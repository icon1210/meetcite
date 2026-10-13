"""Runs the AI pipeline for one meeting and records progress in the ``jobs`` table.

Stage outputs are saved as files in ``data/work/<meeting_id>/``. When a failed
job is retried, stages whose output already exists are skipped, so it resumes
from the last successful stage without re-uploading (NFR7).
"""

import json
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import SessionLocal
from app.models import ActionItem, Decision, Job, Meeting, Segment, Speaker, Summary
from app.pipeline import align as align_mod
from app.pipeline.summary_schema import MeetingNotes, check_sources
from app.pipeline.types import (
    AlignedSegment,
    TranscriptLine,
    Turn,
    Word,
    to_jsonable,
    turns_from_json,
    words_from_json,
)
from app.pipeline.verify import Check, verification_stats, verify_notes

log = logging.getLogger(__name__)

# (stage name, start %, end %) - the overall progress bar is split across stages.
STAGES = {
    "preprocessing": (0, 5),
    "transcribing": (5, 55),
    "diarizing": (55, 75),
    "aligning": (75, 78),
    "summarizing": (78, 93),
    "verifying": (93, 100),
}


class ProgressReporter:
    """Writes stage progress to the database, throttled to avoid excessive commits."""

    def __init__(self, db: Session, job: Job) -> None:
        self.db, self.job = db, job
        self._last_commit = 0.0
        self._stage_started = time.monotonic()

    def start(self, stage: str) -> None:
        self.job.stage = stage
        self.job.progress_pct = float(STAGES[stage][0])
        self._stage_started = time.monotonic()
        self.db.commit()

    def update(self, stage: str, fraction: float) -> None:
        lo, hi = STAGES[stage]
        self.job.progress_pct = round(lo + (hi - lo) * max(0.0, min(fraction, 1.0)), 1)
        now = time.monotonic()
        if now - self._last_commit >= 0.5:
            self.db.commit()
            self._last_commit = now

    def finish(self, stage: str) -> None:
        timings = dict(self.job.stage_timings or {})
        timings[stage] = round(time.monotonic() - self._stage_started, 2)
        self.job.stage_timings = timings  # reassign so SQLAlchemy notices the JSON change
        self.update(stage, 1.0)
        self.db.commit()

    def warn(self, message: str) -> None:
        self.job.warnings = [*(self.job.warnings or []), message]
        self.db.commit()

    def callback(self, stage: str) -> Callable[[float], None]:
        return lambda fraction: self.update(stage, fraction)


def _save(path: Path, data: Any) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data), encoding="utf-8")
    tmp.replace(path)  # atomic, so a crash never leaves a half-written stage output


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def run_pipeline(meeting_id: int) -> None:
    """Entry point used by both the Celery task and the in-process thread runner."""
    settings = get_settings()
    db = SessionLocal()
    try:
        meeting = db.get(Meeting, meeting_id)
        if meeting is None or meeting.job is None:
            log.warning("Meeting %s no longer exists; skipping job", meeting_id)
            return
        job = meeting.job
        meeting.status = "processing"
        job.error = None
        job.started_at = datetime.now(UTC)
        job.finished_at = None
        db.commit()
        progress = ProgressReporter(db, job)
        try:
            _run_stages(db, settings, meeting, progress)
            meeting.status = "completed"
            job.stage = "completed"
            job.progress_pct = 100.0
        except Exception as exc:  # report every failure clearly to the user (NFR7)
            log.exception("Processing failed for meeting %s", meeting_id)
            db.rollback()
            meeting.status = "failed"
            job.error = f"{type(exc).__name__}: {exc}" if not str(exc) else str(exc)
        job.finished_at = datetime.now(UTC)
        db.commit()
    finally:
        db.close()


