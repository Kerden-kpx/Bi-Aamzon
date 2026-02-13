from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter

from ..core.logging import logger
from ..schemas.dev import FrontendLogPayload

router = APIRouter()


@router.post("/api/dev/log")
async def frontend_log(payload: FrontendLogPayload) -> Dict[str, Any]:
    level = (payload.level or "error").lower()
    log_message = f"[frontend:{level}] {payload.message}"
    if payload.stack:
        log_message = f"{log_message}\n{payload.stack}"
    if level == "warn":
        logger.warning(log_message)
    elif level == "info":
        logger.info(log_message)
    else:
        logger.error(log_message)
    if payload.context:
        logger.info("[frontend:context] %s", payload.context)
    return {"ok": True}
