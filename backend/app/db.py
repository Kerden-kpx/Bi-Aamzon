import os
from contextlib import contextmanager
from typing import Any, Dict, Iterable, List, Optional, Sequence

import pymysql
from dotenv import load_dotenv

load_dotenv()


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def get_db_config() -> dict:
    return {
        "host": os.getenv("DB_HOST", "121.41.4.126"),
        "port": _env_int("DB_PORT", 15388),
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", "QWERasd2025!"),
        "database": os.getenv("DB_NAME", "bi_amazon"),
        "charset": "utf8mb4",
        "cursorclass": pymysql.cursors.DictCursor,
    }


@contextmanager
def get_connection():
    conn = pymysql.connect(**get_db_config())
    try:
        yield conn
    finally:
        conn.close()


QueryParams = Optional[Sequence[Any]]


def _normalize_params(params: QueryParams) -> Sequence[Any]:
    return params if params is not None else ()


def fetch_all(sql: str, params: QueryParams = None) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, _normalize_params(params))
            return cursor.fetchall()


def fetch_one(sql: str, params: QueryParams = None) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, _normalize_params(params))
            return cursor.fetchone()


def execute(sql: str, params: QueryParams = None) -> int:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, _normalize_params(params))
            affected = cursor.rowcount
        conn.commit()
    return affected


def execute_many(sql: str, param_sets: Iterable[Sequence[Any]]) -> int:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            affected = cursor.executemany(sql, list(param_sets))
        conn.commit()
    return affected


def execute_insert(sql: str, params: QueryParams = None) -> int:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, _normalize_params(params))
            lastrowid = int(cursor.lastrowid)
        conn.commit()
    return lastrowid
