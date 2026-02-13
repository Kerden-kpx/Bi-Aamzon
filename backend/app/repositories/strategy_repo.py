from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

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
    restrict_userid: Optional[str] = None,
) -> List[Dict[str, Any]]:
    sql = """
        SELECT
            s.id,
            s.competitor_asin,
            s.yida_asin,
            s.created_at,
            s.title,
            s.detail,
            s.userid,
            s.owner_name,
            s.owner_userid,
            s.review_date,
            s.priority,
            s.state,
            p.brand AS brand
        FROM dim_bsr_strategy s
        LEFT JOIN (
            SELECT asin, MAX(brand) AS brand
            FROM dim_bsr_product
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
    if restrict_userid:
        sql += " AND (s.owner_userid = %s OR (s.owner_userid IS NULL AND s.userid = %s))"
        params.extend([restrict_userid, restrict_userid])

    sql += " ORDER BY s.created_at DESC, s.id DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    return fetch_all(sql, params)


def fetch_strategy_detail(strategy_id: int, restrict_userid: Optional[str]) -> Optional[Dict[str, Any]]:
    sql = """
        SELECT
            s.id,
            s.competitor_asin,
            s.yida_asin,
            s.created_at,
            s.title,
            s.detail,
            s.userid,
            s.owner_name,
            s.owner_userid,
            s.review_date,
            s.priority,
            s.state,
            p.brand AS brand
        FROM dim_bsr_strategy s
        LEFT JOIN (
            SELECT asin, MAX(brand) AS brand
            FROM dim_bsr_product
            GROUP BY asin
        ) p ON p.asin = s.yida_asin
        WHERE s.id = %s
        LIMIT 1
    """
    params: List[Any] = [strategy_id]
    if restrict_userid:
        sql = sql.replace("WHERE s.id = %s", "WHERE s.id = %s AND (s.owner_userid = %s OR (s.owner_userid IS NULL AND s.userid = %s))")
        params.extend([restrict_userid, restrict_userid])

    return fetch_one(sql, params)


def fetch_strategy_permission_row(strategy_id: int) -> Optional[Dict[str, Any]]:
    return fetch_one(
        "SELECT id, userid, owner_userid, owner_name FROM dim_bsr_strategy WHERE id = %s LIMIT 1",
        (strategy_id,),
    )


def insert_strategy(params: Tuple[Any, ...]) -> int:
    sql = """
        INSERT INTO dim_bsr_strategy (
            competitor_asin, yida_asin, created_at,
            title, detail, userid, owner_name, owner_userid, review_date,
            priority, state, updated_by
        ) VALUES (
            %s, %s, COALESCE(%s, CURDATE()),
            %s, %s, %s, %s, %s, %s,
            %s, COALESCE(%s, '待开始'), %s
        )
    """
    return execute_insert(sql, params)


def update_strategy_state(strategy_id: int, state: str, updated_by: str) -> int:
    return execute(
        "UPDATE dim_bsr_strategy SET state = %s, updated_by = %s WHERE id = %s",
        (state, updated_by, strategy_id),
    )


def update_strategy(params: Tuple[Any, ...]) -> int:
    sql = """
        UPDATE dim_bsr_strategy
        SET
            yida_asin = %s,
            title = %s,
            detail = %s,
            owner_name = %s,
            owner_userid = %s,
            review_date = %s,
            priority = %s,
            state = %s,
            updated_by = %s
        WHERE id = %s
    """
    return execute(sql, params)


def delete_strategy(strategy_id: int) -> int:
    return execute("DELETE FROM dim_bsr_strategy WHERE id = %s", (strategy_id,))
