"""Project memory: link a meeting to its agenda and to earlier meetings in the same series.

Two checks run after the minutes are written:

* Agenda review - each planned agenda item is marked covered, partly covered or not covered,
  with the transcript lines where it was discussed, and topics that were not on the agenda are
  listed as unplanned.
* Continuity - this meeting's decisions and statements are compared with decisions made in
  earlier meetings of the series (to flag changes and contradictions), and earlier open actions
  are checked for reports that they are done or in progress.

Both are evidence-grounded like the minutes: every result points at the transcript lines (via the
summary items that cite them), so a person can check it. The LLM works from the compact,
already-cited minutes rather than the whole transcript, so it fits small local models too. If no
LLM is available (demo mode, or the model fails) a transparent word-overlap check is used and the
result says which method produced it.
"""

import json
import re
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.pipeline.llm_clients import LLMClient, LLMError
from app.pipeline.summarize_bart import content_words


@dataclass
class Item:
    """A cited statement from this meeting's minutes (decision, key point, topic summary or outcome)."""

    text: str
    source_segment_ids: list[int] = field(default_factory=list)


@dataclass
class PreviousDecision:
    meeting_id: int
    meeting_title: str
    meeting_date: str
    text: str
    source_segment_ids: list[int]


@dataclass
class OpenAction:
    action_id: int
    meeting_id: int
    meeting_title: str
    task: str
    owner: str | None
    deadline: str | None


# --- Agenda review ---------------------------------------------------------------------------

AGENDA_SYSTEM = """You check a meeting against its planned agenda.
You get the numbered agenda items and the numbered topics actually discussed (with summaries).
For every agenda item decide:
- "covered": clearly discussed, with substance or an outcome
- "partly": only mentioned briefly, or discussed without reaching anything
- "not_covered": not discussed
List the topic numbers where each item was discussed, and give a note of at most 15 words.
Also list the topic numbers that were discussed but are not on the agenda ("unplanned").
Judge only from the topics given. Reply with JSON only."""

AGENDA_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "status": {"type": "string", "enum": ["covered", "partly", "not_covered"]},
                    "topic_indices": {"type": "array", "items": {"type": "integer"}},
                    "note": {"type": "string"},
                },
                "required": ["index", "status", "topic_indices", "note"],
                "additionalProperties": False,
            },
        },
        "unplanned_topic_indices": {"type": "array", "items": {"type": "integer"}},
    },
    "required": ["items", "unplanned_topic_indices"],
    "additionalProperties": False,
}


class _AgendaItem(BaseModel):
    index: int
    status: Literal["covered", "partly", "not_covered"]
    topic_indices: list[int]
    note: str


class _AgendaReply(BaseModel):
    items: list[_AgendaItem]
    unplanned_topic_indices: list[int]


def parse_agenda(text: str | None) -> list[str]:
    """One agenda item per line; bullets and numbering are removed."""
    items = []
    for line in (text or "").splitlines():
        cleaned = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", line).strip()
        if cleaned:
            items.append(cleaned[:300])
    return items[:30]


def _overlap(a: str, b: str) -> float:
    words = content_words(a)
    return len(words & content_words(b)) / len(words) if words else 0.0


def _agenda_by_overlap(items: list[str], topics: list[dict[str, Any]]) -> dict[str, Any]:
    results, used = [], set()
    for item in items:
        scores = [(_overlap(item, f"{t['title']} {t['summary']}"), ti) for ti, t in enumerate(topics)]
        best = max((s for s, _ in scores), default=0.0)
        # Link only the closest topics, not every topic that happens to share a word.
        matched = [ti for score, ti in scores if score >= 0.25 and score >= best - 0.15]
        status = "covered" if best >= 0.5 else "partly" if best >= 0.25 else "not_covered"
        used.update(matched)
        results.append(_agenda_entry(item, status, matched, topics, f"{best:.0%} of the item's key words matched."))
    unplanned = [t["title"] for ti, t in enumerate(topics) if ti not in used]
    return {"method": "word-overlap", "items": results, "unplanned": unplanned}


def _agenda_entry(
    item: str, status: str, topic_indices: list[int], topics: list[dict[str, Any]], note: str
) -> dict[str, Any]:
    ids = sorted({i for ti in topic_indices if 0 <= ti < len(topics) for i in topics[ti]["source_segment_ids"]})
    return {
        "item": item,
        "status": status,
        "topics": [topics[ti]["title"] for ti in topic_indices if 0 <= ti < len(topics)],
        "source_segment_ids": ids,
        "note": note.strip()[:200],
    }


