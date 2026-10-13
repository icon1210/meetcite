"""MeetCite API entry point.

Run locally with:  uvicorn app.main:app --reload
Interactive API documentation is served at /docs.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import engine
from app.routers import auth, claims, edits, live, meetings, series
from app.schemas import ConfigOut

BACKEND_DIR = Path(__file__).resolve().parent.parent

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    if settings.environment == "production" and settings.secret_key == "change-me-in-.env":
        raise RuntimeError("Set SECRET_KEY to a long random value before running in production.")
    _migrate_database()
    _recover_interrupted_jobs()
    yield


def _migrate_database() -> None:
    """Bring the database schema up to date with the Alembic migrations, on every start."""
    from sqlalchemy import inspect

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.attributes["configure_logger"] = False  # keep the server's own logging setup
    tables = inspect(engine).get_table_names()
    if "users" in tables and "alembic_version" not in tables:
        command.stamp(cfg, "0001")  # a database created before migrations were used
    command.upgrade(cfg, "head")


def _recover_interrupted_jobs() -> None:
    """Jobs left 'processing' by a crash or restart are marked failed so the user can retry them."""
    if get_settings().task_mode != "thread":
        return  # with Celery, the worker redelivers unfinished jobs itself
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Meeting

    with SessionLocal() as db:
        for meeting in db.scalars(select(Meeting).where(Meeting.status.in_(["queued", "processing"]))):
            meeting.status = "failed"
            if meeting.job:
                meeting.job.error = "Processing was interrupted because the server restarted. Press Retry."
        db.commit()


settings = get_settings()
app = FastAPI(
    title="MeetCite API",
    description="AI-powered meeting transcription and summarization.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Lets a separately hosted website read the export's file name.
    expose_headers=["Content-Disposition"],
)
app.include_router(auth.router)
app.include_router(meetings.router)
app.include_router(series.router)
app.include_router(live.router)
app.include_router(edits.router)
app.include_router(claims.router)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config", response_model=ConfigOut, tags=["system"])
def public_config() -> ConfigOut:
    s = get_settings()
    summarizers: list = ["llm", "baseline"]
    if not s.uses_cloud_ai:  # in cloud mode "llm" is already Claude, and BART needs a local GPU
        summarizers.append("bart")
        if s.cloud_llm_enabled and s.anthropic_api_key:
            summarizers.append("cloud")
    return ConfigOut(
        summarizers=summarizers,
        default_summarizer=s.default_summarizer,
        max_upload_mb=s.max_upload_mb,
        max_duration_s=s.max_duration_s,
        ai_mode=s.ai_mode,
        ai_provider="cloud" if s.uses_cloud_ai else "local",
        signup_code_required=bool(s.registration_code),
        live_available=bool(s.uses_cloud_ai and s.assemblyai_api_key),
    )
