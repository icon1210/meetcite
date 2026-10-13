"""Meeting series: MeetCite's project memory across many meetings.

A series groups recurring meetings (e.g. a weekly team meeting or thesis supervision). Its page
shows every meeting, one action tracker (actions carry over until they are done), one decision
history, the changes and contradictions noticed between meetings, and question answering across
all of its meetings, every answer linked to the moment it came from.
"""

import re

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.config import get_settings
from app.deps import DB, CurrentUser, owned_series
from app.models import Meeting, Series
from app.pipeline.llm_clients import LLMError
from app.pipeline.types import TranscriptLine
from app.schemas import (
    AskIn,
    MeetingListItem,
    SeriesAction,
    SeriesAskOut,
    SeriesDecision,
    SeriesDetail,
    SeriesIn,
    SeriesOut,
    SeriesSource,
)

router = APIRouter(prefix="/api/series", tags=["series"])


def _summary_out(series: Series) -> SeriesOut:
    meetings = series.meetings
    return SeriesOut(
        id=series.id,
        name=series.name,
        created_at=series.created_at,
        meeting_count=len(meetings),
        open_action_count=sum(m.open_action_count for m in meetings),
        last_meeting_at=max((m.created_at for m in meetings), default=None),
    )


@router.get("", response_model=list[SeriesOut])
def list_series(user: CurrentUser, db: DB) -> list[SeriesOut]:
    rows = db.scalars(select(Series).where(Series.user_id == user.id).order_by(Series.name))
    return [_summary_out(s) for s in rows]


@router.post("", response_model=SeriesOut, status_code=status.HTTP_201_CREATED)
def create_series(body: SeriesIn, user: CurrentUser, db: DB) -> SeriesOut:
    series = Series(user_id=user.id, name=body.name.strip())
    db.add(series)
    db.commit()
    return _summary_out(series)


@router.patch("/{series_id}", response_model=SeriesOut)
def rename_series(series_id: int, body: SeriesIn, user: CurrentUser, db: DB) -> SeriesOut:
    series = owned_series(db, user, series_id)
    series.name = body.name.strip()
    db.commit()
    return _summary_out(series)


@router.delete("/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_series(series_id: int, user: CurrentUser, db: DB) -> Response:
    """Removes the grouping only; the meetings themselves are kept."""
    series = owned_series(db, user, series_id)
    for m in series.meetings:
        m.series_id = None
    db.delete(series)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{series_id}", response_model=SeriesDetail)
def get_series(series_id: int, user: CurrentUser, db: DB) -> SeriesDetail:
    series = owned_series(db, user, series_id)
    meetings = sorted(series.meetings, key=lambda m: m.created_at)
    actions, decisions, contradictions, progress = [], [], [], []
    for m in meetings:
        for a in m.action_items:
            actions.append(
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
            )
        for d in m.decisions:
            decisions.append(
                SeriesDecision(
                    id=d.id,
                    meeting_id=m.id,
                    meeting_title=m.title,
                    meeting_date=m.created_at,
                    text=d.text,
                    source_segment_ids=list(d.source_segment_ids),
                    verdict=d.verdict,
                )
            )
        continuity = (m.summary.continuity or {}) if m.summary else {}
        tag = {"meeting_id": m.id, "meeting_title": m.title, "meeting_date": m.created_at.isoformat()}
        contradictions += [{**c, **tag} for c in continuity.get("contradictions", [])]
        progress += [{**p, **tag} for p in continuity.get("progress", [])]
    base = _summary_out(series)
    return SeriesDetail(
        **base.model_dump(),
        meetings=[MeetingListItem.model_validate(m) for m in reversed(meetings)],
        actions=actions,
        decisions=decisions,
        contradictions=contradictions,
        progress=progress,
    )


_CITE = re.compile(r"\s*\[\d+\]")


@router.post("/{series_id}/ask", response_model=SeriesAskOut)
def ask_series(series_id: int, body: AskIn, user: CurrentUser, db: DB) -> SeriesAskOut:
    """Answer a question from every meeting in the series, citing the moments used."""
    from app.pipeline.ask import answer_question

    series = owned_series(db, user, series_id)
    lines: list[TranscriptLine] = []
    origin: dict[int, tuple[Meeting, int]] = {}
    for m in sorted(series.meetings, key=lambda m: m.created_at):
        date = m.created_at.strftime("%d %b %Y")
        for seg in m.segments:
            gid = len(lines)
            speaker = seg.speaker.display_name if seg.speaker else "Unknown"
            lines.append(
                TranscriptLine(gid, f"{speaker} ({m.title}, {date})", seg.start_s, seg.end_s, seg.current_text)
            )
            origin[gid] = (m, seg.position)
    if not lines:
        raise HTTPException(status.HTTP_409_CONFLICT, "This series has no transcribed meetings yet.")
    try:
        answer, ids = answer_question(get_settings(), lines, body.question)
    except LLMError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    sources = []
    for gid in ids:
        meeting, position = origin[gid]
        line = lines[gid]
        sources.append(
            SeriesSource(
                meeting_id=meeting.id,
                meeting_title=meeting.title,
                position=position,
                start_s=line.start,
                speaker=line.speaker.split(" (")[0],
                text=line.text,
            )
        )
    return SeriesAskOut(answer=_CITE.sub("", answer).strip(), sources=sources)
