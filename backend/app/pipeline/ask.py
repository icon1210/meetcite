"""Question answering over one meeting (FR16, a "Could" requirement).

A lightweight retrieval step picks the transcript lines that share the most
words with the question; the local LLM then answers from those lines only and
cites them, so the answer can be checked like any summary point.
"""

import re

from app.config import Settings
from app.pipeline.chunking import estimate_tokens, format_line
from app.pipeline.summarize_bart import content_words
from app.pipeline.types import TranscriptLine

ASK_SYSTEM = """You answer questions about a meeting using only the transcript lines provided.
Each line looks like: [ID] Speaker: text
Cite the IDs you used in square brackets, e.g. [12][15]. If the lines do not contain
the answer, say "The transcript does not say." Answer in at most four sentences."""

_CITE = re.compile(r"\[(\d+)\]")


def retrieve(lines: list[TranscriptLine], question: str, max_tokens: int) -> list[TranscriptLine]:
    q = content_words(question)
    scored = sorted(((len(q & content_words(line.text)), idx) for idx, line in enumerate(lines)), reverse=True)
    chosen: set[int] = set()
    for score, idx in scored[:15]:
        if score == 0:
            break
        chosen.update({idx - 1, idx, idx + 1})  # neighbours give the model context
    if not chosen:  # nothing matched: fall back to the start of the meeting
        chosen = set(range(min(40, len(lines))))
    picked, used = [], 0
    for idx in sorted(i for i in chosen if 0 <= i < len(lines)):
        cost = estimate_tokens(format_line(lines[idx], clean=False))
        if used + cost > max_tokens:
            break
        picked.append(lines[idx])
        used += cost
    return picked


def answer_question(settings: Settings, lines: list[TranscriptLine], question: str) -> tuple[str, list[int]]:
    context = retrieve(lines, question, max_tokens=int(settings.llm_context_tokens * 0.6))
    valid = {line.id for line in context}
    if settings.ai_mode == "fake":
        best = context[:2]
        answer = " ".join(f'{line.speaker} said: "{line.text}" [{line.id}]' for line in best)
        return answer or "The transcript does not say.", [line.id for line in best]

    from app.pipeline.llm_clients import make_llm_client

    client = make_llm_client(settings, "llm")
    transcript = "\n".join(format_line(line, clean=False) for line in context)
    answer = client.complete_text(ASK_SYSTEM, f"Transcript lines:\n{transcript}\n\nQuestion: {question}")
    cited = sorted({int(i) for i in _CITE.findall(answer)} & valid)
    return answer.strip(), cited
