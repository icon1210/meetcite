import shutil
import subprocess
from pathlib import Path

import pytest

from app.pipeline.preprocess import probe_duration

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="FFmpeg is not installed")


@needs_ffmpeg
def test_browser_style_webm_without_a_stored_length_is_measured(tmp_path: Path) -> None:
    # Writing to a pipe (as a browser's MediaRecorder does) leaves no duration in the WebM header.
    with (tmp_path / "rec.webm").open("wb") as out:
        subprocess.run(
            [
                "ffmpeg",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=duration=3",
                "-c:a",
                "libopus",
                "-f",
                "webm",
                "-",
            ],
            stdout=out,
            check=True,
        )
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(tmp_path / "rec.webm")],
        capture_output=True,
        text=True,
        check=True,
    )
    assert probe.stdout.strip() in {"N/A", ""}  # the situation that used to fail
    assert probe_duration(tmp_path / "rec.webm") == pytest.approx(3.0, abs=0.1)
