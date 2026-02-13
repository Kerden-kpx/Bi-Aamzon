from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from ..core.celery_app import celery_app
from ..core.config import normalize_site
from ..repositories import ai_insight_repo, bsr_repo
from . import bsr_ai_service

_AI_INSIGHT_TASK_NAME = "bi_amazon.ai_insight.run"


def _normalize_range_days(value: int) -> int:
    return value if value in {7, 30, 90, 180} else 90


def _to_job_item(row: Dict[str, Any]) -> Dict[str, Any]:
    report_text = str(row.get("report_text") or "")
    return {
        "job_id": row.get("job_id"),
        "asin": row.get("asin"),
        "site": row.get("site"),
        "status": row.get("status"),
        "operator_userid": row.get("operator_userid"),
        "created_at": ai_insight_repo.serialize_datetime(row.get("created_at")),
        "report_text": report_text,
        "report_preview": report_text[:280] if report_text else "",
    }


def run_ai_insight_job(
    job_id: str,
    asin: str,
    site: str,
    range_days: int,
    operator_userid: str,
) -> None:
    ai_insight_repo.mark_job_running(job_id)
    try:
        rows = bsr_repo.fetch_bsr_daily_window(asin, site, range_days)
        if not rows:
            raise HTTPException(status_code=404, detail="该 ASIN 在 fact_bsr_daily 暂无可分析数据")
        summary = bsr_ai_service._build_bsr_ai_summary(rows)
        report_text = bsr_ai_service._call_openrouter_bsr_ai_insight(asin, site, range_days, rows, summary)
        ai_insight_repo.mark_job_success(job_id, report_text)
    except HTTPException:
        ai_insight_repo.mark_job_failed(job_id)
    except Exception:
        ai_insight_repo.mark_job_failed(job_id)


def submit_job(
    asin: str,
    site: Optional[str],
    range_days: int,
    operator_userid: str,
) -> Dict[str, Any]:
    target_asin = str(asin or "").strip().upper()
    if not target_asin:
        raise HTTPException(status_code=400, detail="asin 不能为空")
    target_site = normalize_site(site)
    target_range_days = _normalize_range_days(range_days)

    job_id = uuid.uuid4().hex
    ai_insight_repo.insert_job(
        job_id=job_id,
        asin=target_asin,
        site=target_site,
        operator_userid=operator_userid,
    )
    try:
        celery_app.send_task(
            _AI_INSIGHT_TASK_NAME,
            args=[job_id, target_asin, target_site, target_range_days, operator_userid],
        )
    except Exception as exc:
        ai_insight_repo.mark_job_failed(job_id)
        raise HTTPException(status_code=502, detail=f"任务入队失败: {exc}") from exc

    row = ai_insight_repo.fetch_job(job_id)
    if not row:
        raise HTTPException(status_code=500, detail="任务创建失败")
    return _to_job_item(row)


def get_job(job_id: str, role: str, userid: str) -> Dict[str, Any]:
    row = ai_insight_repo.fetch_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="任务不存在")
    if role != "admin" and str(row.get("operator_userid") or "") != str(userid or ""):
        raise HTTPException(status_code=403, detail="无权访问该任务")
    return _to_job_item(row)


def list_jobs(
    limit: int,
    offset: int,
    asin: Optional[str],
    site: Optional[str],
    status: Optional[str],
    role: str,
    userid: str,
) -> List[Dict[str, Any]]:
    target_asin = str(asin or "").strip().upper() or None
    target_site = normalize_site(site) if site else None
    target_status = str(status or "").strip().lower() or None
    rows = ai_insight_repo.fetch_jobs(limit, offset, target_asin, target_site, target_status, role, userid)
    return [_to_job_item(row) for row in rows]
