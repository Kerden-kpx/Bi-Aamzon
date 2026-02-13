from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from ..db import execute, execute_many, fetch_all, fetch_one, get_connection

BSR_ITEM_SELECT_COLUMNS = """
                b.asin,
                b.site,
                m.yida_asin,
                b.parent_asin,
                b.title,
                b.image_url,
                b.product_url,
                b.brand,
                b.price,
                b.list_price,
                b.score,
                b.comment_count,
                b.bsr_rank,
                b.category_rank,
                b.variation_count,
                b.launch_date,
                b.conversion_rate,
                b.conversion_rate_period,
                b.organic_traffic_count,
                b.ad_traffic_count,
                b.organic_search_terms,
                b.ad_search_terms,
                b.search_recommend_terms,
                b.sales_volume,
                b.sales,
                b.tags,
                b.type,
                b.createtime
"""


def bsr_mapping_join(role: str, userid: str, site: str) -> Tuple[str, List[Any]]:
    if role == "admin":
        return (
            """
            LEFT JOIN (
                SELECT
                    competitor_asin,
                    site,
                    createtime,
                    GROUP_CONCAT(DISTINCT yida_asin ORDER BY yida_asin SEPARATOR ',') AS yida_asin
                FROM dim_bsr_mapping
                WHERE site = %s
                GROUP BY competitor_asin, site, createtime
            ) m ON m.competitor_asin = b.asin
               AND m.createtime = b.createtime
               AND m.site = b.site
            """,
            [site],
        )
    return (
        """
        LEFT JOIN (
            SELECT
                competitor_asin,
                site,
                createtime,
                GROUP_CONCAT(DISTINCT yida_asin ORDER BY yida_asin SEPARATOR ',') AS yida_asin
            FROM dim_bsr_mapping
            WHERE owner_userid = %s AND site = %s
            GROUP BY competitor_asin, site, createtime
        ) m ON m.competitor_asin = b.asin
           AND m.createtime = b.createtime
           AND m.site = b.site
        """,
        [userid, site],
    )


def resolve_bsr_createtime(asin: str, site: str, createtime: Optional[date]) -> Optional[date]:
    if createtime:
        return createtime
    row = fetch_one(
        "SELECT MAX(createtime) AS createtime FROM dim_bsr_item WHERE asin = %s AND site = %s",
        (asin, site),
    )
    value = row.get("createtime") if row else None
    return value if isinstance(value, date) else None


def fetch_bsr_items(
    site: str,
    createtime: Optional[date],
    limit: int,
    offset: int,
    role: str,
    userid: str,
) -> List[Dict[str, Any]]:
    join_sql, join_params = bsr_mapping_join(role, userid, site)
    if createtime:
        sql = f"""
            SELECT
{BSR_ITEM_SELECT_COLUMNS}
            FROM dim_bsr_item b
            {join_sql}
            WHERE b.site = %s
              AND b.createtime = %s
            ORDER BY b.bsr_rank ASC
            LIMIT %s OFFSET %s
        """
        params = [*join_params, site, createtime, limit, offset]
    else:
        sql = f"""
            SELECT
{BSR_ITEM_SELECT_COLUMNS}
            FROM dim_bsr_item b
            {join_sql}
            JOIN (
                SELECT MAX(createtime) AS latest_createtime
                FROM dim_bsr_item
                WHERE site = %s
            ) latest ON b.createtime = latest.latest_createtime
            WHERE b.site = %s
            ORDER BY b.bsr_rank ASC
            LIMIT %s OFFSET %s
        """
        params = [*join_params, site, site, limit, offset]

    return fetch_all(sql, params)


