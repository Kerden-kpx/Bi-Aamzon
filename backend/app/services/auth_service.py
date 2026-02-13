from __future__ import annotations

from typing import Any, Dict

from ..auth import DingTalkLoginPayload, DingTalkSignPayload, login_with_auth_code, refresh_user_profile, sign_jsapi


def jsapi_sign(payload: DingTalkSignPayload) -> Dict[str, Any]:
    return sign_jsapi(payload)


def login(payload: DingTalkLoginPayload) -> Dict[str, Any]:
    return login_with_auth_code(payload)


def refresh_user(userid: str) -> Dict[str, Any]:
    return refresh_user_profile(userid)
