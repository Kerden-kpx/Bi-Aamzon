from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter

from ..core.responses import ok_response

router = APIRouter()


@router.get("/health")
def health() -> Dict[str, Any]:
    return ok_response({"status": "ok"})
