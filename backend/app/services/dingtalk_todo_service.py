from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from .. import auth as auth_core
from ..db import execute, fetch_one
from ..repositories import dingtalk_todo_repo

_DONE_STATES = {"已完成", "已取消"}
_DINGTALK_TZ = ZoneInfo("Asia/Shanghai")


class DingTalkTodoSyncError(RuntimeError):
    pass


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value


def _env_bool(name: str, default: bool = False) -> bool:
    value = str(_env(name, "") or "").strip().lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _env_int(name: str, default: int) -> int:
    raw = str(_env(name, str(default)) or str(default)).strip()
    try:
        return int(raw)
    except ValueError:
        return default


def is_enabled() -> bool:
    return _env_bool("DINGTALK_TODO_SYNC_ENABLED", False)


def _require_user_unionid(userid: str) -> str:
    normalized_userid = str(userid or "").strip()
    if not normalized_userid:
        raise DingTalkTodoSyncError("Missing owner_userid for DingTalk todo sync")

    try:
        row = fetch_one(
            "SELECT dingtalk_unionid FROM dim_bi_amazon_user WHERE dingtalk_userid = %s LIMIT 1",
            (normalized_userid,),
        )
    except Exception as exc:  # pragma: no cover - runtime migration issue
        raise DingTalkTodoSyncError(
            "Missing column dim_bi_amazon_user.dingtalk_unionid. Please run SQL migration first."
        ) from exc

    unionid = str((row or {}).get("dingtalk_unionid") or "").strip()
    if unionid:
        return unionid

    try:
        detail = auth_core._get_user_detail(normalized_userid)
    except Exception as exc:
        raise DingTalkTodoSyncError(f"Failed to fetch DingTalk user detail for userid={normalized_userid}") from exc

    unionid = str(detail.get("unionid") or detail.get("unionId") or "").strip()
    if not unionid:
        raise DingTalkTodoSyncError(f"DingTalk user detail has no unionid for userid={normalized_userid}")

    execute(
        "UPDATE dim_bi_amazon_user SET dingtalk_unionid = %s WHERE dingtalk_userid = %s",
        (unionid, normalized_userid),
    )
    return unionid


def _to_due_time_ms(review_date: Optional[str], deadline_time: Optional[str]) -> Optional[int]:
    raw = str(review_date or "").strip()
    if not raw:
        return None
    try:
        parsed_date = datetime.strptime(raw, "%Y-%m-%d")
    except ValueError:
        return None

    hour = 23
    minute = 59
    deadline_raw = str(deadline_time or "").strip()
    if deadline_raw:
        try:
            time_parsed = datetime.strptime(deadline_raw, "%H:%M")
            hour = time_parsed.hour
            minute = time_parsed.minute
        except ValueError:
            pass

    # DingTalk dueTime expects an absolute Unix timestamp. Interpret user-selected
    # date/time in China timezone to avoid shifting (e.g. 18:00 -> next-day 02:00).
    dt_local = parsed_date.replace(hour=hour, minute=minute, second=0, tzinfo=_DINGTALK_TZ)
    return int(dt_local.timestamp() * 1000)


def _to_reminder_time_ms(due_time_ms: Optional[int], reminder_time: Optional[str]) -> Optional[int]:
    if not due_time_ms:
        return None
    raw = str(reminder_time or "").strip()
    if not raw or raw == "无":
        return None

    due_dt = datetime.fromtimestamp(due_time_ms / 1000, tz=timezone.utc)
    mapping = {
        "截止时": timedelta(seconds=0),
        "截止前10分钟": timedelta(minutes=10),
        "截止前15分钟": timedelta(minutes=15),
        "截止前30分钟": timedelta(minutes=30),
        "截止前1小时": timedelta(hours=1),
        "截止前3小时": timedelta(hours=3),
        "截止前1天": timedelta(days=1),
    }
    delta = mapping.get(raw)
    if delta is None:
        return None
    reminder_dt = due_dt - delta
    now_dt = datetime.now(tz=timezone.utc)
    if reminder_dt <= now_dt:
        return None
    return int(reminder_dt.timestamp() * 1000)


def _normalize_userid_list(value: Any) -> List[str]:
    if not value:
        return []
    if isinstance(value, str):
        raw_items = [part.strip() for part in value.split(",")]
    elif isinstance(value, (list, tuple, set)):
        raw_items = [str(part).strip() for part in value]
    else:
        raw_items = [str(value).strip()]

    seen: set[str] = set()
    result: List[str] = []
    for userid in raw_items:
        if not userid or userid in seen:
            continue
        seen.add(userid)
        result.append(userid)
    return result


