from __future__ import annotations

import threading
import time
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from ..core.config import normalize_site
from ..repositories import bsr_repo
from . import user_service
from .bsr_common_service import bsr_row_to_item, split_asins, to_float, to_int, unique_asins

_BSR_LIST_CACHE_TTL_SECONDS = 30
_BSR_LIST_CACHE: Dict[tuple[Any, ...], tuple[float, Dict[str, Any]]] = {}
_BSR_LIST_CACHE_LOCK = threading.Lock()
_BSR_OVERVIEW_CACHE_TTL_SECONDS = 30
_BSR_OVERVIEW_CACHE: Dict[tuple[Any, ...], tuple[float, Dict[str, Any]]] = {}
_BSR_OVERVIEW_CACHE_LOCK = threading.Lock()
_BSR_MONTHLY_BATCH_CACHE_TTL_SECONDS = 30
_BSR_MONTHLY_BATCH_CACHE: Dict[tuple[Any, ...], tuple[float, Dict[str, List[Dict[str, Any]]]]] = {}
_BSR_MONTHLY_BATCH_CACHE_LOCK = threading.Lock()
_OVERVIEW_OWN_BRANDS = ("EZARC", "TOLESA")


def _to_optional_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _build_bsr_list_cache_key(
    limit: int,
    offset: int,
    createtime: Optional[date],
    compare_date: Optional[date],
    site: str,
    role: str,
    userid: str,
    brand_filters: List[str],
    rating_filters: List[str],
    tag_filters: List[str],
    category: Optional[str],
    price_min: Optional[float],
    price_max: Optional[float],
    compact: bool,
) -> tuple[Any, ...]:
    return (
        site,
        createtime.isoformat() if isinstance(createtime, date) else "",
        compare_date.isoformat() if isinstance(compare_date, date) else "",
        limit,
        offset,
        role,
        userid,
        tuple(sorted(str(value).strip() for value in brand_filters if str(value).strip())),
        tuple(sorted(str(value).strip() for value in rating_filters if str(value).strip())),
        tuple(sorted(str(value).strip() for value in tag_filters if str(value).strip())),
        str(category or "").strip(),
        float(price_min) if price_min is not None else None,
        float(price_max) if price_max is not None else None,
        bool(compact),
    )


def invalidate_bsr_list_cache() -> None:
    with _BSR_LIST_CACHE_LOCK:
        _BSR_LIST_CACHE.clear()
    with _BSR_OVERVIEW_CACHE_LOCK:
        _BSR_OVERVIEW_CACHE.clear()
    with _BSR_MONTHLY_BATCH_CACHE_LOCK:
        _BSR_MONTHLY_BATCH_CACHE.clear()


def _build_bsr_overview_cache_key(
    createtime: Optional[date],
    compare_date: Optional[date],
    site: str,
    role: str,
    userid: str,
    category: Optional[str],
) -> tuple[Any, ...]:
    return (
        site,
        createtime.isoformat() if isinstance(createtime, date) else "",
        compare_date.isoformat() if isinstance(compare_date, date) else "",
        role,
        userid,
        str(category or "").strip(),
    )


def _build_bsr_monthly_batch_cache_key(
    asins: List[str],
    site: str,
    is_child: Optional[int],
) -> tuple[Any, ...]:
    return (
        site,
        tuple(sorted(str(value).strip().upper() for value in asins if str(value).strip())),
        is_child if is_child is not None else -1,
    )


