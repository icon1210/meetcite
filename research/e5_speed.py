"""E5 - End-to-end processing time by recording length (NFR1: 1 hour in under 10 minutes).

Builds 15, 30 and 60-minute recordings by joining AMI test meetings with FFmpeg,
runs the complete app pipeline on each (exactly as a web upload would), and
records the time spent in every stage.

Usage:  python research/e5_speed.py --lengths 15 30 60 --model llm
Output: research/results/e5_speed.csv
"""

import argparse
import subprocess
import time

from ami import AMI_DIR, load
from common import DATA, RESULTS, append_csv


def build_recording(minutes: int) -> str:
    out = DATA / f"e5_{minutes}min.wav"
    if out.exists():
        return str(out)
    files = [AMI_DIR / f"{m['meeting']}.wav" for m in load("test")]
    listing = DATA / "e5_concat.txt"
    listing.write_text("".join(f"file '{f.as_posix()}'\n" for f in files))
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(listing),
            "-t",
            str(minutes * 60),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(out),
        ],
        check=True,
    )
    return str(out)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lengths", nargs="+", type=int, default=[15, 30, 60])
    parser.add_argument("--model", default="llm", choices=["llm", "bart"])
    args = parser.parse_args()

    from app.db import Base, SessionLocal, engine
    from app.models import Job, Meeting, User
    from app.pipeline.runner import run_pipeline
    from app.security import hash_password

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        user = db.query(User).filter_by(email="e5@example.com").first() or User(
            email="e5@example.com", name="E5", password_hash=hash_password("unused-password")
        )
        db.add(user)
        db.commit()
        user_id = user.id

    for minutes in args.lengths:
        path = build_recording(minutes)
        with SessionLocal() as db:
            meeting = Meeting(
                user_id=user_id,
                title=f"E5 {minutes} min",
                original_filename=path,
                file_path=path,
                model_used=args.model,
                job=Job(warnings=[], stage_timings={}),
            )
            db.add(meeting)
            db.commit()
            meeting_id = meeting.id
        start = time.perf_counter()
        run_pipeline(meeting_id)
        total = time.perf_counter() - start
        with SessionLocal() as db:
            meeting = db.get(Meeting, meeting_id)
            assert meeting is not None and meeting.job is not None
            if meeting.status != "completed":
                raise SystemExit(f"Pipeline failed: {meeting.job.error}")
            append_csv(
                RESULTS / "e5_speed.csv",
                {
                    "minutes": minutes,
                    "model": args.model,
                    "total_s": round(total, 1),
                    "meets_nfr1": total <= 600 * minutes / 60,
                    **{f"{k}_s": v for k, v in meeting.job.stage_timings.items()},
                },
            )


if __name__ == "__main__":
    main()
