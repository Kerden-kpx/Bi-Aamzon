from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, DingTalkLoginPayload, DingTalkSignPayload, get_current_user
from ..core.responses import ok_response
from ..services import auth_service

router = APIRouter()


@router.post("/api/auth/dingtalk/jsapi-sign")
def dingtalk_jsapi_sign(payload: DingTalkSignPayload) -> Dict[str, Any]:
    return ok_response(auth_service.jsapi_sign(payload))


@router.post("/api/auth/dingtalk/login")
def dingtalk_login(payload: DingTalkLoginPayload) -> Dict[str, Any]:
    return ok_response(auth_service.login(payload))


@router.post("/api/auth/dingtalk/refresh-user")
def dingtalk_refresh_user(
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    user = auth_service.refresh_user(current_user.userid)
    return ok_response({"user": user})
