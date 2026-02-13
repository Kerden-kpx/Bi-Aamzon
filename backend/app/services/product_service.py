from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from ..core.config import DEFAULT_BSR_SITE, normalize_site
from ..repositories import bsr_repo, product_repo
from ..schemas.product import YidaProductPayload
from ..services import bsr_service


def split_tags(value: Any) -> List[str]:
    if not value:
        return []
    return [tag.strip() for tag in str(value).split(",") if tag.strip()]


def bsr_has_payload(payload) -> bool:
    if payload is None:
        return False
    for field_name in (
        "parent_asin",
        "title",
        "image_url",
        "product_url",
        "brand",
        "price",
        "list_price",
        "score",
        "comment_count",
        "bsr_rank",
        "category_rank",
        "variation_count",
        "launch_date",
        "conversion_rate",
        "organic_traffic_count",
        "ad_traffic_count",
        "organic_search_terms",
        "ad_search_terms",
        "search_recommend_terms",
        "sales_volume",
        "sales",
        "tags",
    ):
        value = getattr(payload, field_name)
        if value is None:
            continue
        if isinstance(value, str) and value.strip() == "":
            continue
        return True
    return False


def normalize_rate(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    try:
        val = float(value)
    except (TypeError, ValueError):
        return None
    if val > 1:
        val = val / 100
    if val < 0:
        val = 0.0
    if val > 1:
        val = 1.0
    return round(val, 4)


def build_bsr_payload(payload, fallback_brand: Optional[str], fallback_title: Optional[str]) -> Dict[str, Any]:
    tags_value = payload.tags.strip() if payload.tags else None
    bsr_brand = payload.brand or fallback_brand
    bsr_title = payload.title if payload.title not in (None, "") else None
    createtime = payload.createtime or date.today()
    conversion_rate = normalize_rate(payload.conversion_rate)
    organic_traffic_count = (
        bsr_service.to_int(payload.organic_traffic_count, default=0)
        if payload.organic_traffic_count is not None
        else None
    )
    ad_traffic_count = (
        bsr_service.to_int(payload.ad_traffic_count, default=0)
        if payload.ad_traffic_count is not None
        else None
    )
    organic_search_terms = (
        bsr_service.to_int(payload.organic_search_terms, default=0)
        if payload.organic_search_terms is not None
        else None
    )
    ad_search_terms = (
        bsr_service.to_int(payload.ad_search_terms, default=0)
        if payload.ad_search_terms is not None
        else None
    )
    search_recommend_terms = (
        bsr_service.to_int(payload.search_recommend_terms, default=0)
        if payload.search_recommend_terms is not None
        else None
    )
    return {
        "parent_asin": payload.parent_asin,
        "title": bsr_title,
        "image_url": payload.image_url,
        "product_url": payload.product_url,
        "brand": bsr_brand,
        "price": payload.price,
        "list_price": payload.list_price,
        "score": payload.score,
        "comment_count": payload.comment_count,
        "bsr_rank": payload.bsr_rank,
        "category_rank": payload.category_rank,
        "variation_count": payload.variation_count,
        "launch_date": payload.launch_date,
        "conversion_rate": conversion_rate,
        "organic_traffic_count": organic_traffic_count,
        "ad_traffic_count": ad_traffic_count,
        "organic_search_terms": organic_search_terms,
        "ad_search_terms": ad_search_terms,
        "search_recommend_terms": search_recommend_terms,
        "sales_volume": payload.sales_volume,
        "sales": payload.sales,
        "tags": tags_value,
        "type": "1",
        "createtime": createtime,
    }


def list_products(site: str, limit: int, offset: int, role: str, userid: str, product_scope: str) -> List[Dict[str, Any]]:
    site = normalize_site(site)
    rows = product_repo.fetch_products(site, limit, offset, role, userid, product_scope)
    items = []
    for row in rows:
        tags = []
        tags.extend(split_tags(row.get("position_tags")))
        tags.extend(split_tags(row.get("application_tags")))
        tags.extend(split_tags(row.get("tooth_pattern_tags")))
        tags.extend(split_tags(row.get("material_tags")))

        product_name = row.get("product") or ""
        bsr_createtime = row.get("bsr_createtime")
        bsr_data = None
        if bsr_createtime or row.get("bsr_title") or row.get("bsr_rank") is not None:
            bsr_data = {
                "parent_asin": row.get("bsr_parent_asin") or "",
                "site": row.get("bsr_site") or row.get("site") or DEFAULT_BSR_SITE,
                "brand": row.get("bsr_brand") or "",
                "title": row.get("bsr_title") or "",
                "image_url": row.get("bsr_image_url") or "",
                "product_url": row.get("bsr_product_url") or "",
                "price": bsr_service.price_to_string(row.get("bsr_price")),
                "list_price": bsr_service.price_to_string(row.get("bsr_list_price")),
                "score": bsr_service.to_float(row.get("bsr_score")),
                "comment_count": bsr_service.to_int(row.get("bsr_comment_count")),
                "bsr_rank": bsr_service.to_int(row.get("bsr_rank")),
                "category_rank": bsr_service.to_int(row.get("bsr_category_rank")),
                "variation_count": bsr_service.to_int(row.get("bsr_variation_count")),
                "launch_date": row.get("bsr_launch_date").isoformat()
                if isinstance(row.get("bsr_launch_date"), date)
                else None,
                "conversion_rate": bsr_service.to_float(row.get("bsr_conversion_rate")),
                "conversion_rate_period": row.get("bsr_conversion_rate_period"),
                "organic_traffic_count": bsr_service.to_int(row.get("bsr_organic_traffic_count")),
                "ad_traffic_count": bsr_service.to_int(row.get("bsr_ad_traffic_count")),
                "organic_search_terms": bsr_service.to_int(row.get("bsr_organic_search_terms")),
                "ad_search_terms": bsr_service.to_int(row.get("bsr_ad_search_terms")),
                "search_recommend_terms": bsr_service.to_int(row.get("bsr_search_recommend_terms")),
                "sales_volume": bsr_service.to_int(row.get("bsr_sales_volume")),
                "sales": bsr_service.to_float(row.get("bsr_sales")),
                "tags": bsr_service.parse_tags(row.get("bsr_tags")),
                "type": bsr_service.derive_bsr_type(row.get("bsr_type")),
                "createtime": bsr_createtime.isoformat()
                if isinstance(bsr_createtime, date)
                else None,
            }

        items.append(
            {
                "asin": row.get("asin") or "",
                "site": row.get("site") or site,
                "sku": row.get("sku") or "",
                "brand": row.get("brand") or "",
                "product": product_name,
                "name": product_name,
                "tags": tags,
                "spec_length": row.get("spec_length") or "",
                "spec_quantity": bsr_service.to_int(row.get("spec_quantity"), default=0),
                "spec_other": row.get("spec_other") or "",
                "application_tags": row.get("application_tags") or "",
                "tooth_pattern_tags": row.get("tooth_pattern_tags") or "",
                "material_tags": row.get("material_tags") or "",
                "position_tags": split_tags(row.get("position_tags")),
                "position_tags_raw": row.get("position_tags") or "",
                "status": row.get("status") or "",
                "creator_userid": row.get("creator_userid") or "",
                "created_at": row.get("created_at").isoformat()
                if isinstance(row.get("created_at"), date)
                else None,
                "updated_at": row.get("updated_at").isoformat()
                if isinstance(row.get("updated_at"), date)
                else None,
                "bsr": bsr_data,
            }
        )

    return items


def create_product(payload: YidaProductPayload, creator_userid: str) -> None:
    product_site = normalize_site(payload.site or (payload.bsr.site if payload.bsr else None))
    params = (
        payload.asin,
        product_site,
        payload.sku or "",
        payload.brand or "",
        payload.product or "",
        payload.application_tags,
        payload.tooth_pattern_tags,
        payload.material_tags,
        payload.spec_length,
        payload.spec_quantity,
        payload.spec_other,
        payload.position_tags,
        payload.status or "在售",
        payload.created_at,
        payload.updated_at,
        creator_userid or None,
    )
    if bsr_has_payload(payload.bsr):
        bsr_site = normalize_site(payload.bsr.site if payload.bsr and payload.bsr.site else product_site)
        bsr_data = build_bsr_payload(payload.bsr, payload.brand, payload.product)
        product_repo.insert_product_with_bsr(
            params,
            bsr_data,
            payload.asin,
            bsr_data.get("createtime") or date.today(),
            bsr_site,
        )
    else:
        product_repo.insert_product(params)


def update_product(asin: str, site: str, payload: YidaProductPayload) -> int:
    normalized_site = normalize_site(site)
    params = (
        payload.sku or "",
        payload.brand or "",
        payload.product or "",
        payload.application_tags,
        payload.tooth_pattern_tags,
        payload.material_tags,
        payload.spec_length,
        payload.spec_quantity,
        payload.spec_other,
        payload.position_tags,
        payload.status or "在售",
        payload.updated_at,
        asin,
        normalized_site,
    )
    if bsr_has_payload(payload.bsr):
        bsr_site = normalize_site(payload.bsr.site if payload.bsr and payload.bsr.site else normalized_site)
        bsr_data = build_bsr_payload(payload.bsr, payload.brand, payload.product)
        return product_repo.update_product_with_bsr(
            params,
            bsr_data,
            asin,
            normalized_site,
            bsr_data.get("createtime") or date.today(),
            bsr_site,
        )
    return product_repo.update_product(params)


def delete_product(asin: str, site: str) -> int:
    normalized_site = normalize_site(site)
    return product_repo.delete_product(asin, normalized_site)


def ensure_product_exists(asin: str, site: str) -> None:
    normalized_site = normalize_site(site)
    if not product_repo.product_exists(asin, normalized_site):
        raise HTTPException(status_code=404, detail="Product not found")


def ensure_product_accessible(asin: str, site: str, role: str, userid: str, product_scope: str) -> None:
    normalized_site = normalize_site(site)
    ensure_product_exists(asin, normalized_site)
    if role == "admin" or product_scope != "restricted":
        return
    if not product_repo.restricted_user_can_access_product(asin, normalized_site, userid):
        raise HTTPException(status_code=403, detail="Forbidden")
