"""Fact-check every generated point against the transcript lines it cites.

Mainstream meeting tools ask users to trust their summaries. MeetMind instead
runs a second, independent pass: each claim (key point, topic summary, speaker
position, decision, action item, open question, risk) is shown to a "verifier"
together with only the transcript lines it cites (plus one neighbouring line
either side for context), and labelled:

  supported    - every detail is stated in the evidence
  partial      - the gist is there, but a detail (name, number, date, owner) is missing or different
  unsupported  - the evidence does not say this, or contradicts it

The verifier is the local LLM. If no LLM is available (e.g. the BART-only path
with Ollama stopped, or demo mode) a transparent word-overlap check is used
instead, and the interface says which method produced the labels.
"""

import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ValidationError

from app.pipeline.llm_clients import LLMClient, LLMError, LLMTruncated
from app.pipeline.summary_schema import MeetingNotes
from app.pipeline.types import TranscriptLine

Verdict = Literal["supported", "partial", "unsupported"]
BATCH = 10

VERIFY_SYSTEM = """You are a strict fact-checker for meeting minutes.
For each claim you get the transcript lines it was based on ("evidence"). Lines marked (context) are
neighbouring lines, included only so you can follow the conversation.
Label each claim:
- "supported": every detail in the claim (who, what, numbers, dates, outcomes) is stated in the evidence.
- "partial": the main idea is in the evidence, but at least one detail is missing, different or overstated.
- "unsupported": the evidence does not say this, or contradicts it.
Give a reason of at most 20 words, naming the detail that is wrong or missing when the label is not "supported".
Judge only against the evidence, not general knowledge. Reply with JSON only."""


@dataclass
class Claim:
    key: str
    text: str
    source_ids: list[int]


@dataclass
class Check:
    verdict: Verdict
    note: str


class _Result(BaseModel):
    id: int
    verdict: Verdict
    reason: str


class _Results(BaseModel):
    results: list[_Result]


_RESULTS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "verdict": {"type": "string", "enum": ["supported", "partial", "unsupported"]},
                    "reason": {"type": "string"},
                },
                "required": ["id", "verdict", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["results"],
    "additionalProperties": False,
}


def iter_claims(notes: MeetingNotes) -> Iterator[Claim]:
    """Every checkable statement in the notes, each with a stable key."""
    for i, p in enumerate(notes.summary):
        yield Claim(f"summary.{i}", p.text, p.source_segment_ids)
    for t, topic in enumerate(notes.topics):
        text = topic.summary + (f" Outcome: {topic.outcome}" if topic.outcome else "")
        yield Claim(
            f"topic.{t}", text, topic.source_segment_ids or [i for p in topic.points for i in p.source_segment_ids]
        )
        for i, p in enumerate(topic.points):
            yield Claim(f"topic.{t}.point.{i}", p.text, p.source_segment_ids)
        for i, pos in enumerate(topic.positions):
            yield Claim(f"topic.{t}.position.{i}", f"{pos.speaker}: {pos.view}", pos.source_segment_ids)
    for i, d in enumerate(notes.decisions):
        yield Claim(f"decision.{i}", d.text, d.source_segment_ids)
    for i, a in enumerate(notes.action_items):
        parts = [a.task]
        if a.owner:
            parts.append(f"Owner: {a.owner}.")
        if a.deadline:
            parts.append(f"Deadline: {a.deadline}.")
        yield Claim(f"action.{i}", " ".join(parts), a.source_segment_ids)
    for i, q in enumerate(notes.open_questions):
        yield Claim(f"question.{i}", f"Unresolved question: {q.text}", q.source_segment_ids)
    for i, r in enumerate(notes.risks):
        yield Claim(f"risk.{i}", f"Concern raised: {r.text}", r.source_segment_ids)


def _evidence(claim: Claim, by_id: dict[int, TranscriptLine], order: list[int]) -> str:
    cited = [i for i in claim.source_ids if i in by_id]
    position = {line_id: idx for idx, line_id in enumerate(order)}
    context = {order[position[i] + d] for i in cited for d in (-1, 1) if 0 <= position[i] + d < len(order)} - set(cited)
    lines = []
    for line_id in sorted(set(cited) | context, key=position.__getitem__):
        line = by_id[line_id]
        tag = " (context)" if line_id in context else ""
        lines.append(f"[{line.id}]{tag} {line.speaker}: {line.text}")
    return "\n".join(lines)


