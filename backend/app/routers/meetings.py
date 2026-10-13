import asyncio
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, WebSocket, status
from fastapi.responses import FileResponse
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, selectinload
from starlette.concurrency import run_in_threadpool
from starlette.websockets import WebSocketDisconnect

from app.config import get_settings
from app.db import SessionLocal
from app.deps import DB, CurrentUser, owned_meeting, owned_series
from app.export import EXPORTERS, build_minutes
from app.jobs import enqueue_processing, enqueue_regenerate
from app.models import ActionItem, ClaimReview, Job, Meeting, Segment, Summary, User
from app.peaks import cached_peaks
from app.pipeline.runner import transcript_lines
from app.schemas import (
    ActionItemCreate,
    ActionItemOut,
    AskIn,
    AskOut,
    ClaimReviewOut,
    MeetingDetail,
    MeetingListItem,
    MeetingPatch,
    MeetingStatus,
    RegenerateIn,
    SummarizerName,
)
from app.security import create_media_token, decode_access_token, decode_media_token
from app.storage import delete_meeting_files, save_names_file, save_upload

router = APIRouter(prefix="/api/meetings", tags=["meetings"])

_MEDIA_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".webm": "audio/webm",
}


def _check_model_available(model: str) -> None:
    settings = get_settings()
    if model == "cloud" and not (settings.cloud_llm_enabled and settings.anthropic_api_key):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The cloud LLM is disabled on this server.")


def _status(meeting: Meeting) -> MeetingStatus:
    job = meeting.job
    return MeetingStatus(
        meeting_id=meeting.id,
        status=meeting.status,
        stage=job.stage if job else "queued",
        progress_pct=job.progress_pct if job else 0.0,
        error=job.error if job else None,
        warnings=list(job.warnings or []) if job else [],
    )


@router.get("", response_model=list[MeetingListItem])
def list_meetings(user: CurrentUser, db: DB, q: Annotated[str | None, Query(max_length=200)] = None) -> list[Meeting]:
    stmt = select(Meeting).where(Meeting.user_id == user.id)
    if q and q.strip():
        term = q.strip()
        if db.get_bind().dialect.name == "postgresql":
            # PostgreSQL full-text search handles word forms ("decide" also finds "decided").
            text_match = func.to_tsvector("english", Segment.text).op("@@")(func.plainto_tsquery("english", term))
        else:
            text_match = Segment.text.ilike(f"%{term}%")
        in_transcript = exists().where(Segment.meeting_id == Meeting.id, text_match)
        stmt = stmt.where(or_(Meeting.title.ilike(f"%{term}%"), in_transcript))
    return list(db.scalars(stmt.order_by(Meeting.created_at.desc())))


@router.post("", response_model=MeetingListItem, status_code=status.HTTP_201_CREATED)
def create_meeting(
    user: CurrentUser,
    db: DB,
    file: Annotated[UploadFile, File(description="Audio or video recording")],
    title: Annotated[str | None, Form(max_length=200)] = None,
    model: Annotated[SummarizerName | None, Form()] = None,
    source: Annotated[Literal["upload", "browser"], Form()] = "upload",
    names_file: Annotated[
        UploadFile | None, File(description="Optional Teams/Zoom transcript (.vtt) with speaker names")
    ] = None,
    series_id: Annotated[int | None, Form(description="Meeting series this meeting belongs to")] = None,
    agenda: Annotated[str | None, Form(max_length=5000, description="Planned agenda, one item per line")] = None,
) -> Meeting:
    chosen = model or get_settings().default_summarizer
    _check_model_available(chosen)
    if series_id is not None:
        owned_series(db, user, series_id)
    names_path = save_names_file(names_file) if names_file is not None and names_file.filename else None
    try:
        path = save_upload(file)
    except BaseException:
        if names_path is not None:
            names_path.unlink(missing_ok=True)
        raise
    meeting = Meeting(
        user_id=user.id,
        title=(title or "").strip() or Path(file.filename or "Meeting").stem[:200],
        original_filename=(file.filename or "recording")[:255],
        file_path=str(path),
        names_file_path=str(names_path) if names_path else None,
        source=source,
        model_used=chosen,
        series_id=series_id,
        agenda=(agenda or "").strip() or None,
        status="queued",
        job=Job(stage="queued", progress_pct=0.0, warnings=[], stage_timings={}, configuration={}),
    )
    db.add(meeting)
    db.commit()
    enqueue_processing(meeting.id)
    return meeting


