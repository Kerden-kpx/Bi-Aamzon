from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..db import execute, fetch_all, fetch_one

TABLE = "dim_bi_amazon_product_category"


def list_categories() -> List[Dict[str, Any]]:
    sql = f"SELECT id, level1, level2, level3, level4, sort_order FROM {TABLE} ORDER BY sort_order ASC, id ASC"
    return fetch_all(sql, ())


def category_exists(level1: str, level2: str, level3: str, level4: str, exclude_id: Optional[int] = None) -> bool:
    if exclude_id is not None:
        row = fetch_one(
            f"SELECT 1 FROM {TABLE} WHERE level1=%s AND level2=%s AND level3=%s AND level4=%s AND id<>%s LIMIT 1",
            (level1, level2, level3, level4, exclude_id),
        )
    else:
        row = fetch_one(
            f"SELECT 1 FROM {TABLE} WHERE level1=%s AND level2=%s AND level3=%s AND level4=%s LIMIT 1",
            (level1, level2, level3, level4),
        )
    return row is not None


def create_category(level1: str, level2: str, level3: str, level4: str, sort_order: int = 0) -> int:
    """Returns the new row id."""
    sql = f"INSERT INTO {TABLE} (level1, level2, level3, level4, sort_order) VALUES (%s, %s, %s, %s, %s)"
    execute(sql, (level1, level2, level3, level4, sort_order))
    row = fetch_one(
        f"SELECT id FROM {TABLE} WHERE level1=%s AND level2=%s AND level3=%s AND level4=%s LIMIT 1",
        (level1, level2, level3, level4),
    )
    return int(row["id"]) if row else -1


def delete_category(category_id: int) -> int:
    """Returns affected row count."""
    sql = f"DELETE FROM {TABLE} WHERE id=%s"
    execute(sql, (category_id,))
    # fetch_one after delete won't help; use a workaround: check non-existence
    row = fetch_one(f"SELECT id FROM {TABLE} WHERE id=%s LIMIT 1", (category_id,))
    return 0 if row else 1
