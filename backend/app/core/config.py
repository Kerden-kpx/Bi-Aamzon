from __future__ import annotations

from typing import Optional

DEFAULT_BSR_SITE = "US"
VALID_BSR_SITES = {"US", "CA", "UK", "DE"}


def normalize_site(value: Optional[str]) -> str:
    if not value:
        return DEFAULT_BSR_SITE
    candidate = str(value).strip().upper()
    if candidate in VALID_BSR_SITES:
        return candidate
    return DEFAULT_BSR_SITE
