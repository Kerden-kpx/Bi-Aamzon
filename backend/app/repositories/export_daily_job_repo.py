from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, Optional

from ..db import execute, fetch_one

def _set_job_status(
    job_id: str,
    status: str,
    *,
    queue_task_id: Optional[str] = None,
    error_message: Optional[str] = None,
    result: Optional[Dict[str, Any]] = None,
    set_started: bool = False,
    set_finished: bool = False,
) -> None:
    fields = ["status = %s", "updated_at = NOW()"]
    params: list[Any] = [status]

    if queue_task_id is not None:
        fields.append("queue_task_id = %s")
        params.append(queue_task_id)
    if error_message is not None:
        fields.append("error_message = %s")
        params.append(error_message)
    if result is not None:
        fields.append("result_json = %s")
        params.append(json.dumps(result, ensure_ascii=False))
    if set_started:
        fields.append("started_at = NOW()")
    if set_finished:
        fields.append("finished_at = NOW()")

    params.append(job_id)
    execute(f"UPDATE fact_export_daily_job SET {', '.join(fields)} WHERE job_id = %s", params)


def insert_job(job_id: str, site: str, operator_userid: str) -> None:
    execute(
        """
        INSERT INTO fact_export_daily_job (
            job_id, site, status, operator_userid, created_at, updated_at
        ) VALUES (%s, %s, 'pending', %s, NOW(), NOW())
        """,
        (job_id, site, operator_userid),
    )


def mark_job_queued(job_id: str, queue_task_id: Optional[str]) -> None:
    execute(
        """
        UPDATE fact_export_daily_job
        SET queue_task_id = %s,
            updated_at = NOW()
        WHERE job_id = %s
        """,
        (queue_task_id, job_id),
    )


def mark_job_running(job_id: str) -> None:
    _set_job_status(job_id, "running", error_message="", set_started=True)


def mark_job_success(job_id: str, result: Dict[str, Any]) -> None:
    _set_job_status(job_id, "success", error_message="", result=result, set_finished=True)


def mark_job_failed(job_id: str, error_message: str) -> None:
    _set_job_status(job_id, "failed", error_message=error_message[:2000], set_finished=True)


def _serialize_datetime(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    return None


def fetch_job(job_id: str) -> Optional[Dict[str, Any]]:
    row = fetch_one(
        """
        SELECT
            job_id,
            site,
            status,
            operator_userid,
            queue_task_id,
            error_message,
            result_json,
            created_at,
            updated_at,
            started_at,
            finished_at
        FROM fact_export_daily_job
        WHERE job_id = %s
        LIMIT 1
        """,
        (job_id,),
    )
    if not row:
        return None

    parsed_result: Optional[Dict[str, Any]] = None
    raw_result = row.get("result_json")
    if isinstance(raw_result, str) and raw_result.strip():
        try:
            loaded = json.loads(raw_result)
            if isinstance(loaded, dict):
                parsed_result = loaded
        except json.JSONDecodeError:
            parsed_result = None

    return {
        "job_id": row.get("job_id"),
        "site": row.get("site"),
        "status": row.get("status"),
        "operator_userid": row.get("operator_userid"),
        "queue_task_id": row.get("queue_task_id"),
        "error_message": row.get("error_message"),
        "result": parsed_result,
        "created_at": _serialize_datetime(row.get("created_at")),
        "updated_at": _serialize_datetime(row.get("updated_at")),
        "started_at": _serialize_datetime(row.get("started_at")),
        "finished_at": _serialize_datetime(row.get("finished_at")),
    }
