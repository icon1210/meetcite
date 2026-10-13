"""Shared helpers for the experiment scripts.

The experiments call the *same* pipeline modules the web app uses (backend/app/pipeline),
so the measured results describe the system that users actually run.
"""

import csv
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT.parent / "backend"
DATA = ROOT / "data"
RESULTS = ROOT / "results"
RESULTS.mkdir(exist_ok=True)

# Make `import app...` work and keep the experiment's files away from the app's own data folder.
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DATA_DIR", str(DATA / "app-scratch"))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(DATA / 'app-scratch' / 'unused.db').as_posix()}")
(DATA / "app-scratch").mkdir(parents=True, exist_ok=True)


def hardware_description() -> str:
    """GPU, driver and OS, recorded with every experiment run (spec NFR8)."""
    import platform
    import subprocess

    try:
        gpu = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        ).stdout.strip()
    except OSError:
        gpu = "no NVIDIA GPU found"
    return f"{gpu} | {platform.system()} {platform.release()} | Python {platform.python_version()}"[:200]


def record_run(
    experiment: str,
    dataset_split: str,
    model_config: dict[str, Any],
    metrics: dict[str, Any],
    runtime_s: float,
    prompt_version: str = "",
    notes: str | None = None,
) -> None:
    """Store one experiment run in the evaluation_runs table so results can be traced and re-run."""
    from app.db import SessionLocal, engine
    from app.models import Base, EvaluationRun

    Base.metadata.create_all(engine, tables=[EvaluationRun.__table__])
    with SessionLocal() as db:
        db.add(
            EvaluationRun(
                experiment=experiment,
                dataset_split=dataset_split,
                model_config=model_config,
                prompt_version=prompt_version,
                metrics=metrics,
                runtime_s=round(runtime_s, 2),
                hardware=hardware_description(),
                notes=notes,
            )
        )
        db.commit()


def append_csv(path: Path, row: dict[str, Any]) -> None:
    """Append one result row, writing the header the first time."""
    new = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(row))
        if new:
            writer.writeheader()
        writer.writerow(row)
    print(row)
