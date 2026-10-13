from fastapi.testclient import TestClient

from app.config import get_settings
from tests.conftest import make_user


def test_repeated_wrong_passwords_are_slowed_down(client: TestClient) -> None:
    make_user(client)
    limit = get_settings().auth_attempts_per_minute
    body = {"email": "nobody@example.com", "password": "wrong-password"}
    codes = [client.post("/api/auth/login", json=body).status_code for _ in range(limit + 1)]
    assert codes[:limit] == [401] * limit
    assert codes[-1] == 429


def test_limit_is_per_email_as_well_as_per_address(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    # Attempts against one account from many addresses are still limited.
    monkeypatch.setattr(get_settings(), "trusted_proxy_header", "CF-Connecting-IP")
    limit = get_settings().auth_attempts_per_minute
    body = {"email": "target@example.com", "password": "wrong-password"}
    codes = [
        client.post("/api/auth/login", json=body, headers={"CF-Connecting-IP": f"10.0.0.{i}"}).status_code
        for i in range(limit + 1)
    ]
    assert codes[-1] == 429


def test_proxy_header_is_ignored_unless_trusted(client: TestClient) -> None:
    # Without TRUSTED_PROXY_HEADER a forged header must not give each request a fresh allowance.
    limit = get_settings().auth_attempts_per_minute
    codes = [
        client.post(
            "/api/auth/login",
            json={"email": f"u{i}@example.com", "password": "x"},
            headers={"CF-Connecting-IP": f"10.0.0.{i}"},
        ).status_code
        for i in range(limit + 1)
    ]
    assert codes[-1] == 429
