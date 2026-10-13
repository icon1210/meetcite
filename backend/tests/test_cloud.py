"""Cloud mode (AI_PROVIDER=cloud): AssemblyAI transcription and Claude, with both services mocked."""

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.config import Settings
from app.pipeline.cloud_transcribe import AssemblyAIClient, CloudTranscriptionError, parse_transcript
from app.pipeline.llm_clients import ClaudeClient, OllamaClient, make_llm_client
from app.pipeline.runner import llm_limits
from app.pipeline.summarize_llm import chunk_budget

TRANSCRIPT = {
    "status": "completed",
    "words": [
        {"text": "Hello", "start": 0, "end": 400, "confidence": 0.9, "speaker": "A"},
        {"text": "team.", "start": 400, "end": 900, "confidence": 0.9, "speaker": "A"},
        {"text": "Hi!", "start": 1200, "end": 1500, "confidence": 0.8, "speaker": "B"},
    ],
    "utterances": [
        {"speaker": "A", "start": 0, "end": 900, "text": "Hello team."},
        {"speaker": "B", "start": 1200, "end": 1500, "text": "Hi!"},
    ],
}


def test_assemblyai_transcript_becomes_words_and_turns() -> None:
    words, turns = parse_transcript(TRANSCRIPT)
    assert [(w.text, w.start, w.end) for w in words] == [("Hello", 0.0, 0.4), ("team.", 0.4, 0.9), ("Hi!", 1.2, 1.5)]
    assert [(t.speaker, t.start, t.end) for t in turns] == [("SPEAKER_00", 0.0, 0.9), ("SPEAKER_01", 1.2, 1.5)]


def _client(handler: Any) -> AssemblyAIClient:
    client = AssemblyAIClient("key", poll_s=0)
    client._http = httpx.Client(
        base_url="https://api.assemblyai.com", headers={"authorization": "key"}, transport=httpx.MockTransport(handler)
    )
    return client


def test_upload_submit_and_poll(tmp_path: Path) -> None:
    calls: list[str] = []
    polls = iter([{"status": "processing"}, TRANSCRIPT])

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(f"{request.method} {request.url.path}")
        assert request.headers["authorization"] == "key"
        if request.url.path == "/v2/upload":
            return httpx.Response(200, json={"upload_url": "https://cdn/audio"})
        if request.method == "POST":
            body = json.loads(request.content)
            assert body["audio_url"] == "https://cdn/audio" and body["speaker_labels"] is True
            return httpx.Response(200, json={"id": "t1", "status": "queued"})
        return httpx.Response(200, json=next(polls))

    audio = tmp_path / "a.mp3"
    audio.write_bytes(b"mp3")
    words, turns = _client(handler).transcribe(audio)
    assert len(words) == 3 and len(turns) == 2
    assert calls == ["POST /v2/upload", "POST /v2/transcript", "GET /v2/transcript/t1", "GET /v2/transcript/t1"]


def test_bad_key_and_failed_transcripts_are_reported(tmp_path: Path) -> None:
    audio = tmp_path / "a.mp3"
    audio.write_bytes(b"mp3")
    with pytest.raises(CloudTranscriptionError, match="API key"):
        _client(lambda r: httpx.Response(401, json={"error": "bad"})).transcribe(audio)

    def failing(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v2/upload":
            return httpx.Response(200, json={"upload_url": "u"})
        if request.method == "POST":
            return httpx.Response(200, json={"id": "t1"})
        return httpx.Response(200, json={"status": "error", "error": "Audio file is empty"})

    with pytest.raises(CloudTranscriptionError, match="Audio file is empty"):
        _client(failing).transcribe(audio)


def test_cloud_mode_uses_claude_for_everything_and_one_call_per_meeting() -> None:
    cloud = Settings(ai_mode="real", ai_provider="cloud", anthropic_api_key="sk-test")
    assert isinstance(make_llm_client(cloud, "llm"), ClaudeClient)
    local = Settings(ai_mode="real", ai_provider="local")
    assert isinstance(make_llm_client(local, "llm"), OllamaClient)

    # A two-hour meeting is roughly 30k tokens: Claude summarizes it in a single request.
    ctx, out = llm_limits(cloud, "llm")
    assert chunk_budget(ctx, out) > 30_000
    ctx, out = llm_limits(local, "llm")
    assert chunk_budget(ctx, out) < 30_000


def test_cloud_mode_without_a_key_explains_what_to_set() -> None:
    from app.pipeline.llm_clients import LLMError

    with pytest.raises(LLMError, match="ANTHROPIC_API_KEY"):
        make_llm_client(Settings(ai_mode="real", ai_provider="cloud"), "llm")