def review_agenda(
    agenda_text: str | None, topics: list[dict[str, Any]], client: LLMClient | None, max_retries: int = 2
) -> dict[str, Any]:
    """``topics`` are the stored topic dicts (title, summary, source_segment_ids)."""
    items = parse_agenda(agenda_text)
    if not items:
        return {}
    if client is None or not topics:
        return _agenda_by_overlap(items, topics)
    prompt = "Agenda items:\n" + "\n".join(f"{i}. {it}" for i, it in enumerate(items))
    prompt += "\n\nTopics discussed:\n" + "\n".join(
        f"{ti}. {t['title']}: {t['summary']}" for ti, t in enumerate(topics)
    )
    reply = _ask(client, AGENDA_SYSTEM, prompt, AGENDA_SCHEMA, _AgendaReply, max_retries)
    if reply is None:
        return _agenda_by_overlap(items, topics)
    by_index = {r.index: r for r in reply.items if 0 <= r.index < len(items)}
    results = []
    for i, item in enumerate(items):
        r = by_index.get(i)
        results.append(
            _agenda_entry(item, r.status, r.topic_indices, topics, r.note)
            if r
            else _agenda_entry(item, "not_covered", [], topics, "Not assessed.")
        )
    unplanned = [topics[ti]["title"] for ti in reply.unplanned_topic_indices if 0 <= ti < len(topics)]
    return {"method": "llm", "items": results, "unplanned": unplanned}


# --- Continuity with earlier meetings ----------------------------------------------------------

CONTINUITY_SYSTEM = """You keep track of a series of meetings.
You get (A) decisions made in EARLIER meetings, (B) actions from earlier meetings that are still
open, and (C) numbered statements from TODAY's meeting.
Find:
1. "contradictions": today's statements that change, reverse or conflict with an earlier decision
   (e.g. a different date, amount, owner or choice). Do not list statements that simply repeat or
   agree with an earlier decision.
2. "progress": earlier open actions that today's statements report as done or in progress.
Use only what the statements say. Give a note of at most 20 words explaining the change.
Reply with JSON only."""

CONTINUITY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "contradictions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "previous_index": {"type": "integer"},
                    "current_index": {"type": "integer"},
                    "note": {"type": "string"},
                },
                "required": ["previous_index", "current_index", "note"],
                "additionalProperties": False,
            },
        },
        "progress": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "action_index": {"type": "integer"},
                    "status": {"type": "string", "enum": ["done", "in_progress"]},
                    "current_index": {"type": "integer"},
                    "note": {"type": "string"},
                },
                "required": ["action_index", "status", "current_index", "note"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["contradictions", "progress"],
    "additionalProperties": False,
}


class _Contradiction(BaseModel):
    previous_index: int
    current_index: int
    note: str


class _Progress(BaseModel):
    action_index: int
    status: Literal["done", "in_progress"]
    current_index: int
    note: str


class _ContinuityReply(BaseModel):
    contradictions: list[_Contradiction]
    progress: list[_Progress]


_SPECIFICS = re.compile(
    r"\b(\d[\d,.]*(?:st|nd|rd|th)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|"
    r"june|july|august|september|october|november|december|thousand|million|hundred|"
    r"one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty)\b",
    re.IGNORECASE,
)
_DONE = re.compile(r"\b(done|finished|fixed|completed|sent|shipped|delivered|submitted|resolved|closed|merged)\b", re.I)
_PROGRESS = re.compile(r"\b(working on|in progress|started|halfway|almost done|nearly done|underway)\b", re.I)


def _specifics(text: str) -> set[str]:
    return {m.lower() for m in _SPECIFICS.findall(text)}


# Plans, not reports: "will be done", "to be fixed", "should be sent by Friday".
_FUTURE = re.compile(
    r"\b(will|shall|going to|to be|should|must|need to|needs to|plan to|by (?:mon|tue|wed|thu|fri|next|the end))", re.I
)
_MAX_WORDS = 40  # long topic paragraphs mix many subjects; word overlap on them is unreliable


def _short(item: Item) -> bool:
    return len(item.text.split()) <= _MAX_WORDS


def _reports(text: str, pattern: re.Pattern[str]) -> bool:
    """True when ``text`` reports something as happened, not as planned ("will be done")."""
    for m in pattern.finditer(text):
        # Look back to the start of the sentence: "We need to fix X before Y is fixed" is still a plan.
        sentence_start = max(text.rfind(ch, 0, m.start()) for ch in ".!?;") + 1
        if not _FUTURE.search(text[sentence_start : m.start()]):
            return True
    return False


