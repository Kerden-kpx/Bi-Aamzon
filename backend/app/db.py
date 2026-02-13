import os
import threading
from contextlib import contextmanager
from typing import Any, Dict, Iterable, List, Optional, Sequence
from urllib.parse import quote_plus

import pymysql
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from .core.config import get_required_env

load_dotenv()
_ENGINE: Optional[Engine] = None
_ENGINE_LOCK = threading.Lock()


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _build_db_url() -> str:
    user = quote_plus(get_required_env("DB_USER"))
    password = quote_plus(get_required_env("DB_PASSWORD"))
    host = get_required_env("DB_HOST")
    port = _env_int("DB_PORT", 3306)
    database = quote_plus(get_required_env("DB_NAME"))
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"


def _get_engine() -> Engine:
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE

    with _ENGINE_LOCK:
        if _ENGINE is not None:
            return _ENGINE
        _ENGINE = create_engine(
            _build_db_url(),
            pool_size=_env_int("DB_POOL_SIZE", 10),
            max_overflow=_env_int("DB_MAX_OVERFLOW", 20),
            pool_timeout=_env_int("DB_POOL_TIMEOUT", 30),
            pool_recycle=_env_int("DB_POOL_RECYCLE", 1800),
            pool_pre_ping=True,
            connect_args={
                "cursorclass": pymysql.cursors.DictCursor,
            },
        )
    return _ENGINE


def get_db_config() -> dict:
    # Keep this for callers that need connection metadata.
    return {
        "host": get_required_env("DB_HOST"),
        "port": _env_int("DB_PORT", 3306),
        "user": get_required_env("DB_USER"),
        "password": get_required_env("DB_PASSWORD"),
        "database": get_required_env("DB_NAME"),
        "charset": "utf8mb4",
        "cursorclass": pymysql.cursors.DictCursor,
    }


@contextmanager
def get_connection():
    conn = _get_engine().raw_connection()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
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