# --- Word-overlap fallback ----------------------------------------------------
_WORD = re.compile(r"[a-z0-9]+")
_STOP = set(
    "the a an and or but of to in on for with is are was were be been it this that we i you they he she will "
    "would can could should have has had do does did not so as at by from about their there his her its our "
    "owner deadline outcome concern raised unresolved question also just very".split()
)


def _stem(word: str) -> str:
    for suffix in ("ing", "ed", "es", "s"):
        if len(word) > 4 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def _words(text: str) -> set[str]:
    return {_stem(w) for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 2}


def overlap_check(claim: Claim, evidence_text: str) -> Check:
    words = _words(claim.text)
    if not words:
        return Check("partial", "Too short to check automatically.")
    found = words & _words(evidence_text)
    ratio = len(found) / len(words)
    missing = sorted(words - found)[:4]
    if ratio >= 0.6:
        return Check("supported", f"{ratio:.0%} of the claim's key words appear in the cited lines.")
    if ratio >= 0.3:
        return Check("partial", f"Only {ratio:.0%} of key words found; not found: {', '.join(missing)}.")
    return Check("unsupported", f"Only {ratio:.0%} of key words found in the cited lines.")


# --- Main entry point ----------------------------------------------------------
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", flags=re.MULTILINE)


def _llm_batch(client: LLMClient, batch: list[tuple[int, Claim, str]], max_retries: int) -> dict[int, Check]:
    payload = "\n\n".join(f"Claim {n}: {c.text}\nEvidence:\n{ev or '(none)'}" for n, c, ev in batch)
    prompt = payload
    for _ in range(max_retries):
        try:
            raw = client.complete_json(VERIFY_SYSTEM, prompt, _RESULTS_SCHEMA)
        except LLMTruncated:
            prompt = f"{payload}\n\nYour previous reply was cut off. Keep each reason under 20 words. JSON only."
            continue
        try:
            parsed = _Results.model_validate_json(_FENCE.sub("", raw.strip()))
        except ValidationError as exc:
            prompt = f"{payload}\n\nYour previous reply was invalid ({str(exc)[:300]}). Reply with valid JSON only."
            continue
        return {r.id: Check(r.verdict, r.reason.strip()) for r in parsed.results}
    raise LLMError("The verifier did not return valid JSON.")


def verify_notes(
    notes: MeetingNotes,
    lines: list[TranscriptLine],
    client: LLMClient | None,
    *,
    max_retries: int = 2,
    on_progress: Callable[[float], None] = lambda f: None,
    batch_size: int = BATCH,
) -> tuple[dict[str, Check], str]:
    """Return a check for every claim (by key) and the name of the method used."""
    by_id = {line.id: line for line in lines}
    order = [line.id for line in lines]
    claims = list(iter_claims(notes))
    checks: dict[str, Check] = {}
    pending: list[tuple[int, Claim, str]] = []
    for n, claim in enumerate(claims):
        if not any(i in by_id for i in claim.source_ids):
            checks[claim.key] = Check("unsupported", "No valid transcript lines were cited for this point.")
        else:
            pending.append((n, claim, _evidence(claim, by_id, order)))

    llm_batches = fallback_batches = 0
    for start in range(0, len(pending), batch_size):
        batch = pending[start : start + batch_size]
        results: dict[int, Check] = {}
        if client is not None:
            try:
                results = _llm_batch(client, batch, max_retries)
                llm_batches += 1
            except LLMError:
                client = None  # verifier unavailable: use word overlap for the rest
        if not results:
            fallback_batches += 1
        for n, claim, _ev in batch:
            # The overlap check uses only the cited lines: context lines would inflate the score.
            cited_text = " ".join(by_id[i].text for i in claim.source_ids if i in by_id)
            checks[claim.key] = results.get(n) or overlap_check(claim, cited_text)
        on_progress(min(1.0, (start + len(batch)) / max(len(pending), 1)))
    on_progress(1.0)
    if llm_batches and fallback_batches:
        method = "llm+word-overlap"
    elif llm_batches:
        method = "llm"
    else:
        method = "word-overlap"
    return checks, method


def verification_stats(checks: dict[str, Check]) -> dict[str, int]:
    stats = {"supported": 0, "partial": 0, "unsupported": 0}
    for c in checks.values():
        stats[c.verdict] += 1
    return stats
