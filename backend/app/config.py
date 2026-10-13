"""Application settings, loaded from environment variables (or a .env file).

Secrets such as the JWT key and database password are never hard-coded (spec §14).
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Core -------------------------------------------------------------
    app_name: str = "MeetCite"
    environment: Literal["development", "production", "test"] = "development"
    secret_key: str = "change-me-in-.env"
    access_token_expire_minutes: int = 60
    cors_origins: list[str] = ["http://localhost:5173"]
    # Sign-in/sign-up attempts allowed per minute, per client address and per email.
    auth_attempts_per_minute: int = 10
    # Header carrying the real client address behind a proxy/tunnel (e.g. "CF-Connecting-IP").
    # Leave empty when clients connect directly: the header could otherwise be forged.
    trusted_proxy_header: str | None = None
    # When set, creating an account requires this code. Use it on a public server so strangers
    # cannot sign up and spend your AI credits. Leave empty for open sign-up.
    registration_code: str | None = None

    # --- Storage ----------------------------------------------------------
    # SQLite is used for quick local development; Docker Compose sets a PostgreSQL URL.
    database_url: str = "sqlite:///./data/meetcite.db"
    data_dir: Path = Path("./data")
    max_upload_mb: int = 1024
    max_duration_s: int = 2 * 60 * 60  # two-hour limit (spec §5)

    # --- Background jobs --------------------------------------------------
    # "celery" sends jobs to Redis for the GPU worker (Docker setup).
    # "thread" runs jobs inside the API process, so the app works without Redis.
    task_mode: Literal["celery", "thread"] = "thread"
    redis_url: str = "redis://localhost:6379/0"

    # --- AI pipeline ------------------------------------------------------
    # "fake" swaps every AI stage for a deterministic stub; used by tests and UI demos only.
    ai_mode: Literal["real", "fake"] = "real"
    device: Literal["cuda", "cpu"] = "cuda"
    # large-v3-turbo with batched greedy decoding transcribed an 88-minute meeting in 117 s on an
    # RTX 2060 (large-v3, beam 5, sequential: 1179 s), with 86% word agreement between the two.
    whisper_model: str = "large-v3-turbo"
    whisper_compute_type: str = "int8_float16"
    # Speech regions decoded at once on the GPU (0 = one at a time). 16 fits a 6 GB card.
    whisper_batch_size: int = 16
    whisper_beam_size: int = 1
    hf_token: str | None = None  # needed for pyannote's gated diarization model
    diarization_model: str = "pyannote/speaker-diarization-3.1"
    bart_model: str = "facebook/bart-large-cnn"  # replace with the AMI fine-tuned checkpoint path
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    default_summarizer: Literal["llm", "bart", "cloud"] = "llm"
    llm_context_tokens: int = 8192
    # Longest answer one LLM call may write; stops runaway generations (see llm_clients.py).
    llm_max_output_tokens: int = 4096
    llm_max_retries: int = 3
    # Fact-check every generated point with the local LLM (falls back to word overlap if unavailable).
    verify_with_llm: bool = True

    # --- Where the AI runs ------------------------------------------------
    # "local": Whisper, pyannote and Ollama on this machine's GPU (private, needs an NVIDIA card).
    # "cloud": AssemblyAI for speech-to-text + speakers and Claude for minutes and evidence checks.
    #          Runs on any small server with no GPU; recordings and transcripts are sent to both
    #          providers, which users must be told about (spec §13, §19).
    ai_provider: Literal["local", "cloud"] = "local"
    assemblyai_api_key: str | None = None
    assemblyai_base_url: str = "https://api.assemblyai.com"  # EU: https://api.eu.assemblyai.com

    # Claude: used for everything in cloud mode, and for the optional "cloud" summarizer otherwise.
    cloud_llm_enabled: bool = False
    anthropic_api_key: str | None = None
    cloud_llm_model: str = "claude-opus-5-5"
    # Thinking depth: "low" is fastest; raise it if the minutes miss nuance.
    cloud_llm_effort: Literal["low", "medium", "high", "xhigh", "max"] = "low"
    # Claude reads up to 1M tokens, so a whole meeting (a 2-hour one is ~30k tokens) fits in one call.
    cloud_llm_context_tokens: int = 200_000
    cloud_llm_max_output_tokens: int = 32_000

    @property
    def uses_cloud_ai(self) -> bool:
        return self.ai_provider == "cloud" and self.ai_mode == "real"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def work_dir(self) -> Path:
        return self.data_dir / "work"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    settings.work_dir.mkdir(parents=True, exist_ok=True)
    return settings
