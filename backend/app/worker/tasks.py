"""Celery tasks. They are thin wrappers so the same code also runs without Celery."""

from app.pipeline.runner import run_pipeline, run_regenerate
from app.worker.celery_app import celery_app


@celery_app.task(name="meetcite.process_meeting")
def process_meeting(meeting_id: int) -> None:
    run_pipeline(meeting_id)


@celery_app.task(name="meetcite.regenerate_summary")
def regenerate_summary(meeting_id: int, model: str) -> None:
    run_regenerate(meeting_id, model)
