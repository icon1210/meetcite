"""Stage 1: convert any upload to 16 kHz mono WAV with normalised volume (spec §10.1)."""

import json
import re
import shutil
import subprocess
from pathlib import Path


class PreprocessError(RuntimeError):
    pass


def _require(tool: str) -> str:
    path = shutil.which(tool)
    if path is None:
        raise PreprocessError(f"{tool} was not found. Install FFmpeg and make sure it is on your PATH.")
    return path


_TIME = re.compile(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)")


def _decoded_duration(path: Path) -> float | None:
    """Measure the length by reading through the audio (fast: an hour takes a few seconds)."""
    result = subprocess.run(
        [_require("ffmpeg"), "-hide_banner", "-nostats", "-i", str(path), "-vn", "-f", "null", "-"],
        capture_output=True,
        text=True,
        check=False,
    )
    matches = _TIME.findall(result.stderr)
    if result.returncode != 0 or not matches:
        return None
    hours, minutes, seconds = matches[-1]
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def probe_duration(path: Path) -> float:
    """Return the media duration in seconds using ffprobe.

    Browser recordings (MediaRecorder .webm) are written as a stream and usually carry no
    duration in their header, so when ffprobe reports none the audio is decoded to measure it.
    """
    result = subprocess.run(
        [_require("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise PreprocessError("The file could not be read as audio or video. Is it a supported recording?")
    try:
        return float(json.loads(result.stdout)["format"]["duration"])
    except (KeyError, ValueError, json.JSONDecodeError):
        measured = _decoded_duration(path)
        if measured is None or measured <= 0:
            raise PreprocessError("Could not determine the recording's length. Is the file complete?") from None
        return measured


def to_wav(src: Path, dst: Path, max_duration_s: int, normalize: bool = True) -> float:
    """Convert ``src`` to a 16 kHz mono WAV at ``dst``. Returns the duration in seconds.

    ``normalize`` evens out the volume for Whisper and pyannote; it is the slow part of this stage,
    and cloud speech-to-text does its own, so cloud mode skips it.
    """
    duration = probe_duration(src)
    if duration > max_duration_s:
        raise PreprocessError(
            f"The recording is {duration / 60:.0f} minutes long; the limit is {max_duration_s / 60:.0f} minutes."
        )
    dst.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            _require("ffmpeg"),
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(src),
            "-vn",  # drop any video track
            "-ac",
            "1",
            "-ar",
            "16000",  # mono, 16 kHz - what Whisper and pyannote expect
            *(["-af", "loudnorm"] if normalize else []),  # EBU R128 volume normalisation
            "-c:a",
            "pcm_s16le",
            str(dst),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise PreprocessError(f"FFmpeg failed to convert the recording: {result.stderr.strip()[:300]}")
    return duration
