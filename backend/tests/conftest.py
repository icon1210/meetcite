"""Test setup: a temporary SQLite database and data folder, with fake AI stages.

Environment variables must be set before the app is imported, because settings
are read once at import time.
"""

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="meetcite-test-"))
os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": f"sqlite:///{(_tmp / 'test.db').as_posix()}",
        "DATA_DIR": str(_tmp / "data"),
        "AI_MODE": "fake",
        # Never use real API keys from a developer's .env: tests must not reach (or pay for) cloud services.
        "AI_PROVIDER": "local",
        "ANTHROPIC_API_KEY": "",
        "ASSEMBLYAI_API_KEY": "",
        "CLOUD_LLM_ENABLED": "false",
        "TASK_MODE": "thread",
        "SECRET_KEY": "test-secret-key-for-unit-tests-only-0123456789",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.pipeline.runner import run_pipeline, run_regenerate  # noqa: E402


@pytest.fixture(autouse=True)
def synchronous_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    """Run background jobs immediately so tests can check their results."""
    monkeypatch.setattr("app.routers.meetings.enqueue_processing", run_pipeline)
    monkeypatch.setattr("app.routers.meetings.enqueue_regenerate", run_regenerate)


@pytest.fixture(autouse=True)
def fresh_rate_limits() -> None:
    """Each test starts with no recorded sign-in attempts (all tests share one client address)."""
    from app.ratelimit import limiter

    limiter.reset()


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


_counter = 0


def make_user(client: TestClient) -> dict[str, str]:
    """Register a fresh user and return auth headers."""
    global _counter
    _counter += 1
    resp = client.post(
        "/api/auth/register",
        json={"email": f"user{_counter}@example.com", "name": f"User {_counter}", "password": "correct-horse-1"},
    )
    assert resp.status_code == 201, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    return make_user(client)


def upload(client: TestClient, headers: dict[str, str], name: str = "standup.mp3", title: str = "Weekly sync") -> dict:
    resp = client.post(
        "/api/meetings",
        headers=headers,
        files={"file": (name, b"ID3fake-audio-bytes", "audio/mpeg")},
        data={"title": title, "model": "llm"},
    )
    assert resp.status_code == 201, resp.text
    return dict(resp.json())
