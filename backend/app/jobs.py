"""Puts processing jobs on the queue.

With TASK_MODE=celery (Docker), jobs go to Redis for the separate GPU worker.
With TASK_MODE=thread (simple local run), they run in a single background
thread inside the API process - one at a time, because the GPU is shared.
Either way the web request returns immediately.
"""

from concurrent.futures import ThreadPoolExecutor

from app.config import get_settings

_executor: ThreadPoolExecutor | None = None


def _thread_pool() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="meetmind-job")
    return _executor


def enqueue_processing(meeting_id: int) -> None:
    if get_settings().task_mode == "celery":
        from app.worker.tasks import process_meeting

        process_meeting.delay(meeting_id)
    else:
        from app.pipeline.runner import run_pipeline

        _thread_pool().submit(run_pipeline, meeting_id)


def enqueue_regenerate(meeting_id: int, model: str) -> None:
    if get_settings().task_mode == "celery":
        from app.worker.tasks import regenerate_summary

        regenerate_summary.delay(meeting_id, model)
    else:
        from app.pipeline.runner import run_regenerate

        _thread_pool().submit(run_regenerate, meeting_id, model)
