from __future__ import annotations

from datetime import date
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile

from ..auth import CurrentUser, get_current_user
from ..core.responses import list_response, ok_response
from ..schemas.bsr import (
    BsrAiInsightPayload,
    BsrDailyPayload,
    BsrDatesPayload,
    BsrLookupPayload,
    BsrMonthlyBatchPayload,
    BsrMonthlyPayload,
    BsrOverviewQueryPayload,
    BsrQueryPayload,
    MappingUpdatePayload,
    TagUpdatePayload,
)
from ..services import bsr_service, user_service

router = APIRouter()


@router.get("/api/bsr")
def get_bsr_items(
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    createtime: Optional[date] = Query(None),
    compare_date: Optional[date] = Query(None),
    site: str = Query("US"),
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    result = bsr_service.list_bsr_items(
        limit,
        offset,
        createtime,
        compare_date,
        site,
        current_user.role,
        current_user.userid,
    )
    user_service.log_audit(
        module="bsr",
        action="visit",
        target_id=None,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"api=/api/bsr, site={site}",
    )
    return ok_response(list_response(result["items"], limit, offset, batch_date=result.get("batch_date")))


@router.post("/api/bsr/query")
def query_bsr_items(
    payload: BsrQueryPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    limit = max(1, min(payload.limit, 2000))
    offset = max(0, payload.offset)
    site = payload.site or "US"
    result = bsr_service.list_bsr_items(
        limit,
        offset,
        payload.createtime,
        payload.compare_date,
        site,
        current_user.role,
        current_user.userid,
        payload.brand_filters,
        payload.rating_filters,
        payload.tag_filters,
        payload.category,
        payload.price_min,
        payload.price_max,
        payload.compact,
    )
    user_service.log_audit(
        module="bsr",
        action="visit",
        target_id=None,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"api=/api/bsr/query, site={site}",
    )
    return ok_response(list_response(result["items"], limit, offset, batch_date=result.get("batch_date")))


@router.post("/api/bsr/overview")
def query_bsr_overview(
    payload: BsrOverviewQueryPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    site = payload.site or "US"
    result = bsr_service.list_bsr_overview(
        payload.createtime,
        payload.compare_date,
        site,
        current_user.role,
        current_user.userid,
        payload.category,
    )
    user_service.log_audit(
        module="overview",
        action="visit",
        target_id=None,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"api=/api/bsr/overview, site={site}",
    )
    return ok_response(result)


@router.get("/api/bsr/lookup")
def lookup_bsr_item(
    asin: str,
    createtime: Optional[date] = Query(None),
    site: str = Query("US"),
    brand: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    return ok_response(bsr_service.lookup_bsr_item(asin, createtime, site, current_user.role, current_user.userid, brand))


@router.post("/api/bsr/lookup")
def lookup_bsr_item_post(
    payload: BsrLookupPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    return ok_response(
        bsr_service.lookup_bsr_item(
            payload.asin,
            payload.createtime,
            payload.site or "US",
            current_user.role,
            current_user.userid,
            payload.brand,
        )
    )


@router.post("/api/bsr/dates")
def get_bsr_dates(
    payload: BsrDatesPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    limit = max(1, min(payload.limit, 2000))
    offset = max(0, payload.offset)
    items = bsr_service.list_bsr_dates(payload.site or "US", limit, offset, payload.category)
    return ok_response(list_response(items, limit, offset))


@router.post("/api/bsr/import")
def import_bsr_files(
    seller_file: Optional[UploadFile] = File(None),
    seller_file_detail: Optional[UploadFile] = File(None),
    jimu_file: Optional[UploadFile] = File(None),
    jimu_file_51_100: Optional[UploadFile] = File(None),
    site: str = Form("US"),
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    result = bsr_service.import_bsr_files(
        seller_file,
        seller_file_detail,
        jimu_file,
        jimu_file_51_100,
        site,
    )
    return ok_response(result)


@router.post("/api/bsr/monthly")
def get_bsr_monthly(
    payload: BsrMonthlyPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    rows = bsr_service.list_bsr_monthly(payload.asin, payload.site or "US", payload.is_child)
    return ok_response(list_response(rows))


@router.post("/api/bsr/monthly/batch")
def get_bsr_monthly_batch(
    payload: BsrMonthlyBatchPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    items = bsr_service.list_bsr_monthly_batch(payload.asins, payload.site or "US", payload.is_child)
    return ok_response({"items": items})


@router.post("/api/bsr/daily")
def get_bsr_daily(
    payload: BsrDailyPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    rows = bsr_service.list_bsr_daily(payload.asin, payload.site or "US")
    return ok_response(list_response(rows))


@router.post("/api/bsr/ai-insight")
def get_bsr_ai_insight(
    payload: BsrAiInsightPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    result = bsr_service.get_bsr_ai_insight(payload.asin, payload.site or "US", payload.range_days)
    return ok_response(result)


@router.put("/api/bsr/{asin}/tags")
def update_bsr_tags(
    asin: str,
    payload: TagUpdatePayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    result = bsr_service.update_bsr_tags(
        asin,
        payload.tags,
        payload.createtime,
        payload.site or "US",
        current_user.role,
        current_user.userid,
        current_user.username,
    )
    return ok_response(result)


@router.put("/api/bsr/{asin}/mapping")
def update_bsr_mapping(
    asin: str,
    payload: MappingUpdatePayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    result = bsr_service.update_bsr_mapping(
        asin,
        payload.yida_asin,
        payload.createtime,
        payload.site or "US",
        current_user.userid,
        current_user.username,
    )
    return ok_response(result)
