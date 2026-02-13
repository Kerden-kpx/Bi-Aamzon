from __future__ import annotations

from ..core.celery_app import celery_app
from ..services import bsr_export_service


@celery_app.task(name="bi_amazon.export_daily.run")
def run_export_daily_job_task(job_id: str, site: str) -> None:
    bsr_export_service.run_export_daily_job(job_id, site)
