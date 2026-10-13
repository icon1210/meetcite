import json
from typing import Any

from app.pipeline.extract_rules import extract_questions, extract_risks
from app.pipeline.summary_schema import ExtractedAction, MeetingNotes, Position, SourcedPoint, Topic
from app.pipeline.types import TranscriptLine
from app.pipeline.verify import iter_claims, verify_notes

LINES = [
    TranscriptLine(0, "Ana", 0, 5, "The upload page still has two bugs."),
    TranscriptLine(1, "Ben", 5, 9, "Then we have decided to launch on Monday the 14th."),
    TranscriptLine(2, "Ana", 9, 12, "I am worried the server costs could go over budget."),
    TranscriptLine(3, "Ben", 12, 15, "Who is going to review the budget next month?"),
]

NOTES = MeetingNotes(
    overview="Launch planning.",
    summary=[
        SourcedPoint(text="The launch was set for Monday the 14th.", source_segment_ids=[1]),
        SourcedPoint(text="The CEO approved a marketing campaign in Paris.", source_segment_ids=[0]),
        SourcedPoint(text="Something with no citation.", source_segment_ids=[]),
    ],
    topics=[
        Topic(
            title="Launch",
            summary="Two upload bugs remain; launch on Monday the 14th.",
            positions=[
                Position(speaker="Ana", view="Worried about server costs going over budget.", source_segment_ids=[2])
            ],
            outcome="Launch on Monday the 14th.",
            source_segment_ids=[0, 1],
        )
    ],
    action_items=[ExtractedAction(task="Fix the upload bugs", owner="Ana", source_segment_ids=[0])],
)


def test_every_item_becomes_a_claim() -> None:
    keys = [c.key for c in iter_claims(NOTES)]
    assert keys == ["summary.0", "summary.1", "summary.2", "topic.0", "topic.0.position.0", "action.0"]


def test_word_overlap_fallback_catches_invented_claims() -> None:
    checks, method = verify_notes(NOTES, LINES, client=None)
    assert method == "word-overlap"
    assert checks["summary.0"].verdict == "supported"
    assert checks["summary.1"].verdict == "unsupported"  # CEO, Paris, campaign: not in the transcript
    assert checks["summary.2"].verdict == "unsupported"
    assert "No valid transcript lines" in checks["summary.2"].note
    assert checks["topic.0.position.0"].verdict == "supported"


class FakeVerifier:
    """Labels every claim 'partial' and records the evidence it was shown."""

    name = "fake"

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.prompts: list[str] = []

    def complete_json(self, system: str, user: str, schema: dict[str, Any]) -> str:
        if self.fail:
            from app.pipeline.llm_clients import LLMError

            raise LLMError("offline")
        self.prompts.append(user)
        ids = [int(line.split(":")[0].split()[1]) for line in user.splitlines() if line.startswith("Claim ")]
        return json.dumps({"results": [{"id": i, "verdict": "partial", "reason": "detail missing"} for i in ids]})

    def complete_text(self, system: str, user: str) -> str:
        return ""

    def release(self) -> None:
        pass


def test_llm_verifier_sees_cited_lines_with_context() -> None:
    verifier = FakeVerifier()
    checks, method = verify_notes(NOTES, LINES, verifier)
    assert method == "llm"
    assert checks["summary.0"].verdict == "partial"
    assert checks["summary.2"].verdict == "unsupported"  # never sent: it cites nothing
    prompt = verifier.prompts[0]
    assert "[1] Ben: Then we have decided" in prompt
    assert "(context)" in prompt  # neighbouring lines are included and labelled


def test_verifier_failure_falls_back_to_word_overlap() -> None:
    checks, method = verify_notes(NOTES, LINES, FakeVerifier(fail=True))
    assert method == "word-overlap"
    assert checks["summary.0"].verdict == "supported"


def test_rule_based_questions_and_risks() -> None:
    questions = extract_questions(LINES)
    risks = extract_risks(LINES)
    assert [q.source_segment_ids for q in questions] == [[3]]
    assert [r.source_segment_ids for r in risks] == [[0], [2]]  # "bugs" and "worried ... over budget"
