"""Saving and deleting uploaded recordings (spec §14).

Uploads are checked by extension, content type and size, and saved under a
random name outside the web root. FFmpeg later confirms they really are media.
"""

import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.config import get_settings

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".mp4", ".webm"}
_CHUNK = 1024 * 1024


def save_upload(upload: UploadFile) -> Path:
    settings = get_settings()
    ext = Path(upload.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Unsupported file type. Please upload one of: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    ctype = (upload.content_type or "").lower()
    if ctype and not ctype.startswith(("audio/", "video/", "application/octet-stream")):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "The file does not look like audio or video.")

    limit = settings.max_upload_mb * 1024 * 1024
    dest = settings.uploads_dir / f"{uuid.uuid4().hex}{ext}"
    written = 0
    try:
        with dest.open("wb") as out:
            while chunk := upload.file.read(_CHUNK):
                written += len(chunk)
                if written > limit:
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        f"The file is larger than the {settings.max_upload_mb} MB limit.",
                    )
                out.write(chunk)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    if written == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty.")
    return dest


MAX_NAMES_FILE_BYTES = 10 * 1024 * 1024


def save_names_file(upload: UploadFile) -> Path:
    """Save a Teams/Zoom .vtt transcript after checking it really contains speaker turns."""
    from app.pipeline.names import TranscriptFileError, parse_platform_transcript

    if Path(upload.filename or "").suffix.lower() != ".vtt":
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "The speaker-names file must be a .vtt transcript from Teams or Zoom.",
        )
    raw = upload.file.read(MAX_NAMES_FILE_BYTES + 1)
    if len(raw) > MAX_NAMES_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "The transcript file is larger than 10 MB.")
    try:
        parse_platform_transcript(raw.decode("utf-8-sig", errors="replace"))
    except TranscriptFileError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    dest = get_settings().uploads_dir / f"{uuid.uuid4().hex}.vtt"
    dest.write_bytes(raw)
    return dest


def delete_meeting_files(meeting_id: int, *file_paths: str) -> None:
    """Remove the recording, any transcript file and all intermediate files for a meeting (US11)."""
    for file_path in file_paths:
        Path(file_path).unlink(missing_ok=True)
    shutil.rmtree(get_settings().work_dir / str(meeting_id), ignore_errors=True)
