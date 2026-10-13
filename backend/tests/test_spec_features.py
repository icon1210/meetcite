"""Tests for the full-specification features: configurations, evidence status, claim reviews,
speaker names, transcript corrections and browser recordings."""

from fastapi.testclient import TestClient

from app.pipeline.names import TranscriptFileError, parse_platform_transcript, suggest_from_introductions
from app.pipeline.runner import evidence_status
from app.pipeline.types import AlignedSegment, Word
from tests.conftest import make_user, upload

TEAMS_VTT = """WEBVTT

0a1b2c3d-1/12-0
00:00:00.000 --> 00:00:20.000
<v Ada Lovelace>Good evening everyone, let's begin.</v>

0a1b2c3d-1/13-0
00:00:20.500 --> 00:00:45.000
<v Ada Lovelace>First item is the budget.</v>

0a1b2c3d-2/14-0
00:00:46.000 --> 00:01:30.000
<v Grace Hopper>Thanks Ada. I have the numbers here.</v>
"""

ZOOM_VTT = """WEBVTT

1
00:00:01.000 --> 00:00:04.000
Alan Turing: Hello all.

2
00:00:05.000 --> 00:00:09.000
Joan Clarke: Hi Alan.
"""


def test_parse_teams_and_zoom_transcripts() -> None:
    teams = parse_platform_transcript(TEAMS_VTT)
    assert [(t.speaker, t.start, t.end) for t in teams] == [("Ada Lovelace", 0.0, 45.0), ("Grace Hopper", 46.0, 90.0)]
    zoom = parse_platform_transcript(ZOOM_VTT)
    assert [t.speaker for t in zoom] == ["Alan Turing", "Joan Clarke"]


def test_rejects_transcript_without_names() -> None:
    import pytest

    with pytest.raises(TranscriptFileError):
        parse_platform_transcript("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nno speaker here\n")
    with pytest.raises(TranscriptFileError):
        parse_platform_transcript("just some text")


def test_name_suggestion_from_self_introduction() -> None:
    segs = [
        AlignedSegment("SPEAKER_00", 0, 2, [Word("Hi,", 0, 1), Word("I'm", 1, 1.5), Word("Tunde", 1.5, 2)]),
        AlignedSegment("SPEAKER_01", 2, 4, [Word("I'm", 2, 3), Word("sorry", 3, 4)]),
    ]
    found = suggest_from_introductions(segs)
    assert found["SPEAKER_00"].name == "Tunde" and found["SPEAKER_00"].segment_ids == [0]
    assert "SPEAKER_01" not in found  # "I'm sorry" is not a name


def test_evidence_status_values() -> None:
    assert evidence_status([1, 2], {1, 2, 3}) == ([1, 2], "valid")
    assert evidence_status([1, 99], {1, 2}) == ([1], "valid")
    assert evidence_status([], {1}) == ([], "missing")
    assert evidence_status([98, 99], {1}) == ([], "invalid")


def test_upload_with_teams_transcript_uses_real_names(client: TestClient, auth: dict[str, str]) -> None:
    resp = client.post(
        "/api/meetings",
        headers=auth,
        files={
            "file": ("townhall.mp4", b"fake-video", "video/mp4"),
            "names_file": ("townhall.vtt", TEAMS_VTT.encode(), "text/vtt"),
        },
        data={"title": "Town hall"},
    )
    assert resp.status_code == 201, resp.text
    detail = client.get(f"/api/meetings/{resp.json()['id']}", headers=auth).json()
    assert detail["has_names_file"] is True
    names = {s["display_name"] for s in detail["speakers"]}
    assert names <= {"Ada Lovelace", "Grace Hopper"} and "Ada Lovelace" in names
    assert detail["job"]["configuration"]["speaker_turns"].startswith("platform transcript")