def fetch_bsr_lookup_row(
    asin: str,
    site: str,
    createtime: Optional[date],
    role: str,
    userid: str,
    brand: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    join_sql, join_params = bsr_mapping_join(role, userid, site)
    filters = ["b.site = %s", "b.asin = %s"]
    params: List[Any] = [*join_params, site, asin]
    if brand:
        filters.append("b.brand = %s")
        params.append(brand)
    if createtime:
        filters.append("b.createtime <= %s")
        params.append(createtime)

    where_clause = " AND ".join(filters)
    sql = f"""
        SELECT
{BSR_ITEM_SELECT_COLUMNS}
        FROM dim_bsr_item b
        {join_sql}
        WHERE {where_clause}
        ORDER BY b.createtime DESC
        LIMIT 1
    """

    return fetch_one(sql, params)


def fetch_bsr_dates(site: str, limit: int, offset: int) -> List[Dict[str, Any]]:
    sql = """
        SELECT DISTINCT createtime
        FROM dim_bsr_item
        WHERE site = %s
          AND createtime IS NOT NULL
        ORDER BY createtime DESC
        LIMIT %s OFFSET %s
    """
    return fetch_all(sql, (site, limit, offset))


def fetch_latest_bsr_product_urls(site: str, limit: int = 100) -> List[Dict[str, Any]]:
    sql = """
        SELECT
            b.asin,
            b.product_url,
            b.createtime
        FROM dim_bsr_item b
        JOIN (
            SELECT MAX(createtime) AS latest_createtime
            FROM dim_bsr_item
            WHERE site = %s
        ) latest ON b.createtime = latest.latest_createtime
        WHERE b.site = %s
          AND b.product_url IS NOT NULL
          AND TRIM(b.product_url) <> ''
        ORDER BY b.bsr_rank ASC, b.asin ASC
        LIMIT %s
    """
    return fetch_all(sql, (site, site, limit))


def upsert_fact_bsr_daily_rows(
    rows: List[Tuple[Any, ...]]
) -> int:
    if not rows:
        return 0
    sql = """
        INSERT INTO fact_bsr_daily (
            site,
            asin,
            date,
            buybox_price,
            price,
            prime_price,
            coupon_price,
            coupon_discount,
            child_sales,
            fba_price,
            fbm_price,
            strikethrough_price,
            bsr_rank,
            bsr_reciprocating_saw_blades,
            rating,
            rating_count,
            seller_count
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        ON DUPLICATE KEY UPDATE
            buybox_price = VALUES(buybox_price),
            price = VALUES(price),
            prime_price = VALUES(prime_price),
            coupon_price = VALUES(coupon_price),
            coupon_discount = VALUES(coupon_discount),
            child_sales = VALUES(child_sales),
            fba_price = VALUES(fba_price),
            fbm_price = VALUES(fbm_price),
            strikethrough_price = VALUES(strikethrough_price),
            bsr_rank = VALUES(bsr_rank),
            bsr_reciprocating_saw_blades = VALUES(bsr_reciprocating_saw_blades),
            rating = VALUES(rating),
            rating_count = VALUES(rating_count),
            seller_count = VALUES(seller_count)
    """
    execute_many(sql, rows)
    return len(rows)


def delete_bsr_items_for_today(site: str) -> None:
    execute("DELETE FROM dim_bsr_item WHERE site = %s AND createtime = CURDATE()", (site,))


def update_bsr_tags(
    asin: str,
    tag_string: str,
    target_site: str,
    target_date: date,
    role: str,
    userid: str,
) -> Tuple[int, bool]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            if role != "admin":
                cursor.execute(
                    """
                    SELECT 1
                    FROM dim_bsr_mapping
                    WHERE competitor_asin = %s AND createtime = %s AND owner_userid = %s AND site = %s
                    LIMIT 1
                    """,
                    (asin, target_date, userid, target_site),
                )
                if cursor.fetchone() is None:
                    return 0, False

            cursor.execute(
                """
                UPDATE dim_bsr_item
                SET tags = %s
                WHERE asin = %s AND site = %s AND createtime = %s
                """,
                (tag_string, asin, target_site, target_date),
            )
            affected = cursor.rowcount
            exists = True
            if affected == 0:
                cursor.execute(
                    "SELECT 1 FROM dim_bsr_item WHERE asin = %s AND site = %s AND createtime = %s LIMIT 1",
                    (asin, target_site, target_date),
                )
                exists = cursor.fetchone() is not None
        conn.commit()
    return affected, exists


def update_bsr_mapping(
    asin: str,
    requested_asins: List[str],
    target_site: str,
    resolved_date: date,
    userid: str,
) -> None:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT yida_asin
                FROM dim_bsr_mapping
                WHERE competitor_asin = %s AND createtime = %s AND owner_userid = %s AND site = %s
                """,
                (asin, resolved_date, userid, target_site),
            )
            rows = cursor.fetchall()
            existing_asins = {row.get("yida_asin") for row in rows if row.get("yida_asin")}

            to_delete = existing_asins - set(requested_asins)
            to_insert = [val for val in requested_asins if val not in existing_asins]

            if to_delete:
                placeholders = ", ".join(["%s"] * len(to_delete))
                cursor.execute(
                    f"""
                    DELETE FROM dim_bsr_mapping
                    WHERE competitor_asin = %s AND createtime = %s AND owner_userid = %s AND site = %s
                      AND yida_asin IN ({placeholders})
                    """,
                    (asin, resolved_date, userid, target_site, *to_delete),
                )

            if to_insert:
                cursor.executemany(
                    """
                    INSERT INTO dim_bsr_mapping (
                        competitor_asin, yida_asin, owner_userid, site, createtime
                    ) VALUES (%s, %s, %s, %s, %s)
                    """,
                    [(asin, val, userid, target_site, resolved_date) for val in to_insert],
                )
        conn.commit()


def fetch_bsr_monthly(asin: str, site: str, is_child: Optional[int] = None) -> List[Dict[str, Any]]:
    filters = ["asin = %s", "site = %s"]
    params: List[Any] = [asin, site]
    if is_child is not None:
        filters.append("is_child = %s")
        params.append(is_child)
    where_clause = " AND ".join(filters)
    sql = f"""
        SELECT
            month,
            sales_volume,
            sales,
            is_child,
            price
        FROM fact_bsr_monthly
        WHERE {where_clause}
        ORDER BY month ASC
    """
    return fetch_all(sql, params)


def fetch_bsr_daily(asin: str, site: str) -> List[Dict[str, Any]]:
    sql = """
        SELECT
            date,
            buybox_price,
            price,
            prime_price,
            coupon_price,
            coupon_discount,
            child_sales,
            fba_price,
            fbm_price,
            strikethrough_price,
            bsr_rank,
            bsr_reciprocating_saw_blades,
            rating,
            rating_count,
            seller_count
        FROM fact_bsr_daily
        WHERE asin = %s
          AND site = %s
        ORDER BY date ASC
    """
    return fetch_all(sql, (asin, site))


def fetch_bsr_daily_window(asin: str, site: str, range_days: int) -> List[Dict[str, Any]]:
    sql = """
        SELECT
            t.date,
            t.buybox_price,
            t.price,
            t.prime_price,
            t.coupon_price,
            t.coupon_discount,
            t.child_sales,
            t.fba_price,
            t.fbm_price,
            t.strikethrough_price,
            t.bsr_rank,
            t.bsr_reciprocating_saw_blades,
            t.rating,
            t.rating_count,
            t.seller_count
        FROM fact_bsr_daily t
        JOIN (
            SELECT MAX(date) AS latest_date
            FROM fact_bsr_daily
            WHERE asin = %s
              AND site = %s
        ) m ON 1 = 1
        WHERE t.asin = %s
          AND t.site = %s
          AND m.latest_date IS NOT NULL
          AND t.date >= DATE_SUB(m.latest_date, INTERVAL %s DAY)
        ORDER BY t.date ASC
    """
    window_days = max(0, int(range_days) - 1)
    return fetch_all(sql, (asin, site, asin, site, window_days))


def upsert_bsr_from_payload_with_cursor(
    cursor,
    asin: str,
    payload: Dict[str, Any],
    createtime: date,
    site: str,
) -> None:
    sql = """
        INSERT INTO dim_bsr_item (
            asin,
            parent_asin,
            title,
            image_url,
            product_url,
            brand,
            price,
            list_price,
            score,
            comment_count,
            bsr_rank,
            category_rank,
            variation_count,
            launch_date,
            conversion_rate,
            organic_traffic_count,
            ad_traffic_count,
            organic_search_terms,
            ad_search_terms,
            search_recommend_terms,
            sales_volume,
            sales,
            tags,
            type,
            createtime,
            site
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s
        )
        ON DUPLICATE KEY UPDATE
            parent_asin = COALESCE(VALUES(parent_asin), parent_asin),
            title = COALESCE(VALUES(title), title),
            image_url = COALESCE(VALUES(image_url), image_url),
            product_url = COALESCE(VALUES(product_url), product_url),
            brand = COALESCE(VALUES(brand), brand),
            price = COALESCE(VALUES(price), price),
            list_price = COALESCE(VALUES(list_price), list_price),
            score = COALESCE(VALUES(score), score),
            comment_count = COALESCE(VALUES(comment_count), comment_count),
            bsr_rank = COALESCE(VALUES(bsr_rank), bsr_rank),
            category_rank = COALESCE(VALUES(category_rank), category_rank),
            variation_count = COALESCE(VALUES(variation_count), variation_count),
            launch_date = COALESCE(VALUES(launch_date), launch_date),
            conversion_rate = COALESCE(VALUES(conversion_rate), conversion_rate),
            organic_traffic_count = COALESCE(VALUES(organic_traffic_count), organic_traffic_count),
            ad_traffic_count = COALESCE(VALUES(ad_traffic_count), ad_traffic_count),
            organic_search_terms = COALESCE(VALUES(organic_search_terms), organic_search_terms),
            ad_search_terms = COALESCE(VALUES(ad_search_terms), ad_search_terms),
            search_recommend_terms = COALESCE(VALUES(search_recommend_terms), search_recommend_terms),
            sales_volume = COALESCE(VALUES(sales_volume), sales_volume),
            sales = COALESCE(VALUES(sales), sales),
            tags = COALESCE(VALUES(tags), tags),
            type = COALESCE(VALUES(type), type)
    """
    cursor.execute(
        sql,
        (
            asin,
            payload.get("parent_asin"),
            payload.get("title"),
            payload.get("image_url"),
            payload.get("product_url"),
            payload.get("brand"),
            payload.get("price"),
            payload.get("list_price"),
            payload.get("score"),
            payload.get("comment_count"),
            payload.get("bsr_rank"),
            payload.get("category_rank"),
            payload.get("variation_count"),
            payload.get("launch_date"),
            payload.get("conversion_rate"),
            payload.get("organic_traffic_count"),
            payload.get("ad_traffic_count"),
            payload.get("organic_search_terms"),
            payload.get("ad_search_terms"),
            payload.get("search_recommend_terms"),
            payload.get("sales_volume"),
            payload.get("sales"),
            payload.get("tags"),
            payload.get("type"),
            createtime,
            site,
        ),
    )


def upsert_bsr_from_payload(
    asin: str,
    payload: Dict[str, Any],
    createtime: date,
    site: str,
) -> None:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            upsert_bsr_from_payload_with_cursor(cursor, asin, payload, createtime, site)
        conn.commit()