def _run_stages(db: Session, settings: Settings, meeting: Meeting, progress: ProgressReporter) -> None:
    work = settings.work_dir / str(meeting.id)
    work.mkdir(parents=True, exist_ok=True)
    wav, words_file, turns_file, aligned_file = (
        work / "audio.wav",
        work / "words.json",
        work / "turns.json",
        work / "aligned.json",
    )
    fake = settings.ai_mode == "fake"

    # 1. Preprocess -----------------------------------------------------------
    if fake:
        meeting.duration_s = meeting.duration_s or 90.0
    elif not wav.exists():
        from app.pipeline.preprocess import to_wav

        progress.start("preprocessing")
        meeting.duration_s = to_wav(
            Path(meeting.file_path), wav, settings.max_duration_s, normalize=not settings.uses_cloud_ai
        )
        progress.finish("preprocessing")
    duration = meeting.duration_s or 0.0

    # 2 + 3. Transcribe and diarize -------------------------------------------
    names_from_platform = bool(meeting.names_file_path)
    if fake and not (words_file.exists() and turns_file.exists()):
        from app.pipeline.fake import fake_transcribe_and_diarize

        progress.start("transcribing")
        fake_words, fake_turns = fake_transcribe_and_diarize(duration)
        _save(words_file, to_jsonable(fake_words))
        progress.finish("transcribing")
        if not names_from_platform:  # a supplied Teams/Zoom transcript provides the turns instead
            progress.start("diarizing")
            _save(turns_file, to_jsonable(fake_turns))
            progress.finish("diarizing")

    if settings.uses_cloud_ai and not words_file.exists():
        # One AssemblyAI request returns both the words and who spoke when.
        from app.pipeline.cloud_transcribe import AssemblyAIClient, CloudTranscriptionError, compress_for_upload

        if not settings.assemblyai_api_key:
            raise CloudTranscriptionError("Cloud transcription needs ASSEMBLYAI_API_KEY in the server settings.")
        progress.start("transcribing")
        cloud_words, cloud_turns = AssemblyAIClient(
            settings.assemblyai_api_key, settings.assemblyai_base_url
        ).transcribe(
            compress_for_upload(wav, work / "upload.mp3"),
            speaker_labels=not names_from_platform,
            on_progress=progress.callback("transcribing"),
        )
        (work / "upload.mp3").unlink(missing_ok=True)
        _save(words_file, to_jsonable(cloud_words))
        progress.finish("transcribing")
        if not names_from_platform:
            progress.start("diarizing")
            _save(turns_file, to_jsonable(cloud_turns))
            progress.finish("diarizing")

    if not words_file.exists():
        from app.pipeline.transcribe import transcribe

        progress.start("transcribing")
        new_words = transcribe(
            wav,
            model_size=settings.whisper_model,
            device=settings.device,
            compute_type=settings.whisper_compute_type,
            models_dir=settings.data_dir / "models",
            batch_size=settings.whisper_batch_size,
            beam_size=settings.whisper_beam_size,
            duration_s=duration,
            on_progress=progress.callback("transcribing"),
        )
        _save(words_file, to_jsonable(new_words))
        progress.finish("transcribing")
    words: list[Word] = words_from_json(_load(words_file))
    if not words:
        raise RuntimeError("No speech was detected in the recording.")

    if not turns_file.exists():
        progress.start("diarizing")
        new_turns: list[Turn]
        if names_from_platform:
            # A Teams/Zoom transcript says who spoke when, with real names: use it instead of voice analysis.
            from app.pipeline.names import load_platform_transcript

            new_turns = load_platform_transcript(Path(meeting.names_file_path or ""))
        else:
            from app.pipeline.diarize import DiarizationUnavailable, diarize

            try:
                new_turns = diarize(
                    wav,
                    model_name=settings.diarization_model,
                    hf_token=settings.hf_token,
                    device=settings.device,
                    on_progress=progress.callback("diarizing"),
                )
            except DiarizationUnavailable as exc:
                progress.warn(str(exc))
                new_turns = []
        _save(turns_file, to_jsonable(new_turns))
        progress.finish("diarizing")
    turns: list[Turn] = turns_from_json(_load(turns_file))
    _record_configuration(meeting, settings, names_from_platform)

    # 4. Align ----------------------------------------------------------------
    if not aligned_file.exists() or not meeting.segments:
        progress.start("aligning")
        aligned = align_mod.align(words, turns)
        _save(aligned_file, to_jsonable(aligned))
        store_transcript(db, meeting, aligned, names_from_platform=names_from_platform)
        if not names_from_platform:
            suggest_speaker_names(db, settings, meeting, aligned)
        progress.finish("aligning")

    # 5 + 6 + 7. Chunk, summarize, fact-check, store ---------------------------
    summarize_meeting(db, settings, meeting, meeting.model_used, progress)


