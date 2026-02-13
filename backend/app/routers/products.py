from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, get_current_user
from ..core.responses import list_response, ok_response
from ..schemas.product import YidaProductPayload, YidaProductsQueryPayload
from ..services import product_service, user_service

router = APIRouter()


@router.get("/api/yida-products")
def get_yida_products(
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    site: str = Query("US"),
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    items = product_service.list_products(site, limit, offset, current_user.role, current_user.userid, current_user.product_scope)
    user_service.log_audit(
        module="product",
        action="visit",
        target_id=None,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"api=/api/yida-products, site={site}",
    )
    return ok_response(list_response(items, limit, offset))


@router.post("/api/yida-products/query")
def query_yida_products(
    payload: YidaProductsQueryPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    limit = max(1, min(payload.limit, 2000))
    offset = max(0, payload.offset)
    site = payload.site or "US"
    items = product_service.list_products(
        site,
        limit,
        offset,
        current_user.role,
        current_user.userid,
        current_user.product_scope,
    )
    user_service.log_audit(
        module="product",
        action="visit",
        target_id=None,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"api=/api/yida-products/query, site={site}",
    )
    return ok_response(list_response(items, limit, offset))


@router.post("/api/yida-products")
def create_yida_product(
    payload: YidaProductPayload,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    target_site = payload.site or (payload.bsr.site if payload.bsr else None) or "US"
    product_service.create_product(payload, current_user.userid)
    user_service.log_audit(
        module="product",
        action="create",
        target_id=payload.asin,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"site={target_site}, brand={payload.brand or ''}, product={payload.product or ''}",
    )
    return ok_response({"asin": payload.asin})


@router.put("/api/yida-products/{asin}")
def update_yida_product(
    asin: str,
    payload: YidaProductPayload,
    site: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    target_site = site or payload.site or (payload.bsr.site if payload.bsr else None) or "US"
    product_service.ensure_product_accessible(asin, target_site, current_user.role, current_user.userid, current_user.product_scope)
    product_service.update_product(asin, target_site, payload)
    user_service.log_audit(
        module="product",
        action="update",
        target_id=asin,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"site={target_site}, brand={payload.brand or ''}, product={payload.product or ''}",
    )
    return ok_response({"asin": asin})


@router.delete("/api/yida-products/{asin}")
def delete_yida_product(
    asin: str,
    site: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    target_site = site or "US"
    product_service.ensure_product_accessible(asin, target_site, current_user.role, current_user.userid, current_user.product_scope)
    affected = product_service.delete_product(asin, target_site)
    if affected == 0:
        return ok_response({"asin": asin, "deleted": 0})
    user_service.log_audit(
        module="product",
        action="delete",
        target_id=asin,
        operator_userid=current_user.userid,
        operator_name=current_user.username,
        detail=f"site={target_site}",
    )
    return ok_response({"asin": asin})
