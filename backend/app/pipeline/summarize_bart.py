"""Summarizer A: BART (fine-tuned on AMI) with hierarchical summarization (spec §10.6).

BART reads at most 1,024 tokens, so each chunk is summarized separately and the
chunk summaries are summarized again if they are still too long. Each summary
sentence is then linked back to the transcript lines it overlaps with most.
"""

import re
from collections.abc import Callable

from app.pipeline.chunking import chunk_lines, clean_text, estimate_tokens
from app.pipeline.extract_rules import extract_actions, extract_decisions, extract_questions, extract_risks
from app.pipeline.gpu import release_gpu_memory
from app.pipeline.summary_schema import MeetingNotes, SourcedPoint, Topic
from app.pipeline.types import TranscriptLine

BART_INPUT_TOKENS = 900  # below the 1,024 limit, leaving room for tokenizer differences
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")
_WORD = re.compile(r"[a-z0-9']+")
_STOP = set(
    "the a an and or but of to in on for with is are was were be been it this that we i you they he she "
    "will would can could should have has had do does did not so as at by from about".split()
)


def content_words(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 2}


def link_sentence(sentence: str, lines: list[TranscriptLine], top_k: int = 2) -> list[int]:
    """Return IDs of the lines sharing the most content words with ``sentence``."""
    target = content_words(sentence)
    if not target:
        return []
    scored = []
    for line in lines:
        overlap = len(target & content_words(line.text))
        if overlap:
            scored.append((overlap / len(target), line.id))
    scored.sort(reverse=True)
    return sorted(i for score, i in scored[:top_k] if score >= 0.2)


def _chunk_text(chunk: list[TranscriptLine]) -> str:
    # Speaker names help BART attribute statements, as in the AMI training data format.
    return "\n".join(f"{line.speaker}: {clean_text(line.text)}" for line in chunk)


def summarize_with_bart(
    lines: list[TranscriptLine], *, model_name: str, device: str, on_progress: Callable[[float], None]
) -> MeetingNotes:
    from transformers import pipeline

    summarizer = pipeline("summarization", model=model_name, device=0 if device == "cuda" else -1)

    def run(text: str) -> str:
        out = summarizer(text, max_length=180, min_length=40, truncation=True, do_sample=False)
        return str(out[0]["summary_text"]).strip()

    try:
        combined, sections = _hierarchical_summary(run, lines, on_progress)
    finally:
        summarizer = None  # drop the model so its GPU memory can be freed
        release_gpu_memory()
    return _to_notes(combined, sections, lines, on_progress)


def _hierarchical_summary(
    run: Callable[[str], str], lines: list[TranscriptLine], on_progress: Callable[[float], None]
) -> tuple[str, list[tuple[list[TranscriptLine], str]]]:
    """Returns the final summary and each chunk with its own summary (used as time-based sections)."""
    chunks = chunk_lines(lines, max_tokens=BART_INPUT_TOKENS, overlap_lines=1)
    pieces: list[str] = []
    for i, chunk in enumerate(chunks):
        pieces.append(run(_chunk_text(chunk)))
        on_progress((i + 1) / (len(chunks) + 1))
    sections = list(zip(chunks, pieces, strict=True))

    # Reduce: summarize the summaries until they fit comfortably.
    combined = " ".join(pieces)
    while estimate_tokens(combined) > BART_INPUT_TOKENS * 2 and len(pieces) > 1:
        groups, current = [], ""
        for p in pieces:
            if current and estimate_tokens(current + " " + p) > BART_INPUT_TOKENS:
                groups.append(current)
                current = p
            else:
                current = f"{current} {p}".strip()
        groups.append(current)
        if len(groups) == len(pieces):
            break  # grouping cannot shrink the text any further
        pieces = [run(g) for g in groups]
        combined = " ".join(pieces)
    return combined, sections


def _mmss(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 60}:{s % 60:02d}"


def _sourced_sentences(text: str, lines: list[TranscriptLine]) -> list[SourcedPoint]:
    seen: set[str] = set()
    points: list[SourcedPoint] = []
    for sentence in _SENT_SPLIT.split(text):
        sentence = sentence.strip()
        if len(sentence) < 15 or sentence.lower() in seen:
            continue
        seen.add(sentence.lower())
        points.append(SourcedPoint(text=sentence, source_segment_ids=link_sentence(sentence, lines)))
    return points


def _to_notes(
    combined: str,
    sections: list[tuple[list[TranscriptLine], str]],
    lines: list[TranscriptLine],
    on_progress: Callable[[float], None],
) -> MeetingNotes:
    points = _sourced_sentences(combined, lines)
    # BART cannot name topics, so its detailed minutes are time-based sections, one per chunk.
    topics = [
        Topic(
            title=f"Part {i + 1} ({_mmss(chunk[0].start)}–{_mmss(chunk[-1].end)})",
            summary=piece,
            points=_sourced_sentences(piece, chunk),
            source_segment_ids=[line.id for line in chunk],
        )
        for i, (chunk, piece) in enumerate(sections)
        if piece
    ]
    on_progress(1.0)
    return MeetingNotes(
        overview=" ".join(p.text for p in points[:3]),
        summary=points,
        topics=topics,
        decisions=extract_decisions(lines),
        action_items=extract_actions(lines),
        open_questions=extract_questions(lines),
        risks=extract_risks(lines),
    )