def _record_configuration(meeting: Meeting, settings: Settings, names_from_platform: bool) -> None:
    """Store the models and settings behind the transcript (FR14)."""
    if meeting.job is None:
        return
    if settings.uses_cloud_ai:
        meeting.job.configuration = {
            "ai_mode": settings.ai_mode,
            "ai_provider": "cloud",
            "transcription": "AssemblyAI (default speech models)",
            "speaker_turns": "platform transcript (.vtt)" if names_from_platform else "AssemblyAI speaker labels",
            "diarization_available": True,
        }
        return
    meeting.job.configuration = {
        "ai_mode": settings.ai_mode,
        "ai_provider": "local",
        "whisper_model": settings.whisper_model,
        "whisper_compute_type": settings.whisper_compute_type,
        "whisper_batch_size": settings.whisper_batch_size,
        "whisper_beam_size": settings.whisper_beam_size,
        "device": settings.device,
        "speaker_turns": "platform transcript (.vtt)" if names_from_platform else settings.diarization_model,
        "diarization_available": names_from_platform or bool(settings.hf_token),
    }


def suggest_speaker_names(db: Session, settings: Settings, meeting: Meeting, aligned: list[AlignedSegment]) -> None:
    """Propose names from introductions in the meeting; the user accepts or ignores them."""
    from app.pipeline.names import suggest_from_introductions, suggest_with_llm

    suggestions = suggest_from_introductions(aligned)
    if settings.ai_mode == "real" and len({s.speaker for s in aligned}) > 1:
        from app.pipeline.llm_clients import LLMError, make_llm_client

        try:
            client = make_llm_client(settings, "llm")
            try:
                suggestions = {**suggest_with_llm(aligned, client), **suggestions}  # introductions win
            finally:
                client.release()
        except LLMError:
            pass  # suggestions are a convenience; never fail the job over them
    by_label = {s.label: s for s in meeting.speakers}
    for label, sug in suggestions.items():
        speaker = by_label.get(label)
        if speaker is not None:
            speaker.suggested_name = sug.name
            speaker.suggestion_reason = sug.reason
            speaker.suggestion_segment_ids = sug.segment_ids
    db.commit()


def store_transcript(
    db: Session, meeting: Meeting, aligned: list[AlignedSegment], *, names_from_platform: bool = False
) -> None:
    db.execute(delete(Segment).where(Segment.meeting_id == meeting.id))
    db.execute(delete(Speaker).where(Speaker.meeting_id == meeting.id))
    db.flush()
    # Order speakers by when they first spoke, so "Speaker 1" is the first voice heard.
    labels = list(dict.fromkeys(seg.speaker for seg in aligned))
    speakers = {
        label: Speaker(
            meeting_id=meeting.id,
            label=label,
            # Names from the meeting platform's own transcript are participants' account names.
            display_name=label if names_from_platform else f"Speaker {i + 1}",
            suggestion_reason="Name from the Teams/Zoom transcript" if names_from_platform else None,
        )
        for i, label in enumerate(labels)
    }
    db.add_all(speakers.values())
    db.flush()
    db.add_all(
        Segment(
            meeting_id=meeting.id,
            speaker_id=speakers[seg.speaker].id,
            position=pos,
            start_s=seg.start,
            end_s=seg.end,
            text=seg.text,
            words=[{"w": w.text, "s": w.start, "e": w.end} for w in seg.words],
        )
        for pos, seg in enumerate(aligned)
    )
    db.commit()
    db.refresh(meeting)


def transcript_lines(meeting: Meeting) -> list[TranscriptLine]:
    """The transcript as summarizers see it, using the current (possibly renamed) speaker names."""
    return [
        TranscriptLine(
            id=seg.position,
            speaker=seg.speaker.display_name if seg.speaker else "Unknown",
            start=seg.start_s,
            end=seg.end_s,
            text=seg.current_text,  # the user's corrections, when they have made any
        )
        for seg in meeting.segments
    ]


