from __future__ import annotations

import os

from celery import Celery


def _env(name: str, default: str) -> str:
    value = str(os.getenv(name, "")).strip()
    return value or default


broker_url = _env("CELERY_BROKER_URL", _env("REDIS_URL", "redis://127.0.0.1:6379/0"))
result_backend = _env("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/1")

celery_app = Celery(
    "bi_amazon",
    broker=broker_url,
    backend=result_backend,
    include=[
        "app.tasks.ai_insight_tasks",
        "app.tasks.export_daily_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
)
