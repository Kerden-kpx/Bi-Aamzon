from __future__ import annotations

from fastapi import Request
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .logging import logger, get_request_id
from .responses import error_response


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        message = str(exc.detail.get("message", exc.detail))
        code = exc.detail.get("code")
        details = exc.detail.get("details")
    else:
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        code = None
        details = None
    if exc.status_code >= 500:
        logger.error(
            "http_error %s %s %s %s rid=%s",
            request.method,
            request.url.path,
            exc.status_code,
            message,
            get_request_id(),
        )
    else:
        logger.warning(
            "http_error %s %s %s %s rid=%s",
            request.method,
            request.url.path,
            exc.status_code,
            message,
            get_request_id(),
        )
    return error_response(exc.status_code, message, details=details, code=code)


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    logger.warning(
        "validation_error %s %s rid=%s",
        request.method,
        request.url.path,
        get_request_id(),
    )
    return error_response(400, "Invalid request", exc.errors(), code="VALIDATION_ERROR")


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error at %s %s", request.method, request.url.path)
    return error_response(500, "Internal server error")
