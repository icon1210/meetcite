import json
from typing import Any

import pytest

from app.pipeline.extract_rules import extract_actions, extract_decisions
from app.pipeline.llm_clients import LLMError
from app.pipeline.summarize_bart import link_sentence
from app.pipeline.summarize_llm import summarize_with_llm
from app.pipeline.summary_schema import MeetingNotes, check_sources
from app.pipeline.types import TranscriptLine


class ScriptedLLM:
    """A fake LLM client that returns queued replies and records prompts."""

    name = "scripted"

    def __init__(self, replies: list[str]) -> None:
        self.replies = list(replies)
        self.prompts: list[str] = []

    def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> str:
        self.prompts.append(user)
        return self.replies.pop(0)

    def complete_text(self, system: str, user: str) -> str:
        return self.replies.pop(0)

    def release(self) -> None:
        pass


NOTES = json.dumps(
    {
        "summary": [{"text": "Launch moved to Monday.", "source_segment_ids": [1]}],
        "decisions": [{"text": "Launch on Monday.", "source_segment_ids": [1, 99]}],
        "action_items": [{"task": "Fix bugs", "owner": "Ana", "deadline": "", "source_segment_ids": [0]}],
    }
)

LINES = [
    TranscriptLine(0, "Ana", 0, 5, "I will fix the upload bugs by Wednesday."),
    TranscriptLine(1, "Ben", 5, 9, "Then we have decided to launch on Monday."),
]


def test_llm_output_is_validated_and_blank_fields_become_none() -> None:
    notes = summarize_with_llm(
        LINES, ScriptedLLM([NOTES]), context_tokens=8192, max_retries=3, on_progress=lambda f: None
    )
    assert notes.action_items[0].owner == "Ana"
    assert notes.action_items[0].deadline is None


def test_invalid_json_is_retried_with_error() -> None:
    llm = ScriptedLLM(["not json at all", "```json\n" + NOTES + "\n```"])
    notes = summarize_with_llm(LINES, llm, context_tokens=8192, max_retries=3, on_progress=lambda f: None)
    assert len(notes.summary) == 1
    assert "not valid JSON" in llm.prompts[1]


def test_gives_up_after_max_retries() -> None:
    with pytest.raises(LLMError):
        summarize_with_llm(
            LINES, ScriptedLLM(["{}x"] * 3), context_tokens=8192, max_retries=3, on_progress=lambda f: None
        )


def test_long_transcript_uses_map_then_reduce() -> None:
    long_lines = [TranscriptLine(i, "S", i, i + 1, " ".join(f"w{j}" for j in range(200))) for i in range(40)]
    llm = ScriptedLLM([NOTES] * 50)
    summarize_with_llm(long_lines, llm, context_tokens=1024, max_retries=1, on_progress=lambda f: None)
    assert len(llm.prompts) > 2
    assert llm.prompts[-1].startswith("Partial notes")


def test_finished_llm_steps_are_reused_on_retry(tmp_path) -> None:  # type: ignore[no-untyped-def]
    long_lines = [TranscriptLine(i, "S", i, i + 1, " ".join(f"w{j}" for j in range(200))) for i in range(40)]
    first = ScriptedLLM([NOTES] * 50)
    summarize_with_llm(
        long_lines, first, context_tokens=1024, max_retries=1, on_progress=lambda f: None, cache_dir=tmp_path
    )
    assert first.prompts  # the first run asked the model
    again = ScriptedLLM([])  # would fail if asked anything
    notes = summarize_with_llm(
        long_lines, again, context_tokens=1024, max_retries=1, on_progress=lambda f: None, cache_dir=tmp_path
    )
    assert again.prompts == [] and notes.summary


def test_ollama_answer_is_streamed() -> None:
    import httpx

    from app.pipeline.llm_clients import OllamaClient

    chunks = [b'{"message":{"content":"{\\"a\\""},"done":false}\n', b'{"message":{"content":": 1}"},"done":true}\n']

    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["stream"] is True
        return httpx.Response(200, content=b"".join(chunks))

    client = OllamaClient("http://ollama", "llama3.1:8b", 8192)
    client._http = httpx.Client(base_url="http://ollama", transport=httpx.MockTransport(handler))
    assert client.complete_json("s", "u", {}) == '{"a": 1}'


def test_runaway_answer_is_capped_and_reported() -> None:
    import httpx

    from app.pipeline.llm_clients import LLMTruncated, OllamaClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["options"]["num_predict"] == 50
        return httpx.Response(
            200, content=b'{"message":{"content":"{\\"a\\": ["},"done":true,"done_reason":"length"}\n'
        )

    client = OllamaClient("http://ollama", "m", 8192, max_output_tokens=50)
    client._http = httpx.Client(base_url="http://ollama", transport=httpx.MockTransport(handler))
    with pytest.raises(LLMTruncated):
        client.complete_json("s", "u", {})


def test_cut_off_answer_is_retried_with_a_shorter_request() -> None:
    from app.pipeline.llm_clients import LLMTruncated

    class CutOffOnce(ScriptedLLM):
        def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> str:
            self.prompts.append(user)
            if len(self.prompts) == 1:
                raise LLMTruncated("cut off")
            return NOTES

    llm = CutOffOnce([])
    notes = summarize_with_llm(LINES, llm, context_tokens=8192, max_retries=3, on_progress=lambda f: None)
    assert notes.decisions and "cut off" in llm.prompts[1]


def test_prompt_and_answer_fit_in_the_context_window() -> None:
    from app.pipeline.chunking import estimate_tokens
    from app.pipeline.summarize_llm import GROUNDED, chunk_budget

    for ctx, out in [(8192, 4096), (16384, 4096), (4096, 2048)]:
        budget = chunk_budget(ctx, out)
        if budget > 512:
            assert budget + out + estimate_tokens(GROUNDED.reduce_system) < ctx


def test_invalid_source_ids_are_dropped_and_flagged() -> None:
    assert check_sources([1, 99], {0, 1}) == ([1], True)
    assert check_sources([42], {0, 1}) == ([], False)


def test_rule_based_extraction() -> None:
    decisions = extract_decisions(LINES)
    actions = extract_actions(LINES)
    assert [d.source_segment_ids for d in decisions] == [[1]]
    assert actions[0].owner == "Ana"  # "I will" -> the speaker
    assert actions[0].deadline == "by Wednesday"


def test_named_owner_and_question_actions() -> None:
    lines = [
        TranscriptLine(0, "Ben", 0, 1, "Sarah will draft the announcement email by Friday."),
        TranscriptLine(1, "Ana", 1, 2, "Can you send me the tester list tomorrow?"),
        TranscriptLine(2, "Ben", 2, 3, "It will rain later."),
    ]
    actions = extract_actions(lines)
    assert [(a.owner, a.deadline) for a in actions] == [("Sarah", "by Friday"), (None, "tomorrow")]


def test_bart_sentences_link_to_matching_lines() -> None:
    assert link_sentence("The team decided to launch on Monday.", LINES) == [1]


def test_schema_accepts_empty_notes() -> None:
    assert MeetingNotes.model_validate_json('{"summary": [], "decisions": [], "action_items": []}')
