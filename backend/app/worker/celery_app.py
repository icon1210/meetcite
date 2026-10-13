"""Celery application for the GPU worker (Docker setup).

Start it with:  celery -A app.worker.celery_app worker --concurrency=1 --loglevel=info
Concurrency is 1 because the GPU can only hold one set of models at a time.
"""

from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery("meetmind", broker=settings.redis_url, backend=settings.redis_url, include=["app.worker.tasks"])
celery_app.conf.update(
    task_acks_late=True,  # if the worker crashes mid-job, the job is not lost
    worker_prefetch_multiplier=1,  # take one long job at a time
    task_track_started=True,
    broker_connection_retry_on_startup=True,
)
