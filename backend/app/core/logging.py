from __future__ import annotations

import logging
import time
import uuid
from contextvars import ContextVar
from typing import Optional

from fastapi import Request

logger = logging.getLogger("bi-amazon")
_request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


def get_request_id() -> Optional[str]:
    return _request_id_ctx.get()


async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    token = _request_id_ctx.set(request_id)
    start = time.perf_counter()
    try:
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        response.headers["x-request-id"] = request_id
        logger.info(
            "request %s %s %s %.2fms rid=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
        )
        return response
    finally:
        _request_id_ctx.reset(token)
