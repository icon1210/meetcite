"""Putting real names on speakers.

Speaker diarization only says *that* voices differ ("SPEAKER_00", "SPEAKER_01").
MeetMind gets names in two ways:

1. Meeting-platform transcript (most reliable). Teams and Zoom can export a
   transcript (.vtt) that records who was speaking when, using participants'
   account names. Its speaker turns are used directly, so every segment gets
   the real name - even when diarization is unavailable.
2. Suggestions from the conversation. Self-introductions ("I'm Priya") and,
   with the local LLM, other clear cues are turned into *suggestions* that the
   user must accept. Names are never applied silently from guesses, because a
   wrong name attached to a decision or task is worse than no name.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from app.pipeline.llm_clients import LLMClient, LLMError
from app.pipeline.types import AlignedSegment, Turn

# --- 1. Teams / Zoom transcripts ------------------------------------------------
_CUE_TIME = re.compile(r"(?P<s>(?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*(?P<e>(?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})")
_TEAMS_VOICE = re.compile(r"<v\s+([^>]+)>")  # Teams: <v Jane Doe>text</v>
_ZOOM_SPEAKER = re.compile(r"^([^:<>]{2,60}):\s+\S")  # Zoom: "Jane Doe: text"
_TAGS = re.compile(r"<[^>]+>")


class TranscriptFileError(ValueError):
    pass


def _seconds(stamp: str) -> float:
    parts = stamp.replace(",", ".").split(":")
    total = 0.0
    for p in parts:
        total = total * 60 + float(p)
    return total


def parse_platform_transcript(text: str) -> list[Turn]:
    """Speaker turns from a Teams or Zoom WebVTT transcript. Consecutive cues by one person are merged."""
    if "-->" not in text:
        raise TranscriptFileError("This does not look like a .vtt transcript (no timestamps found).")
    turns: list[Turn] = []
    for block in re.split(r"\r?\n\s*\r?\n", text):
        lines = [line.strip() for line in block.strip().splitlines() if line.strip()]
        time_idx = next((i for i, line in enumerate(lines) if _CUE_TIME.search(line)), None)
        if time_idx is None:
            continue
        m = _CUE_TIME.search(lines[time_idx])
        assert m is not None
        body = " ".join(lines[time_idx + 1 :])
        voice = _TEAMS_VOICE.search(body)
        speaker = voice.group(1).strip() if voice else None
        if speaker is None:
            zoom = _ZOOM_SPEAKER.match(_TAGS.sub("", body))
            speaker = zoom.group(1).strip() if zoom else None
        if not speaker:
            continue
        start, end = _seconds(m.group("s")), _seconds(m.group("e"))
        last = turns[-1] if turns else None
        if last and last.speaker == speaker and start - last.end <= 1.0:
            last.end = max(last.end, end)
        else:
            turns.append(Turn(speaker=speaker, start=round(start, 2), end=round(end, 2)))
    if not turns:
        raise TranscriptFileError("No speaker names were found in the transcript file.")
    return turns


def load_platform_transcript(path: Path) -> list[Turn]:
    return parse_platform_transcript(path.read_text(encoding="utf-8-sig", errors="replace"))


# --- 2. Suggestions from the conversation --------------------------------------
_INTRO = re.compile(r"\b(?:I'm|I am|my name is|this is)\s+([A-Z][a-z]{1,20}(?:\s[A-Z][a-z]{1,20})?)\b")
_NOT_NAMES = {
    "Going",
    "Just",
    "Sure",
    "Here",
    "Sorry",
    "Not",
    "Happy",
    "Glad",
    "Good",
    "Fine",
    "Back",
    "Okay",
    "Ok",
    "Really",
    "Trying",
    "Looking",
    "Working",
    "Done",
    "Ready",
    "Great",
    "The",
    "That",
    "What",
    "Very",
    "Also",
    # Languages and nationalities are often mentioned in meetings but are not people's names.
    "English",
    "Pidgin",
    "Yoruba",
    "Igbo",
    "Hausa",
    "French",
    "Spanish",
    "Arabic",
    "Nigerian",
    "British",
    "American",
}


@dataclass
class NameSuggestion:
    name: str
    reason: str
    segment_ids: list[int]


def suggest_from_introductions(segments: list[AlignedSegment]) -> dict[str, NameSuggestion]:
    """A speaker who says "I'm Priya" in their own turn is probably Priya."""
    found: dict[str, NameSuggestion] = {}
    for pos, seg in enumerate(segments):
        if seg.speaker in found:
            continue
        m = _INTRO.search(seg.text)
        if m and m.group(1).split()[0] not in _NOT_NAMES:
            found[seg.speaker] = NameSuggestion(
                name=m.group(1), reason=f'Introduced themselves: "{seg.text[:80]}"', segment_ids=[pos]
            )
    return found


NAMES_SYSTEM = """You identify the names of meeting participants from a transcript.
Each line looks like: [ID] SPEAKER_LABEL: text
Speaker labels come from voice analysis and have no names. For each label, give the person's name ONLY if
the transcript makes it clear, for example:
- they introduce themselves ("I'm Tunde", "this is Amaka from finance");
- someone addresses them by name and that label replies directly ("Over to you, Sarah." then SPEAKER_02 speaks).
If it is not clear, use null. Never guess from roles, topics or speaking style.
Cite the line IDs that show the name and give a short reason. Reply with JSON only."""

_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "speakers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "name": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "segment_ids": {"type": "array", "items": {"type": "integer"}},
                    "reason": {"type": "string"},
                },
                "required": ["label", "name", "segment_ids", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["speakers"],
    "additionalProperties": False,
}


class _Item(BaseModel):
    label: str
    name: str | None
    segment_ids: list[int]
    reason: str


class _Reply(BaseModel):
    speakers: list[_Item]


_NAME_CUE = re.compile(r"\b[A-Z][a-z]{2,}\b")


def _context_lines(segments: list[AlignedSegment], max_lines: int = 160) -> list[int]:
    """Lines likely to reveal names: each speaker's first turns, plus lines containing capitalised words
    and the line that follows them (the person who answers)."""
    chosen: set[int] = set()
    first_turns: dict[str, int] = {}
    for pos, seg in enumerate(segments):
        if first_turns.get(seg.speaker, 0) < 4:
            chosen.add(pos)
            first_turns[seg.speaker] = first_turns.get(seg.speaker, 0) + 1
        words = _NAME_CUE.findall(seg.text)
        if any(w not in _NOT_NAMES and w != "I" for w in words[1:]):  # skip the sentence-initial word
            chosen.update({pos, pos + 1})
    return sorted(i for i in chosen if i < len(segments))[:max_lines]


def suggest_with_llm(segments: list[AlignedSegment], client: LLMClient) -> dict[str, NameSuggestion]:
    ids = _context_lines(segments)
    if not ids:
        return {}
    transcript = "\n".join(f"[{i}] {segments[i].speaker}: {segments[i].text}" for i in ids)
    labels = sorted({s.speaker for s in segments})
    prompt = f"Speaker labels: {', '.join(labels)}\n\nTranscript lines:\n{transcript}"
    try:
        reply = _Reply.model_validate_json(client.complete_json(NAMES_SYSTEM, prompt, _SCHEMA))
    except (ValidationError, LLMError, json.JSONDecodeError):
        return {}
    out: dict[str, NameSuggestion] = {}
    valid_ids = set(ids)
    for item in reply.speakers:
        cited = [i for i in item.segment_ids if i in valid_ids]
        # A suggestion must point at real lines that actually contain the name.
        if (
            item.label in labels
            and item.name
            and item.name.split()[0].capitalize() not in _NOT_NAMES
            and cited
            and any(item.name.split()[0].lower() in segments[i].text.lower() for i in cited)
        ):
            out[item.label] = NameSuggestion(
                name=item.name.strip(), reason=item.reason.strip()[:300], segment_ids=cited
            )
    return out
