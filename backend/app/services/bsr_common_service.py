from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional
import re

from ..core.config import DEFAULT_BSR_SITE


def _tail_text(value: str, max_chars: int = 3000) -> str:
    text = (value or "").strip()
    if len(text) <= max_chars:
        return text
    return text[-max_chars:]


def to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def to_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, Decimal):
        value = int(value)
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def price_to_string(value: Any) -> str:
    if value is None:
        return "$0.00"
    if isinstance(value, Decimal):
        value = float(value)
    try:
        return f"${float(value):.2f}"
    except (TypeError, ValueError):
        return "$0.00"


def parse_tags(value: Any) -> List[str]:
    if not value:
        return []
    return [tag.strip() for tag in str(value).split(",") if tag.strip()]


def split_asins(value: Optional[str]) -> List[str]:
    if not value:
        return []
    parts = re.split(r"[,，;|]", str(value))
    return [part.strip() for part in parts if part and part.strip()]


def unique_asins(values: List[str]) -> List[str]:
    seen: set[str] = set()
    result: List[str] = []
    for val in values:
        if val in seen:
            continue
        seen.add(val)
        result.append(val)
    return result


def derive_bsr_type(type_value: Any) -> str:
    if type_value is None:
        return "0"
    raw = str(type_value).strip()
    if raw == "1":
        return "1"
    if raw == "0":
        return "0"
    return "0"


def bsr_row_to_item(row: Dict[str, Any]) -> Dict[str, Any]:
    item_type = derive_bsr_type(row.get("type"))
    return {
        "rank": to_int(row.get("bsr_rank")),
        "bsr_rank": to_int(row.get("bsr_rank")),
        "site": row.get("site") or DEFAULT_BSR_SITE,
        "asin": row.get("asin") or "",
        "yida_asin": row.get("yida_asin") or "",
        "parent_asin": row.get("parent_asin") or "",
        "title": row.get("title") or "",
        "brand": row.get("brand") or "",
        "price": price_to_string(row.get("price")),
        "list_price": price_to_string(row.get("list_price")),
        "rating": to_float(row.get("score")),
        "score": to_float(row.get("score")),
        "reviews": to_int(row.get("comment_count")),
        "comment_count": to_int(row.get("comment_count")),
        "tags": parse_tags(row.get("tags")),
        "status": item_type,
        "type": item_type,
        "image_url": row.get("image_url") or "",
        "product_url": row.get("product_url") or "",
        "category_rank": to_int(row.get("category_rank")),
        "variation_count": to_int(row.get("variation_count")),
        "conversion_rate": to_float(row.get("conversion_rate")),
        "conversion_rate_period": row.get("conversion_rate_period"),
        "organic_traffic_count": to_int(row.get("organic_traffic_count")),
        "ad_traffic_count": to_int(row.get("ad_traffic_count")),
        "organic_search_terms": to_int(row.get("organic_search_terms")),
        "ad_search_terms": to_int(row.get("ad_search_terms")),
        "search_recommend_terms": to_int(row.get("search_recommend_terms")),
        "launch_date": row.get("launch_date").isoformat()
        if isinstance(row.get("launch_date"), date)
        else None,
        "sales_volume": to_int(row.get("sales_volume")),
        "sales": to_float(row.get("sales")),
        "createtime": row.get("createtime").isoformat()
        if isinstance(row.get("createtime"), date)
        else None,
    }
