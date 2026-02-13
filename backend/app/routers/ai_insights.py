from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, get_current_user
from ..core.responses import list_response, ok_response
from ..schemas.ai_insight import AiInsightCreatePayload, AiInsightQueryPayload
from ..services import ai_insight_service, user_service

router = APIRouter()


@router.post("/api/ai-insights/jobs")
def submit_ai_insight_job(
    payload: AiInsightCreatePayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    item = ai_insight_service.submit_job(
        payload.asin,
        payload.site or "US",
        payload.range_days,
        current_user.userid,
    )
    user_service.log_audit(
        module="ai_insight",
        action="submit",
        target_id=item.get("job_id"),
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"asin={item.get('asin')}, site={item.get('site')}, range_days={payload.range_days}",
    )
    return ok_response({"item": item})


@router.get("/api/ai-insights/jobs/{job_id}")
def get_ai_insight_job(
    job_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    item = ai_insight_service.get_job(job_id, current_user.role, current_user.userid)
    return ok_response({"item": item})


@router.post("/api/ai-insights/jobs/query")
def query_ai_insight_jobs(
    payload: AiInsightQueryPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    limit = max(1, min(payload.limit, 500))
    offset = max(0, payload.offset)
    items = ai_insight_service.list_jobs(
        limit,
        offset,
        payload.asin,
        payload.site,
        payload.status,
        current_user.role,
        current_user.userid,
    )
    return ok_response(list_response(items, limit, offset))
