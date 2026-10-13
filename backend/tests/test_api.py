from pathlib import Path

from fastapi.testclient import TestClient

from app.config import get_settings
from tests.conftest import make_user, upload


def test_register_login_and_me(client: TestClient) -> None:
    body = {"email": "Login@Example.com", "name": "Lee", "password": "a-strong-pass"}
    assert client.post("/api/auth/register", json=body).status_code == 201
    assert client.post("/api/auth/register", json=body).status_code == 409  # duplicate, case-insensitive

    bad = client.post("/api/auth/login", json={"email": "login@example.com", "password": "wrong-pass"})
    assert bad.status_code == 401
    ok = client.post("/api/auth/login", json={"email": "login@example.com", "password": "a-strong-pass"})
    assert ok.status_code == 200
    token = ok.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == "login@example.com"


def test_short_password_rejected(client: TestClient) -> None:
    resp = client.post("/api/auth/register", json={"email": "x@example.com", "name": "X", "password": "short"})
    assert resp.status_code == 422


def test_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/api/meetings").status_code == 401
    assert client.get("/api/meetings", headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_upload_processes_meeting_end_to_end(client: TestClient, auth: dict[str, str]) -> None:
    created = upload(client, auth)
    detail = client.get(f"/api/meetings/{created['id']}", headers=auth).json()
    assert detail["status"] == "completed", detail["job"]
    assert detail["job"]["progress_pct"] == 100
    assert len(detail["speakers"]) == 3
    assert len(detail["segments"]) >= 5
    assert detail["summary"]["points"]
    assert detail["decisions"] and detail["action_items"]
    positions = {s["position"] for s in detail["segments"]}
    for point in detail["summary"]["points"]:
        assert set(point["source_segment_ids"]) <= positions  # every citation points at a real segment
    timings = detail["job"]["stage_timings"]
    assert {"transcribing", "diarizing", "aligning", "summarizing"} <= set(timings)


def test_detailed_minutes_and_fact_check(client: TestClient, auth: dict[str, str]) -> None:
    detail = client.get(f"/api/meetings/{upload(client, auth)['id']}", headers=auth).json()
    summary = detail["summary"]
    assert summary["overview"]
    assert len(summary["topics"]) == 2
    topic = summary["topics"][0]
    assert topic["positions"] and topic["outcome"] and topic["verdict"] in {"supported", "partial"}
    assert summary["open_questions"] and summary["risks"]
    # The sample deliberately contains one invented risk; the fact-check must flag it.
    invented = next(r for r in summary["risks"] if "slip by a month" in r["text"])
    assert invented["verdict"] == "unsupported"
    v = summary["verification"]
    assert v["method"] == "word-overlap" and v["unsupported"] >= 1 and v["supported"] >= 1
    assert all(a["verdict"] != "unverified" for a in detail["action_items"])
    assert detail["job"]["stage_timings"].get("verifying") is not None


def test_user_edits_are_marked_as_user_written(client: TestClient, auth: dict[str, str]) -> None:
    mid = upload(client, auth)["id"]
    detail = client.get(f"/api/meetings/{mid}", headers=auth).json()
    kept = detail["summary"]["points"][0]
    client.patch(
        f"/api/meetings/{mid}",
        headers=auth,
        json={"summary_points": [kept, {"text": "My own note"}]},
    )
    points = client.get(f"/api/meetings/{mid}", headers=auth).json()["summary"]["points"]
    assert points[0]["verdict"] == kept["verdict"]  # unchanged point keeps its fact-check
    assert points[1]["verdict"] == "user"
    item = detail["action_items"][0]
    edited = client.patch(f"/api/action-items/{item['id']}", headers=auth, json={"owner": "Someone else"}).json()
    assert edited["verdict"] == "user"
    done = client.patch(f"/api/action-items/{detail['action_items'][1]['id']}", headers=auth, json={"status": "done"})
    assert done.json()["verdict"] == detail["action_items"][1]["verdict"]  # ticking done is not an edit


def test_exports_include_detailed_sections(client: TestClient, auth: dict[str, str]) -> None:
    mid = upload(client, auth)["id"]
    txt = client.get(f"/api/meetings/{mid}/export?format=txt", headers=auth).text
    for heading in ("Overview", "Topic: Launch readiness and date", "Open questions", "Risks and concerns"):
        assert heading in txt
    assert "Fact-check:" in txt and "[NOT supported by the transcript]" in txt


def test_rejects_unsupported_file_type(client: TestClient, auth: dict[str, str]) -> None:
    resp = client.post(
        "/api/meetings", headers=auth, files={"file": ("notes.exe", b"MZ...", "application/x-msdownload")}
    )
    assert resp.status_code == 415


def test_users_cannot_see_each_others_meetings(client: TestClient) -> None:
    alice, bob = make_user(client), make_user(client)
    meeting = upload(client, alice)
    mid = meeting["id"]
    assert client.get(f"/api/meetings/{mid}", headers=bob).status_code == 404
    assert client.delete(f"/api/meetings/{mid}", headers=bob).status_code == 404
    assert client.get(f"/api/meetings/{mid}/export?format=txt", headers=bob).status_code == 404
    assert all(m["id"] != mid for m in client.get("/api/meetings", headers=bob).json())

    speaker_id = client.get(f"/api/meetings/{mid}", headers=alice).json()["speakers"][0]["id"]
    assert client.patch(f"/api/speakers/{speaker_id}", headers=bob, json={"display_name": "Hacked"}).status_code == 404


def test_edit_speaker_segment_and_action_item(client: TestClient, auth: dict[str, str]) -> None:
    mid = upload(client, auth)["id"]
    detail = client.get(f"/api/meetings/{mid}", headers=auth).json()

    speaker = detail["speakers"][0]
    assert (
        client.patch(f"/api/speakers/{speaker['id']}", headers=auth, json={"display_name": "Priya"}).status_code == 200
    )
    seg = detail["segments"][0]
    resp = client.patch(f"/api/segments/{seg['id']}", headers=auth, json={"text": "Corrected text."})
    assert resp.json()["text"] == "Corrected text."

    item = detail["action_items"][0]
    resp = client.patch(f"/api/action-items/{item['id']}", headers=auth, json={"status": "done", "owner": "Priya"})
    assert resp.json()["status"] == "done" and resp.json()["owner"] == "Priya"

    resp = client.patch(
        f"/api/meetings/{mid}",
        headers=auth,
        json={"title": "Renamed", "summary_points": [{"text": "Edited point", "source_segment_ids": [0]}]},
    )
    assert resp.json()["title"] == "Renamed"
    after = client.get(f"/api/meetings/{mid}", headers=auth).json()
    assert after["summary"]["points"][0]["text"] == "Edited point"
    assert any(s["display_name"] == "Priya" for s in after["speakers"])


def test_search_by_title_and_transcript(client: TestClient) -> None:
    headers = make_user(client)
    upload(client, headers, title="Budget review")
    assert len(client.get("/api/meetings?q=budget", headers=headers).json()) == 1
    assert len(client.get("/api/meetings?q=announcement", headers=headers).json()) == 1  # found in transcript
    assert client.get("/api/meetings?q=zebra", headers=headers).json() == []


def test_exports(client: TestClient, auth: dict[str, str]) -> None:
    mid = upload(client, auth, title="Export test")["id"]
    txt = client.get(f"/api/meetings/{mid}/export?format=txt", headers=auth)
    assert txt.status_code == 200 and "Action items" in txt.text and "Export test" in txt.text
    docx = client.get(f"/api/meetings/{mid}/export?format=docx", headers=auth)
    assert docx.content[:2] == b"PK"  # DOCX files are ZIP archives
    pdf = client.get(f"/api/meetings/{mid}/export?format=pdf", headers=auth)
    assert pdf.content[:4] == b"%PDF"


def test_regenerate_and_ask(client: TestClient, auth: dict[str, str]) -> None:
    mid = upload(client, auth)["id"]
    resp = client.post(f"/api/meetings/{mid}/regenerate", headers=auth, json={"model": "bart"})
    assert resp.status_code == 202
    detail = client.get(f"/api/meetings/{mid}", headers=auth).json()
    assert detail["status"] == "completed" and detail["model_used"] == "bart"

    assert client.post(f"/api/meetings/{mid}/regenerate", headers=auth, json={"model": "cloud"}).status_code == 400

    answer = client.post(f"/api/meetings/{mid}/ask", headers=auth, json={"question": "What is the budget?"}).json()
    assert answer["source_segment_ids"]


def test_media_token_is_scoped(client: TestClient, auth: dict[str, str]) -> None:
    mid = upload(client, auth)["id"]
    media = client.get(f"/api/meetings/{mid}/media", headers=auth).json()
    assert client.get(media["url"]).status_code == 200
    token = media["url"].split("t=")[1]
    # The media token must not work as a login token, nor for another meeting.
    assert client.get("/api/meetings", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    other = upload(client, auth)["id"]
    assert client.get(f"/api/meetings/{other}/audio?t={token}").status_code == 404


def test_delete_removes_rows_and_files(client: TestClient, auth: dict[str, str]) -> None:
    mid = upload(client, auth)["id"]
    work = get_settings().work_dir / str(mid)
    assert work.exists()
    files_before = set(Path(get_settings().uploads_dir).iterdir())
    assert client.delete(f"/api/meetings/{mid}", headers=auth).status_code == 204
    assert client.get(f"/api/meetings/{mid}", headers=auth).status_code == 404
    assert not work.exists()
    assert len(set(Path(get_settings().uploads_dir).iterdir())) == len(files_before) - 1


def test_progress_websocket(client: TestClient, auth: dict[str, str]) -> None:
    mid = upload(client, auth)["id"]
    token = auth["Authorization"].split()[1]
    with client.websocket_connect(f"/api/meetings/{mid}/progress") as ws:
        ws.send_text(token)
        msg = ws.receive_json()
    assert msg["status"] == "completed" and msg["progress_pct"] == 100


def test_progress_websocket_rejects_other_users(client: TestClient) -> None:
    from starlette.websockets import WebSocketDisconnect

    owner, other = make_user(client), make_user(client)
    mid = upload(client, owner)["id"]
    with client.websocket_connect(f"/api/meetings/{mid}/progress") as ws:
        ws.send_text(other["Authorization"].split()[1])
        try:
            ws.receive_json()
            raise AssertionError("another user's token must not receive progress")
        except WebSocketDisconnect as exc:
            assert exc.code == 4404
