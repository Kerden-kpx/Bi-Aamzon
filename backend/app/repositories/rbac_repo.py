from __future__ import annotations

from typing import Any, Dict, List, Set

from ..db import fetch_all, fetch_one, get_connection


def _safe_fetch_all(sql: str, params: tuple[Any, ...] = ()) -> List[Dict[str, Any]]:
    try:
        return fetch_all(sql, params)
    except Exception:
        return []


def get_user_roles(userid: str) -> Set[str]:
    if not userid:
        return set()
    rows = _safe_fetch_all(
        """
        SELECT ur.role_code
        FROM rel_bi_amazon_user_role ur
        INNER JOIN dim_bi_amazon_role r ON r.role_code = ur.role_code
        WHERE ur.dingtalk_userid = %s
          AND (r.status IS NULL OR r.status = 'active')
        """,
        (userid,),
    )
    roles = {str(row.get("role_code") or "").strip().lower() for row in rows}
    return {role for role in roles if role}


def has_scope_rule(userid: str, resource: str, action: str, scope_type: str) -> bool:
    if not userid:
        return False
    row = None
    try:
        row = fetch_one(
            """
            SELECT 1
            FROM rel_bi_amazon_user_role ur
            INNER JOIN dim_bi_amazon_role_rule rr ON rr.role_code = ur.role_code
            INNER JOIN dim_bi_amazon_role r ON r.role_code = ur.role_code
            WHERE ur.dingtalk_userid = %s
              AND rr.resource = %s
              AND rr.action = %s
              AND rr.scope_type = %s
              AND rr.effect = 'allow'
              AND (r.status IS NULL OR r.status = 'active')
            LIMIT 1
            """,
            (userid, resource, action, scope_type),
        )
    except Exception:
        row = None
    return row is not None


def list_lead_team_names(userid: str) -> List[str]:
    rows = _safe_fetch_all(
        """
        SELECT DISTINCT tm.team_name
        FROM rel_bi_amazon_team_member tm
        WHERE tm.dingtalk_userid = %s
          AND tm.member_role = 'lead'
          AND tm.status = 'active'
        """,
        (userid,),
    )
    return [str(row.get("team_name") or "").strip() for row in rows if str(row.get("team_name") or "").strip()]


def list_lead_team_member_userids(userid: str) -> List[str]:
    team_names = list_lead_team_names(userid)
    if not team_names:
        return [userid] if userid else []

    placeholders = ",".join(["%s"] * len(team_names))
    sql = f"""
        SELECT DISTINCT tm2.dingtalk_userid
        FROM rel_bi_amazon_team_member tm2
        WHERE tm2.team_name IN ({placeholders})
          AND tm2.status = 'active'
    """
    rows = _safe_fetch_all(sql, tuple(team_names))
    members = [str(row.get("dingtalk_userid") or "").strip() for row in rows if str(row.get("dingtalk_userid") or "").strip()]
    if userid and userid not in members:
        members.append(userid)
    return members


def replace_user_roles(userid: str, role_codes: List[str]) -> bool:
    normalized = []
    seen: Set[str] = set()
    for role_code in role_codes:
        role = str(role_code or "").strip().lower()
        if not role or role in seen:
            continue
        seen.add(role)
        normalized.append(role)

    if not userid or not normalized:
        return False

    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM rel_bi_amazon_user_role WHERE dingtalk_userid = %s", (userid,))
                cursor.executemany(
                    """
                    INSERT INTO rel_bi_amazon_user_role (dingtalk_userid, role_code)
                    VALUES (%s, %s)
                    """,
                    [(userid, role) for role in normalized],
                )
            conn.commit()
        return True
    except Exception:
        return False