def list_bsr_items(
    limit: int,
    offset: int,
    createtime: Optional[date],
    compare_date: Optional[date],
    site: str,
    role: str,
    userid: str,
    brand_filters: Optional[List[str]] = None,
    rating_filters: Optional[List[str]] = None,
    tag_filters: Optional[List[str]] = None,
    category: Optional[str] = None,
    price_min: Optional[float] = None,
    price_max: Optional[float] = None,
    compact: bool = False,
) -> Dict[str, Any]:
    target_site = normalize_site(site)
    normalized_brand_filters = [str(value).strip() for value in (brand_filters or []) if str(value).strip()]
    normalized_rating_filters = [str(value).strip() for value in (rating_filters or []) if str(value).strip()]
    normalized_tag_filters = [str(value).strip() for value in (tag_filters or []) if str(value).strip()]
    normalized_category = str(category or "").strip() or None
    normalized_price_min = float(price_min) if price_min is not None else None
    normalized_price_max = float(price_max) if price_max is not None else None
    cache_key = _build_bsr_list_cache_key(
        limit,
        offset,
        createtime,
        compare_date,
        target_site,
        role,
        userid,
        normalized_brand_filters,
        normalized_rating_filters,
        normalized_tag_filters,
        normalized_category,
        normalized_price_min,
        normalized_price_max,
        compact,
    )
    now = time.time()
    with _BSR_LIST_CACHE_LOCK:
        cached = _BSR_LIST_CACHE.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]

    rows = bsr_repo.fetch_bsr_items(
        target_site,
        createtime,
        compare_date,
        limit,
        offset,
        role,
        userid,
        normalized_brand_filters,
        normalized_rating_filters,
        normalized_tag_filters,
        normalized_category,
        normalized_price_min,
        normalized_price_max,
        compact,
    )
    items = []
    batch_date = None
    for row in rows:
        if batch_date is None and isinstance(row.get("createtime"), date):
            batch_date = row["createtime"].isoformat()
        item = bsr_row_to_item(row)
        item["prev_bsr_rank"] = _to_optional_int(row.get("prev_bsr_rank"))
        item["rank_change"] = _to_optional_int(row.get("rank_change"))
        item["is_mapped"] = int(row.get("is_mapped") or 0)
        items.append(item)
    result = {"items": items, "batch_date": batch_date}
    with _BSR_LIST_CACHE_LOCK:
        _BSR_LIST_CACHE[cache_key] = (now + _BSR_LIST_CACHE_TTL_SECONDS, result)
    return result


def list_bsr_overview(
    createtime: Optional[date],
    compare_date: Optional[date],
    site: str,
    role: str,
    userid: str,
    category: Optional[str] = None,
) -> Dict[str, Any]:
    target_site = normalize_site(site)
    normalized_category = str(category or "").strip() or None
    cache_key = _build_bsr_overview_cache_key(createtime, compare_date, target_site, role, userid, normalized_category)
    now = time.time()
    with _BSR_OVERVIEW_CACHE_LOCK:
        cached = _BSR_OVERVIEW_CACHE.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]

    current_rows = bsr_repo.fetch_bsr_overview_brand_stats(target_site, createtime, normalized_category)
    prev_rows = bsr_repo.fetch_bsr_overview_brand_stats(target_site, compare_date, normalized_category) if compare_date else []
    category_rows = bsr_repo.fetch_bsr_overview_category_options(target_site, createtime)

    prev_count_map = {
        str(row.get("brand") or "").strip() or "Unknown": to_int(row.get("count"))
        for row in prev_rows
    }
    total_count = sum(to_int(row.get("count")) for row in current_rows)
    total_sales = sum(to_float(row.get("sales")) for row in current_rows)
    total_volume = sum(to_int(row.get("sales_volume")) for row in current_rows)

    brand_stats: List[Dict[str, Any]] = []
    own_count = 0
    own_sales = 0.0
    own_sales_volume = 0
    own_brand_stats: List[Dict[str, Any]] = []
    own_brand_set = {brand.upper() for brand in _OVERVIEW_OWN_BRANDS}

    for row in current_rows:
        brand = str(row.get("brand") or "").strip() or "Unknown"
        count = to_int(row.get("count"))
        sales = to_float(row.get("sales"))
        sales_volume = to_int(row.get("sales_volume"))
        prev_count = prev_count_map.get(brand, 0)
        delta_count = count - prev_count if compare_date else None
        stat = {
            "brand": brand,
            "count": count,
            "count_share": (count / total_count * 100) if total_count > 0 else 0.0,
            "sales": sales,
            "sales_share": (sales / total_sales * 100) if total_sales > 0 else 0.0,
            "sales_volume": sales_volume,
            "sales_volume_share": (sales_volume / total_volume * 100) if total_volume > 0 else 0.0,
            "delta_count": delta_count,
        }
        brand_stats.append(stat)
        if brand.upper() in own_brand_set:
            own_count += count
            own_sales += sales
            own_sales_volume += sales_volume
            own_brand_stats.append(
                {
                    "brand": brand,
                    "count": count,
                    "sales": sales,
                    "sales_volume": sales_volume,
                    "delta_count": delta_count,
                }
            )

    result = {
        "brand_stats": brand_stats,
        "summary": {
            "total_count": total_count,
            "own_count": own_count,
            "own_share": (own_count / total_count * 100) if total_count > 0 else 0.0,
            "own_sales": own_sales,
            "own_sales_volume": own_sales_volume,
            "own_brands": own_brand_stats,
        },
        "category_options": [
            str(row.get("category") or "").strip()
            for row in category_rows
            if str(row.get("category") or "").strip()
        ],
        "batch_date": createtime.isoformat() if isinstance(createtime, date) else None,
        "compare_date": compare_date.isoformat() if isinstance(compare_date, date) else None,
    }
    with _BSR_OVERVIEW_CACHE_LOCK:
        _BSR_OVERVIEW_CACHE[cache_key] = (now + _BSR_OVERVIEW_CACHE_TTL_SECONDS, result)
    return result


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


