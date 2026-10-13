"""E2 - Speaker diarization error rate on AMI (RQ1).

Runs the app's pyannote diarization stage on each AMI test meeting and scores it
against the reference speaker turns with pyannote.metrics. A 0.25 s forgiveness
collar is used, as is standard practice when reporting DER on AMI.

Usage:  python research/e2_diarization.py
Output: research/results/e2_diarization.csv
"""

from common import RESULTS, append_csv  # first: puts the backend on the import path

# isort: split
import argparse
import os
import time

from ami import AMI_DIR, load
from app.pipeline.diarize import diarize
from pyannote.core import Annotation, Segment
from pyannote.metrics.diarization import DiarizationErrorRate


def to_annotation(turns, label_key="speaker") -> Annotation:
    ann = Annotation()
    for t in turns:
        start, end = (t["start"], t["end"]) if isinstance(t, dict) else (t.start, t.end)
        label = t[label_key] if isinstance(t, dict) else t.speaker
        if end > start:
            ann[Segment(start, end)] = label
    return ann


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="pyannote/speaker-diarization-3.1")
    parser.add_argument("--collar", type=float, default=0.25)
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()
    token = os.environ.get("HF_TOKEN")
    if not token:
        raise SystemExit("Set HF_TOKEN (see .env.example) first.")

    for m in load("test"):
        metric = DiarizationErrorRate(collar=args.collar, skip_overlap=False)
        start = time.perf_counter()
        hyp = diarize(
            AMI_DIR / f"{m['meeting']}.wav",
            model_name=args.model,
            hf_token=token,
            device=args.device,
            on_progress=lambda f: None,
        )
        elapsed = time.perf_counter() - start
        detail = metric(to_annotation(m["turns"]), to_annotation(hyp), detailed=True)
        total = detail["total"] or 1.0
        append_csv(
            RESULTS / "e2_diarization.csv",
            {
                "meeting": m["meeting"],
                "model": args.model,
                "collar": args.collar,
                "der": round(detail["diarization error rate"], 4),
                "missed": round(detail["missed detection"] / total, 4),
                "false_alarm": round(detail["false alarm"] / total, 4),
                "confusion": round(detail["confusion"] / total, 4),
                "ref_speakers": len({t["speaker"] for t in m["turns"]}),
                "hyp_speakers": len({t.speaker for t in hyp}),
                "time_s": round(elapsed, 1),
            },
        )


if __name__ == "__main__":
    main()
