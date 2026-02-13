import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from .db import execute, fetch_one


@dataclass
class CurrentUser:
    userid: str
    username: str
    role: str
    product_scope: str = "all"


class DingTalkSignPayload(BaseModel):
    url: str


class DingTalkLoginPayload(BaseModel):
    auth_code: str


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value


def _env_int(name: str, default: int) -> int:
    value = _env(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign_token(payload: Dict[str, Any], secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    message = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url(signature)}"


def _verify_token(token: str, secret: str) -> Dict[str, Any]:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc
    message = f"{header_b64}.{payload_b64}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    signature = _b64url_decode(signature_b64)
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid token")
    payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    exp = payload.get("exp")
    if exp and int(exp) < int(time.time()):
        raise HTTPException(status_code=401, detail="Token expired")
    return payload


def _http_get_json(url: str, params: Dict[str, str], timeout: int) -> Dict[str, Any]:
    query = urllib.parse.urlencode(params)
    full_url = f"{url}?{query}" if query else url
    try:
        with urllib.request.urlopen(full_url, timeout=timeout) as resp:
            data = resp.read().decode("utf-8")
        return json.loads(data)
    except Exception as exc:
        print(f"[DingTalk] HTTP GET failed: {full_url} ({exc})", file=sys.stderr)
        raise


def _http_post_json(url: str, body: Dict[str, Any], timeout: int) -> Dict[str, Any]:
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read().decode("utf-8")
        return json.loads(data)
    except Exception as exc:
        print(f"[DingTalk] HTTP POST failed: {url} ({exc})", file=sys.stderr)
        raise


def _ensure_ok(resp: Dict[str, Any], context: str) -> None:
    errcode = resp.get("errcode")
    if errcode not in (0, None):
        errmsg = resp.get("errmsg") or resp.get("message") or "unknown error"
        print(f"[DingTalk] {context} failed: errcode={errcode}, errmsg={errmsg}", file=sys.stderr)
        raise HTTPException(status_code=502, detail=f"{context} failed: {errmsg}")


_TOKEN_CACHE: Dict[str, Any] = {"token": None, "expires_at": 0}
_TICKET_CACHE: Dict[str, Any] = {"ticket": None, "expires_at": 0}

USER_SELECT_SQL = """
    SELECT dingtalk_userid, dingtalk_username, avatar_url, role, status, product_scope
    FROM dim_user
    WHERE dingtalk_userid = %s
    LIMIT 1
"""


def _get_access_token() -> str:
    now = int(time.time())
    cached = _TOKEN_CACHE.get("token")
    if cached and now < int(_TOKEN_CACHE.get("expires_at", 0)) - 60:
        return cached
    app_key = _env("DINGTALK_APP_KEY")
    app_secret = _env("DINGTALK_APP_SECRET")
    if not app_key or not app_secret:
        raise HTTPException(status_code=500, detail="Missing DingTalk app credentials")
    timeout = _env_int("DINGTALK_HTTP_TIMEOUT", 15)
    url = _env("DINGTALK_TOKEN_URL", "https://oapi.dingtalk.com/gettoken")
    resp = _http_get_json(url, {"appkey": app_key, "appsecret": app_secret}, timeout)
    _ensure_ok(resp, "get_access_token")
    token = resp.get("access_token")
    expires_in = int(resp.get("expires_in") or 7200)
    if not token:
        raise HTTPException(status_code=502, detail="Missing access_token")
    _TOKEN_CACHE["token"] = token
    _TOKEN_CACHE["expires_at"] = now + expires_in
    return token


def _get_jsapi_ticket(token: str) -> str:
    now = int(time.time())
    cached = _TICKET_CACHE.get("ticket")
    if cached and now < int(_TICKET_CACHE.get("expires_at", 0)) - 60:
        return cached
    timeout = _env_int("DINGTALK_HTTP_TIMEOUT", 15)
    url = _env("DINGTALK_JSAPI_TICKET_URL", "https://oapi.dingtalk.com/get_jsapi_ticket")
    resp = _http_get_json(url, {"access_token": token}, timeout)
    _ensure_ok(resp, "get_jsapi_ticket")
    ticket = resp.get("ticket")
    expires_in = int(resp.get("expires_in") or 7200)
    if not ticket:
        raise HTTPException(status_code=502, detail="Missing jsapi ticket")
    _TICKET_CACHE["ticket"] = ticket
    _TICKET_CACHE["expires_at"] = now + expires_in
    return ticket


def sign_jsapi(payload: DingTalkSignPayload) -> Dict[str, Any]:
    token = _get_access_token()
    ticket = _get_jsapi_ticket(token)
    nonce_str = _b64url(os.urandom(9))
    timestamp = str(int(time.time()))
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Missing url")
    raw = f"jsapi_ticket={ticket}&noncestr={nonce_str}&timestamp={timestamp}&url={url}"
    signature = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    return {
        "corpId": _env("DINGTALK_CORP_ID"),
        "agentId": _env("DINGTALK_AGENT_ID"),
        "timeStamp": timestamp,
        "nonceStr": nonce_str,
        "signature": signature,
    }


def _get_userid_from_code(auth_code: str) -> str:
    token = _get_access_token()
    timeout = _env_int("DINGTALK_HTTP_TIMEOUT", 15)
    url = _env("DINGTALK_USERID_URL", "https://oapi.dingtalk.com/topapi/v2/user/getuserinfo")
    resp = _http_post_json(f"{url}?access_token={token}", {"code": auth_code}, timeout)
    _ensure_ok(resp, "get_userid")
    result = resp.get("result") or {}
    userid = result.get("userid")
    if not userid:
        raise HTTPException(status_code=502, detail="Missing userid")
    return userid


def _get_user_detail(userid: str) -> Dict[str, Any]:
    token = _get_access_token()
    timeout = _env_int("DINGTALK_HTTP_TIMEOUT", 15)
    url = _env("DINGTALK_USER_DETAIL_URL", "https://oapi.dingtalk.com/topapi/v2/user/get")
    resp = _http_post_json(
        f"{url}?access_token={token}",
        {"userid": userid},
        timeout,
    )
    _ensure_ok(resp, "get_user_detail")
    return resp.get("result") or {}


def search_dingtalk_users(keyword: str, limit: int = 8) -> List[Dict[str, str]]:
    name = str(keyword or "").strip()
    if not name:
        return []

    normalized_limit = max(1, min(int(limit or 8), 20))
    timeout = _env_int("DINGTALK_HTTP_TIMEOUT", 15)
    token = _get_access_token()

    try:
        from alibabacloud_dingtalk.contact_1_0.client import Client as DingTalkContactClient
        from alibabacloud_dingtalk.contact_1_0 import models as contact_models
        from alibabacloud_tea_openapi import models as open_api_models
        from alibabacloud_tea_util import models as util_models
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Missing DingTalk Python SDK. Please install alibabacloud_dingtalk",
        ) from exc

    config = open_api_models.Config()
    config.protocol = "https"
    config.region_id = _env("DINGTALK_OPENAPI_REGION_ID", "central")
    client = DingTalkContactClient(config)

    headers = contact_models.SearchUserHeaders()
    headers.x_acs_dingtalk_access_token = token

    request = contact_models.SearchUserRequest()
    request_payload: Dict[str, Any] = {
        "offset": 0,
        "size": max(10, normalized_limit * 3),
    }
    if hasattr(request, "from_map"):
        try:
            request.from_map(request_payload)
        except Exception:
            pass

    query_applied = False
    for field_name in ("query_word", "queryWord", "keyword", "name", "search_word", "word"):
        if hasattr(request, field_name):
            setattr(request, field_name, name)
            query_applied = True
            request_payload[field_name] = name
            break
    if not query_applied and hasattr(request, "from_map"):
        for query_key in ("queryWord", "query_word", "keyword", "name", "search_word", "word"):
            try:
                request.from_map({**request_payload, query_key: name})
                query_applied = True
                break
            except Exception:
                continue
    if not query_applied:
        raise HTTPException(status_code=500, detail="Unsupported SearchUserRequest fields in current SDK")

    offset_applied = False
    for field_name in ("offset", "start", "page_offset"):
        if hasattr(request, field_name):
            setattr(request, field_name, 0)
            offset_applied = True
            break
    if not offset_applied and hasattr(request, "from_map"):
        try:
            request.from_map(request_payload)
            offset_applied = True
        except Exception:
            offset_applied = False
    if not offset_applied:
        raise HTTPException(status_code=500, detail="Unsupported SearchUserRequest offset field in current SDK")

    size_applied = False
    for field_name in ("size", "page_size", "max_results", "limit"):
        if hasattr(request, field_name):
            setattr(request, field_name, max(10, normalized_limit * 3))
            size_applied = True
            break
    if not size_applied and hasattr(request, "from_map"):
        try:
            request.from_map(request_payload)
        except Exception:
            pass

    runtime = util_models.RuntimeOptions()
    timeout_ms = timeout * 1000
    if hasattr(runtime, "read_timeout"):
        runtime.read_timeout = timeout_ms
    if hasattr(runtime, "connect_timeout"):
        runtime.connect_timeout = timeout_ms

    try:
        response = client.search_user_with_options(request, headers, runtime)
    except Exception as exc:
        message = getattr(exc, "message", None) or str(exc) or "unknown error"
        raise HTTPException(status_code=502, detail=f"searchUser failed: {message}") from exc

    def _to_plain(value: Any) -> Any:
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, list):
            return [_to_plain(item) for item in value]
        if isinstance(value, dict):
            return {str(key): _to_plain(item) for key, item in value.items()}
        to_map = getattr(value, "to_map", None)
        if callable(to_map):
            try:
                mapped = to_map()
                if isinstance(mapped, dict):
                    return {str(key): _to_plain(item) for key, item in mapped.items()}
            except Exception:
                pass
        if hasattr(value, "__dict__"):
            return {str(key): _to_plain(item) for key, item in vars(value).items() if not str(key).startswith("_")}
        return value

    payload = _to_plain(response)
    collected: Dict[str, str] = {}

    def _walk(node: Any) -> None:
        if isinstance(node, list):
            for item in node:
                _walk(item)
            return
        if not isinstance(node, dict):
            return

        userid = node.get("userid") or node.get("userId")
        username = node.get("name") or node.get("nick") or node.get("username")
        if userid:
            normalized_userid = str(userid).strip()
            if normalized_userid and normalized_userid not in collected:
                collected[normalized_userid] = str(username or normalized_userid).strip() or normalized_userid

        for item in node.values():
            _walk(item)

    _walk(payload)

    # searchUser 常见返回: body.list = ["userid1", "userid2", ...]
    body = payload.get("body") if isinstance(payload, dict) else None
    raw_list = body.get("list") if isinstance(body, dict) else None
    if isinstance(raw_list, list):
        for item in raw_list:
            if isinstance(item, dict):
                userid = item.get("userid") or item.get("userId")
                username = item.get("name") or item.get("nick") or item.get("username")
                if userid:
                    normalized_userid = str(userid).strip()
                    if normalized_userid and normalized_userid not in collected:
                        collected[normalized_userid] = str(username or normalized_userid).strip() or normalized_userid
                continue

            normalized_userid = str(item).strip()
            if not normalized_userid or normalized_userid in collected:
                continue
            username = normalized_userid
            try:
                detail = _get_user_detail(normalized_userid)
                username = str(
                    detail.get("name")
                    or detail.get("nick")
                    or detail.get("username")
                    or normalized_userid
                ).strip() or normalized_userid
            except Exception:
                username = normalized_userid
            collected[normalized_userid] = username

    items = [{"userid": userid, "name": username} for userid, username in collected.items()]
    if not items:
        return []

    name_lower = name.lower()
    matched = [item for item in items if name_lower in (item.get("name") or "").lower()]
    source = matched if matched else items

    def _rank(item: Dict[str, str]) -> tuple[int, int, str]:
        username = item.get("name") or ""
        lowered = username.lower()
        if lowered == name_lower:
            return (0, len(username), username)
        if lowered.startswith(name_lower):
            return (1, len(username), username)
        return (2, len(username), username)

    source.sort(key=_rank)
    return source[:normalized_limit]


