"""Rule-based extraction of decisions and action items, used with the BART summarizer.

BART produces free-text summaries only, so when it is selected, decisions and
action items come from these transparent keyword patterns instead. This also
gives the evaluation a simple, explainable baseline to compare the LLM against.
"""

import re

from app.pipeline.summary_schema import ExtractedAction, SourcedPoint
from app.pipeline.types import TranscriptLine

_DECISION = re.compile(
    r"\b(?:we(?:'ve| have)? (?:decided|agreed)|(?:it's|it is) (?:decided|agreed)|let's go with|"
    r"we(?:'ll| will) go with|the decision is|final decision|we're going with|agreed to|consensus is)\b",
    re.IGNORECASE,
)
_ACTION = re.compile(
    # Names must be capitalised, so only the fixed phrases are case-insensitive.
    r"\b(?:(?P<who>I|[Ww]e|[A-Z][a-z]+)(?:'ll| will| is going to| are going to| needs? to| has to| have to)"
    r"|(?i:action item|can you|could you|please))\b:?\s+(?P<task>[^.?!]{6,})",
)
_WEEKDAY = r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
_DEADLINE = re.compile(
    rf"\b(?:by|before|until|on)\s+(?:the\s+)?(?:next\s+|this\s+)?(?:{_WEEKDAY}|tomorrow|tonight|"
    r"end of (?:the )?(?:day|week|month|quarter)|\d{1,2}(?:st|nd|rd|th)?(?: of)? \w+|next (?:week|month|meeting))"
    rf"|\b(?:tomorrow|today|next week|this week|next {_WEEKDAY}|next meeting)\b",
    re.IGNORECASE,
)
_NON_NAMES = {"It", "That", "This", "There", "He", "She", "They", "You", "What", "Which", "So", "And", "But"}


_QUESTION = re.compile(r"[^.?!]*\b\w+[^.?!]*\?")
_REQUEST = re.compile(r"^\s*(?:can|could|would|will) you\b", re.IGNORECASE)
_RISK = re.compile(
    r"\b(?:risks?|risky|concerns?|concerned|worr(?:y|ied)|problems?|issues?|blockers?|block(?:ed|ing)|"
    r"delay(?:s|ed)?|depends? on|dependency|behind schedule|tight|over budget|can't|cannot|bugs?)\b",
    re.IGNORECASE,
)


def extract_questions(lines: list[TranscriptLine]) -> list[SourcedPoint]:
    """Substantive questions raised (requests like "can you..." are action items instead)."""
    out = []
    for line in lines:
        for q in _QUESTION.findall(line.text):
            q = q.strip()
            if len(q.split()) >= 5 and not _REQUEST.match(q):
                out.append(SourcedPoint(text=f"{line.speaker} asked: {q}", source_segment_ids=[line.id]))
    return out


def extract_risks(lines: list[TranscriptLine]) -> list[SourcedPoint]:
    return [
        SourcedPoint(text=f"{line.speaker}: {line.text.strip()}", source_segment_ids=[line.id])
        for line in lines
        if _RISK.search(line.text)
    ]


def extract_decisions(lines: list[TranscriptLine]) -> list[SourcedPoint]:
    return [
        SourcedPoint(text=line.text.strip(), source_segment_ids=[line.id])
        for line in lines
        if _DECISION.search(line.text)
    ]


def extract_actions(lines: list[TranscriptLine]) -> list[ExtractedAction]:
    actions: list[ExtractedAction] = []
    for line in lines:
        m = _ACTION.search(line.text)
        if not m:
            continue
        who = m.group("who")
        if who is not None and who in _NON_NAMES:
            continue
        owner: str | None
        if who == "I":
            owner = line.speaker
        elif who is None or who.lower() == "we":
            owner = None
        else:
            owner = who
        deadline = _DEADLINE.search(line.text)
        actions.append(
            ExtractedAction(
                task=m.group("task").strip().rstrip(",;"),
                owner=owner,
                deadline=deadline.group(0) if deadline else None,
                source_segment_ids=[line.id],
            )
        )
    return actions
