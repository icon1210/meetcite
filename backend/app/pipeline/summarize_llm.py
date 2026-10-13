"""Summarizer B: a prompted LLM with hierarchical ("map-reduce") summarization (spec §10.6).

Map: each transcript chunk becomes partial notes - an overview, key points,
topic-by-topic minutes with each speaker's position, decisions, action items,
open questions and risks - every item citing the segment IDs it is based on.
Reduce: the partial notes are merged into one final, de-duplicated set.
"""

import hashlib
import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from app.pipeline.chunking import chunk_lines, estimate_tokens, format_line
from app.pipeline.llm_clients import LLMClient, LLMError, LLMTruncated
from app.pipeline.summary_schema import MeetingNotes, notes_json_schema
from app.pipeline.types import TranscriptLine

FIELDS = """Fields:
- overview: 3-5 sentences: the meeting's purpose, the main topics and the main outcomes.
- summary: the key points, each one specific (include the names, numbers and reasons that were given).
- topics: one entry per distinct subject discussed, in the order discussed. For each:
  - title: a short name for the subject.
  - summary: a detailed paragraph (3-6 sentences) of what was discussed, including the reasoning,
    options considered and any figures mentioned.
  - points: the important individual statements or facts on this subject.
  - positions: what each participant argued, proposed or objected to (one entry per speaker with a view).
    Record disagreement faithfully; do not smooth it over.
  - outcome: what was concluded on this subject, or null if nothing was concluded.
- decisions: things the group agreed or concluded (not ideas that were merely mentioned).
- action_items: concrete tasks someone committed to or was asked to do.
- open_questions: questions raised that were NOT answered or resolved in the meeting.
- risks: concerns, problems, blockers or dependencies that someone raised."""

COMMON_RULES = """- Set "owner" only if the transcript says who will do the task; otherwise null.
- Set "deadline" only if a time is stated (copy it as said, e.g. "next Friday"); otherwise null.
- Use the speaker names exactly as they appear in the transcript.
- Write in clear, neutral, third-person English. Be detailed but do not repeat yourself.
- Use empty lists when there is nothing to report. Reply with JSON only."""

# C2 - evidence-grounded: every item must cite the transcript lines it is based on.
GROUNDED_RULES = f"""Rules:
- Use ONLY information stated in the transcript. Never invent names, dates, numbers or tasks.
- Every item must cite the IDs (the numbers in square brackets) of the transcript lines that support it.
{COMMON_RULES}"""

# C1 - baseline: the same task and fields, with no citation or evidence instructions (spec §21).
BASELINE_RULES = f"""Rules:
{COMMON_RULES}"""

MERGE_RULES = """- Write a new overview for the whole meeting.
- Keep the 6 to 12 most important key points, in chronological order.
- Merge topics that are about the same subject (combine their summaries, points and positions);
  keep separate subjects separate, in the order they were first discussed.
- Keep all distinct decisions, action items, open questions and risks. Drop an open question if later
  notes show it was answered."""


@dataclass(frozen=True)
class PromptSet:
    version: str
    grounded: bool
    map_system: str
    reduce_system: str


GROUNDED = PromptSet(
    version="c2-grounded-v2",
    grounded=True,
    map_system=f"""You are an expert minute-taker writing detailed minutes from a transcript excerpt.
Each transcript line looks like: [ID] Speaker: text
{FIELDS}
{GROUNDED_RULES}""",
    reduce_system=f"""You are an expert minute-taker merging partial meeting notes into final, detailed minutes.
The notes were written from consecutive parts of one meeting, in order.
{MERGE_RULES}
- When merging items, combine their source_segment_ids. Do not add anything that is not in the notes.
{FIELDS}
{GROUNDED_RULES}""",
)

BASELINE = PromptSet(
    version="c1-plain-v1",
    grounded=False,
    map_system=f"""You are an expert minute-taker writing detailed minutes from a transcript excerpt.
Each transcript line looks like: Speaker: text
{FIELDS}
{BASELINE_RULES}""",
    reduce_system=f"""You are an expert minute-taker merging partial meeting notes into final, detailed minutes.
The notes were written from consecutive parts of one meeting, in order.
{MERGE_RULES}
{FIELDS}
{BASELINE_RULES}""",
)

# Kept for code that refers to the grounded prompts directly.
MAP_SYSTEM = GROUNDED.map_system
REDUCE_SYSTEM = GROUNDED.reduce_system

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", flags=re.MULTILINE)


