"""E3 - Summary quality and speed: fine-tuned BART vs local LLM (vs optional cloud LLM) (RQ2).

Every model summarizes the same AMI test meetings through the app's own
summarization code, and is scored against the human abstractive summaries with
ROUGE-1/2/L (Lin, 2004) and BERTScore (Zhang et al., 2020).

By default the reference transcript is used as input, so summary quality is
measured on its own. Pass --asr to use Whisper + pyannote output instead
(end-to-end quality, which includes recognition errors).

Usage:
  python research/e3_summarization.py --models bart llm
  CLOUD_LLM_ENABLED=true ANTHROPIC_API_KEY=... python research/e3_summarization.py --models cloud
Output: research/results/e3_summarization.csv and e3_outputs/<model>/<meeting>.json (used by E4)
"""

from common import RESULTS, append_csv, record_run  # first: puts the backend on the import path

# isort: split
import argparse
import json
import os
import time

from ami import AMI_DIR, load
from app.config import get_settings
from app.pipeline.types import TranscriptLine
from rouge_score import rouge_scorer

OUTPUTS = RESULTS / "e3_outputs"


def reference_lines(m: dict) -> list[TranscriptLine]:
    return [
        TranscriptLine(i, f"Speaker {t['speaker']}", t["start"], t["end"], t["text"]) for i, t in enumerate(m["turns"])
    ]


def asr_lines(m: dict, settings) -> list[TranscriptLine]:
    """Run the app's transcription, diarization and alignment on the meeting audio."""
    from app.pipeline.align import align
    from app.pipeline.diarize import DiarizationUnavailable, diarize
    from app.pipeline.transcribe import transcribe

    wav = AMI_DIR / f"{m['meeting']}.wav"
    words = transcribe(
        wav,
        model_size=settings.whisper_model,
        device=settings.device,
        compute_type=settings.whisper_compute_type,
        duration_s=m["turns"][-1]["end"],
        on_progress=lambda f: None,
    )
    try:
        turns = diarize(
            wav,
            model_name=settings.diarization_model,
            hf_token=settings.hf_token,
            device=settings.device,
            on_progress=lambda f: None,
        )
    except DiarizationUnavailable:
        turns = []
    return [TranscriptLine(i, s.speaker, s.start, s.end, s.text) for i, s in enumerate(align(words, turns))]


def main() -> None:
    parser = argparse.ArgumentParser()
    # C1 = baseline, C2 = llm (evidence-grounded), C3 = bart (optional), cloud = optional comparison.
    parser.add_argument(
        "--models", nargs="+", default=["baseline", "llm"], choices=["baseline", "llm", "bart", "cloud"]
    )
    parser.add_argument("--asr", action="store_true", help="summarize ASR output instead of the reference transcript")
    parser.add_argument("--no-bertscore", action="store_true")
    args = parser.parse_args()

    os.environ["AI_MODE"] = "real"
    settings = get_settings()
    from app.pipeline.runner import generate_notes

    scorer = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeLsum"], use_stemmer=True)
    meetings = load("test")
    inputs = {m["meeting"]: (asr_lines(m, settings) if args.asr else reference_lines(m)) for m in meetings}

    for model in args.models:
        out_dir = OUTPUTS / ("asr" if args.asr else "ref") / model
        out_dir.mkdir(parents=True, exist_ok=True)
        rows, candidates, references = [], [], []
        for m in meetings:
            lines = inputs[m["meeting"]]
            start = time.perf_counter()
            notes, label = generate_notes(settings, lines, model, on_progress=lambda f: None)
            elapsed = time.perf_counter() - start
            summary = "\n".join(p.text for p in notes.summary)  # one sentence per line for ROUGE-Lsum
            (out_dir / f"{m['meeting']}.json").write_text(
                json.dumps(
                    {
                        "model": label,
                        "summary": summary,
                        "notes": notes.model_dump(),
                        "lines": [line.__dict__ for line in lines],
                    },
                    indent=1,
                )
            )
            s = scorer.score(m["abstract"].replace(". ", ".\n"), summary)
            rows.append(
                {
                    "meeting": m["meeting"],
                    "model": label,
                    "input": "asr" if args.asr else "reference",
                    "rouge1": round(s["rouge1"].fmeasure, 4),
                    "rouge2": round(s["rouge2"].fmeasure, 4),
                    "rougeL": round(s["rougeLsum"].fmeasure, 4),
                    "summary_words": len(summary.split()),
                    "decisions": len(notes.decisions),
                    "action_items": len(notes.action_items),
                    "time_s": round(elapsed, 1),
                }
            )
            candidates.append(summary)
            references.append(m["abstract"])

        if not args.no_bertscore:
            from bert_score import score as bert_score

            # Rescaled with baseline so scores spread across a readable range (Zhang et al., 2020).
            _, _, f1 = bert_score(candidates, references, lang="en", rescale_with_baseline=True)
            for row, f in zip(rows, f1.tolist(), strict=True):
                row["bertscore_f1"] = round(f, 4)
        for row in rows:
            append_csv(RESULTS / "e3_summarization.csv", row)
        from app.pipeline.runner import _summary_settings, prompt_version

        numeric = [k for k in rows[0] if isinstance(rows[0][k], int | float) and k not in ("decisions", "action_items")]
        record_run(
            experiment="E3",
            dataset_split="ami-test" + ("-asr" if args.asr else "-reference"),
            model_config=_summary_settings(settings, model),
            prompt_version=prompt_version(model),
            metrics={k: round(sum(r[k] for r in rows) / len(rows), 4) for k in numeric} | {"meetings": len(rows)},
            runtime_s=sum(r["time_s"] for r in rows),
        )


if __name__ == "__main__":
    main()
