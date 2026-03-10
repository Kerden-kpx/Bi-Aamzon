from __future__ import annotations

import os
from typing import Optional

DEFAULT_BSR_SITE = "US"
VALID_BSR_SITES = {"US", "CA", "UK", "DE", "JP"}
AUTH_SECRET_MIN_LENGTH = 32


def normalize_site(value: Optional[str]) -> str:
    if not value:
        return DEFAULT_BSR_SITE
    candidate = str(value).strip().upper()
    if candidate in VALID_BSR_SITES:
        return candidate
    return DEFAULT_BSR_SITE


def get_required_env(name: str) -> str:
    value = str(os.getenv(name, "")).strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def get_auth_secret_or_raise() -> str:
    secret = get_required_env("AUTH_SECRET")
    if len(secret) < AUTH_SECRET_MIN_LENGTH:
        raise RuntimeError(f"AUTH_SECRET must be at least {AUTH_SECRET_MIN_LENGTH} characters")
    return secret
