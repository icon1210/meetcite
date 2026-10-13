"""E4 - Factual accuracy: build an annotation sheet for a manual hallucination check (RQ2).

ROUGE and BERTScore do not measure whether a summary is *true*. This script samples
summary points, decisions and action items produced in E3 and writes a spreadsheet
showing each point next to the transcript lines it cites. A human annotator then
labels every row:

  supported     - fully backed by the transcript
  partial       - partly backed, or a detail (name, date, number) is wrong
  unsupported   - not in the transcript (a hallucination)

Model names are hidden behind random codes so the annotator is blind to the model.

Usage:
  python research/e4_hallucination_sheet.py --per-model 40
  (annotate research/results/e4_sheet.csv, then)
  python research/e4_hallucination_sheet.py --score
"""

import argparse
import csv
import json
import random
from collections import Counter, defaultdict

from common import RESULTS

SHEET = RESULTS / "e4_sheet.csv"
KEY = RESULTS / "e4_model_key.json"


def build(per_model: int, seed: int) -> None:
    rng = random.Random(seed)
    rows = []
    for model_dir in sorted((RESULTS / "e3_outputs" / "ref").iterdir()):
        items = []
        for f in sorted(model_dir.glob("*.json")):
            data = json.loads(f.read_text())
            lines = {line["id"]: line for line in data["lines"]}
            notes = data["notes"]
            for kind, entries in (
                ("summary", notes["summary"]),
                ("decision", notes["decisions"]),
                ("action", notes["action_items"]),
            ):
                for e in entries:
                    text = e.get("text") or (
                        f"{e['task']} (owner: {e.get('owner') or '-'}, deadline: {e.get('deadline') or '-'})"
                    )
                    cited = [lines[i] for i in e["source_segment_ids"] if i in lines]
                    items.append(
                        {
                            "model": model_dir.name,
                            "meeting": f.stem,
                            "type": kind,
                            "point": text,
                            "cited_lines": " | ".join(f"[{c['id']}] {c['speaker']}: {c['text']}" for c in cited)
                            or "(no valid citation)",
                        }
                    )
        rows += rng.sample(items, min(per_model, len(items)))

    codes = {m: f"M{i + 1}" for i, m in enumerate(sorted({r["model"] for r in rows}))}
    KEY.write_text(json.dumps({v: k for k, v in codes.items()}, indent=1))
    rng.shuffle(rows)
    with SHEET.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=["row", "model_code", "meeting", "type", "point", "cited_lines", "label", "notes"]
        )
        writer.writeheader()
        for i, r in enumerate(rows, 1):
            writer.writerow(
                {
                    "row": i,
                    "model_code": codes[r["model"]],
                    "meeting": r["meeting"],
                    "type": r["type"],
                    "point": r["point"],
                    "cited_lines": r["cited_lines"],
                    "label": "",
                    "notes": "",
                }
            )
    print(f"Wrote {len(rows)} rows to {SHEET}. Fill in the 'label' column, then run with --score.")


def score() -> None:
    key = json.loads(KEY.read_text())
    counts: dict[str, Counter] = defaultdict(Counter)
    with SHEET.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            label = r["label"].strip().lower()
            if label:
                counts[key[r["model_code"]]][label] += 1
    for model, c in counts.items():
        total = sum(c.values())
        print(
            f"{model}: n={total}  supported={c['supported'] / total:.1%}  partial={c['partial'] / total:.1%}  "
            f"unsupported={c['unsupported'] / total:.1%}"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-model", type=int, default=40)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--score", action="store_true")
    args = parser.parse_args()
    score() if args.score else build(args.per_model, args.seed)
