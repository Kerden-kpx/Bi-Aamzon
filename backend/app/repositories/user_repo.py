from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from ..core.logging import logger
from ..db import execute, fetch_all, fetch_one, get_connection


def fetch_users(
    limit: int,
    offset: int,
    role: Optional[str],
    status: Optional[str],
    keyword: Optional[str],
    visible_userids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    sql = """
        SELECT
            u.dingtalk_userid,
            u.dingtalk_username,
            u.role,
            u.status,
            u.product_scope,
            u.created_at,
            l.last_active_at
        FROM dim_bi_amazon_user u
        LEFT JOIN (
            SELECT operator_userid, MAX(created_at) AS last_active_at
            FROM dim_bi_amazon_log
            GROUP BY operator_userid
        ) l
        ON l.operator_userid = u.dingtalk_userid
        WHERE 1=1
    """
    params: List[Any] = []
    if role:
        sql += " AND u.role = %s"
        params.append(role)
    if status:
        sql += " AND u.status = %s"
        params.append(status)
    if keyword:
        sql += " AND (u.dingtalk_username LIKE %s OR u.dingtalk_userid LIKE %s)"
        like = f"%{keyword}%"
        params.extend([like, like])
    if visible_userids is not None:
        if not visible_userids:
            sql += " AND 1 = 0"
        else:
            placeholders = ",".join(["%s"] * len(visible_userids))
            sql += f" AND u.dingtalk_userid IN ({placeholders})"
            params.extend(visible_userids)
    sql += " ORDER BY u.created_at DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    return fetch_all(sql, params)


def fetch_user_by_userid(userid: str) -> Optional[Dict[str, Any]]:
    return fetch_one(
        """
        SELECT dingtalk_userid, dingtalk_username, role, status, product_scope, created_at
        FROM dim_bi_amazon_user
        WHERE dingtalk_userid = %s
        LIMIT 1
        """,
        (userid,),
    )


def insert_user(
    userid: str,
    username: str,
    avatar_url: Optional[str],
    role: str,
    status: str,
    product_scope: str,
) -> None:
    sql = """
        INSERT INTO dim_bi_amazon_user (dingtalk_userid, dingtalk_username, avatar_url, role, status, product_scope)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    execute(sql, (userid, username, avatar_url, role, status, product_scope))


def update_user(userid: str, role: Optional[str], status: Optional[str]) -> int:
    fields = []
    params: List[Any] = []
    if role:
        fields.append("role = %s")
        params.append(role)
    if status:
        fields.append("status = %s")
        params.append(status)
    if not fields:
        return 0

    sql = f"UPDATE dim_bi_amazon_user SET {', '.join(fields)} WHERE dingtalk_userid = %s"
    params.append(userid)
    return execute(sql, params)


def delete_user(userid: str) -> int:
    return execute("DELETE FROM dim_bi_amazon_user WHERE dingtalk_userid = %s", (userid,))


def fetch_user_product_visibility(userid: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT dingtalk_userid, role, COALESCE(product_scope, 'all') AS product_scope
                FROM dim_bi_amazon_user
                WHERE dingtalk_userid = %s
                LIMIT 1
                """,
                (userid,),
            )
            user_row = cursor.fetchone()
            if not user_row:
                return None
            cursor.execute(
                """
                SELECT asin, site
                FROM dim_bi_amazon_permissions
                WHERE operator_userid = %s
                ORDER BY site ASC, asin ASC
                """,
                (userid,),
            )
            permission_rows = cursor.fetchall()
    return {
        "dingtalk_userid": user_row.get("dingtalk_userid"),
        "role": user_row.get("role"),
        "product_scope": user_row.get("product_scope") or "all",
        "permissions": [
            {
                "asin": str(row.get("asin") or "").strip(),
                "site": str(row.get("site") or "US").strip().upper() or "US",
            }
            for row in permission_rows
            if str(row.get("asin") or "").strip()
        ],
    }


def replace_user_product_visibility(
    userid: str,
    product_scope: str,
    permission_pairs: List[tuple[str, str]],
    created_by: str,
) -> bool:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM dim_bi_amazon_user WHERE dingtalk_userid = %s LIMIT 1", (userid,))
            if cursor.fetchone() is None:
                return False

            cursor.execute(
                "UPDATE dim_bi_amazon_user SET product_scope = %s WHERE dingtalk_userid = %s",
                (product_scope, userid),
            )
            cursor.execute("DELETE FROM dim_bi_amazon_permissions WHERE operator_userid = %s", (userid,))
            if permission_pairs:
                cursor.executemany(
                    """
                    INSERT INTO dim_bi_amazon_permissions (operator_userid, asin, site, created_by)
                    VALUES (%s, %s, %s, %s)
                    """,
                    [(userid, asin, site, created_by) for asin, site in permission_pairs],
                )
        conn.commit()
    return True


