from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi.responses import JSONResponse

from .logging import get_request_id

_ERROR_CODE_MAP = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    500: "INTERNAL_ERROR",
    502: "BAD_GATEWAY",
}


def error_response(
    status_code: int,
    message: str,
    details: Optional[Any] = None,
    code: Optional[str] = None,
) -> JSONResponse:
    payload: Dict[str, Any] = {
        "error": {"code": code or _ERROR_CODE_MAP.get(status_code, "ERROR"), "message": message},
        "detail": message,
    }
    if details is not None:
        payload["error"]["details"] = details
    request_id = get_request_id()
    if request_id:
        payload["request_id"] = request_id
    return JSONResponse(status_code=status_code, content=payload)


def ok_response(payload: Optional[Dict[str, Any]] = None, **extra: Any) -> Dict[str, Any]:
    response: Dict[str, Any] = {"ok": True}
    if payload:
        response.update(payload)
    if extra:
        response.update(extra)
    return response


def list_response(
    items: List[Dict[str, Any]] | List[Any],
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    **extra: Any,
) -> Dict[str, Any]:
    count = len(items)
    response: Dict[str, Any] = {"items": items, "count": count}
    if limit is not None and offset is not None:
        response["pagination"] = {"limit": limit, "offset": offset, "count": count}
    if extra:
        response.update(extra)
    return response