def _upsert_user(userid: str, username: str, avatar_url: Optional[str], default_role: str) -> Dict[str, Any]:
    execute(
        """
        INSERT INTO dim_user (dingtalk_userid, dingtalk_username, avatar_url, role, status)
        VALUES (%s, %s, %s, %s, 'active')
        ON DUPLICATE KEY UPDATE
            dingtalk_username = VALUES(dingtalk_username),
            avatar_url = VALUES(avatar_url),
            status = 'active'
        """,
        (userid, username, avatar_url, default_role),
    )

    row = fetch_one(USER_SELECT_SQL, (userid,))
    if not row:
        raise HTTPException(status_code=500, detail="User upsert failed")
    return row


def _fetch_user(userid: str) -> Optional[Dict[str, Any]]:
    return fetch_one(USER_SELECT_SQL, (userid,))


def refresh_user_profile(userid: str) -> Dict[str, Any]:
    if not userid:
        raise HTTPException(status_code=400, detail="Missing userid")
    detail: Dict[str, Any] = {}
    try:
        detail = _get_user_detail(userid)
    except HTTPException:
        detail = {}

    username = detail.get("name") or detail.get("nick")
    avatar_url = detail.get("avatar") or detail.get("avatar_url")

    if username or avatar_url:
        affected = execute(
            """
            UPDATE dim_user
            SET
                dingtalk_username = COALESCE(%s, dingtalk_username),
                avatar_url = COALESCE(%s, avatar_url),
                status = 'active'
            WHERE dingtalk_userid = %s
            """,
            (username, avatar_url, userid),
        )
        if affected == 0:
            default_role = _env("DINGTALK_DEFAULT_ROLE", "operator") or "operator"
            _upsert_user(userid, username or userid, avatar_url, default_role)

    user = _fetch_user(userid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def login_with_auth_code(payload: DingTalkLoginPayload) -> Dict[str, Any]:
    auth_code = payload.auth_code.strip()
    if not auth_code:
        raise HTTPException(status_code=400, detail="Missing auth_code")
    default_role = _env("DINGTALK_DEFAULT_ROLE", "operator") or "operator"
    userid = _get_userid_from_code(auth_code)
    detail = _get_user_detail(userid)
    username = detail.get("name") or detail.get("nick") or userid
    avatar_url = detail.get("avatar") or detail.get("avatar_url")
    user = _upsert_user(userid, username, avatar_url, default_role)
    if user.get("status") == "disabled":
        raise HTTPException(status_code=403, detail="User disabled")
    secret = _env("AUTH_SECRET", "dev-secret")
    exp = int(time.time()) + _env_int("AUTH_TOKEN_TTL", 86400)
    token = _sign_token(
        {"sub": userid, "name": user.get("dingtalk_username"), "role": user.get("role"), "exp": exp},
        secret,
    )
    return {"user": user, "token": token}


def get_current_user(request: Request) -> CurrentUser:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth.replace("Bearer ", "", 1).strip()
    secret = _env("AUTH_SECRET", "dev-secret")
    payload = _verify_token(token, secret)

    userid = payload.get("sub")
    if not userid:
        raise HTTPException(status_code=401, detail="Invalid token")

    row = fetch_one(USER_SELECT_SQL, (userid,))

    if not row or row.get("status") == "disabled":
        raise HTTPException(status_code=403, detail="User disabled")

    scope = (row.get("product_scope") or "all").strip().lower()
    if scope not in ("all", "restricted"):
        scope = "all"

    return CurrentUser(
        userid=row.get("dingtalk_userid") or userid,
        username=row.get("dingtalk_username") or userid,
        role=row.get("role") or "operator",
        product_scope=scope,
    )


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