def list_bsr_monthly_batch(asins: List[str], site: str, is_child: Optional[int] = None) -> Dict[str, List[Dict[str, Any]]]:
    normalized_asins = unique_asins([str(value or "").strip().upper() for value in asins if str(value or "").strip()])
    if not normalized_asins:
        raise HTTPException(status_code=400, detail="asins 不能为空")
    normalized_site = normalize_site(site)
    cache_key = _build_bsr_monthly_batch_cache_key(normalized_asins, normalized_site, is_child)
    now = time.time()
    with _BSR_MONTHLY_BATCH_CACHE_LOCK:
        cached = _BSR_MONTHLY_BATCH_CACHE.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]
    rows = bsr_repo.fetch_bsr_monthly_batch(normalized_asins, normalized_site, is_child)
    result: Dict[str, List[Dict[str, Any]]] = {asin: [] for asin in normalized_asins}
    for row in rows:
        asin = str(row.get("asin") or "").strip().upper()
        if not asin:
            continue
        month_value = row.get("month")
        result.setdefault(asin, []).append(
            {
                "month": month_value.isoformat() if isinstance(month_value, date) else str(month_value or ""),
                "sales_volume": to_int(row.get("sales_volume"), 0),
                "sales": to_float(row.get("sales"), 0.0),
                "is_child": to_int(row.get("is_child"), 0),
                "price": to_float(row.get("price"), 0.0),
            }
        )
    with _BSR_MONTHLY_BATCH_CACHE_LOCK:
        _BSR_MONTHLY_BATCH_CACHE[cache_key] = (now + _BSR_MONTHLY_BATCH_CACHE_TTL_SECONDS, result)
    return result


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
                "sales_volume": to_int(row.get("sales_volume"), 0),
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
    invalidate_bsr_list_cache()

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
    requested_asins = unique_asins(split_asins(yida_asin)) if yida_asin else []
    if any(val.lower() == asin.lower() for val in requested_asins):
        raise HTTPException(status_code=400, detail="Cannot map to the same ASIN")

    bsr_repo.update_bsr_mapping(asin, requested_asins, target_site, userid)
    invalidate_bsr_list_cache()

    detail = f"yida_asin={','.join(requested_asins)}"
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