# The summarisation configurations compared in the evaluation (spec §21).
CONFIGURATIONS = {
    "llm": "C2 evidence-grounded (local LLM, citations, schema, evidence checks)",
    "baseline": "C1 baseline (same local LLM, same fields, no citations)",
    "bart": "C3 BART + rule-based extraction",
    "cloud": "Cloud LLM, evidence-grounded (optional, public data only)",
}


def prompt_version(configuration: str) -> str:
    from app.pipeline.summarize_llm import BASELINE, GROUNDED

    return {"llm": GROUNDED.version, "cloud": GROUNDED.version, "baseline": BASELINE.version}.get(
        configuration, "bart-rules-v1"
    )


def generate_notes(
    settings: Settings,
    lines: list[TranscriptLine],
    model: str,
    on_progress: Callable[[float], None],
    cache_dir: Path | None = None,
) -> tuple[MeetingNotes, str]:
    """Run the chosen summarizer. Returns the notes and a label naming the exact model used."""
    if settings.ai_mode == "fake":
        from app.pipeline.fake import fake_summarize

        on_progress(1.0)
        notes = fake_summarize(lines)
        if model == "baseline":  # the baseline does not cite evidence
            notes = _strip_sources(notes)
        return notes, f"{model} (sample)"
    if model == "bart":
        from app.pipeline.summarize_bart import summarize_with_bart

        notes = summarize_with_bart(
            lines, model_name=settings.bart_model, device=settings.device, on_progress=on_progress
        )
        return notes, f"bart:{settings.bart_model}"

    from app.pipeline.llm_clients import make_llm_client
    from app.pipeline.summarize_llm import BASELINE, GROUNDED, summarize_with_llm

    client = make_llm_client(settings, "cloud" if model == "cloud" else "llm")
    context_tokens, max_output_tokens = llm_limits(settings, model)
    try:
        notes = summarize_with_llm(
            lines,
            client,
            context_tokens=context_tokens,
            max_output_tokens=max_output_tokens,
            max_retries=settings.llm_max_retries,
            on_progress=on_progress,
            prompts=BASELINE if model == "baseline" else GROUNDED,
            cache_dir=cache_dir,
        )
    finally:
        client.release()
    return notes, client.name


def llm_limits(settings: Settings, model: str) -> tuple[int, int]:
    """(context window, longest answer) for the model doing the work.

    Claude's large window means a whole meeting is summarized in one call; the local model needs
    the transcript split into chunks that are summarized and then merged.
    """
    if model == "cloud" or settings.uses_cloud_ai:
        return settings.cloud_llm_context_tokens, settings.cloud_llm_max_output_tokens
    return settings.llm_context_tokens, settings.llm_max_output_tokens


