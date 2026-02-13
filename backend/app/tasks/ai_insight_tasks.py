from __future__ import annotations

from ..core.celery_app import celery_app
from ..services import ai_insight_service


@celery_app.task(name="bi_amazon.ai_insight.run")
def run_ai_insight_job_task(
    job_id: str,
    asin: str,
    site: str,
    range_days: int,
    operator_userid: str,
) -> None:
    ai_insight_service.run_ai_insight_job(job_id, asin, site, range_days, operator_userid)
