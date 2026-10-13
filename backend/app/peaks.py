"""Waveform peaks for the audio player.

Letting the browser decode a two-hour recording to draw its waveform would use
over a gigabyte of memory, so the server computes a small list of peaks once
from the 16 kHz WAV and WaveSurfer draws from that while streaming the audio.
"""

import json
import wave
from array import array
from pathlib import Path

BUCKETS = 4000


def compute_peaks(wav_path: Path, buckets: int = BUCKETS) -> list[float]:
    with wave.open(str(wav_path), "rb") as wav:
        if wav.getsampwidth() != 2:
            return []
        total = wav.getnframes() * wav.getnchannels()
        per_bucket = max(1, total // buckets)
        peaks: list[float] = []
        while True:
            raw = wav.readframes(per_bucket // wav.getnchannels() or 1)
            if not raw:
                break
            samples = array("h")
            samples.frombytes(raw)
            peak = max(max(samples), -min(samples)) if samples else 0
            peaks.append(round(peak / 32768, 3))
    top = max(peaks, default=0) or 1
    return [round(p / top, 3) for p in peaks]  # normalise so quiet recordings are still visible


def cached_peaks(work_dir: Path) -> list[float]:
    cache = work_dir / "peaks.json"
    if cache.exists():
        return list(json.loads(cache.read_text()))
    wav_path = work_dir / "audio.wav"
    if not wav_path.exists():
        return []
    peaks = compute_peaks(wav_path)
    cache.write_text(json.dumps(peaks))
    return peaks
