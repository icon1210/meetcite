"""Stage 5: cleaning and chunking for summarization (spec §10.5).

Filler words are removed only from the text sent to the summarizer; the stored
transcript keeps them. Chunks break at segment (speaker-turn) boundaries, never
mid-sentence, and overlap slightly so context is not lost at the edges.
"""

import re

from app.pipeline.types import TranscriptLine

_FILLERS = re.compile(
    # "like", "sort of" etc. are left alone: they often carry meaning ("I'd like to...").
    r"\b(?:um+|uh+|erm+|er|ah+|hmm+|mm+|you know|i mean)\b[,.]?\s*",
    flags=re.IGNORECASE,
)
_REPEATS = re.compile(r"\b(\w+)(?:\s+\1\b)+", flags=re.IGNORECASE)  # "the the the" -> "the"
_SPACES = re.compile(r"\s{2,}")


def clean_text(text: str) -> str:
    text = _FILLERS.sub("", text)
    text = _REPEATS.sub(r"\1", text)
    return _SPACES.sub(" ", text).strip(" ,")


def estimate_tokens(text: str) -> int:
    # ~1.3 tokens per English word is a conservative rule of thumb for BPE tokenizers.
    return int(len(text.split()) * 1.3) + 1


def format_line(line: TranscriptLine, clean: bool = True) -> str:
    text = clean_text(line.text) if clean else line.text
    return f"[{line.id}] {line.speaker}: {text}"


def chunk_lines(lines: list[TranscriptLine], max_tokens: int, overlap_lines: int = 2) -> list[list[TranscriptLine]]:
    """Split ``lines`` into chunks of at most ``max_tokens`` (estimated).

    Consecutive chunks share ``overlap_lines`` lines. A single line longer than
    the budget becomes its own chunk rather than being split mid-sentence.
    """
    usable = [line for line in lines if clean_text(line.text)]
    chunks: list[list[TranscriptLine]] = []
    current: list[TranscriptLine] = []
    current_tokens = 0
    for line in usable:
        tokens = estimate_tokens(format_line(line))
        if current and current_tokens + tokens > max_tokens:
            chunks.append(current)
            current = current[-overlap_lines:] if overlap_lines else []
            current_tokens = sum(estimate_tokens(format_line(x)) for x in current)
            # If the overlap alone leaves no room, drop it.
            if current_tokens + tokens > max_tokens:
                current, current_tokens = [], 0
        current.append(line)
        current_tokens += tokens
    if current:
        chunks.append(current)
    return chunks
