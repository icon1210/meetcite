"""Live mode: captions while a meeting is being recorded, and quick notes as it goes.

The browser streams the recording's audio straight to AssemblyAI's real-time service using a
short-lived token issued here (the API key stays on the server). Quick notes - likely decisions,
actions and questions - come from MeetCite's keyword rules, so they are instant and cost nothing;
the full, evidence-checked minutes are produced as usual once the recording is uploaded.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.config import get_settings
from app.deps import CurrentUser
from app.pipeline.cloud_transcribe import CloudTranscriptionError, create_streaming_token, streaming_host
from app.pipeline.extract_rules import extract_actions, extract_decisions, extract_questions
from app.pipeline.types import TranscriptLine
from app.ratelimit import limiter

router = APIRouter(prefix="/api/live", tags=["live"])


class LiveToken(BaseModel):
    token: str
    websocket_url: str  # add &token=... in the browser


@router.post("/token", response_model=LiveToken)
def live_token(user: CurrentUser) -> LiveToken:
    settings = get_settings()
    if not (settings.uses_cloud_ai and settings.assemblyai_api_key):
        raise HTTPException(status.HTTP_409_CONFLICT, "Live captions need cloud mode (AssemblyAI) on this server.")
    # Each token can start a paid streaming session, so issuing them is rate limited per user.
    limiter.check(f"live-token:{user.id}", 10, 60.0)
    try:
        token = create_streaming_token(
            settings.assemblyai_api_key, settings.assemblyai_base_url, settings.max_duration_s
        )
    except CloudTranscriptionError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    url = (
        f"wss://{streaming_host(settings.assemblyai_base_url)}/v3/ws"
        "?speech_model=universal-streaming-english&sample_rate=16000&encoding=pcm_s16le&format_turns=true"
    )
    return LiveToken(token=token, websocket_url=url)


class LiveTurn(BaseModel):
    text: str = Field(max_length=5000)
    speaker: str | None = Field(default=None, max_length=120)


class LiveNotesIn(BaseModel):
    turns: list[LiveTurn] = Field(max_length=2000)


class LiveAction(BaseModel):
    task: str
    owner: str | None
    deadline: str | None


class LiveNotes(BaseModel):
    decisions: list[str]
    actions: list[LiveAction]
    questions: list[str]


@router.post("/notes", response_model=LiveNotes)
def live_notes(body: LiveNotesIn, user: CurrentUser) -> LiveNotes:
    """Likely decisions, actions and questions in the captions so far (keyword rules, no AI call)."""
    lines = [
        TranscriptLine(i, t.speaker or "Speaker", float(i), float(i + 1), t.text.strip())
        for i, t in enumerate(body.turns)
        if t.text.strip()
    ]
    return LiveNotes(
        decisions=[d.text for d in extract_decisions(lines)][-10:],
        actions=[LiveAction(task=a.task, owner=a.owner, deadline=a.deadline) for a in extract_actions(lines)][-10:],
        questions=[q.text for q in extract_questions(lines)][-10:],
    )
