"""The structured output every summarizer must produce, and its hallucination checks.

The LLM is asked for JSON matching ``MeetingNotes``; the reply is validated with
Pydantic and retried if invalid (spec §10.6). Afterwards every cited segment ID
is checked against the real transcript, points with no valid source are flagged,
and each remaining point is fact-checked against the lines it cites (verify.py).

Compared with typical meeting tools, the notes are deliberately richer:
an overview, topic-by-topic minutes with each speaker's position, and the open
questions and risks the meeting left behind - not just bullets and tasks.
"""

from typing import Any

from pydantic import BaseModel, Field, field_validator


def _blank_to_none(v: Any) -> Any:
    if isinstance(v, str) and v.strip().lower() in {"", "none", "null", "n/a", "unknown", "not stated"}:
        return None
    return v


class SourcedPoint(BaseModel):
    text: str = Field(min_length=1)
    source_segment_ids: list[int] = Field(default_factory=list)


class Position(BaseModel):
    """What one participant argued or proposed on a topic."""

    speaker: str = Field(min_length=1)
    view: str = Field(min_length=1)
    source_segment_ids: list[int] = Field(default_factory=list)


class Topic(BaseModel):
    title: str = Field(min_length=1)
    summary: str = Field(min_length=1)  # a detailed paragraph, not a one-liner
    points: list[SourcedPoint] = Field(default_factory=list)
    positions: list[Position] = Field(default_factory=list)
    outcome: str | None = None
    source_segment_ids: list[int] = Field(default_factory=list)

    _clean_outcome = field_validator("outcome", mode="before")(_blank_to_none)


class ExtractedAction(BaseModel):
    task: str = Field(min_length=1)
    owner: str | None = None
    deadline: str | None = None
    source_segment_ids: list[int] = Field(default_factory=list)

    _clean_owner = field_validator("owner", "deadline", mode="before")(_blank_to_none)


class MeetingNotes(BaseModel):
    overview: str = ""
    summary: list[SourcedPoint] = Field(default_factory=list)  # key points
    topics: list[Topic] = Field(default_factory=list)
    decisions: list[SourcedPoint] = Field(default_factory=list)
    action_items: list[ExtractedAction] = Field(default_factory=list)
    open_questions: list[SourcedPoint] = Field(default_factory=list)
    risks: list[SourcedPoint] = Field(default_factory=list)


# --- JSON schema for constrained decoding -----------------------------------
_IDS = {"type": "array", "items": {"type": "integer"}}
_NULLABLE_STR = {"anyOf": [{"type": "string"}, {"type": "null"}]}


def _obj(props: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def notes_json_schema(with_sources: bool = True) -> dict[str, Any]:
    """A plain JSON schema for constrained decoding (Ollama ``format`` / Claude ``output_config``).

    ``with_sources=False`` is the C1 baseline: identical fields, but no segment IDs are requested.
    """
    ids: dict[str, Any] = {"source_segment_ids": _IDS} if with_sources else {}
    point = _obj({"text": {"type": "string"}, **ids})
    position = _obj({"speaker": {"type": "string"}, "view": {"type": "string"}, **ids})
    topic = _obj(
        {
            "title": {"type": "string"},
            "summary": {"type": "string"},
            "points": {"type": "array", "items": point},
            "positions": {"type": "array", "items": position},
            "outcome": _NULLABLE_STR,
            **ids,
        }
    )
    action = _obj({"task": {"type": "string"}, "owner": _NULLABLE_STR, "deadline": _NULLABLE_STR, **ids})
    return _obj(
        {
            "overview": {"type": "string"},
            "summary": {"type": "array", "items": point},
            "topics": {"type": "array", "items": topic},
            "decisions": {"type": "array", "items": point},
            "action_items": {"type": "array", "items": action},
            "open_questions": {"type": "array", "items": point},
            "risks": {"type": "array", "items": point},
        }
    )


def check_sources(ids: list[int], valid_ids: set[int]) -> tuple[list[int], bool]:
    """Drop cited IDs that do not exist. Returns (kept IDs, whether any valid source remains)."""
    kept = sorted({i for i in ids if i in valid_ids})
    return kept, bool(kept)