def _resolve_unionids_by_userids(userids: List[str]) -> List[str]:
    unionids: List[str] = []
    seen: set[str] = set()
    for userid in userids:
        try:
            unionid = _require_user_unionid(userid)
        except Exception:
            continue
        if not unionid or unionid in seen:
            continue
        seen.add(unionid)
        unionids.append(unionid)
    return unionids


def _priority_to_level(value: Optional[str]) -> int:
    normalized = str(value or "").strip()
    if normalized == "紧急":
        return 30
    if normalized in {"较高", "高"}:
        return 30
    if normalized in {"较低", "低"}:
        return 10
    return 20


def _build_detail_url(strategy_id: str) -> Optional[Dict[str, str]]:
    base = str(_env("DINGTALK_TODO_DETAIL_URL_BASE", "") or "").strip()
    if not base:
        return None
    if "{id}" in base:
        url = base.replace("{id}", str(strategy_id))
    else:
        separator = "&" if "?" in base else "?"
        url = f"{base}{separator}strategyId={strategy_id}"
    return {"pcUrl": url, "appUrl": url}


def _extract_task_id(resp: Any) -> str:
    if isinstance(resp, dict):
        for key in ("id", "taskId", "task_id", "todoTaskId"):
            value = resp.get(key)
            if value:
                return str(value).strip()
        for key in ("result", "data"):
            nested = resp.get(key)
            if isinstance(nested, dict):
                nested_id = _extract_task_id(nested)
                if nested_id:
                    return nested_id
    return ""


def _call_todo_api(
    method: str,
    path: str,
    access_token: str,
    operator_unionid: Optional[str],
    payload: Optional[Dict[str, Any]] = None,
    ignore_not_found: bool = False,
) -> Dict[str, Any]:
    base = str(_env("DINGTALK_TODO_API_BASE", "https://api.dingtalk.com") or "").strip().rstrip("/")
    if not base:
        raise DingTalkTodoSyncError("Missing DINGTALK_TODO_API_BASE")
    url = f"{base}{path}"
    if operator_unionid:
        operator_query = urllib.parse.urlencode({"operatorId": operator_unionid})
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}{operator_query}"

    body_bytes = None
    if payload is not None:
        body_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(
        url=url,
        data=body_bytes,
        method=method.upper(),
        headers={
            "Content-Type": "application/json",
            "x-acs-dingtalk-access-token": access_token,
            "Authorization": f"Bearer {access_token}",
        },
    )

    timeout = _env_int("DINGTALK_HTTP_TIMEOUT", 15)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            if not raw.strip():
                return {}
            parsed = json.loads(raw)
    except urllib.error.HTTPError as exc:
        if ignore_not_found and exc.code == 404:
            return {}
        body = ""
        try:
            body = exc.read().decode("utf-8")
        except Exception:
            body = ""
        message = f"HTTP {exc.code}"
        if body:
            message = f"{message} {body[:500]}"
        raise DingTalkTodoSyncError(message) from exc
    except Exception as exc:
        raise DingTalkTodoSyncError(f"Call DingTalk todo API failed: {exc}") from exc

    if isinstance(parsed, dict):
        errcode = parsed.get("errcode")
        if errcode not in (None, 0):
            errmsg = parsed.get("errmsg") or parsed.get("message") or "unknown error"
            raise DingTalkTodoSyncError(f"DingTalk todo API error: {errmsg} (errcode={errcode})")
    return parsed if isinstance(parsed, dict) else {"data": parsed}


def _build_task_payload(strategy: Dict[str, Any], owner_unionid: str, creator_unionid: str) -> Dict[str, Any]:
    strategy_id = str(strategy.get("id") or "").strip()
    if not strategy_id:
        raise DingTalkTodoSyncError("Invalid strategy id")
    source_id = f"strategy:{strategy_id}"
    detail = str(strategy.get("detail") or "").strip()
    description = detail

    payload: Dict[str, Any] = {
        "sourceId": source_id,
        "source": str(_env("DINGTALK_TODO_SOURCE", "bi-amazon-strategy") or "bi-amazon-strategy"),
        "subject": str(strategy.get("title") or "").strip()[:200] or f"策略任务#{strategy_id}",
        "description": description[:5000],
        "creatorId": creator_unionid,
        "executorIds": [owner_unionid],
        "priority": _priority_to_level(strategy.get("priority")),
        "done": str(strategy.get("state") or "").strip() in _DONE_STATES,
        "isOnlyShowExecutor": False,
    }
    participant_userids = _normalize_userid_list(strategy.get("participant_userids"))
    participant_unionids = _resolve_unionids_by_userids(participant_userids)[:100]
    if participant_unionids:
        payload["participantIds"] = participant_unionids
    due_time = _to_due_time_ms(strategy.get("review_date"), strategy.get("deadline_time"))
    if due_time is not None:
        payload["dueTime"] = due_time
    reminder_ts = _to_reminder_time_ms(due_time, strategy.get("reminder_time"))
    if reminder_ts is not None:
        payload["notifyConfigs"] = {"dingNotify": "1"}
        payload["reminderTimeStamp"] = reminder_ts
    detail_url = _build_detail_url(strategy_id)
    if detail_url:
        payload["detailUrl"] = detail_url
    return payload


