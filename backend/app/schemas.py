"""Pydantic request and response models for the REST API."""

from datetime import datetime
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field

# llm = C2 evidence-grounded, baseline = C1 plain prompt, bart = C3, cloud = optional grounded cloud LLM
SummarizerName = Literal["llm", "baseline", "bart", "cloud"]
EvidenceStatus = Literal["valid", "missing", "invalid", "user"]
ReviewLabel = Literal["supported", "partial", "unsupported", "contradicted", "unclear"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth -------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    # Required only when the server sets REGISTRATION_CODE (keeps strangers off a public demo).
    signup_code: str | None = Field(default=None, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: int
    email: str
    name: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Meetings ---------------------------------------------------------------
class JobOut(ORM):
    stage: str
    progress_pct: float
    error: str | None
    warnings: list[str]
    stage_timings: dict[str, float]
    configuration: dict[str, Any]
    started_at: datetime | None
    finished_at: datetime | None


class MeetingListItem(ORM):
    id: int
    title: str
    duration_s: float | None
    status: str
    model_used: str
    source: str
    created_at: datetime
    # At-a-glance figures for the dashboard.
    stage: str | None = None
    progress_pct: float = 0.0
    overview: str = ""
    speaker_count: int = 0
    decision_count: int = 0
    open_action_count: int = 0
    flagged_count: int = 0
    series_id: int | None = None
    series_name: str | None = None


class SpeakerOut(ORM):
    id: int
    label: str
    display_name: str
    suggested_name: str | None
    suggestion_reason: str | None
    suggestion_segment_ids: list[int]


class SegmentOut(ORM):
    id: int
    position: int
    speaker_id: int | None
    start_s: float
    end_s: float
    # The text as it stands now (with the user's correction, if any) ...
    text: str = Field(validation_alias=AliasChoices("current_text", "text"))
    # ... and what was originally transcribed, when it has been corrected.
    original_text: str | None = None


VerdictName = Literal["supported", "partial", "unsupported", "unverified", "user"]


class Checked(BaseModel):
    """Fields every AI-generated item carries: its sources and its fact-check result."""

    source_segment_ids: list[int] = []
    has_source: bool = True
    evidence_status: EvidenceStatus = "missing"
    verdict: VerdictName = "unverified"
    verdict_note: str | None = None


class SummaryPoint(Checked):
    text: str


class PositionOut(Checked):
    speaker: str
    view: str


class TopicOut(Checked):
    title: str
    summary: str
    outcome: str | None = None
    points: list[SummaryPoint] = []
    positions: list[PositionOut] = []


class VerificationOut(BaseModel):
    method: str = "none"
    supported: int = 0
    partial: int = 0
    unsupported: int = 0


class DecisionOut(ORM):
    id: int
    text: str
    source_segment_ids: list[int]
    has_source: bool
    evidence_status: EvidenceStatus
    verdict: VerdictName
    verdict_note: str | None


class ActionItemOut(ORM):
    id: int
    task: str
    owner: str | None
    deadline: str | None
    status: str
    source_segment_ids: list[int]
    has_source: bool
    evidence_status: EvidenceStatus
    verdict: VerdictName
    verdict_note: str | None


class SummaryOut(ORM):
    """One configuration's notes, with the metadata needed to reproduce them (FR14)."""

    id: int
    configuration: str
    prompt_version: str
    settings: dict[str, Any]
    timings: dict[str, float]
    is_active: bool
    text: str
    overview: str
    points: list[SummaryPoint]
    topics: list[TopicOut]
    open_questions: list[SummaryPoint]
    risks: list[SummaryPoint]
    verification: VerificationOut
    decisions: list[DecisionOut]
    action_items: list[ActionItemOut]
    # Project memory: links to earlier meetings in the series, and the agenda check.
    continuity: dict[str, Any] = {}
    agenda_review: dict[str, Any] = {}
    model_used: str
    created_at: datetime


class ClaimReviewOut(ORM):
    claim_key: str
    claim_type: str
    label: ReviewLabel
    notes: str | None
    configuration: str
    created_at: datetime


class MeetingDetail(MeetingListItem):
    original_filename: str
    has_names_file: bool = False
    agenda: str | None = None
    job: JobOut | None
    speakers: list[SpeakerOut]
    segments: list[SegmentOut]
    summary: SummaryOut | None  # the active configuration
    decisions: list[DecisionOut]  # of the active configuration
    action_items: list[ActionItemOut]  # of the active configuration
    summaries: list[SummaryOut]  # every configuration, for side-by-side comparison
    reviews: list[ClaimReviewOut] = []  # the current user's factual-support labels


class MeetingStatus(BaseModel):
    meeting_id: int
    status: str
    stage: str
    progress_pct: float
    error: str | None
    warnings: list[str] = []


class MeetingPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    summary_points: list[SummaryPoint] | None = None
    # Send null to remove the meeting from its series or clear the agenda.
    series_id: int | None = None
    agenda: str | None = Field(default=None, max_length=5000)


# --- Project memory (meeting series) ------------------------------------------------------------
class SeriesIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class SeriesOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    meeting_count: int = 0
    open_action_count: int = 0
    last_meeting_at: datetime | None = None


class SeriesAction(BaseModel):
    id: int
    meeting_id: int
    meeting_title: str
    meeting_date: datetime
    task: str
    owner: str | None
    deadline: str | None
    status: str
    source_segment_ids: list[int]
    verdict: str


class SeriesDecision(BaseModel):
    id: int
    meeting_id: int
    meeting_title: str
    meeting_date: datetime
    text: str
    source_segment_ids: list[int]
    verdict: str


class SeriesDetail(SeriesOut):
    meetings: list[MeetingListItem]
    actions: list[SeriesAction]
    decisions: list[SeriesDecision]
    # From each meeting's continuity check, tagged with the meeting where the change was noticed.
    contradictions: list[dict[str, Any]]
    progress: list[dict[str, Any]]


class SeriesSource(BaseModel):
    meeting_id: int
    meeting_title: str
    position: int
    start_s: float
    speaker: str
    text: str


class SeriesAskOut(BaseModel):
    answer: str
    sources: list[SeriesSource]


class RegenerateIn(BaseModel):
    model: SummarizerName


# --- Edits ------------------------------------------------------------------
class SpeakerPatch(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)


class SegmentPatch(BaseModel):
    text: str | None = Field(default=None, min_length=1)
    speaker_id: int | None = None
    revert: bool = False  # go back to the original transcription


class ClaimReviewIn(BaseModel):
    label: ReviewLabel
    notes: str | None = Field(default=None, max_length=2000)


class DecisionPatch(BaseModel):
    text: str = Field(min_length=1)


class ActionItemPatch(BaseModel):
    task: str | None = Field(default=None, min_length=1)
    owner: str | None = None
    deadline: str | None = None
    status: Literal["open", "done"] | None = None


class ActionItemCreate(BaseModel):
    task: str = Field(min_length=1)
    owner: str | None = None
    deadline: str | None = None


# --- Q&A (FR16) -------------------------------------------------------------
class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)


class AskOut(BaseModel):
    answer: str
    source_segment_ids: list[int]


class ConfigOut(BaseModel):
    summarizers: list[SummarizerName]
    default_summarizer: SummarizerName
    max_upload_mb: int
    max_duration_s: int
    ai_mode: str
    # "local" (models on this server) or "cloud" (AssemblyAI + Claude): shown to users for transparency.
    ai_provider: str = "local"
    # True when new accounts need the sign-up code the administrator hands out.
    signup_code_required: bool = False
    # Live captions while recording (needs cloud mode).
    live_available: bool = False