def query_audit_logs(
    limit: int,
    offset: int,
    module: Optional[str],
    action: Optional[str],
    userid: Optional[str],
    keyword: Optional[str],
    date_from: Optional[Any],
    date_to: Optional[Any],
) -> List[Dict[str, Any]]:
    sql = """
        SELECT
            id,
            module,
            action,
            target_id,
            operator_userid,
            operator_name,
            detail,
            created_at
        FROM dim_bi_amazon_log
        WHERE 1=1
    """
    params: List[Any] = []
    if module:
        sql += " AND module = %s"
        params.append(module)
    if action:
        sql += " AND action = %s"
        params.append(action)
    if userid:
        sql += " AND operator_userid = %s"
        params.append(userid)
    if keyword:
        like = f"%{keyword}%"
        sql += " AND (operator_name LIKE %s OR target_id LIKE %s OR detail LIKE %s)"
        params.extend([like, like, like])
    if date_from:
        sql += " AND created_at >= %s"
        params.append(date_from)
    if date_to:
        sql += " AND created_at < DATE_ADD(%s, INTERVAL 1 DAY)"
        params.append(date_to)

    sql += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    return fetch_all(sql, params)


def insert_audit_log(
    module: str,
    action: str,
    target_id: Optional[str],
    operator_userid: Optional[str],
    operator_name: Optional[str],
    detail: Optional[str],
) -> None:
    try:
        execute(
            """
            INSERT INTO dim_bi_amazon_log (
                module, action, target_id,
                operator_userid, operator_name,
                detail, created_at
            ) VALUES (
                %s, %s, %s,
                %s, %s,
                %s, %s
            )
            """,
            (
                module,
                action,
                target_id,
                operator_userid,
                operator_name,
                detail,
                datetime.now(),
            ),
        )
    except Exception as exc:
        logger.warning(
            "audit_log_insert_failed code=AUDIT_LOG_INSERT_FAILED module=%s action=%s target_id=%s operator_userid=%s err=%s",
            module,
            action,
            target_id,
            operator_userid,
            exc,
        )


def lookup_user_name(userid: str) -> Optional[str]:
    if not userid:
        return None
    row = fetch_one(
        "SELECT dingtalk_username FROM dim_bi_amazon_user WHERE dingtalk_userid = %s LIMIT 1",
        (userid,),
    )
    if not row:
        return None
    return row.get("dingtalk_username")


def fetch_permission_stats_aggregates() -> Dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    COUNT(*) AS total_visits,
                    COUNT(DISTINCT CASE WHEN DATE(created_at) = CURDATE() THEN operator_userid END) AS active_today,
                    COUNT(DISTINCT CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN operator_userid END) AS active_week,
                    SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) THEN 1 ELSE 0 END) AS visits_30d
                FROM dim_bi_amazon_log
                WHERE action = 'visit'
                """
            )
            summary_row = cursor.fetchone() or {}

            cursor.execute(
                """
                SELECT DATE(created_at) AS date_key, COUNT(*) AS count
                FROM dim_bi_amazon_log
                WHERE action = 'visit' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
                GROUP BY DATE(created_at)
                """
            )
            weekly_rows = cursor.fetchall()

            cursor.execute(
                """
                SELECT DATE(created_at) AS date_key, COUNT(*) AS count
                FROM dim_bi_amazon_log
                WHERE action = 'visit' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                GROUP BY DATE(created_at)
                """
            )
            monthly_rows = cursor.fetchall()

            cursor.execute(
                """
                SELECT COALESCE(NULLIF(module, ''), 'unknown') AS module, COUNT(*) AS count
                FROM dim_bi_amazon_log
                WHERE action = 'visit' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
                GROUP BY COALESCE(NULLIF(module, ''), 'unknown')
                """
            )
            module_rows = cursor.fetchall()

            cursor.execute(
                """
                SELECT
                    u.dingtalk_userid AS userid,
                    u.dingtalk_username AS username,
                    SUM(CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END) AS total_visits,
                    SUM(CASE WHEN l.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN 1 ELSE 0 END) AS visits_7d,
                    SUM(CASE WHEN l.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) THEN 1 ELSE 0 END) AS visits_30d
                FROM dim_bi_amazon_user u
                LEFT JOIN dim_bi_amazon_log l
                    ON l.operator_userid = u.dingtalk_userid
                    AND l.action = 'visit'
                GROUP BY u.dingtalk_userid, u.dingtalk_username
                ORDER BY visits_30d DESC, total_visits DESC, u.dingtalk_username ASC
                """
            )
            usage_rows = cursor.fetchall()

    return {
        "summary": summary_row,
        "weekly_rows": weekly_rows,
        "monthly_rows": monthly_rows,
        "module_rows": module_rows,
        "usage_rows": usage_rows,
    }
