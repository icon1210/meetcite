"""Stage 3: speaker diarization with pyannote.audio (spec §10.3).

Produces speaker turns such as ``SPEAKER_00`` from 0.0 to 12.4 seconds.
"""

from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.pipeline.gpu import release_gpu_memory
from app.pipeline.types import Turn


class DiarizationUnavailable(RuntimeError):
    """Raised when diarization cannot run (e.g. no Hugging Face token)."""


def diarize(
    wav_path: Path,
    *,
    model_name: str,
    hf_token: str | None,
    device: str,
    on_progress: Callable[[float], None],
) -> list[Turn]:
    if not hf_token:
        raise DiarizationUnavailable(
            "Speaker identification needs a Hugging Face token (HF_TOKEN). "
            "All speech has been attributed to a single speaker."
        )

    import torch
    import torchaudio
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(model_name, use_auth_token=hf_token)
    if pipeline is None:
        raise DiarizationUnavailable(
            f"Could not load {model_name}. Accept its user conditions on huggingface.co and check HF_TOKEN."
        )
    try:
        if device == "cuda" and torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))

        # Loading audio ourselves avoids pyannote's own decoder, which is fussy on Windows.
        waveform, sample_rate = torchaudio.load(str(wav_path))

        # pyannote reports progress through a hook: (step_name, artifact, completed=, total=)
        steps = ["segmentation", "speaker_counting", "embeddings", "discrete_diarization"]

        def hook(
            step_name: str, _artifact: Any, file: Any = None, total: int | None = None, completed: int | None = None
        ) -> None:
            idx = steps.index(step_name) if step_name in steps else 0
            frac = (completed / total) if total and completed is not None else 1.0
            on_progress(min((idx + frac) / len(steps), 1.0))

        annotation = pipeline({"waveform": waveform, "sample_rate": sample_rate}, hook=hook)
        turns = [
            Turn(speaker=str(label), start=round(seg.start, 2), end=round(seg.end, 2))
            for seg, _track, label in annotation.itertracks(yield_label=True)
        ]
        return sorted(turns, key=lambda t: t.start)
    finally:
        del pipeline
        release_gpu_memory()
