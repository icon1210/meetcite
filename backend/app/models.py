"""Database tables (spec §11).

One user has many meetings; a meeting has one job, one summary and many speakers,
segments, decisions and action items. Deleting a meeting cascades to all of them.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    meetings: Mapped[list["Meeting"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class Series(Base):
    """A recurring set of meetings (e.g. "Weekly team meeting"): MeetMind's project memory.

    Actions carry over between its meetings, its decisions form one history, and a new meeting is
    checked against earlier decisions for changes and contradictions.
    """

    __tablename__ = "series"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    meetings: Mapped[list["Meeting"]] = relationship(back_populates="series", order_by="Meeting.created_at")


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    original_filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(500))
    duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="upload")  # upload | browser
    # Optional Teams/Zoom transcript (.vtt) whose speaker names and turns are used instead of diarization.
    names_file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # queued | processing | completed | failed
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    model_used: Mapped[str] = mapped_column(String(20), default="llm")  # configuration of the active summary
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    series_id: Mapped[int | None] = mapped_column(
        ForeignKey("series.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # The planned agenda, one item per line; the minutes are checked against it.
    agenda: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="meetings")
    series: Mapped["Series | None"] = relationship(back_populates="meetings")
    job: Mapped["Job | None"] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", uselist=False, passive_deletes=True
    )
    speakers: Mapped[list["Speaker"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", passive_deletes=True, order_by="Speaker.id"
    )
    segments: Mapped[list["Segment"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", passive_deletes=True, order_by="Segment.position"
    )
    # One summary per configuration (C1 baseline, C2 evidence-grounded, ...); one of them is "active".
    summaries: Mapped[list["Summary"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", passive_deletes=True, order_by="Summary.id"
    )
    claim_reviews: Mapped[list["ClaimReview"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def has_names_file(self) -> bool:
        return self.names_file_path is not None

    @property
    def series_name(self) -> str | None:
        return self.series.name if self.series else None

    @property
    def summary(self) -> "Summary | None":
        """The summary currently shown to the user."""
        return next((s for s in self.summaries if s.is_active), self.summaries[-1] if self.summaries else None)

    @property
    def decisions(self) -> list["Decision"]:
        return self.summary.decisions if self.summary else []

    @property
    def action_items(self) -> list["ActionItem"]:
        return self.summary.action_items if self.summary else []

    # --- At-a-glance figures for the dashboard ----------------------------------
    @property
    def stage(self) -> str | None:
        return self.job.stage if self.job else None

    @property
    def progress_pct(self) -> float:
        return self.job.progress_pct if self.job else 0.0

    @property
    def overview(self) -> str:
        return (self.summary.overview or "") if self.summary else ""

    @property
    def speaker_count(self) -> int:
        return len(self.speakers)

    @property
    def decision_count(self) -> int:
        return len(self.decisions)

    @property
    def open_action_count(self) -> int:
        return sum(1 for a in self.action_items if a.status != "done")

    @property
    def flagged_count(self) -> int:
        """Claims the automatic check could not fully confirm (partial or unsupported)."""
        v = (self.summary.verification or {}) if self.summary else {}
        return int(v.get("partial", 0)) + int(v.get("unsupported", 0))


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), unique=True)
    # queued | preprocessing | transcribing | diarizing | aligning | summarizing | completed | failed
    stage: Mapped[str] = mapped_column(String(30), default="queued")
    progress_pct: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    warnings: Mapped[list[str]] = mapped_column(JSON, default=list)
    # Models and settings used for transcription and diarization (FR14), e.g. {"whisper_model": "large-v3"}.
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    # Seconds spent in each stage, used for the performance evaluation (E5).
    stage_timings: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    meeting: Mapped[Meeting] = relationship(back_populates="job")


class Speaker(Base):
    __tablename__ = "speakers"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(40))  # e.g. SPEAKER_00
    display_name: Mapped[str] = mapped_column(String(120))
    # A name proposed by MeetMind (from a Teams/Zoom transcript or from introductions in the meeting),
    # shown for the user to accept. Never applied silently unless it came from a meeting-platform transcript.
    suggested_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    suggestion_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggestion_segment_ids: Mapped[list[int]] = mapped_column(JSON, default=list)

    meeting: Mapped[Meeting] = relationship(back_populates="speakers")


class Segment(Base):
    __tablename__ = "segments"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    speaker_id: Mapped[int | None] = mapped_column(ForeignKey("speakers.id", ondelete="SET NULL"), nullable=True)
    position: Mapped[int] = mapped_column(Integer)  # order within the meeting; also the ID cited by the summarizer
    start_s: Mapped[float] = mapped_column(Float)
    end_s: Mapped[float] = mapped_column(Float)
    text: Mapped[str] = mapped_column(Text)  # as transcribed; never overwritten
    edited_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # the user's correction, if any
    words: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)  # word-level timestamps (FR4)

    meeting: Mapped[Meeting] = relationship(back_populates="segments")
    speaker: Mapped[Speaker | None] = relationship()

    @property
    def current_text(self) -> str:
        return self.edited_text if self.edited_text is not None else self.text

    @property
    def original_text(self) -> str | None:
        """The transcribed text, but only when a correction has replaced it."""
        return self.text if self.edited_text is not None else None


class Summary(Base):
    """One set of generated notes, produced by one configuration (spec §15, §21)."""

    __tablename__ = "summaries"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    # llm (C2 evidence-grounded) | baseline (C1 plain prompt) | bart (C3) | cloud
    configuration: Mapped[str] = mapped_column(String(20), default="llm")
    prompt_version: Mapped[str] = mapped_column(String(40), default="")
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # model, context size, chunk size...
    timings: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)  # seconds per step
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    text: Mapped[str] = mapped_column(Text)
    overview: Mapped[str] = mapped_column(Text, default="")
    # Key points: [{"text", "source_segment_ids", "has_source", "verdict", "verdict_note"}]
    points: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    # Topic-by-topic minutes: [{"title", "summary", "outcome", "source_segment_ids", "verdict", "verdict_note",
    #                           "points": [point...], "positions": [{"speaker", "view", ...point fields}]}]
    topics: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    open_questions: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    risks: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    # {"method": "llm" | "word-overlap" | ..., "supported": n, "partial": n, "unsupported": n}
    verification: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    # Links to earlier meetings in the series (project memory):
    # {"method", "contradictions": [{"previous_meeting_id", "previous_meeting_title", "previous_decision",
    #   "previous_source_ids", "current", "source_segment_ids", "note"}],
    #  "progress": [{"action_id", "meeting_id", "task", "status": "done"|"in_progress", "source_segment_ids", "note"}]}
    continuity: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    # The agenda checked against the meeting:
    # {"method", "items": [{"item", "status": "covered"|"partly"|"not_covered", "source_segment_ids", "note"}],
    #  "unplanned": [topic titles discussed but not on the agenda]}
    agenda_review: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    model_used: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    meeting: Mapped[Meeting] = relationship(back_populates="summaries")
    decisions: Mapped[list["Decision"]] = relationship(
        back_populates="summary", cascade="all, delete-orphan", passive_deletes=True, order_by="Decision.id"
    )
    action_items: Mapped[list["ActionItem"]] = relationship(
        back_populates="summary", cascade="all, delete-orphan", passive_deletes=True, order_by="ActionItem.id"
    )


# Evidence status of a generated claim (spec §15): the model cited existing segments (valid),
# cited nothing (missing), or cited only segments that do not exist (invalid).
EVIDENCE_STATUSES = ("valid", "missing", "invalid", "user")


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    summary_id: Mapped[int] = mapped_column(ForeignKey("summaries.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(Text)
    source_segment_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    evidence_status: Mapped[str] = mapped_column(String(20), default="missing")
    # Automatic AI check: supported | partial | unsupported | unverified | user (written or edited by the user)
    verdict: Mapped[str] = mapped_column(String(20), default="unverified")
    verdict_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    summary: Mapped[Summary] = relationship(back_populates="decisions")

    @property
    def has_source(self) -> bool:
        return self.evidence_status == "valid"


class ActionItem(Base):
    __tablename__ = "action_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    summary_id: Mapped[int] = mapped_column(ForeignKey("summaries.id", ondelete="CASCADE"), index=True)
    task: Mapped[str] = mapped_column(Text)
    owner: Mapped[str | None] = mapped_column(String(120), nullable=True)
    deadline: Mapped[str | None] = mapped_column(String(120), nullable=True)  # as stated, e.g. "next Friday"
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | done
    source_segment_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    evidence_status: Mapped[str] = mapped_column(String(20), default="missing")
    verdict: Mapped[str] = mapped_column(String(20), default="unverified")
    verdict_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    summary: Mapped[Summary] = relationship(back_populates="action_items")

    @property
    def has_source(self) -> bool:
        return self.evidence_status == "valid"


# Human factual-support labels (spec §21 rubric). The AI check above is only an aid; these are the evidence.
REVIEW_LABELS = ("supported", "partial", "unsupported", "contradicted", "unclear")


class ClaimReview(Base):
    __tablename__ = "claim_reviews"
    __table_args__ = (UniqueConstraint("reviewer_id", "claim_key", name="uq_claim_review_reviewer_claim"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # decision | action | point | topic | position | question | risk
    claim_type: Mapped[str] = mapped_column(String(20))
    # Stable key: "decision:12", "action:7", or "summary:3:point:0" / "summary:3:topic:1:position:0" for JSON items.
    claim_key: Mapped[str] = mapped_column(String(120), index=True)
    claim_text: Mapped[str] = mapped_column(Text)  # snapshot, so later edits don't change what was judged
    configuration: Mapped[str] = mapped_column(String(20))
    label: Mapped[str] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    meeting: Mapped[Meeting] = relationship(back_populates="claim_reviews")


class EvaluationRun(Base):
    """A reproducible experiment record (spec §15, NFR8)."""

    __tablename__ = "evaluation_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    experiment: Mapped[str] = mapped_column(String(40))  # e.g. E1, E3
    dataset_split: Mapped[str] = mapped_column(String(40))
    model_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    prompt_version: Mapped[str] = mapped_column(String(40), default="")
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    runtime_s: Mapped[float] = mapped_column(Float, default=0.0)
    hardware: Mapped[str] = mapped_column(String(200), default="")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
