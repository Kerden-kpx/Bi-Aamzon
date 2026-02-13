from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from ..core.config import normalize_site
from ..repositories import bsr_repo
from . import user_service
from .bsr_common_service import bsr_row_to_item, split_asins, to_float, to_int, unique_asins


def list_bsr_items(limit: int, offset: int, createtime: Optional[date], site: str, role: str, userid: str) -> Dict[str, Any]:
    target_site = normalize_site(site)
    rows = bsr_repo.fetch_bsr_items(target_site, createtime, limit, offset, role, userid)
    items = []
    batch_date = None
    for row in rows:
        if batch_date is None and isinstance(row.get("createtime"), date):
            batch_date = row["createtime"].isoformat()
        items.append(bsr_row_to_item(row))
    return {"items": items, "batch_date": batch_date}


def lookup_bsr_item(
    asin: str,
    createtime: Optional[date],
    site: str,
    role: str,
    userid: str,
    brand: Optional[str] = None,
) -> Dict[str, Any]:
    target_site = normalize_site(site)
    normalized_brand = str(brand or "").strip() or None
    row = bsr_repo.fetch_bsr_lookup_row(asin, target_site, createtime, role, userid, normalized_brand)
    if not row:
        return {"item": None, "found": False}
    return {"item": bsr_row_to_item(row), "found": True}


def list_bsr_dates(site: str, limit: int, offset: int) -> List[str]:
    target_site = normalize_site(site)
    rows = bsr_repo.fetch_bsr_dates(target_site, limit, offset)
    items: List[str] = []
    for row in rows:
        value = row.get("createtime")
        items.append(value.isoformat() if isinstance(value, date) else str(value))
    return items


def list_bsr_monthly(asin: str, site: str, is_child: Optional[int] = None) -> List[Dict[str, Any]]:
    if not asin:
        raise HTTPException(status_code=400, detail="asin 不能为空")
    normalized_site = normalize_site(site)
    return bsr_repo.fetch_bsr_monthly(asin, normalized_site, is_child)


def list_bsr_daily(asin: str, site: str) -> List[Dict[str, Any]]:
    if not asin:
        raise HTTPException(status_code=400, detail="asin 不能为空")
    normalized_site = normalize_site(site)
    rows = bsr_repo.fetch_bsr_daily(asin, normalized_site)
    items: List[Dict[str, Any]] = []
    for row in rows:
        row_date = row.get("date")
        items.append(
            {
                "date": row_date.isoformat() if isinstance(row_date, date) else str(row_date or ""),
                "buybox_price": to_float(row.get("buybox_price"), 0.0),
                "price": to_float(row.get("price"), 0.0),
                "prime_price": to_float(row.get("prime_price"), 0.0),
                "coupon_price": to_float(row.get("coupon_price"), 0.0),
                "coupon_discount": to_float(row.get("coupon_discount"), 0.0),
                "child_sales": to_int(row.get("child_sales"), 0),
                "fba_price": to_float(row.get("fba_price"), 0.0),
                "fbm_price": to_float(row.get("fbm_price"), 0.0),
                "strikethrough_price": to_float(row.get("strikethrough_price"), 0.0),
                "bsr_rank": to_int(row.get("bsr_rank"), 0),
                "bsr_reciprocating_saw_blades": to_int(row.get("bsr_reciprocating_saw_blades"), 0),
                "rating": to_float(row.get("rating"), 0.0),
                "rating_count": to_int(row.get("rating_count"), 0),
                "seller_count": to_int(row.get("seller_count"), 0),
            }
        )
    return items


def update_bsr_tags(asin: str, tag_list: List[str], createtime: Optional[date], site: str, role: str, userid: str, username: str) -> Dict[str, Any]:
    tag_string = ",".join([tag.strip() for tag in tag_list if tag and tag.strip()])
    target_site = normalize_site(site)
    target_date = createtime or bsr_repo.resolve_bsr_createtime(asin, target_site, None)
    if not target_date:
        raise HTTPException(status_code=404, detail="ASIN not found for update")

    affected, exists = bsr_repo.update_bsr_tags(asin, tag_string, target_site, target_date, role, userid)
    if role != "admin" and affected == 0 and not exists:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not exists:
        raise HTTPException(status_code=404, detail="ASIN not found for update")

    detail = f"tags={tag_string}"
    if target_date:
        detail += f", createtime={target_date.isoformat()}"
    detail += f", site={target_site}"
    user_service.log_audit(
        module="bsr",
        action="update_tags",
        target_id=asin,
        operator_userid=userid,
        operator_name=username,
        detail=detail,
    )

    return {
        "asin": asin,
        "tags": [t for t in tag_string.split(",") if t],
        "updated": affected,
    }


def update_bsr_mapping(asin: str, yida_asin: Optional[str], createtime: Optional[date], site: str, userid: str, username: str) -> Dict[str, Any]:
    target_site = normalize_site(site)
    resolved_date = bsr_repo.resolve_bsr_createtime(asin, target_site, createtime)
    if not resolved_date:
        raise HTTPException(status_code=404, detail="BSR date not found for ASIN")

    requested_asins = unique_asins(split_asins(yida_asin)) if yida_asin else []
    if any(val.lower() == asin.lower() for val in requested_asins):
        raise HTTPException(status_code=400, detail="Cannot map to the same ASIN")

    bsr_repo.update_bsr_mapping(asin, requested_asins, target_site, resolved_date, userid)

    detail = f"yida_asin={','.join(requested_asins)}"
    detail += f", createtime={resolved_date.isoformat()}"
    detail += f", site={target_site}"
    user_service.log_audit(
        module="bsr",
        action="update_mapping",
        target_id=asin,
        operator_userid=userid,
        operator_name=username,
        detail=detail,
    )

    return {"asin": asin, "yida_asin": ",".join(requested_asins)}
