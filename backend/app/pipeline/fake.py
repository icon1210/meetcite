"""Deterministic stand-ins for the AI stages, enabled with AI_MODE=fake.

Used by the automated tests and for trying the interface on a machine without
a GPU. Every fake result is clearly a sample script, whatever audio is uploaded.
Real processing never uses this module.
"""

from app.pipeline.extract_rules import extract_actions, extract_decisions
from app.pipeline.summary_schema import MeetingNotes, Position, SourcedPoint, Topic
from app.pipeline.types import TranscriptLine, Turn, Word

SCRIPT: list[tuple[str, str]] = [
    (
        "SPEAKER_00",
        "Okay, let's get started. I'm Priya and I'm chairing today. We need to agree the launch date and the "
        "budget for the beta.",
    ),
    (
        "SPEAKER_01",
        "Um, the build is nearly ready. Testing found two bugs in the upload page that we still have to fix.",
    ),
    ("SPEAKER_00", "How long will the fixes take?"),
    ("SPEAKER_01", "I will fix the upload bugs by Wednesday, so we could launch the following Monday."),
    (
        "SPEAKER_02",
        "Marketing needs a week of notice. I can prepare the announcement email if the date is fixed today.",
    ),
    ("SPEAKER_00", "Then we have decided to launch the beta on Monday the 14th."),
    ("SPEAKER_02", "On budget, I suggest we keep it at five thousand pounds and review it after the first month."),
    ("SPEAKER_00", "Agreed. We agreed to keep the budget at five thousand pounds for now."),
    ("SPEAKER_00", "Sarah will draft the announcement email by Friday and share it with the team."),
    ("SPEAKER_01", "Can you also send me the list of beta testers before the end of the week?"),
    ("SPEAKER_00", "Yes, I'll send the tester list tomorrow. Thanks everyone, that's all for today."),
]


def fake_transcribe_and_diarize(duration_s: float) -> tuple[list[Word], list[Turn]]:
    total_words = sum(len(text.split()) for _, text in SCRIPT)
    span = max(duration_s, 30.0)
    step = span / (total_words + len(SCRIPT))
    t = 0.0
    words: list[Word] = []
    turns: list[Turn] = []
    for speaker, text in SCRIPT:
        start = t
        for token in text.split():
            words.append(Word(text=token, start=round(t, 2), end=round(t + step * 0.9, 2)))
            t += step
        turns.append(Turn(speaker=speaker, start=round(start, 2), end=round(t, 2)))
        t += step  # short pause between speakers
    return words, turns


def fake_summarize(lines: list[TranscriptLine]) -> MeetingNotes:
    def ids(*keywords: str, limit: int = 2) -> list[int]:
        found = [line.id for line in lines if any(k.lower() in line.text.lower() for k in keywords)]
        return found[:limit]

    def speaker(*keywords: str) -> str:
        found = ids(*keywords, limit=1)
        return next((line.speaker for line in lines if found and line.id == found[0]), "A participant")

    point = SourcedPoint
    return MeetingNotes(
        overview=(
            "The team met to agree the beta launch date and budget. Two upload bugs are the only blockers; "
            "once they are fixed by Wednesday the beta will launch on Monday the 14th with a budget of "
            "five thousand pounds, to be reviewed after the first month."
        ),
        summary=[
            point(
                text="Two bugs in the upload page are still to be fixed before launch.", source_segment_ids=ids("bugs")
            ),
            point(text="The beta launch was set for Monday the 14th.", source_segment_ids=ids("Monday the 14th")),
            point(
                text="The beta budget stays at five thousand pounds and will be reviewed after the first month.",
                source_segment_ids=ids("five thousand"),
            ),
            point(
                text="Marketing needs a week of notice to prepare the announcement email.",
                source_segment_ids=ids("week of notice"),
            ),
        ],
        topics=[
            Topic(
                title="Launch readiness and date",
                summary=(
                    "The build is nearly ready, but testing found two bugs in the upload page. The fixes will be "
                    "done by Wednesday, which allows a launch the following Monday. Marketing asked for a week's "
                    "notice, so the date was fixed in the meeting."
                ),
                points=[
                    point(text="Testing found two bugs in the upload page.", source_segment_ids=ids("bugs", limit=1)),
                    point(text="Marketing needs a week of notice.", source_segment_ids=ids("week of notice")),
                ],
                positions=[
                    Position(
                        speaker=speaker("fix the upload"),
                        view="Will fix the bugs by Wednesday, enabling a Monday launch.",
                        source_segment_ids=ids("fix the upload"),
                    ),
                    Position(
                        speaker=speaker("week of notice"),
                        view="Needs the date fixed today to give marketing a week.",
                        source_segment_ids=ids("week of notice"),
                    ),
                ],
                outcome="Beta launch on Monday the 14th.",
                source_segment_ids=ids("bugs", "fix the upload", "Monday the 14th", limit=4),
            ),
            Topic(
                title="Beta budget",
                summary=(
                    "A budget of five thousand pounds was proposed for the beta, with a review after the first "
                    "month. The proposal was accepted without objection."
                ),
                positions=[
                    Position(
                        speaker=speaker("I suggest"),
                        view="Keep the budget at five thousand pounds and review it " "after the first month.",
                        source_segment_ids=ids("I suggest"),
                    ),
                ],
                outcome="Budget kept at five thousand pounds for now.",
                source_segment_ids=ids("five thousand", limit=3),
            ),
        ],
        decisions=extract_decisions(lines),
        action_items=extract_actions(lines),
        open_questions=[
            point(
                text="Who will review the budget after the first month was not decided.",
                source_segment_ids=ids("review it after"),
            ),
        ],
        risks=[
            point(
                text="The launch depends on the upload bugs being fixed by Wednesday.",
                source_segment_ids=ids("fix the upload"),
            ),
            # Deliberately unsupported, so the demo shows the fact-checker catching an invented claim.
            point(
                text="The marketing team warned that the launch could slip by a month.",
                source_segment_ids=ids("Marketing needs"),
            ),
        ],
    )
