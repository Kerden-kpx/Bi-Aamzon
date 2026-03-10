from __future__ import annotations

from typing import Any, Dict, Optional

from ..db import execute, fetch_one


def fetch_strategy_todo_sync(strategy_id: str) -> Optional[Dict[str, Any]]:
    return fetch_one(
        """
        SELECT
            dingtalk_task_id AS strategy_id,
            owner_userid,
            owner_unionid AS owner_unionid,
            dingtalk_task_id AS todo_task_id
        FROM dim_bi_amazon_todo
        WHERE dingtalk_task_id = %s
        LIMIT 1
        """,
        (strategy_id,),
    )


def upsert_strategy_todo_sync(
    strategy_id: str,
    owner_userid: str,
    owner_unionid: Optional[str],
    todo_task_id: Optional[str],
    todo_source_id: str,
    sync_status: str,
) -> None:
    _ = todo_source_id
    _ = sync_status
    execute(
        """
        UPDATE dim_bi_amazon_todo
        SET
            owner_userid = COALESCE(%s, owner_userid),
            owner_unionid = COALESCE(%s, owner_unionid),
            dingtalk_task_id = COALESCE(%s, dingtalk_task_id)
        WHERE dingtalk_task_id = %s
        """,
        (
            owner_userid,
            owner_unionid,
            todo_task_id,
            strategy_id,
        ),
    )


def delete_strategy_todo_sync(strategy_id: str) -> None:
    execute(
        """
        UPDATE dim_bi_amazon_todo
        SET
            owner_unionid = NULL
        WHERE dingtalk_task_id = %s
        """,
        (strategy_id,),
    )
