"""Cloud speech-to-text with AssemblyAI: transcription and speaker separation in one request.

Used when AI_PROVIDER=cloud, so MeetCite can run on an ordinary server with no GPU. The audio
is compressed, uploaded to AssemblyAI, and the timed words and speaker turns come back in the
same shapes the local Whisper + pyannote stages produce, so alignment and everything after it
is unchanged.

Privacy: the recording leaves the server. This must be stated to users and covered by the
ethics approval (spec §13, §19).
"""

import subprocess
import time
from collections.abc import Callable
from pathlib import Path

import httpx

from app.pipeline.preprocess import PreprocessError, _require
from app.pipeline.types import Turn, Word


class CloudTranscriptionError(RuntimeError):
    pass


def compress_for_upload(wav: Path, dst: Path) -> Path:
    """A small mono MP3 for upload (an hour is ~25 MB instead of ~115 MB of WAV)."""
    result = subprocess.run(
        [
            _require("ffmpeg"),
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(wav),
            "-ac",
            "1",
            "-b:a",
            "48k",
            str(dst),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise PreprocessError(f"FFmpeg could not compress the audio for upload: {result.stderr.strip()[:300]}")
    return dst


def _speaker_label(raw: str | None) -> str:
    # AssemblyAI labels speakers "A", "B", ...; the rest of MeetCite expects SPEAKER_00, SPEAKER_01, ...
    if not raw:
        return "SPEAKER_00"
    index = sum((ord(c) - 64) * 26**i for i, c in enumerate(reversed(raw.upper()))) - 1 if raw.isalpha() else 0
    return f"SPEAKER_{index:02d}"


def parse_transcript(data: dict) -> tuple[list[Word], list[Turn]]:
    """Convert an AssemblyAI transcript (times in milliseconds) to MeetCite words and turns."""
    words = [
        Word(text=str(w["text"]).strip(), start=round(w["start"] / 1000, 2), end=round(w["end"] / 1000, 2))
        for w in data.get("words") or []
        if str(w.get("text", "")).strip()
    ]
    turns = [
        Turn(speaker=_speaker_label(u.get("speaker")), start=u["start"] / 1000, end=u["end"] / 1000)
        for u in data.get("utterances") or []
    ]
    return words, turns


def streaming_host(base_url: str) -> str:
    """The live-streaming host matching the chosen data region (EU or global)."""
    return "streaming.eu.assemblyai.com" if ".eu." in base_url else "streaming.assemblyai.com"


def create_streaming_token(api_key: str, base_url: str, max_session_s: int) -> str:
    """A short-lived token the browser uses to open the live-captions WebSocket.

    The permanent API key never leaves the server; the token can only start one session within a
    minute, and the session itself is capped at the meeting length limit.
    """
    try:
        resp = httpx.get(
            f"https://{streaming_host(base_url)}/v3/token",
            params={"expires_in_seconds": 60, "max_session_duration_seconds": max(60, min(max_session_s, 10_800))},
            headers={"authorization": api_key},
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise CloudTranscriptionError(f"Could not reach AssemblyAI: {exc}") from exc
    if resp.status_code == 401:
        raise CloudTranscriptionError("AssemblyAI rejected the API key. Check ASSEMBLYAI_API_KEY in the settings.")
    if resp.status_code >= 400:
        raise CloudTranscriptionError(f"AssemblyAI could not start live captions ({resp.status_code}).")
    return str(resp.json()["token"])


class AssemblyAIClient:
    def __init__(self, api_key: str, base_url: str = "https://api.assemblyai.com", poll_s: float = 3.0) -> None:
        self._http = httpx.Client(
            base_url=base_url, headers={"authorization": api_key}, timeout=httpx.Timeout(300.0, connect=15.0)
        )
        self._poll_s = poll_s

    def _check(self, resp: httpx.Response, action: str) -> dict:
        if resp.status_code == 401:
            raise CloudTranscriptionError("AssemblyAI rejected the API key. Check ASSEMBLYAI_API_KEY in the settings.")
        if resp.status_code >= 400:
            raise CloudTranscriptionError(f"AssemblyAI could not {action} ({resp.status_code}): {resp.text[:300]}")
        return dict(resp.json())

    def transcribe(
        self,
        audio: Path,
        *,
        speaker_labels: bool = True,
        language_code: str = "en",
        on_progress: Callable[[float], None] = lambda f: None,
        timeout_s: float = 3600.0,
    ) -> tuple[list[Word], list[Turn]]:
        try:
            with audio.open("rb") as fh:
                upload = self._check(
                    self._http.post("/v2/upload", content=fh, headers={"content-type": "application/octet-stream"}),
                    "receive the audio",
                )
            on_progress(0.25)
            job = self._check(
                self._http.post(
                    "/v2/transcript",
                    json={
                        "audio_url": upload["upload_url"],
                        "speaker_labels": speaker_labels,
                        "language_code": language_code,
                        "punctuate": True,
                        "format_text": True,
                    },
                ),
                "start the transcription",
            )
            deadline = time.monotonic() + timeout_s
            while True:
                data = self._check(self._http.get(f"/v2/transcript/{job['id']}"), "report progress")
                if data.get("status") == "completed":
                    on_progress(1.0)
                    return parse_transcript(data)
                if data.get("status") == "error":
                    raise CloudTranscriptionError(f"AssemblyAI could not transcribe the recording: {data.get('error')}")
                if time.monotonic() > deadline:
                    raise CloudTranscriptionError("AssemblyAI took too long to transcribe the recording.")
                on_progress(0.5 if data.get("status") == "processing" else 0.3)
                time.sleep(self._poll_s)
        except httpx.HTTPError as exc:
            raise CloudTranscriptionError(f"Could not reach AssemblyAI: {exc}") from exc
