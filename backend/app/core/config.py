from __future__ import annotations

import os
from typing import List, Optional

DEFAULT_BSR_SITE = "US"
VALID_BSR_SITES = {"US", "CA", "UK", "DE"}
AUTH_SECRET_MIN_LENGTH = 32
DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


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


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def get_allowed_origins() -> List[str]:
    raw = str(os.getenv("ALLOWED_ORIGINS", "")).strip()
    if not raw:
        return list(DEFAULT_ALLOWED_ORIGINS)
    items = [item.strip() for item in raw.split(",")]
    return [item for item in items if item]


def get_cors_allow_credentials() -> bool:
    return env_bool("CORS_ALLOW_CREDENTIALS", default=False)


def validate_cors_settings() -> None:
    origins = get_allowed_origins()
    if "*" in origins and get_cors_allow_credentials():
        raise RuntimeError("ALLOWED_ORIGINS cannot contain '*' when CORS_ALLOW_CREDENTIALS=true")
