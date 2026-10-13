"""Live mode: the streaming token endpoint and keyword quick notes."""

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.pipeline import cloud_transcribe
from tests.conftest import make_user


def test_live_captions_need_cloud_mode(client: TestClient) -> None:
    resp = client.post("/api/live/token", headers=make_user(client))
    assert resp.status_code == 409
    assert client.get("/api/config").json()["live_available"] is False


def test_token_is_issued_without_exposing_the_key(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_mode", "real")
    monkeypatch.setattr(settings, "ai_provider", "cloud")
    monkeypatch.setattr(settings, "assemblyai_api_key", "secret-key")
    seen: dict = {}

    def fake_get(url: str, params: dict, headers: dict, timeout: float) -> httpx.Response:
        seen.update(url=url, params=params, headers=headers)
        return httpx.Response(200, json={"token": "temp-123", "expires_in_seconds": 60})

    monkeypatch.setattr(cloud_transcribe.httpx, "get", fake_get)
    resp = client.post("/api/live/token", headers=make_user(client))
    assert resp.status_code == 200
    body = resp.json()
    assert body["token"] == "temp-123" and "secret-key" not in resp.text
    assert body["websocket_url"].startswith("wss://streaming.assemblyai.com/v3/ws?")
    assert seen["headers"]["authorization"] == "secret-key"  # only server-to-AssemblyAI
    assert seen["params"]["expires_in_seconds"] == 60


def test_eu_region_streams_from_the_eu(monkeypatch: pytest.MonkeyPatch) -> None:
    assert cloud_transcribe.streaming_host("https://api.eu.assemblyai.com") == "streaming.eu.assemblyai.com"


def test_quick_notes_pick_out_decisions_actions_and_questions(client: TestClient) -> None:
    turns = [
        {"text": "We have decided to launch on Monday.", "speaker": "Priya"},
        {"text": "I will send the tester list by Friday.", "speaker": "Tom"},
        {"text": "Who is writing the announcement?"},
        {"text": "   "},
    ]
    notes = client.post("/api/live/notes", headers=make_user(client), json={"turns": turns}).json()
    assert any("launch on Monday" in d for d in notes["decisions"])
    assert notes["actions"][0]["owner"] == "Tom" and notes["actions"][0]["deadline"] == "by Friday"
    assert notes["questions"]


def test_live_endpoints_need_sign_in(client: TestClient) -> None:
    assert client.post("/api/live/token").status_code == 401
    assert client.post("/api/live/notes", json={"turns": []}).status_code == 401