def _strip_sources(notes: MeetingNotes) -> MeetingNotes:
    data = notes.model_dump()

    def strip(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: ([] if k == "source_segment_ids" else strip(v)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [strip(v) for v in obj]
        return obj

    return MeetingNotes.model_validate(strip(data))


def fact_check(
    settings: Settings, notes: MeetingNotes, lines: list[TranscriptLine], on_progress: Callable[[float], None]
) -> tuple[dict[str, Check], str]:
    """Verify every point against its cited lines, with the local LLM when available."""
    client = None
    if settings.ai_mode == "real" and settings.verify_with_llm:
        from app.pipeline.llm_clients import make_llm_client

        client = make_llm_client(settings, "llm")
    try:
        return verify_notes(
            notes,
            lines,
            client,
            max_retries=settings.llm_max_retries,
            on_progress=on_progress,
            # Claude checks every claim in one request; the local model takes them ten at a time.
            batch_size=500 if settings.uses_cloud_ai else 10,
        )
    finally:
        if client is not None:
            client.release()


def evidence_status(cited: list[int], valid_ids: set[int]) -> tuple[list[int], str]:
    """Spec §15: valid (cites existing segments), missing (cites nothing), invalid (only nonexistent IDs)."""
    kept, ok = check_sources(cited, valid_ids)
    if ok:
        return kept, "valid"
    return kept, "invalid" if cited else "missing"


def summarize_meeting(
    db: Session, settings: Settings, meeting: Meeting, model: str, progress: ProgressReporter
) -> None:
    """Generate notes with one configuration and store them as that configuration's summary.

    Summaries from other configurations are kept, so they can be compared side by side (FR13, FR18).
    """
    lines = transcript_lines(meeting)
    progress.start("summarizing")
    started = time.monotonic()
    # Finished LLM steps are saved here, so Retry continues where a failed run stopped.
    cache_dir = settings.work_dir / str(meeting.id) / "llm-cache"
    notes, model_label = generate_notes(settings, lines, model, progress.callback("summarizing"), cache_dir)
    summarize_s = time.monotonic() - started
    progress.finish("summarizing")

    progress.start("verifying")
    started = time.monotonic()
    if model == "baseline":
        # The baseline cites no evidence, so there is nothing to check claims against.
        checks: dict[str, Check] = {}
        method = "none (baseline cites no evidence)"
    else:
        checks, method = fact_check(settings, notes, lines, progress.callback("verifying"))
        if settings.ai_mode == "real" and method != "llm":
            progress.warn(
                "The AI check was unavailable for some points, so they were checked by word overlap "
                "instead, which is less reliable. Is Ollama running?"
            )
    verify_s = time.monotonic() - started
    progress.finish("verifying")

    valid_ids = {line.id for line in lines}

    def sourced(key: str, ids: list[int], **fields: Any) -> dict[str, Any]:
        kept, status = evidence_status(ids, valid_ids)
        check = checks.get(key)
        return {
            **fields,
            "source_segment_ids": kept,
            "evidence_status": status,
            "verdict": check.verdict if check else "unverified",
            "verdict_note": check.note if check else None,
        }

    def json_item(key: str, ids: list[int], **fields: Any) -> dict[str, Any]:
        item = sourced(key, ids, **fields)
        item["has_source"] = item["evidence_status"] == "valid"
        return item

    topics = []
    for t, topic in enumerate(notes.topics):
        topic_ids = topic.source_segment_ids or [i for p in topic.points for i in p.source_segment_ids]
        entry = json_item(f"topic.{t}", topic_ids, title=topic.title, summary=topic.summary, outcome=topic.outcome)
        entry["points"] = [
            json_item(f"topic.{t}.point.{i}", p.source_segment_ids, text=p.text) for i, p in enumerate(topic.points)
        ]
        entry["positions"] = [
            json_item(f"topic.{t}.position.{i}", pos.source_segment_ids, speaker=pos.speaker, view=pos.view)
            for i, pos in enumerate(topic.positions)
        ]
        topics.append(entry)

    # Replace only this configuration's previous summary (its decisions and actions cascade with it).
    for old in [s for s in meeting.summaries if s.configuration == model]:
        db.delete(old)
    for other in meeting.summaries:
        other.is_active = False
    db.flush()
    summary = Summary(
        meeting_id=meeting.id,
        configuration=model,
        prompt_version=prompt_version(model),
        settings=_summary_settings(settings, model),
        timings={"summarizing_s": round(summarize_s, 2), "verifying_s": round(verify_s, 2)},
        is_active=True,
        text="\n".join(p.text for p in notes.summary),
        overview=notes.overview,
        points=[json_item(f"summary.{i}", p.source_segment_ids, text=p.text) for i, p in enumerate(notes.summary)],
        topics=topics,
        open_questions=[
            json_item(f"question.{i}", q.source_segment_ids, text=q.text) for i, q in enumerate(notes.open_questions)
        ],
        risks=[json_item(f"risk.{i}", r.source_segment_ids, text=r.text) for i, r in enumerate(notes.risks)],
        verification={"method": method, **verification_stats(checks)},
        model_used=model_label,
    )
    summary.decisions = [
        Decision(meeting_id=meeting.id, **sourced(f"decision.{i}", d.source_segment_ids, text=d.text))
        for i, d in enumerate(notes.decisions)
    ]
    summary.action_items = [
        ActionItem(
            meeting_id=meeting.id,
            **sourced(f"action.{i}", a.source_segment_ids, task=a.task, owner=a.owner, deadline=a.deadline),
        )
        for i, a in enumerate(notes.action_items)
    ]
    link_meeting(db, settings, meeting, summary)
    db.add(summary)
    meeting.model_used = model
    db.commit()
    db.refresh(meeting)


def link_meeting(db: Session, settings: Settings, meeting: Meeting, summary: Summary) -> None:
    """Project memory: check the minutes against the agenda and against earlier meetings in the series."""
    from app.pipeline.continuity import (
        Item,
        OpenAction,
        PreviousDecision,
        check_continuity,
        llm_or_none,
        review_agenda,
    )

    if summary.configuration == "baseline":  # the baseline cites nothing, so nothing can be linked
        summary.agenda_review, summary.continuity = {}, {}
        return
    client = llm_or_none(settings) if (meeting.agenda or meeting.series_id) else None
    try:
        summary.agenda_review = (
            review_agenda(meeting.agenda, summary.topics, client, settings.llm_max_retries) if meeting.agenda else {}
        )
        summary.continuity = {}
        if meeting.series_id:
            earlier = list(
                db.scalars(
                    select(Meeting)
                    .where(
                        Meeting.series_id == meeting.series_id,
                        Meeting.user_id == meeting.user_id,
                        Meeting.id != meeting.id,
                        Meeting.created_at < meeting.created_at,
                    )
                    .order_by(Meeting.created_at)
                )
            )
            previous = [
                PreviousDecision(m.id, m.title, m.created_at.date().isoformat(), d.text, list(d.source_segment_ids))
                for m in earlier
                for d in m.decisions
            ][-60:]
            actions = [
                OpenAction(a.id, m.id, m.title, a.task, a.owner, a.deadline)
                for m in earlier
                for a in m.action_items
                if a.status != "done"
            ][-60:]
            current = (
                [Item(d.text, list(d.source_segment_ids)) for d in summary.decisions]
                + [Item(p["text"], p["source_segment_ids"]) for p in summary.points]
                + [
                    Item(
                        t["summary"] + (f" Outcome: {t['outcome']}" if t.get("outcome") else ""),
                        t["source_segment_ids"],
                    )
                    for t in summary.topics
                ]
            )
            summary.continuity = check_continuity(previous, actions, current, client, settings.llm_max_retries)
    finally:
        if client is not None:
            client.release()


def _summary_settings(settings: Settings, model: str) -> dict[str, Any]:
    """What produced this summary, so results can be reproduced (FR14, NFR8)."""
    from app.pipeline.summarize_llm import chunk_budget

    base: dict[str, Any] = {"ai_mode": settings.ai_mode, "configuration": CONFIGURATIONS.get(model, model)}
    if model == "bart":
        return {**base, "model": settings.bart_model}
    cloud = model == "cloud" or settings.uses_cloud_ai
    context_tokens, max_output_tokens = llm_limits(settings, model)
    return {
        **base,
        "model": settings.cloud_llm_model if cloud else settings.ollama_model,
        "context_tokens": context_tokens,
        "chunk_tokens": chunk_budget(context_tokens, max_output_tokens),
        "max_output_tokens": max_output_tokens,
        **({"effort": settings.cloud_llm_effort} if cloud else {"temperature": 0.2}),
        "max_retries": settings.llm_max_retries,
        "ai_check": "off" if model == "baseline" else ("llm" if settings.verify_with_llm else "word-overlap"),
    }


def run_regenerate(meeting_id: int, model: str) -> None:
    """Re-summarize an already transcribed meeting with a different model (FR13)."""
    settings = get_settings()
    db = SessionLocal()
    try:
        meeting = db.get(Meeting, meeting_id)
        if meeting is None or meeting.job is None:
            return
        job = meeting.job
        meeting.status = "processing"
        job.error = None
        job.finished_at = None
        db.commit()
        progress = ProgressReporter(db, job)
        try:
            summarize_meeting(db, settings, meeting, model, progress)
            meeting.status = "completed"
            job.stage = "completed"
            job.progress_pct = 100.0
        except Exception as exc:
            log.exception("Regeneration failed for meeting %s", meeting_id)
            db.rollback()
            meeting.status = "failed"
            job.error = str(exc) or type(exc).__name__
        job.finished_at = datetime.now(UTC)
        db.commit()
    finally:
        db.close()
