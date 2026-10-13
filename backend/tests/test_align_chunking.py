from app.pipeline.align import align, speaker_for_word
from app.pipeline.chunking import chunk_lines, clean_text
from app.pipeline.types import TranscriptLine, Turn, Word


def test_word_goes_to_speaker_with_most_overlap() -> None:
    turns = [Turn("A", 0.0, 1.0), Turn("B", 0.9, 3.0)]
    assert speaker_for_word(Word("hi", 0.5, 0.95), turns) == "A"
    assert speaker_for_word(Word("there", 0.95, 1.5), turns) == "B"


def test_word_in_gap_goes_to_nearest_turn() -> None:
    turns = [Turn("A", 0.0, 1.0), Turn("B", 5.0, 6.0)]
    assert speaker_for_word(Word("um", 1.2, 1.4), turns) == "A"
    assert speaker_for_word(Word("so", 4.6, 4.8), turns) == "B"


def test_no_diarization_uses_single_speaker() -> None:
    segments = align([Word("hello", 0, 0.5), Word("world", 0.6, 1.0)], [])
    assert len(segments) == 1
    assert segments[0].speaker == "SPEAKER_00"
    assert segments[0].text == "hello world"


def test_consecutive_words_merge_and_speaker_change_splits() -> None:
    words = [Word("a", 0, 0.4), Word("b", 0.5, 0.9), Word("c", 1.0, 1.4), Word("d", 1.5, 1.9)]
    turns = [Turn("A", 0, 1.0), Turn("B", 1.0, 2.0)]
    segments = align(words, turns)
    assert [(s.speaker, s.text) for s in segments] == [("A", "a b"), ("B", "c d")]
    assert segments[1].start == 1.0 and segments[1].end == 1.9


def test_long_pause_starts_new_segment() -> None:
    segments = align([Word("a", 0, 0.5), Word("b", 10, 10.5)], [Turn("A", 0, 11)])
    assert len(segments) == 2


def test_clean_text_removes_fillers_but_keeps_meaning() -> None:
    assert clean_text("Um, I'd like to, uh, you know, ship it it on Friday") == "I'd like to, ship it on Friday"


def _lines(n: int, words_each: int = 50) -> list[TranscriptLine]:
    # Distinct words, because the cleaner deliberately collapses stutters like "word word".
    return [TranscriptLine(i, "S", i, i + 1, " ".join(f"w{i}x{j}" for j in range(words_each))) for i in range(n)]


def test_chunks_respect_budget_and_overlap() -> None:
    chunks = chunk_lines(_lines(20), max_tokens=300, overlap_lines=1)
    assert len(chunks) > 1
    for a, b in zip(chunks, chunks[1:], strict=False):
        assert a[-1].id == b[0].id  # one line of overlap
    covered = {line.id for c in chunks for line in c}
    assert covered == set(range(20))  # nothing is lost


def test_oversized_line_is_its_own_chunk() -> None:
    chunks = chunk_lines(_lines(3, words_each=1000), max_tokens=100)
    assert [len(c) for c in chunks] == [1, 1, 1]
