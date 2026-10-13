from fastapi.testclient import TestClient

from app.config import get_settings


def test_signup_code_is_required_when_set(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(get_settings(), "registration_code", "uws-2026")
    body = {"email": "guest@example.com", "name": "Guest", "password": "a-long-password"}

    assert client.get("/api/config").json()["signup_code_required"] is True
    assert client.post("/api/auth/register", json=body).status_code == 403
    assert client.post("/api/auth/register", json={**body, "signup_code": "wrong"}).status_code == 403
    assert client.post("/api/auth/register", json={**body, "signup_code": " uws-2026 "}).status_code == 201


def test_open_signup_when_no_code_is_set(client: TestClient) -> None:
    assert client.get("/api/config").json()["signup_code_required"] is False