def _call_validated(
    client: LLMClient,
    system: str,
    user: str,
    max_retries: int,
    with_sources: bool = True,
    cache_dir: Path | None = None,
) -> MeetingNotes:
    """Ask for JSON, validate it with Pydantic, and retry with the error message if invalid.

    Valid answers are saved in ``cache_dir`` keyed by the exact request, so a retried job
    resumes after the last completed step instead of repeating every slow LLM call (NFR3).
    """
    cache_file = None
    if cache_dir is not None:
        key = hashlib.sha256(f"{client.name}\n{system}\n{user}\n{with_sources}".encode()).hexdigest()[:24]
        cache_file = cache_dir / f"{key}.json"
        if cache_file.exists():
            return MeetingNotes.model_validate_json(cache_file.read_text(encoding="utf-8"))
    notes = _ask(client, system, user, max_retries, with_sources)
    if cache_file is not None:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(notes.model_dump_json(), encoding="utf-8")
    return notes


def _ask(client: LLMClient, system: str, user: str, max_retries: int, with_sources: bool) -> MeetingNotes:
    schema = notes_json_schema(with_sources)
    prompt = user
    last_error = ""
    for _ in range(max_retries):
        try:
            raw = client.complete_json(system, prompt, schema)
        except LLMTruncated as exc:
            last_error = str(exc)
            prompt = (
                f"{user}\n\nYour previous reply was too long and was cut off. Reply again with valid JSON only, "
                "keeping every text short and never repeating an item."
            )
            continue
        try:
            return MeetingNotes.model_validate_json(_FENCE.sub("", raw.strip()))
        except ValidationError as exc:
            last_error = str(exc)[:800]
            prompt = (
                f"{user}\n\nYour previous reply was not valid JSON for the required format. "
                f"Error:\n{last_error}\nReply again with valid JSON only."
            )
    raise LLMError(f"The language model did not return valid notes after {max_retries} attempts: {last_error}")


def chunk_budget(context_tokens: int, max_output_tokens: int, prompts: PromptSet = GROUNDED) -> int:
    """Transcript tokens per LLM call.

    The instructions, the transcript excerpt and the whole answer must fit in the context window
    together; if they don't, Ollama drops the start of the prompt and the model loses its task.
    """
    instructions = estimate_tokens(prompts.reduce_system) + 200
    return max(512, min(int(context_tokens * 0.6), context_tokens - max_output_tokens - instructions))


def summarize_with_llm(
    lines: list[TranscriptLine],
    client: LLMClient,
    *,
    context_tokens: int,
    max_retries: int,
    on_progress: Callable[[float], None],
    prompts: PromptSet = GROUNDED,
    cache_dir: Path | None = None,
    max_output_tokens: int = 4096,
) -> MeetingNotes:
    budget = chunk_budget(context_tokens, max_output_tokens, prompts)
    chunks = chunk_lines(lines, max_tokens=budget)
    if not chunks:
        return MeetingNotes()
    grounded = prompts.grounded

    def render(line: TranscriptLine) -> str:
        text = format_line(line)
        return text if grounded else text.split("] ", 1)[1]  # the baseline sees no line IDs

    partials: list[MeetingNotes] = []
    for i, chunk in enumerate(chunks):
        transcript = "\n".join(render(line) for line in chunk)
        partials.append(
            _call_validated(
                client, prompts.map_system, f"Transcript excerpt:\n{transcript}", max_retries, grounded, cache_dir
            )
        )
        on_progress((i + 1) / (len(chunks) + 1))

    if len(partials) == 1:
        on_progress(1.0)
        return partials[0]

    # Reduce. If the combined partial notes are themselves too long, reduce them in groups first.
    while len(partials) > 1:
        groups: list[list[MeetingNotes]] = [[]]
        for p in partials:
            candidate = groups[-1] + [p]
            if groups[-1] and estimate_tokens(_dump(candidate)) > budget:
                groups.append([p])
            else:
                groups[-1].append(p)
        if len(groups) == len(partials) and len(partials) > 1:
            groups = [partials]  # cannot shrink further by grouping; merge everything at once
        partials = [
            _call_validated(
                client,
                prompts.reduce_system,
                f"Partial notes, in meeting order:\n{_dump(g)}",
                max_retries,
                grounded,
                cache_dir,
            )
            if len(g) > 1
            else g[0]
            for g in groups
        ]
    on_progress(1.0)
    return partials[0]


def _dump(notes: list[MeetingNotes]) -> str:
    return json.dumps([n.model_dump() for n in notes], ensure_ascii=False)