def _continuity_by_overlap(
    previous: list[PreviousDecision], actions: list[OpenAction], current: list[Item]
) -> dict[str, Any]:
    """A deliberately cautious fallback: it prefers missing a change to raising a false alarm."""
    contradictions, progress = [], []
    short = [c for c in current if _short(c)]
    for p in previous:
        before = _specifics(p.text)
        for c in short:
            after = _specifics(c.text)
            # Same subject, and a specific was replaced (e.g. "the 14th" -> "the 21st"), not just added to.
            if _overlap(p.text, c.text) >= 0.4 and before - after and after - before:
                contradictions.append(_contradiction(p, c, "The specifics differ from the earlier decision."))
                break
    for a in actions:
        for c in short:
            if _overlap(a.task, c.text) < 0.5:
                continue
            if _reports(c.text, _DONE):
                progress.append(_progress(a, "done", c, "Reported in today's meeting."))
                break
            if _reports(c.text, _PROGRESS):
                progress.append(_progress(a, "in_progress", c, "Reported in today's meeting."))
                break
    return {"method": "word-overlap", "contradictions": contradictions, "progress": progress}


def _contradiction(p: PreviousDecision, c: Item, note: str) -> dict[str, Any]:
    return {
        "previous_meeting_id": p.meeting_id,
        "previous_meeting_title": p.meeting_title,
        "previous_meeting_date": p.meeting_date,
        "previous_decision": p.text,
        "previous_source_ids": p.source_segment_ids,
        "current": c.text,
        "source_segment_ids": c.source_segment_ids,
        "note": note.strip()[:200],
    }


def _progress(a: OpenAction, status: str, c: Item, note: str) -> dict[str, Any]:
    return {
        "action_id": a.action_id,
        "meeting_id": a.meeting_id,
        "meeting_title": a.meeting_title,
        "task": a.task,
        "owner": a.owner,
        "status": status,
        "current": c.text,
        "source_segment_ids": c.source_segment_ids,
        "note": note.strip()[:200],
    }


def check_continuity(
    previous: list[PreviousDecision],
    actions: list[OpenAction],
    current: list[Item],
    client: LLMClient | None,
    max_retries: int = 2,
) -> dict[str, Any]:
    if not previous and not actions:
        return {}
    current = [c for c in current if c.source_segment_ids]  # only cited statements can serve as evidence
    if not current:
        return {"method": "none", "contradictions": [], "progress": []}
    if client is None:
        return _continuity_by_overlap(previous, actions, current)
    prompt = "(A) Earlier decisions:\n" + (
        "\n".join(f"{i}. [{p.meeting_date}, {p.meeting_title}] {p.text}" for i, p in enumerate(previous)) or "(none)"
    )
    prompt += "\n\n(B) Open actions from earlier meetings:\n" + (
        "\n".join(
            f"{i}. {a.task}"
            + (f" (owner: {a.owner})" if a.owner else "")
            + (f" (due: {a.deadline})" if a.deadline else "")
            for i, a in enumerate(actions)
        )
        or "(none)"
    )
    prompt += "\n\n(C) Today's statements:\n" + "\n".join(f"{i}. {c.text}" for i, c in enumerate(current))
    reply = _ask(client, CONTINUITY_SYSTEM, prompt, CONTINUITY_SCHEMA, _ContinuityReply, max_retries)
    if reply is None:
        return _continuity_by_overlap(previous, actions, current)
    ok = lambda i, seq: 0 <= i < len(seq)  # noqa: E731
    return {
        "method": "llm",
        "contradictions": [
            _contradiction(previous[r.previous_index], current[r.current_index], r.note)
            for r in reply.contradictions
            if ok(r.previous_index, previous) and ok(r.current_index, current)
        ],
        "progress": [
            _progress(actions[r.action_index], r.status, current[r.current_index], r.note)
            for r in reply.progress
            if ok(r.action_index, actions) and ok(r.current_index, current)
        ],
    }


# --- Shared ------------------------------------------------------------------------------------

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", flags=re.MULTILINE)


def _ask(client: LLMClient, system: str, prompt: str, schema: dict[str, Any], model: Any, max_retries: int) -> Any:
    """Validated JSON from the LLM, or None if it keeps failing (the caller then uses word overlap)."""
    attempt = prompt
    for _ in range(max_retries):
        try:
            raw = client.complete_json(system, attempt, schema)
            return model.model_validate_json(_FENCE.sub("", raw.strip()))
        except (ValidationError, json.JSONDecodeError) as exc:
            attempt = f"{prompt}\n\nYour previous reply was invalid ({str(exc)[:200]}). Reply with valid JSON only."
        except LLMError:
            return None
    return None


def llm_or_none(settings: Settings) -> LLMClient | None:
    if settings.ai_mode != "real":
        return None
    from app.pipeline.llm_clients import make_llm_client

    try:
        return make_llm_client(settings, "llm")
    except LLMError:
        return None
