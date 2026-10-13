"""Stage 4: assign each transcribed word to a speaker (spec §10.4).

Each word goes to the speaker whose diarization turn overlaps it most. Words
that fall in a gap between turns go to the nearest turn. Consecutive words from
the same speaker are then merged into segments.
"""

from app.pipeline.types import AlignedSegment, Turn, Word

DEFAULT_SPEAKER = "SPEAKER_00"
# Start a new segment when the same speaker pauses this long, or a segment gets this long,
# so transcript rows stay readable and summary citations stay precise.
MAX_PAUSE_S = 2.0
MAX_SEGMENT_S = 30.0


def _overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def speaker_for_word(word: Word, turns: list[Turn]) -> str:
    if not turns:
        return DEFAULT_SPEAKER
    best_turn, best_overlap = None, 0.0
    for turn in turns:
        ov = _overlap(word.start, word.end, turn.start, turn.end)
        if ov > best_overlap:
            best_turn, best_overlap = turn, ov
    if best_turn is not None:
        return best_turn.speaker
    # No overlap: choose the turn whose edge is closest to the word's midpoint.
    mid = (word.start + word.end) / 2
    nearest = min(turns, key=lambda t: 0.0 if t.start <= mid <= t.end else min(abs(mid - t.start), abs(mid - t.end)))
    return nearest.speaker


def align(words: list[Word], turns: list[Turn]) -> list[AlignedSegment]:
    segments: list[AlignedSegment] = []
    for word in words:
        speaker = speaker_for_word(word, turns)
        current = segments[-1] if segments else None
        if (
            current is not None
            and current.speaker == speaker
            and word.start - current.end <= MAX_PAUSE_S
            and word.end - current.start <= MAX_SEGMENT_S
        ):
            current.words.append(word)
            current.end = word.end
        else:
            segments.append(AlignedSegment(speaker=speaker, start=word.start, end=word.end, words=[word]))
    return segments
