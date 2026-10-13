"""Helpers for sharing a small GPU between models.

Whisper, pyannote and the LLM do not all fit in 6 GB at once, so each stage
loads its model, uses it, and releases it before the next stage starts (spec §15).
"""

import gc


def release_gpu_memory() -> None:
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:  # torch is only installed with the ML extras
        pass
