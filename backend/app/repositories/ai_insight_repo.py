from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from ..db import execute, fetch_all, fetch_one


def insert_job(
    job_id: str,
    asin: str,
    site: str,
    operator_userid: str,
) -> None:
    sql = """
        INSERT INTO fact_ai_insight (
            job_id,
            asin,
            site,
            status,
            operator_userid,
            created_at
        ) VALUES (%s, %s, %s, 'pending', %s, NOW())
    """
    execute(sql, (job_id, asin, site, operator_userid))


def _set_job_status(job_id: str, status: str, report_text: Optional[str] = None) -> None:
    if report_text is None:
        execute(
            """
            UPDATE fact_ai_insight
            SET status = %s
            WHERE job_id = %s
            """,
            (status, job_id),
        )
        return
    execute(
        """
        UPDATE fact_ai_insight
        SET status = %s,
            report_text = %s
        WHERE job_id = %s
        """,
        (status, report_text, job_id),
    )


def mark_job_running(job_id: str) -> None:
    _set_job_status(job_id, "running")


def mark_job_failed(job_id: str) -> None:
    _set_job_status(job_id, "failed")


def mark_job_success(job_id: str, report_text: str) -> None:
    _set_job_status(job_id, "success", report_text)


def fetch_job(job_id: str) -> Optional[Dict[str, Any]]:
    sql = """
        SELECT
            job_id,
            asin,
            site,
            status,
            operator_userid,
            created_at,
            report_text
        FROM fact_ai_insight
        WHERE job_id = %s
        LIMIT 1
    """
    return fetch_one(sql, (job_id,))


def fetch_jobs(
    limit: int,
    offset: int,
    asin: Optional[str],
    site: Optional[str],
    status: Optional[str],
    role: str,
    userid: str,
) -> List[Dict[str, Any]]:
    filters: List[str] = []
    params: List[Any] = []
    if role != "admin":
        filters.append("j.operator_userid = %s")
        params.append(userid)
    if asin:
        filters.append("j.asin = %s")
        params.append(asin)
    if site:
        filters.append("j.site = %s")
        params.append(site)
    if status:
        filters.append("j.status = %s")
        params.append(status)
    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    sql = f"""
        SELECT
            j.job_id,
            j.asin,
            j.site,
            j.status,
            j.operator_userid,
            j.created_at,
            j.report_text
        FROM fact_ai_insight j
        {where_clause}
        ORDER BY j.created_at DESC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])
    return fetch_all(sql, params)


def serialize_datetime(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    return None
