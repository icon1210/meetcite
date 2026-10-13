"""Editing endpoints: rename speakers, correct transcript text, edit decisions and action items (FR11)."""

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.deps import DB, CurrentUser, owned_child
from app.models import ActionItem, Decision, Meeting, Segment, Speaker
from app.schemas import (
    ActionItemOut,
    ActionItemPatch,
    DecisionOut,
    DecisionPatch,
    SegmentOut,
    SegmentPatch,
    SeriesAction,
    SpeakerOut,
    SpeakerPatch,
)

router = APIRouter(prefix="/api", tags=["edits"])


@router.get("/action-items", response_model=list[SeriesAction])
def open_action_items(user: CurrentUser, db: DB) -> list[SeriesAction]:
    """Every open action across the user's meetings (the active minutes of each), oldest meeting first."""
    meetings = db.scalars(select(Meeting).where(Meeting.user_id == user.id).order_by(Meeting.created_at))
    return [
        SeriesAction(
            id=a.id,
            meeting_id=m.id,
            meeting_title=m.title,
            meeting_date=m.created_at,
            task=a.task,
            owner=a.owner,
            deadline=a.deadline,
            status=a.status,
            source_segment_ids=list(a.source_segment_ids),
            verdict=a.verdict,
        )
        for m in meetings
        for a in m.action_items
        if a.status != "done"
    ]


@router.patch("/speakers/{speaker_id}", response_model=SpeakerOut)
def rename_speaker(speaker_id: int, body: SpeakerPatch, user: CurrentUser, db: DB) -> Speaker:
    speaker = owned_child(db, user, Speaker, speaker_id)
    speaker.display_name = body.display_name.strip()
    if speaker.suggested_name == speaker.display_name:
        speaker.suggested_name = None  # suggestion accepted; any other rename leaves it visible
    db.commit()
    return speaker


@router.patch("/segments/{segment_id}", response_model=SegmentOut)
def edit_segment(segment_id: int, body: SegmentPatch, user: CurrentUser, db: DB) -> Segment:
    segment = owned_child(db, user, Segment, segment_id)
    if body.revert:
        segment.edited_text = None
    elif body.text is not None:
        # The original transcription is kept in ``text``; the correction goes alongside it.
        corrected = body.text.strip()
        segment.edited_text = None if corrected == segment.text else corrected
    if body.speaker_id is not None:
        speaker = owned_child(db, user, Speaker, body.speaker_id)
        if speaker.meeting_id != segment.meeting_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That speaker belongs to a different meeting.")
        segment.speaker_id = speaker.id
    db.commit()
    return segment


@router.patch("/decisions/{decision_id}", response_model=DecisionOut)
def edit_decision(decision_id: int, body: DecisionPatch, user: CurrentUser, db: DB) -> Decision:
    decision = owned_child(db, user, Decision, decision_id)
    if body.text.strip() != decision.text:
        decision.text = body.text.strip()
        decision.verdict, decision.verdict_note = "user", None  # its source links are kept for reference
    db.commit()
    return decision


@router.delete("/decisions/{decision_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_decision(decision_id: int, user: CurrentUser, db: DB) -> Response:
    db.delete(owned_child(db, user, Decision, decision_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/action-items/{item_id}", response_model=ActionItemOut)
def edit_action_item(item_id: int, body: ActionItemPatch, user: CurrentUser, db: DB) -> ActionItem:
    item = owned_child(db, user, ActionItem, item_id)
    data = body.model_dump(exclude_unset=True)
    before = (item.task, item.owner, item.deadline)
    if "task" in data and data["task"]:
        item.task = data["task"].strip()
    if "owner" in data:
        item.owner = (data["owner"] or "").strip() or None
    if "deadline" in data:
        item.deadline = (data["deadline"] or "").strip() or None
    if data.get("status"):
        item.status = data["status"]
    if (item.task, item.owner, item.deadline) != before:
        item.verdict, item.verdict_note = "user", None  # the user's wording, so the AI fact-check no longer applies
    db.commit()
    return item


@router.delete("/action-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_action_item(item_id: int, user: CurrentUser, db: DB) -> Response:
    db.delete(owned_child(db, user, ActionItem, item_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
