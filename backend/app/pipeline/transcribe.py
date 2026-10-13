"""Stage 2: speech recognition with faster-whisper (spec §10.2).

Produces word-level timestamps; voice activity detection skips silence.
"""

from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.pipeline.gpu import release_gpu_memory
from app.pipeline.types import Word


def model_path(model_size: str, models_dir: Path) -> str:
    """Download the model once into ``models_dir`` as ordinary files and return its folder.

    The Hugging Face cache uses symbolic links, which Windows only allows in Developer
    Mode or as administrator; a plain folder works everywhere.
    """
    from faster_whisper.utils import download_model

    target = models_dir / f"faster-whisper-{model_size}"
    if (target / "model.bin").exists() and (target / "config.json").exists():
        return str(target)
    target.mkdir(parents=True, exist_ok=True)
    return str(download_model(model_size, output_dir=str(target)))


def transcribe(
    wav_path: Path,
    *,
    model_size: str,
    device: str,
    compute_type: str,
    duration_s: float,
    on_progress: Callable[[float], None],
    models_dir: Path | None = None,
    batch_size: int = 0,
    beam_size: int = 5,
) -> list[Word]:
    """Transcribe ``wav_path``.

    ``batch_size`` > 0 uses faster-whisper's batched pipeline: speech regions found by voice
    activity detection are decoded several at a time, which is several times faster on a GPU.
    0 decodes sequentially (lower memory use, e.g. on CPU).
    """
    try:
        # On Windows, importing torch first puts its bundled CUDA/cuDNN DLLs on the search path,
        # which CTranslate2 (used by faster-whisper) needs to find the GPU libraries.
        import torch  # noqa: F401
    except ImportError:
        pass
    from faster_whisper import BatchedInferencePipeline, WhisperModel  # heavy import, worker only

    if device == "cpu" and "float16" in compute_type:
        compute_type = "int8"  # FP16 is GPU-only
    source = model_path(model_size, models_dir) if models_dir is not None else model_size
    model = WhisperModel(source, device=device, compute_type=compute_type)
    try:
        options: dict[str, Any] = {
            "language": "en",
            "word_timestamps": True,
            "vad_filter": True,
            "beam_size": beam_size,
        }
        if batch_size > 0:
            segments, _info = BatchedInferencePipeline(model).transcribe(
                str(wav_path), batch_size=batch_size, **options
            )
        else:
            segments, _info = model.transcribe(str(wav_path), **options)
        words: list[Word] = []
        # ``segments`` is a lazy generator: transcription happens as we iterate.
        for seg in segments:
            for w in seg.words or []:
                words.append(Word(text=w.word.strip(), start=round(w.start, 2), end=round(w.end, 2)))
            if duration_s > 0:
                on_progress(min(seg.end / duration_s, 1.0))
        return [w for w in words if w.text]
    finally:
        del model
        release_gpu_memory()
