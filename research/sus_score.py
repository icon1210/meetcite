"""Score the user study (RQ3, NFR4): System Usability Scale plus Likert ratings.

Input: research/data/user_study.csv with one row per participant and columns
  participant, sus1 ... sus10 (1-5), accuracy, completeness, usefulness (1-5)

SUS scoring (Brooke, 1996): odd items contribute (score - 1), even items (5 - score);
the sum is multiplied by 2.5 to give 0-100. 68 is the commonly cited average.

Usage:  python research/sus_score.py
"""

import csv
import statistics

from common import DATA


def sus(row: dict[str, str]) -> float:
    total = 0
    for i in range(1, 11):
        v = int(row[f"sus{i}"])
        if not 1 <= v <= 5:
            raise ValueError(f"sus{i} must be 1-5 for participant {row['participant']}")
        total += (v - 1) if i % 2 == 1 else (5 - v)
    return total * 2.5


def main() -> None:
    path = DATA / "user_study.csv"
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    scores = [sus(r) for r in rows]
    for r, s in zip(rows, scores, strict=True):
        print(f"{r['participant']}: SUS {s:.1f}")
    print(f"\nParticipants: {len(scores)}")
    print(
        f"SUS mean {statistics.mean(scores):.1f} (SD {statistics.stdev(scores) if len(scores) > 1 else 0:.1f}), "
        f"median {statistics.median(scores):.1f}; NFR4 target (>= 68) "
        f"{'met' if statistics.mean(scores) >= 68 else 'not met'}"
    )
    for item in ("accuracy", "completeness", "usefulness"):
        vals = [int(r[item]) for r in rows if r.get(item)]
        if vals:
            print(f"{item.capitalize()}: mean {statistics.mean(vals):.2f} / 5, median {statistics.median(vals)}")


if __name__ == "__main__":
    main()
