from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from ..db import execute, execute_insert, fetch_all, fetch_one


def fetch_strategies(
    limit: int,
    offset: int,
    owner: Optional[str],
    brand: Optional[str],
    priority: Optional[str],
    state: Optional[str],
    competitor_asin: Optional[str],
    yida_asin: Optional[str],
    visible_userids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    sql = """
        SELECT
            s.dingtalk_task_id AS id,
            s.competitor_asin,
            s.yida_asin,
            s.created_at,
            s.title,
            s.detail,
            s.userid,
            s.owner_name,
            s.owner_userid,
            s.participant_userids,
            s.participant_names,
            s.review_date,
            s.deadline_time,
            s.reminder_time,
            s.priority,
            s.state,
            p.brand AS brand
        FROM dim_bi_amazon_todo s
        LEFT JOIN (
            SELECT asin, MAX(brand) AS brand
            FROM dim_bi_amazon_product
            GROUP BY asin
        ) p ON p.asin = s.yida_asin
        WHERE 1=1
    """
    params: List[Any] = []
    if owner:
        sql += " AND s.owner_name = %s"
        params.append(owner)
    if brand:
        sql += " AND p.brand = %s"
        params.append(brand)
    if priority:
        sql += " AND s.priority = %s"
        params.append(priority)
    if state:
        sql += " AND s.state = %s"
        params.append(state)
    if competitor_asin:
        sql += " AND s.competitor_asin = %s"
        params.append(competitor_asin)
    if yida_asin:
        sql += " AND s.yida_asin = %s"
        params.append(yida_asin)
    if visible_userids is not None:
        if not visible_userids:
            sql += " AND 1 = 0"
        else:
            placeholders = ",".join(["%s"] * len(visible_userids))
            sql += f" AND COALESCE(NULLIF(s.owner_userid, ''), s.userid) IN ({placeholders})"
            params.extend(visible_userids)

    sql += " ORDER BY s.created_at DESC, s.dingtalk_task_id DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    return fetch_all(sql, params)


def fetch_strategy_detail(strategy_id: str, visible_userids: Optional[List[str]]) -> Optional[Dict[str, Any]]:
    sql = """
        SELECT
            s.dingtalk_task_id AS id,
            s.competitor_asin,
            s.yida_asin,
            s.created_at,
            s.title,
            s.detail,
            s.userid,
            s.owner_name,
            s.owner_userid,
            s.participant_userids,
            s.participant_names,
            s.review_date,
            s.deadline_time,
            s.reminder_time,
            s.priority,
            s.state,
            p.brand AS brand
        FROM dim_bi_amazon_todo s
        LEFT JOIN (
            SELECT asin, MAX(brand) AS brand
            FROM dim_bi_amazon_product
            GROUP BY asin
        ) p ON p.asin = s.yida_asin
        WHERE s.dingtalk_task_id = %s
        LIMIT 1
    """
    params: List[Any] = [strategy_id]
    if visible_userids is not None:
        if not visible_userids:
            return None
        placeholders = ",".join(["%s"] * len(visible_userids))
        sql = sql.replace(
            "WHERE s.dingtalk_task_id = %s",
            f"WHERE s.dingtalk_task_id = %s AND COALESCE(NULLIF(s.owner_userid, ''), s.userid) IN ({placeholders})",
        )
        params.extend(visible_userids)

    return fetch_one(sql, params)


def fetch_strategy_permission_row(strategy_id: str) -> Optional[Dict[str, Any]]:
    return fetch_one(
        """
        SELECT
            dingtalk_task_id AS id,
            userid,
            owner_userid,
            owner_name,
            participant_userids,
            participant_names,
            deadline_time,
            reminder_time
        FROM dim_bi_amazon_todo
        WHERE dingtalk_task_id = %s
        LIMIT 1
        """,
        (strategy_id,),
    )


def insert_strategy(params: Tuple[Any, ...]) -> str:
    local_task_id = f"local_{uuid4().hex}"
    sql = """
        INSERT INTO dim_bi_amazon_todo (
            site, competitor_asin, yida_asin, userid,
            title, detail, owner_userid, owner_name, participant_userids, participant_names, review_date,
            deadline_time, reminder_time,
            priority, state, dingtalk_task_id, created_at, updated_by
        ) VALUES (
            %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s,
            %s, %s,
            %s, COALESCE(%s, '待开始'), %s, COALESCE(%s, CURDATE()), %s
        )
    """
    (
        competitor_asin,
        yida_asin,
        created_at,
        title,
        detail,
        userid,
        owner_name,
        owner_userid,
        participant_userids,
        participant_names,
        review_date,
        deadline_time,
        reminder_time,
        priority,
        state,
        updated_by,
    ) = params
    execute_insert(
        sql,
        (
            "US",
            competitor_asin,
            yida_asin,
            userid,
            title,
            detail,
            owner_userid,
            owner_name,
            participant_userids,
            participant_names,
            review_date,
            deadline_time,
            reminder_time,
            priority,
            state,
            local_task_id,
            created_at,
            updated_by,
        ),
    )
    return local_task_id


def update_strategy_state(strategy_id: str, state: str, updated_by: str) -> int:
    return execute(
        "UPDATE dim_bi_amazon_todo SET state = %s, updated_by = %s WHERE dingtalk_task_id = %s",
        (state, updated_by, strategy_id),
    )


def update_strategy(params: Tuple[Any, ...]) -> int:
    sql = """
        UPDATE dim_bi_amazon_todo
        SET
            yida_asin = %s,
            title = %s,
            detail = %s,
            owner_name = %s,
            owner_userid = %s,
            participant_userids = %s,
            participant_names = %s,
            review_date = %s,
            deadline_time = %s,
            reminder_time = %s,
            priority = %s,
            state = %s,
            updated_by = %s
        WHERE dingtalk_task_id = %s
    """
    return execute(sql, params)


def delete_strategy(strategy_id: str) -> int:
    return execute("DELETE FROM dim_bi_amazon_todo WHERE dingtalk_task_id = %s", (strategy_id,))