@router.get("/{meeting_id}", response_model=MeetingDetail)
def get_meeting(meeting_id: int, user: CurrentUser, db: DB) -> MeetingDetail:
    meeting = db.scalar(
        select(Meeting)
        .where(Meeting.id == meeting_id, Meeting.user_id == user.id)
        .options(
            selectinload(Meeting.job),
            selectinload(Meeting.speakers),
            selectinload(Meeting.segments),
            selectinload(Meeting.summaries).selectinload(Summary.decisions),
            selectinload(Meeting.summaries).selectinload(Summary.action_items),
        )
    )
    if meeting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    detail = MeetingDetail.model_validate(meeting)
    reviews = db.scalars(
        select(ClaimReview).where(ClaimReview.meeting_id == meeting.id, ClaimReview.reviewer_id == user.id)
    )
    detail.reviews = [ClaimReviewOut.model_validate(r) for r in reviews]
    return detail


def ensure_summary(db: Session, meeting: Meeting) -> Summary:
    """The active summary, creating an empty user-written one if the meeting has none yet."""
    if meeting.summary is None:
        summary = Summary(
            meeting_id=meeting.id,
            configuration="manual",
            prompt_version="",
            settings={},
            timings={},
            is_active=True,
            text="",
            points=[],
            model_used="written by user",
        )
        meeting.summaries.append(summary)
        db.flush()
    assert meeting.summary is not None
    return meeting.summary


USER_ITEM = {
    "source_segment_ids": [],
    "has_source": True,
    "evidence_status": "user",
    "verdict": "user",
    "verdict_note": None,
}


@router.patch("/{meeting_id}", response_model=MeetingListItem)
def update_meeting(meeting_id: int, body: MeetingPatch, user: CurrentUser, db: DB) -> Meeting:
    meeting = owned_meeting(db, user, meeting_id)
    if body.title is not None:
        meeting.title = body.title.strip()
    if body.summary_points is not None:
        summary = ensure_summary(db, meeting)
        # Unchanged points keep their evidence and checks; new or reworded points are marked as the user's.
        previous = {p["text"]: p for p in summary.points}
        points = []
        for p in body.summary_points:
            text = p.text.strip()
            if text:
                points.append(dict(previous[text]) if text in previous else {"text": text, **USER_ITEM})
        summary.points = points
        summary.text = "\n".join(p["text"] for p in points)
    # series_id and agenda may be set to null on purpose, so check which fields were sent.
    if "series_id" in body.model_fields_set:
        if body.series_id is not None:
            owned_series(db, user, body.series_id)
        meeting.series_id = body.series_id
    if "agenda" in body.model_fields_set:
        meeting.agenda = (body.agenda or "").strip() or None
    db.commit()
    return meeting


@router.post("/{meeting_id}/memory", response_model=MeetingListItem)
def refresh_memory(meeting_id: int, user: CurrentUser, db: DB) -> Meeting:
    """Re-check the active minutes against the agenda and earlier meetings (after either changes)."""
    from app.pipeline.runner import link_meeting

    meeting = owned_meeting(db, user, meeting_id)
    if meeting.summary is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting has no minutes yet.")
    link_meeting(db, get_settings(), meeting, meeting.summary)
    db.commit()
    return meeting


@router.post("/{meeting_id}/summaries/{summary_id}/activate", response_model=MeetingListItem)
def activate_summary(meeting_id: int, summary_id: int, user: CurrentUser, db: DB) -> Meeting:
    """Choose which configuration's notes are shown, exported and edited."""
    meeting = owned_meeting(db, user, meeting_id)
    if not any(s.id == summary_id for s in meeting.summaries):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Summary not found")
    for s in meeting.summaries:
        s.is_active = s.id == summary_id
        if s.is_active:
            meeting.model_used = s.configuration
    db.commit()
    return meeting


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(meeting_id: int, user: CurrentUser, db: DB) -> Response:
    meeting = owned_meeting(db, user, meeting_id)
    files = [meeting.file_path, meeting.names_file_path]
    db.delete(meeting)
    db.commit()
    delete_meeting_files(meeting_id, *[f for f in files if f])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{meeting_id}/status", response_model=MeetingStatus)
def get_status(meeting_id: int, user: CurrentUser, db: DB) -> MeetingStatus:
    return _status(owned_meeting(db, user, meeting_id))


@router.websocket("/{meeting_id}/progress")
async def progress_stream(websocket: WebSocket, meeting_id: int) -> None:
    """Pushes the job status whenever it changes, until the job finishes.

    Browsers cannot set headers on WebSocket connections, so the client sends its
    login token as the first message. (Putting it in the URL would leak it into
    server and proxy logs.) The frontend falls back to polling /status.
    """
    await websocket.accept()
    try:
        token = await asyncio.wait_for(websocket.receive_text(), timeout=10)
    except (TimeoutError, WebSocketDisconnect):
        await websocket.close(code=4401)
        return
    user_id = decode_access_token(token)

    def read() -> MeetingStatus | None:
        with SessionLocal() as db:
            user = db.get(User, user_id) if user_id else None
            meeting = (
                db.scalar(select(Meeting).where(Meeting.id == meeting_id, Meeting.user_id == user.id)) if user else None
            )
            return _status(meeting) if meeting else None

    first = await run_in_threadpool(read)
    if first is None:
        await websocket.close(code=4404)  # same answer for "not yours" and "does not exist"
        return
    last = None
    try:
        current: MeetingStatus | None = first
        while current is not None:
            if current != last:
                await websocket.send_json(current.model_dump())
                last = current
            if current.status in ("completed", "failed"):
                break
            await asyncio.sleep(1.0)
            current = await run_in_threadpool(read)
        await websocket.close()
    except WebSocketDisconnect:
        pass


