"""Plain data structures passed between pipeline stages.

Each stage reads and writes these as JSON files in the meeting's work folder,
which is what lets a failed job resume from the last successful stage (NFR7).
"""

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Word:
    text: str
    start: float
    end: float


@dataclass
class Turn:
    """A diarization turn: one speaker talking over a time span."""

    speaker: str
    start: float
    end: float


@dataclass
class AlignedSegment:
    """A run of consecutive words from the same speaker."""

    speaker: str
    start: float
    end: float
    words: list[Word] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(w.text.strip() for w in self.words).strip()


@dataclass
class TranscriptLine:
    """A transcript segment as the summarizers see it. ``id`` is the segment position."""

    id: int
    speaker: str
    start: float
    end: float
    text: str


def to_jsonable(obj: Any) -> Any:
    if isinstance(obj, list):
        return [to_jsonable(o) for o in obj]
    return asdict(obj)


def words_from_json(data: list[dict[str, Any]]) -> list[Word]:
    return [Word(**d) for d in data]


def turns_from_json(data: list[dict[str, Any]]) -> list[Turn]:
    return [Turn(**d) for d in data]


def segments_from_json(data: list[dict[str, Any]]) -> list[AlignedSegment]:
    return [
        AlignedSegment(speaker=d["speaker"], start=d["start"], end=d["end"], words=words_from_json(d["words"]))
        for d in data
    ]
