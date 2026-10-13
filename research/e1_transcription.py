"""E1 - Transcription accuracy and speed by Whisper model size (RQ1).

For each AMI test meeting and each model size, transcribes the headset-mix audio
with the app's own transcription stage and records Word Error Rate and time.

Usage:  python research/e1_transcription.py --models small medium large-v3
Output: research/results/e1_transcription.csv
"""

from common import RESULTS, append_csv  # first: puts the backend on the import path

# isort: split
import argparse
import time

import jiwer
from ami import AMI_DIR, load
from app.pipeline.transcribe import transcribe

# Normalise both texts the same way so WER measures words, not punctuation or casing.
NORMALISE = jiwer.Compose(
    [
        jiwer.ToLowerCase(),
        jiwer.RemovePunctuation(),
        jiwer.RemoveMultipleSpaces(),
        jiwer.Strip(),
        jiwer.ReduceToListOfListOfWords(),
    ]
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="+", default=["small", "medium", "large-v3"])
    parser.add_argument("--compute-type", default="int8_float16")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--limit", type=int, default=0, help="only the first N meetings (0 = all)")
    args = parser.parse_args()

    meetings = load("test")
    if args.limit:
        meetings = meetings[: args.limit]
    for model in args.models:
        for m in meetings:
            wav = AMI_DIR / f"{m['meeting']}.wav"
            duration = m["turns"][-1]["end"]
            start = time.perf_counter()
            words = transcribe(
                wav,
                model_size=model,
                device=args.device,
                compute_type=args.compute_type,
                duration_s=duration,
                on_progress=lambda f: None,
            )
            elapsed = time.perf_counter() - start
            hypothesis = " ".join(w.text for w in words)
            out = jiwer.process_words(
                m["reference_text"],
                hypothesis,
                reference_transform=NORMALISE,
                hypothesis_transform=NORMALISE,
            )
            append_csv(
                RESULTS / "e1_transcription.csv",
                {
                    "meeting": m["meeting"],
                    "model": model,
                    "compute_type": args.compute_type,
                    "audio_s": round(duration, 1),
                    "time_s": round(elapsed, 1),
                    "real_time_factor": round(elapsed / duration, 4),
                    "wer": round(out.wer, 4),
                    "substitutions": out.substitutions,
                    "deletions": out.deletions,
                    "insertions": out.insertions,
                },
            )


if __name__ == "__main__":
    main()