@router.post("/{meeting_id}/regenerate", response_model=MeetingStatus, status_code=status.HTTP_202_ACCEPTED)
def regenerate(meeting_id: int, body: RegenerateIn, user: CurrentUser, db: DB) -> MeetingStatus:
    meeting = owned_meeting(db, user, meeting_id)
    _check_model_available(body.model)
    if meeting.status in ("queued", "processing"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This meeting is still being processed.")
    if not meeting.segments:
        raise HTTPException(status.HTTP_409_CONFLICT, "There is no transcript to summarize yet.")
    meeting.status = "queued"
    db.commit()
    enqueue_regenerate(meeting.id, body.model)
    return _status(meeting)


@router.post("/{meeting_id}/retry", response_model=MeetingStatus, status_code=status.HTTP_202_ACCEPTED)
def retry(meeting_id: int, user: CurrentUser, db: DB) -> MeetingStatus:
    """Retry a failed job from its last successful stage, without re-uploading (NFR7)."""
    meeting = owned_meeting(db, user, meeting_id)
    if meeting.status != "failed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only failed meetings can be retried.")
    meeting.status = "queued"
    if meeting.job:
        meeting.job.error = None
    db.commit()
    enqueue_processing(meeting.id)
    return _status(meeting)


@router.get("/{meeting_id}/export")
def export(meeting_id: int, user: CurrentUser, db: DB, format: Literal["pdf", "docx", "txt"] = "pdf") -> Response:
    meeting = owned_meeting(db, user, meeting_id)
    if meeting.status != "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "The meeting has not finished processing.")
    render, media_type = EXPORTERS[format]
    safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in meeting.title).strip() or "meeting"
    return Response(
        content=render(build_minutes(meeting)),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_title} - minutes.{format}"'},
    )


@router.get("/{meeting_id}/media")
def media_info(meeting_id: int, user: CurrentUser, db: DB) -> dict[str, object]:
    """A short-lived audio URL plus waveform peaks for the player."""
    meeting = owned_meeting(db, user, meeting_id)
    token = create_media_token(user.id, meeting.id)
    return {
        "url": f"/api/meetings/{meeting.id}/audio?t={token}",
        "peaks": cached_peaks(get_settings().work_dir / str(meeting.id)),
        "duration_s": meeting.duration_s,
    }


@router.get("/{meeting_id}/audio")
def stream_audio(meeting_id: int, db: DB, t: str = "") -> FileResponse:
    """Streams the recording (with HTTP range support, so seeking works)."""
    user_id = decode_media_token(t, meeting_id)
    meeting = (
        db.scalar(select(Meeting).where(Meeting.id == meeting_id, Meeting.user_id == user_id)) if user_id else None
    )
    if meeting is None or not Path(meeting.file_path).exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recording not found")
    path = Path(meeting.file_path)
    return FileResponse(path, media_type=_MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream"))


@router.post("/{meeting_id}/action-items", response_model=ActionItemOut, status_code=status.HTTP_201_CREATED)
def add_action_item(meeting_id: int, body: ActionItemCreate, user: CurrentUser, db: DB) -> ActionItem:
    meeting = owned_meeting(db, user, meeting_id)
    summary = ensure_summary(db, meeting)
    item = ActionItem(
        meeting_id=meeting.id,
        summary_id=summary.id,
        task=body.task.strip(),
        owner=body.owner,
        deadline=body.deadline,
        source_segment_ids=[],
        evidence_status="user",  # written by the user, so not an unsupported AI claim
        verdict="user",
    )
    db.add(item)
    db.commit()
    return item


@router.post("/{meeting_id}/ask", response_model=AskOut)
def ask(meeting_id: int, body: AskIn, user: CurrentUser, db: DB) -> AskOut:
    from app.pipeline.ask import answer_question
    from app.pipeline.llm_clients import LLMError

    meeting = owned_meeting(db, user, meeting_id)
    if not meeting.segments:
        raise HTTPException(status.HTTP_409_CONFLICT, "There is no transcript to ask about yet.")
    try:
        answer, ids = answer_question(get_settings(), transcript_lines(meeting), body.question)
    except LLMError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return AskOut(answer=answer, source_segment_ids=ids)