def sync_strategy_todo_upsert(strategy: Dict[str, Any], operator_userid: str) -> None:
    if not is_enabled():
        return

    strategy_id = str(strategy.get("id") or "").strip()
    if not strategy_id:
        raise DingTalkTodoSyncError("Invalid strategy id")

    owner_userid = str(strategy.get("owner_userid") or strategy.get("userid") or "").strip()
    if not owner_userid:
        raise DingTalkTodoSyncError(f"Missing owner_userid for strategy_id={strategy_id}")

    source_id = f"strategy:{strategy_id}"
    sync_row = dingtalk_todo_repo.fetch_strategy_todo_sync(strategy_id)
    existing_task_id = str((sync_row or {}).get("todo_task_id") or "").strip()
    if existing_task_id.lower().startswith("local_"):
        existing_task_id = ""
    existing_owner_unionid = str((sync_row or {}).get("owner_unionid") or "").strip()

    access_token = auth_core._get_access_token()
    owner_unionid = _require_user_unionid(owner_userid)
    operator_unionid = ""
    if operator_userid:
        try:
            operator_unionid = _require_user_unionid(operator_userid)
        except Exception:
            operator_unionid = ""
    if not operator_unionid:
        operator_unionid = owner_unionid

    # Owner changed: delete old task first, then create under new owner.
    if existing_task_id and existing_owner_unionid and existing_owner_unionid != owner_unionid:
        _call_todo_api(
            method="DELETE",
            path=f"/v1.0/todo/users/{urllib.parse.quote(existing_owner_unionid)}/tasks/{urllib.parse.quote(existing_task_id)}",
            access_token=access_token,
            operator_unionid=operator_unionid,
            ignore_not_found=True,
        )
        existing_task_id = ""

    payload = _build_task_payload(strategy, owner_unionid, operator_unionid)
    if existing_task_id:
        _call_todo_api(
            method="PUT",
            path=f"/v1.0/todo/users/{urllib.parse.quote(owner_unionid)}/tasks/{urllib.parse.quote(existing_task_id)}",
            access_token=access_token,
            operator_unionid=operator_unionid,
            payload=payload,
        )
        task_id = existing_task_id
    else:
        resp = _call_todo_api(
            method="POST",
            path=f"/v1.0/todo/users/{urllib.parse.quote(owner_unionid)}/tasks",
            access_token=access_token,
            operator_unionid=operator_unionid,
            payload=payload,
        )
        task_id = _extract_task_id(resp)
        if not task_id:
            raise DingTalkTodoSyncError("Create DingTalk todo succeeded but task id is missing")

    dingtalk_todo_repo.upsert_strategy_todo_sync(
        strategy_id=strategy_id,
        owner_userid=owner_userid,
        owner_unionid=owner_unionid,
        todo_task_id=task_id,
        todo_source_id=source_id,
        sync_status="synced",
    )


def sync_strategy_todo_delete(strategy_id: str, operator_userid: str) -> None:
    if not is_enabled():
        return

    sync_row = dingtalk_todo_repo.fetch_strategy_todo_sync(strategy_id)
    if not sync_row:
        return

    owner_unionid = str(sync_row.get("owner_unionid") or "").strip()
    todo_task_id = str(sync_row.get("todo_task_id") or "").strip()

    if not owner_unionid or not todo_task_id:
        dingtalk_todo_repo.delete_strategy_todo_sync(strategy_id)
        return

    access_token = auth_core._get_access_token()
    operator_unionid = ""
    if operator_userid:
        try:
            operator_unionid = _require_user_unionid(operator_userid)
        except Exception:
            operator_unionid = ""
    if not operator_unionid:
        operator_unionid = owner_unionid

    _call_todo_api(
        method="DELETE",
        path=f"/v1.0/todo/users/{urllib.parse.quote(owner_unionid)}/tasks/{urllib.parse.quote(todo_task_id)}",
        access_token=access_token,
        operator_unionid=operator_unionid,
        ignore_not_found=True,
    )
    dingtalk_todo_repo.delete_strategy_todo_sync(strategy_id)
