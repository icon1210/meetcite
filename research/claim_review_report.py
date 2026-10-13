"""RQ2 analysis: human factual-support labels per configuration, and inter-reviewer agreement.

Reviewers label claims in the MeetMind interface (Review buttons, spec §21 rubric). This
script reads those labels from the database and reports, per configuration:

  * the distribution of labels (supported / partial / unsupported / contradicted / unclear);
  * the primary RQ2 outcome: the share of claims labelled unsupported or contradicted,
    with a 95% Wilson confidence interval;
  * Cohen's kappa between two reviewers on the claims both labelled (Cohen, 1960).

Point it at the app's database with DATABASE_URL, e.g.
  set DATABASE_URL=sqlite:///backend/data/meetmind.db
  python research/claim_review_report.py --reviewers alice@uni.ac.uk bob@uni.ac.uk

Significance is not claimed here; report intervals and let the sample size speak (spec §21).
"""

import argparse
import math
from collections import Counter, defaultdict

from common import RESULTS, append_csv  # first: puts the backend on the import path

# isort: split
from app.db import SessionLocal
from app.models import ClaimReview, User
from sqlalchemy import select

LABELS = ["supported", "partial", "unsupported", "contradicted", "unclear"]


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return (max(0.0, centre - half), min(1.0, centre + half))


def cohen_kappa(a: list[str], b: list[str]) -> float:
    n = len(a)
    if n == 0:
        return float("nan")
    observed = sum(x == y for x, y in zip(a, b, strict=True)) / n
    ca, cb = Counter(a), Counter(b)
    expected = sum(ca[label] * cb[label] for label in LABELS) / (n * n)
    return (observed - expected) / (1 - expected) if expected < 1 else 1.0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reviewers", nargs="*", default=[], help="two reviewer emails for Cohen's kappa")
    args = parser.parse_args()

    with SessionLocal() as db:
        rows = db.execute(select(ClaimReview, User.email).join(User, User.id == ClaimReview.reviewer_id)).all()
    if not rows:
        raise SystemExit("No claim reviews found. Label claims in the app first (Review buttons).")

    by_config: dict[str, Counter[str]] = defaultdict(Counter)
    for review, _email in rows:
        by_config[review.configuration][review.label] += 1

    print("Labels per configuration")
    for config, counts in sorted(by_config.items()):
        n = sum(counts.values())
        bad = counts["unsupported"] + counts["contradicted"]
        lo, hi = wilson(bad, n)
        print(f"  {config}: n={n}  " + "  ".join(f"{lab}={counts[lab]}" for lab in LABELS))
        print(f"    unsupported or contradicted: {bad / n:.1%} (95% CI {lo:.1%}-{hi:.1%})")
        append_csv(
            RESULTS / "claim_reviews_summary.csv",
            {
                "configuration": config,
                "n": n,
                **{lab: counts[lab] for lab in LABELS},
                "unsupported_or_contradicted": round(bad / n, 4),
                "ci_low": round(lo, 4),
                "ci_high": round(hi, 4),
            },
        )

    if len(args.reviewers) == 2:
        first, second = args.reviewers
        labels: dict[str, dict[str, str]] = defaultdict(dict)
        for review, email in rows:
            labels[email][review.claim_key] = review.label
        shared = sorted(set(labels[first]) & set(labels[second]))
        kappa = cohen_kappa([labels[first][k] for k in shared], [labels[second][k] for k in shared])
        print(f"\nCohen's kappa ({first} vs {second}) on {len(shared)} shared claims: {kappa:.3f}")


if __name__ == "__main__":
    main()
