"""Project memory: meeting series, carried-over actions, decision history, contradictions, agendas."""

import json
from typing import Any

from fastapi.testclient import TestClient

from app.pipeline.continuity import (
    Item,
    OpenAction,
    PreviousDecision,
    check_continuity,
    parse_agenda,
    review_agenda,
)
from tests.conftest import make_user


class ScriptedLLM:
    name = "scripted"

    def __init__(self, reply: dict[str, Any]) -> None:
        self.reply = json.dumps(reply)

    def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> str:
        return self.reply

    def complete_text(self, system: str, user: str) -> str:
        return self.reply

    def release(self) -> None:
        pass


PREVIOUS = [PreviousDecision(1, "Planning", "2026-10-01", "Launch the beta on Monday the 14th.", [5])]
ACTIONS = [OpenAction(9, 1, "Planning", "Fix the upload bugs", "Tom", "Wednesday")]


def test_changed_decision_is_flagged_with_both_sources() -> None:
    current = [Item("We will now launch the beta on Monday the 21st.", [3])]
    result = check_continuity(PREVIOUS, [], current, client=None)
    assert result["method"] == "word-overlap"
    [c] = result["contradictions"]
    assert c["previous_source_ids"] == [5] and c["source_segment_ids"] == [3]
    assert c["previous_meeting_id"] == 1


def test_repeated_decision_is_not_a_contradiction() -> None:
    current = [Item("Launch the beta on Monday the 14th, as agreed.", [2])]
    assert check_continuity(PREVIOUS, [], current, client=None)["contradictions"] == []


def test_open_action_reported_done() -> None:
    current = [Item("Tom confirmed the upload bugs are fixed.", [7])]
    [p] = check_continuity([], ACTIONS, current, client=None)["progress"]
    assert p["action_id"] == 9 and p["status"] == "done" and p["source_segment_ids"] == [7]


def test_plans_are_not_reported_as_done() -> None:
    # "will be done" is a plan; "the date was fixed" is a different sense of "fixed".
    current = [
        Item("The upload bug fixes will be done by Wednesday.", [3]),
        Item("We need to fix the upload bugs before the date is fixed.", [4]),
    ]
    assert check_continuity([], ACTIONS, current, client=None)["progress"] == []


def test_adding_detail_is_not_a_contradiction() -> None:
    # The 14th is still the date; Wednesday is extra detail, not a replacement.
    current = [Item("Bugs fixed by Wednesday, then launch the beta on Monday the 14th.", [2])]
    assert check_continuity(PREVIOUS, [], current, client=None)["contradictions"] == []


def test_long_paragraphs_are_not_compared_word_by_word() -> None:
    paragraph = " ".join(["The team talked about launching the beta on Monday the 21st and much more."] * 5)
    assert check_continuity(PREVIOUS, [], [Item(paragraph, [1])], client=None)["contradictions"] == []


def test_uncited_statements_are_never_used_as_evidence() -> None:
    current = [Item("We will now launch the beta on Monday the 21st.", [])]
    assert check_continuity(PREVIOUS, ACTIONS, current, client=None)["contradictions"] == []


def test_llm_results_are_validated() -> None:
    llm = ScriptedLLM(
        {
            "contradictions": [
                {"previous_index": 0, "current_index": 0, "note": "Date moved"},
                {"previous_index": 7, "current_index": 0, "note": "out of range: ignored"},
            ],
            "progress": [{"action_index": 0, "status": "in_progress", "current_index": 0, "note": "Started"}],
        }
    )
    result = check_continuity(PREVIOUS, ACTIONS, [Item("Launch moved to the 21st.", [4])], client=llm)  # type: ignore[arg-type]
    assert result["method"] == "llm"
    assert len(result["contradictions"]) == 1 and result["contradictions"][0]["note"] == "Date moved"
    assert result["progress"][0]["status"] == "in_progress"


TOPICS = [
    {
        "title": "Launch date",
        "summary": "The team agreed the beta launch date for Monday.",
        "source_segment_ids": [1, 2],
    },
    {"title": "Budget", "summary": "The beta budget stays at five thousand pounds.", "source_segment_ids": [6]},
    {"title": "Office party", "summary": "Plans for the end of year party.", "source_segment_ids": [9]},
]


def test_agenda_items_are_parsed_and_reviewed() -> None:
    assert parse_agenda("1. Launch date\n- Budget\n\n* Hiring plan") == ["Launch date", "Budget", "Hiring plan"]
    review = review_agenda("1. Beta launch date\n2. Budget review\n3. Hiring plan", TOPICS, client=None)
    statuses = {i["item"]: i["status"] for i in review["items"]}
    assert statuses["Beta launch date"] in {"covered", "partly"}
    assert statuses["Hiring plan"] == "not_covered"
    assert "Office party" in review["unplanned"]
    launch = next(i for i in review["items"] if i["item"] == "Beta launch date")
    assert launch["source_segment_ids"] == [1, 2]


def _upload(client: TestClient, headers: dict[str, str], title: str, **extra: Any) -> dict:
    resp = client.post(
        "/api/meetings",
        headers=headers,
        files={"file": ("standup.mp3", b"ID3fake-audio-bytes", "audio/mpeg")},
        data={"title": title, "model": "llm", **{k: str(v) for k, v in extra.items()}},
    )
    assert resp.status_code == 201, resp.text
    return dict(resp.json())