def test_bad_transcript_file_is_rejected(client: TestClient, auth: dict[str, str]) -> None:
    resp = client.post(
        "/api/meetings",
        headers=auth,
        files={"file": ("a.mp3", b"ID3", "audio/mpeg"), "names_file": ("notes.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 415


def test_speaker_name_suggestion_can_be_accepted(client: TestClient, auth: dict[str, str]) -> None:
    detail = client.get(f"/api/meetings/{upload(client, auth)['id']}", headers=auth).json()
    priya = next(s for s in detail["speakers"] if s["suggested_name"] == "Priya")
    assert priya["display_name"] == "Speaker 1" and "Introduced themselves" in priya["suggestion_reason"]
    accepted = client.patch(f"/api/speakers/{priya['id']}", headers=auth, json={"display_name": "Priya"}).json()
    assert accepted["display_name"] == "Priya" and accepted["suggested_name"] is None


def test_baseline_and_grounded_are_kept_side_by_side(client: TestClient, auth: dict[str, str]) -> None:
    mid = upload(client, auth)["id"]  # C2 (llm) by default
    assert client.post(f"/api/meetings/{mid}/regenerate", headers=auth, json={"model": "baseline"}).status_code == 202
    detail = client.get(f"/api/meetings/{mid}", headers=auth).json()
    configs = {s["configuration"]: s for s in detail["summaries"]}
    assert set(configs) == {"llm", "baseline"}
    c1, c2 = configs["baseline"], configs["llm"]
    assert c1["is_active"] and not c2["is_active"]
    assert c1["prompt_version"].startswith("c1") and c2["prompt_version"].startswith("c2")
    assert all(d["evidence_status"] == "missing" and not d["source_segment_ids"] for d in c1["decisions"])
    assert all(d["evidence_status"] == "valid" for d in c2["decisions"])
    assert c1["verification"]["method"].startswith("none")
    assert "summarizing_s" in c2["timings"] and c2["settings"]["configuration"].startswith("C2")
    # The active summary's decisions are the top-level ones.
    assert detail["decisions"] == c1["decisions"]

    # Switch back to C2.
    assert client.post(f"/api/meetings/{mid}/summaries/{c2['id']}/activate", headers=auth).status_code == 200
    detail = client.get(f"/api/meetings/{mid}", headers=auth).json()
    assert detail["summary"]["configuration"] == "llm" and detail["model_used"] == "llm"

    # Regenerating C1 again replaces only C1.
    client.post(f"/api/meetings/{mid}/regenerate", headers=auth, json={"model": "baseline"})
    assert len(client.get(f"/api/meetings/{mid}", headers=auth).json()["summaries"]) == 2


def test_claim_reviews(client: TestClient) -> None:
    owner, other = make_user(client), make_user(client)
    mid = upload(client, owner)["id"]
    detail = client.get(f"/api/meetings/{mid}", headers=owner).json()
    decision = detail["decisions"][0]
    summary_id = detail["summary"]["id"]

    r = client.post(f"/api/claims/decision/{decision['id']}/review", headers=owner, json={"label": "supported"})
    assert r.status_code == 200 and r.json()["claim_key"] == f"decision:{decision['id']}"
    # Re-labelling replaces the reviewer's previous label.
    client.post(
        f"/api/claims/decision/{decision['id']}/review", headers=owner, json={"label": "contradicted", "notes": "No"}
    )
    r = client.post(
        f"/api/claims/position/{summary_id}:topic:0:position:0/review", headers=owner, json={"label": "unclear"}
    )
    assert r.status_code == 200

    reviews = client.get(f"/api/meetings/{mid}", headers=owner).json()["reviews"]
    assert {(x["claim_key"], x["label"]) for x in reviews} == {
        (f"decision:{decision['id']}", "contradicted"),
        (f"summary:{summary_id}:topic:0:position:0", "unclear"),
    }
    # Other users can neither review nor see these claims.
    assert (
        client.post(
            f"/api/claims/decision/{decision['id']}/review", headers=other, json={"label": "supported"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/claims/point/{summary_id}:point:0/review", headers=other, json={"label": "supported"}
        ).status_code
        == 404
    )
    # Invalid labels and paths are rejected.
    assert (
        client.post(f"/api/claims/decision/{decision['id']}/review", headers=owner, json={"label": "maybe"}).status_code
        == 422
    )
    assert (
        client.post(
            f"/api/claims/point/{summary_id}:point:999/review", headers=owner, json={"label": "supported"}
        ).status_code
        == 404
    )


def test_transcript_correction_keeps_original(client: TestClient, auth: dict[str, str]) -> None:
    mid = upload(client, auth)["id"]
    seg = client.get(f"/api/meetings/{mid}", headers=auth).json()["segments"][0]
    edited = client.patch(f"/api/segments/{seg['id']}", headers=auth, json={"text": "Corrected."}).json()
    assert edited["text"] == "Corrected." and edited["original_text"] == seg["text"]
    reverted = client.patch(f"/api/segments/{seg['id']}", headers=auth, json={"revert": True}).json()
    assert reverted["text"] == seg["text"] and reverted["original_text"] is None


def test_browser_recording_source(client: TestClient, auth: dict[str, str]) -> None:
    resp = client.post(
        "/api/meetings",
        headers=auth,
        files={"file": ("recording.webm", b"\x1aE\xdf\xa3webm", "audio/webm")},
        data={"title": "Call", "source": "browser"},
    )
    assert resp.status_code == 201 and resp.json()["source"] == "browser"
