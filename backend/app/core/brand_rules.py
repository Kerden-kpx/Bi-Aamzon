from __future__ import annotations

from typing import Dict, Set, Tuple

ALL_OWN_BRANDS: Tuple[str, ...] = ("EZARC", "TOLESA", "YPLUS")
OWN_BRANDS: Tuple[str, ...] = ("EZARC", "TOLESA")

CATEGORY_OWN_BRANDS: Dict[str, Set[str]] = {
    "KIDS' PAINT WITH WATER KITS": {"YPLUS"},
}


def normalize_brand(value: str | None) -> str:
    return str(value or "").strip().upper()


def get_all_own_brands() -> Set[str]:
    return {normalize_brand(brand) for brand in ALL_OWN_BRANDS}


def get_own_brands_for_category(category: str | None) -> Set[str]:
    normalized_category = str(category or "").strip().upper()
    if normalized_category in CATEGORY_OWN_BRANDS:
        return set(CATEGORY_OWN_BRANDS[normalized_category])
    return {normalize_brand(brand) for brand in OWN_BRANDS}