def test_series_tracks_meetings_actions_and_decisions(client: TestClient) -> None:
    auth = make_user(client)
    series = client.post("/api/series", headers=auth, json={"name": "Weekly team meeting"}).json()
    first = _upload(client, auth, "Week 1", series_id=series["id"], agenda="Launch date\nBudget\nHiring plan")
    second = _upload(client, auth, "Week 2", series_id=series["id"])
    assert first["series_name"] == "Weekly team meeting"

    detail = client.get(f"/api/series/{series['id']}", headers=auth).json()
    assert detail["meeting_count"] == 2
    assert [m["id"] for m in detail["meetings"]] == [second["id"], first["id"]]  # newest first
    assert {a["meeting_id"] for a in detail["actions"]} == {first["id"], second["id"]}
    assert detail["decisions"] and detail["open_action_count"] > 0

    # The first meeting's agenda was checked; the second was compared with the first.
    m1 = client.get(f"/api/meetings/{first['id']}", headers=auth).json()
    assert {i["item"] for i in m1["summary"]["agenda_review"]["items"]} == {"Launch date", "Budget", "Hiring plan"}
    m2 = client.get(f"/api/meetings/{second['id']}", headers=auth).json()
    assert m2["summary"]["continuity"]["method"] == "word-overlap"

    answer = client.post(f"/api/series/{series['id']}/ask", headers=auth, json={"question": "When is the launch?"})
    assert answer.status_code == 200
    assert answer.json()["sources"] and answer.json()["sources"][0]["meeting_id"] in {first["id"], second["id"]}


def test_agenda_and_series_can_be_changed_later(client: TestClient) -> None:
    auth = make_user(client)
    meeting = _upload(client, auth, "Ad hoc")
    series = client.post("/api/series", headers=auth, json={"name": "Project X"}).json()
    patched = client.patch(
        f"/api/meetings/{meeting['id']}", headers=auth, json={"series_id": series["id"], "agenda": "Budget"}
    ).json()
    assert patched["series_id"] == series["id"]
    assert client.post(f"/api/meetings/{meeting['id']}/memory", headers=auth).status_code == 200
    detail = client.get(f"/api/meetings/{meeting['id']}", headers=auth).json()
    assert detail["agenda"] == "Budget" and detail["summary"]["agenda_review"]["items"][0]["item"] == "Budget"

    cleared = client.patch(f"/api/meetings/{meeting['id']}", headers=auth, json={"series_id": None}).json()
    assert cleared["series_id"] is None
    # Deleting a series keeps its meetings.
    client.patch(f"/api/meetings/{meeting['id']}", headers=auth, json={"series_id": series["id"]})
    assert client.delete(f"/api/series/{series['id']}", headers=auth).status_code == 204
    assert client.get(f"/api/meetings/{meeting['id']}", headers=auth).json()["series_id"] is None


def test_open_actions_across_meetings(client: TestClient) -> None:
    auth = make_user(client)
    first = _upload(client, auth, "One")
    _upload(client, auth, "Two")
    open_actions = client.get("/api/action-items", headers=auth).json()
    assert {a["meeting_title"] for a in open_actions} == {"One", "Two"}
    done = next(a for a in open_actions if a["meeting_id"] == first["id"])
    client.patch(f"/api/action-items/{done['id']}", headers=auth, json={"status": "done"})
    assert done["id"] not in {a["id"] for a in client.get("/api/action-items", headers=auth).json()}
    assert client.get("/api/action-items", headers=make_user(client)).json() == []


def test_series_are_private(client: TestClient) -> None:
    owner, other = make_user(client), make_user(client)
    series = client.post("/api/series", headers=owner, json={"name": "Private board"}).json()
    assert client.get(f"/api/series/{series['id']}", headers=other).status_code == 404
    assert client.get("/api/series", headers=other).json() == []
    resp = client.post(
        "/api/meetings",
        headers=other,
        files={"file": ("a.mp3", b"ID3fake", "audio/mpeg")},
        data={"title": "Sneaky", "series_id": str(series["id"])},
    )
    assert resp.status_code == 404


def test_dashboard_counts_what_still_needs_attention(client: TestClient) -> None:
    auth = make_user(client)
    meeting = _upload(client, auth, "Needs a look")
    listed = next(m for m in client.get("/api/meetings", headers=auth).json() if m["id"] == meeting["id"])
    assert listed["change_count"] == 0
    before = listed["review_needed_count"]
    assert before > 0  # the demo meeting has claims the check could not confirm

    # Reviewing one flagged claim takes it off the to-do count.
    detail = client.get(f"/api/meetings/{meeting['id']}", headers=auth).json()
    summary = detail["summary"]
    candidates = [(f"point:{i}", p) for i, p in enumerate(summary["points"])]
    candidates += [(f"topic:{t}", topic) for t, topic in enumerate(summary["topics"])]
    candidates += [(f"risk:{i}", r) for i, r in enumerate(summary["risks"])]
    path, _ = next(
        (path, c)
        for path, c in candidates
        if c["verdict"] in ("partial", "unsupported") or c["evidence_status"] in ("missing", "invalid")
    )
    claim_type = path.split(":")[0]
    resp = client.post(
        f"/api/claims/{claim_type}/{summary['id']}:{path}/review", headers=auth, json={"label": "supported"}
    )
    assert resp.status_code == 200, resp.text
    listed = next(m for m in client.get("/api/meetings", headers=auth).json() if m["id"] == meeting["id"])
    assert listed["review_needed_count"] == before - 1