def fetch_team_members(team_names: List[str] | None = None) -> List[Dict[str, Any]]:
    sql = """
        SELECT
            tm.team_name,
            tm.dingtalk_userid,
            COALESCE(u.dingtalk_username, tm.dingtalk_userid) AS dingtalk_username,
            tm.member_role,
            tm.status
        FROM rel_bi_amazon_team_member tm
        LEFT JOIN dim_bi_amazon_user u
          ON u.dingtalk_userid = tm.dingtalk_userid
        WHERE tm.status = 'active'
    """
    params: List[Any] = []
    if team_names is not None:
        if not team_names:
            return []
        placeholders = ",".join(["%s"] * len(team_names))
        sql += f" AND tm.team_name IN ({placeholders})"
        params.extend(team_names)
    sql += " ORDER BY tm.team_name ASC, CASE WHEN tm.member_role = 'lead' THEN 0 ELSE 1 END, dingtalk_username ASC"
    return _safe_fetch_all(sql, tuple(params))


def team_exists(team_name: str) -> bool:
    row = fetch_one(
        """
        SELECT 1
        FROM rel_bi_amazon_team_member
        WHERE team_name = %s
          AND status = 'active'
        LIMIT 1
        """,
        (team_name,),
    )
    return row is not None


def user_exists(userid: str) -> bool:
    row = fetch_one(
        """
        SELECT 1
        FROM dim_bi_amazon_user
        WHERE dingtalk_userid = %s
        LIMIT 1
        """,
        (userid,),
    )
    return row is not None


def insert_team_members(team_name: str, lead_userid: str, member_userids: List[str]) -> None:
    normalized_team_name = str(team_name or "").strip()
    normalized_lead_userid = str(lead_userid or "").strip()
    unique_members: List[str] = []
    seen: Set[str] = set()
    for userid in [normalized_lead_userid, *member_userids]:
        value = str(userid or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        unique_members.append(value)

    if not normalized_team_name or not normalized_lead_userid or not unique_members:
        return

    with get_connection() as conn:
        with conn.cursor() as cursor:
            rows = []
            for userid in unique_members:
                member_role = "lead" if userid == normalized_lead_userid else "member"
                rows.append((normalized_team_name, userid, member_role, "active"))
            cursor.executemany(
                """
                INSERT INTO rel_bi_amazon_team_member (team_name, dingtalk_userid, member_role, status)
                VALUES (%s, %s, %s, %s)
                """,
                rows,
            )
        conn.commit()


def replace_team_members(
    team_name: str,
    lead_userid: str,
    member_userids: List[str],
    new_team_name: str | None = None,
) -> None:
    normalized_team_name = str(team_name or "").strip()
    normalized_new_team_name = str(new_team_name or normalized_team_name).strip()
    normalized_lead_userid = str(lead_userid or "").strip()
    if not normalized_team_name or not normalized_new_team_name or not normalized_lead_userid:
        return

    unique_members: List[str] = []
    seen_members: Set[str] = set()
    for userid in [normalized_lead_userid, *member_userids]:
        value = str(userid or "").strip()
        if not value or value in seen_members:
            continue
        seen_members.add(value)
        unique_members.append(value)
    if normalized_lead_userid not in seen_members:
        unique_members.insert(0, normalized_lead_userid)

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM rel_bi_amazon_team_member WHERE team_name = %s",
                (normalized_team_name,),
            )

            member_rows = []
            for userid in unique_members:
                member_role = "lead" if userid == normalized_lead_userid else "member"
                member_rows.append((normalized_new_team_name, userid, member_role, "active"))
            if member_rows:
                cursor.executemany(
                    """
                    INSERT INTO rel_bi_amazon_team_member (team_name, dingtalk_userid, member_role, status)
                    VALUES (%s, %s, %s, %s)
                    """,
                    member_rows,
                )
        conn.commit()


def delete_team(team_name: str) -> int:
    normalized_team_name = str(team_name or "").strip()
    if not normalized_team_name:
        return 0
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "DELETE FROM rel_bi_amazon_team_member WHERE team_name = %s",
                (normalized_team_name,),
            )
            affected = int(cursor.rowcount or 0)
        conn.commit()
    return affected
