from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from ..db import execute, execute_many, fetch_all, fetch_one, get_connection

BSR_ITEM_SELECT_COLUMNS_FULL = """
                b.asin,
                b.site,
                m.yida_asin,
                CASE
                    WHEN m.yida_asin IS NULL OR TRIM(m.yida_asin) = '' THEN 0
                    ELSE 1
                END AS is_mapped,
                b.parent_asin,
                b.title,
                b.image_url,
                b.product_url,
                b.brand,
                b.category,
                b.price,
                b.list_price,
                (
                    SELECT t.coupon_price
                    FROM fact_bi_amazon_product_day t
                    WHERE t.site COLLATE utf8mb4_unicode_ci = b.site
                      AND t.asin COLLATE utf8mb4_unicode_ci = b.asin
                    ORDER BY ABS(DATEDIFF(t.date, b.createtime)) ASC, t.date DESC
                    LIMIT 1
                ) AS coupon_price,
                (
                    SELECT t.coupon_discount
                    FROM fact_bi_amazon_product_day t
                    WHERE t.site COLLATE utf8mb4_unicode_ci = b.site
                      AND t.asin COLLATE utf8mb4_unicode_ci = b.asin
                    ORDER BY ABS(DATEDIFF(t.date, b.createtime)) ASC, t.date DESC
                    LIMIT 1
                ) AS coupon_discount,
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
                b.is_limited_time_deal,
                b.tags,
                b.type,
                b.createtime,
                prev.bsr_rank AS prev_bsr_rank,
                CASE
                    WHEN prev.bsr_rank IS NOT NULL
                     AND prev.bsr_rank > 0
                     AND b.bsr_rank IS NOT NULL
                     AND b.bsr_rank > 0
                    THEN prev.bsr_rank - b.bsr_rank
                    ELSE NULL
                END AS rank_change
"""

BSR_ITEM_SELECT_COLUMNS_COMPACT = """
                b.asin,
                b.site,
                m.yida_asin,
                CASE
                    WHEN m.yida_asin IS NULL OR TRIM(m.yida_asin) = '' THEN 0
                    ELSE 1
                END AS is_mapped,
                b.parent_asin,
                b.title,
                b.image_url,
                b.product_url,
                b.brand,
                b.category,
                b.price,
                b.list_price,
                b.score,
                b.comment_count,
                b.bsr_rank,
                b.category_rank,
                b.variation_count,
                b.launch_date,
                b.sales_volume,
                b.sales,
                b.is_limited_time_deal,
                b.tags,
                b.type,
                b.createtime,
                prev.bsr_rank AS prev_bsr_rank,
                CASE
                    WHEN prev.bsr_rank IS NOT NULL
                     AND prev.bsr_rank > 0
                     AND b.bsr_rank IS NOT NULL
                     AND b.bsr_rank > 0
                    THEN prev.bsr_rank - b.bsr_rank
                    ELSE NULL
                END AS rank_change
"""


def bsr_mapping_join(role: str, userid: str, site: str) -> Tuple[str, List[Any]]:
    if role == "admin":
        return (
            """
            LEFT JOIN (
                SELECT
                    competitor_asin,
                    site,
                    GROUP_CONCAT(DISTINCT yida_asin ORDER BY yida_asin SEPARATOR ',') AS yida_asin
                FROM dim_bi_amazon_mapping
                WHERE site = %s
                GROUP BY competitor_asin, site
            ) m ON m.competitor_asin = b.asin
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
                GROUP_CONCAT(DISTINCT yida_asin ORDER BY yida_asin SEPARATOR ',') AS yida_asin
            FROM dim_bi_amazon_mapping
            WHERE owner_userid = %s AND site = %s
            GROUP BY competitor_asin, site
        ) m ON m.competitor_asin = b.asin
           AND m.site = b.site
        """,
        [userid, site],
    )


def resolve_bsr_createtime(asin: str, site: str, createtime: Optional[date]) -> Optional[date]:
    if createtime:
        return createtime
    row = fetch_one(
        "SELECT MAX(createtime) AS createtime FROM dim_bi_amazon_item WHERE asin = %s AND site = %s",
        (asin, site),
    )
    value = row.get("createtime") if row else None
    return value if isinstance(value, date) else None


def fetch_bsr_items(
    site: str,
    createtime: Optional[date],
    compare_date: Optional[date],
    limit: int,
    offset: int,
    role: str,
    userid: str,
    brand_filters: Optional[List[str]] = None,
    rating_filters: Optional[List[str]] = None,
    tag_filters: Optional[List[str]] = None,
    category: Optional[str] = None,
    price_min: Optional[float] = None,
    price_max: Optional[float] = None,
    compact: bool = False,
) -> List[Dict[str, Any]]:
    join_sql, join_params = bsr_mapping_join(role, userid, site)
    select_columns = BSR_ITEM_SELECT_COLUMNS_COMPACT if compact else BSR_ITEM_SELECT_COLUMNS_FULL
    compare_join_sql = """
        LEFT JOIN dim_bi_amazon_item prev
          ON prev.site = b.site
         AND prev.asin = b.asin
         AND prev.createtime = %s
    """
    normalized_brands = [str(value).strip() for value in (brand_filters or []) if str(value).strip()]
    normalized_ratings = [str(value).strip() for value in (rating_filters or []) if str(value).strip()]
    normalized_tags = [str(value).strip() for value in (tag_filters or []) if str(value).strip()]
    normalized_category = str(category or "").strip() or None

    filters = [
        "b.site = %s",
        "b.bsr_rank IS NOT NULL",
        "b.bsr_rank > 0",
        "b.bsr_rank <= 100",
    ]
    filter_params: List[Any] = [site]

    if createtime:
        filters.append("b.createtime = %s")
        filter_params.append(createtime)
    if normalized_brands:
        brand_placeholders = ", ".join(["%s"] * len(normalized_brands))
        filters.append(f"b.brand IN ({brand_placeholders})")
        filter_params.extend(normalized_brands)
    if normalized_category:
        filters.append("b.category = %s")
        filter_params.append(normalized_category)
    if price_min is not None:
        filters.append("b.price >= %s")
        filter_params.append(price_min)
    if price_max is not None:
        filters.append("b.price <= %s")
        filter_params.append(price_max)
    if normalized_ratings:
        min_rating = min(
            float(str(value).replace("+", "").strip())
            for value in normalized_ratings
            if str(value).replace("+", "").strip()
        )
        filters.append("COALESCE(b.score, 0) >= %s")
        filter_params.append(min_rating)
    if normalized_tags:
        tag_conditions = ["FIND_IN_SET(%s, REPLACE(COALESCE(b.tags, ''), ', ', ',')) > 0" for _ in normalized_tags]
        filters.append(f"({' OR '.join(tag_conditions)})")
        filter_params.extend(normalized_tags)

    where_clause = " AND ".join(filters)
    if createtime:
        sql = f"""
            SELECT
{select_columns}
            FROM dim_bi_amazon_item b
            {join_sql}
            {compare_join_sql}
            WHERE {where_clause}
            ORDER BY b.bsr_rank ASC
            LIMIT %s OFFSET %s
        """
        params = [*join_params, compare_date, *filter_params, limit, offset]
    else:
        sql = f"""
            SELECT
{select_columns}
            FROM dim_bi_amazon_item b
            {join_sql}
            {compare_join_sql}
            JOIN (
                SELECT MAX(createtime) AS latest_createtime
                FROM dim_bi_amazon_item
                WHERE site = %s
            ) latest ON b.createtime = latest.latest_createtime
            WHERE {where_clause}
            ORDER BY b.bsr_rank ASC
            LIMIT %s OFFSET %s
        """
        params = [*join_params, compare_date, site, *filter_params, limit, offset]

    return fetch_all(sql, params)


def fetch_bsr_overview_brand_stats(
    site: str,
    createtime: Optional[date],
    category: Optional[str] = None,
) -> List[Dict[str, Any]]:
    filters = [
        "site = %s",
        "bsr_rank IS NOT NULL",
        "bsr_rank > 0",
        "bsr_rank <= 100",
    ]
    params: List[Any] = [site]
    if createtime:
        filters.append("createtime = %s")
        params.append(createtime)
    else:
        filters.append(
            "createtime = (SELECT MAX(t.createtime) FROM dim_bi_amazon_item t WHERE t.site = %s)"
        )
        params.append(site)
    if category:
        filters.append("category = %s")
        params.append(category)

    where_clause = " AND ".join(filters)
    sql = f"""
        SELECT
            COALESCE(NULLIF(TRIM(brand), ''), 'Unknown') AS brand,
            COUNT(*) AS count,
            SUM(COALESCE(sales, 0)) AS sales,
            SUM(COALESCE(sales_volume, 0)) AS sales_volume
        FROM dim_bi_amazon_item
        WHERE {where_clause}
        GROUP BY COALESCE(NULLIF(TRIM(brand), ''), 'Unknown')
        ORDER BY count DESC, sales DESC, brand ASC
    """
    return fetch_all(sql, params)


def fetch_bsr_overview_category_options(site: str, createtime: Optional[date]) -> List[Dict[str, Any]]:
    filters = [
        "site = %s",
        "bsr_rank IS NOT NULL",
        "bsr_rank > 0",
        "bsr_rank <= 100",
        "category IS NOT NULL",
        "TRIM(category) <> ''",
        "COALESCE(CAST(type AS CHAR), '0') <> '1'",
    ]
    params: List[Any] = [site]
    if createtime:
        filters.append("createtime = %s")
        params.append(createtime)
    else:
        filters.append(
            "createtime = (SELECT MAX(t.createtime) FROM dim_bi_amazon_item t WHERE t.site = %s)"
        )
        params.append(site)

    where_clause = " AND ".join(filters)
    sql = f"""
        SELECT DISTINCT category
        FROM dim_bi_amazon_item
        WHERE {where_clause}
        ORDER BY category ASC
    """
    return fetch_all(sql, params)


def fetch_bsr_ranks_for_date(site: str, createtime: date, asins: List[str]) -> List[Dict[str, Any]]:
    normalized_asins = [str(val or "").strip().upper() for val in asins if str(val or "").strip()]
    if not normalized_asins:
        return []
    placeholders = ", ".join(["%s"] * len(normalized_asins))
    sql = f"""
        SELECT
            asin,
            bsr_rank
        FROM dim_bi_amazon_item
        WHERE site = %s
          AND createtime = %s
          AND asin IN ({placeholders})
    """
    return fetch_all(sql, (site, createtime, *normalized_asins))


def fetch_bsr_lookup_row(
    asin: str,
    site: str,
    createtime: Optional[date],
    role: str,
    userid: str,
    brand: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    join_sql, join_params = bsr_mapping_join(role, userid, site)
    prev_join_sql = """
        LEFT JOIN dim_bi_amazon_item prev
          ON prev.site = b.site
         AND prev.asin = b.asin
         AND prev.createtime = (
             SELECT MAX(p.createtime)
             FROM dim_bi_amazon_item p
             WHERE p.site = b.site
               AND p.asin = b.asin
               AND p.createtime < b.createtime
         )
    """
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
{BSR_ITEM_SELECT_COLUMNS_FULL}
        FROM dim_bi_amazon_item b
        {join_sql}
        {prev_join_sql}
        WHERE {where_clause}
        ORDER BY b.createtime DESC
        LIMIT 1
    """

    return fetch_one(sql, params)


def fetch_bsr_dates(site: str, limit: int, offset: int) -> List[Dict[str, Any]]:
    sql = """
        SELECT DISTINCT createtime
        FROM dim_bi_amazon_item
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
        FROM dim_bi_amazon_item b
        JOIN (
            SELECT MAX(createtime) AS latest_createtime
            FROM dim_bi_amazon_item
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
    normalized_rows: List[Tuple[Any, ...]] = []
    for row in rows:
        if len(row) == 17:
            normalized_rows.append((*row[:9], None, *row[9:]))
            continue
        if len(row) != 18:
            raise ValueError(f"fact_bi_amazon_product_day row length expected 17/18, got {len(row)}")
        normalized_rows.append(row)
    sql = """
        INSERT INTO fact_bi_amazon_product_day (
            site,
            asin,
            date,
            buybox_price,
            price,
            prime_price,
            coupon_price,
            coupon_discount,
            child_sales,
            sales_volume,
            fba_price,
            fbm_price,
            strikethrough_price,
            bsr_rank,
            bsr_reciprocating_saw_blades,
            rating,
            rating_count,
            seller_count
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        ON DUPLICATE KEY UPDATE
            buybox_price = VALUES(buybox_price),
            price = VALUES(price),
            prime_price = VALUES(prime_price),
            coupon_price = VALUES(coupon_price),
            coupon_discount = VALUES(coupon_discount),
            child_sales = VALUES(child_sales),
            sales_volume = VALUES(sales_volume),
            fba_price = VALUES(fba_price),
            fbm_price = VALUES(fbm_price),
            strikethrough_price = VALUES(strikethrough_price),
            bsr_rank = VALUES(bsr_rank),
            bsr_reciprocating_saw_blades = VALUES(bsr_reciprocating_saw_blades),
            rating = VALUES(rating),
            rating_count = VALUES(rating_count),
            seller_count = VALUES(seller_count)
    """
    execute_many(sql, normalized_rows)
    return len(normalized_rows)


def delete_bsr_items_for_today(site: str) -> None:
    execute("DELETE FROM dim_bi_amazon_item WHERE site = %s AND createtime = CURDATE()", (site,))


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
                    FROM dim_bi_amazon_mapping
                    WHERE competitor_asin = %s AND owner_userid = %s AND site = %s
                    LIMIT 1
                    """,
                    (asin, userid, target_site),
                )
                if cursor.fetchone() is None:
                    return 0, False

            cursor.execute(
                """
                UPDATE dim_bi_amazon_item
                SET tags = %s
                WHERE asin = %s AND site = %s AND createtime = %s
                """,
                (tag_string, asin, target_site, target_date),
            )
            affected = cursor.rowcount
            exists = True
            if affected == 0:
                cursor.execute(
                    "SELECT 1 FROM dim_bi_amazon_item WHERE asin = %s AND site = %s AND createtime = %s LIMIT 1",
                    (asin, target_site, target_date),
                )
                exists = cursor.fetchone() is not None
        conn.commit()
    return affected, exists


def update_bsr_mapping(
    asin: str,
    requested_asins: List[str],
    target_site: str,
    userid: str,
) -> None:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT yida_asin
                FROM dim_bi_amazon_mapping
                WHERE competitor_asin = %s AND owner_userid = %s AND site = %s
                """,
                (asin, userid, target_site),
            )
            rows = cursor.fetchall()
            existing_asins = {row.get("yida_asin") for row in rows if row.get("yida_asin")}

            to_delete = existing_asins - set(requested_asins)
            to_insert = [val for val in requested_asins if val not in existing_asins]

            if to_delete:
                placeholders = ", ".join(["%s"] * len(to_delete))
                cursor.execute(
                    f"""
                    DELETE FROM dim_bi_amazon_mapping
                    WHERE competitor_asin = %s AND owner_userid = %s AND site = %s
                      AND yida_asin IN ({placeholders})
                    """,
                    (asin, userid, target_site, *to_delete),
                )

            if to_insert:
                cursor.executemany(
                    """
                    INSERT INTO dim_bi_amazon_mapping (
                        competitor_asin, yida_asin, owner_userid, site
                    ) VALUES (%s, %s, %s, %s)
                    """,
                    [(asin, val, userid, target_site) for val in to_insert],
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
        FROM fact_bi_amazon_product_month
        WHERE {where_clause}
        ORDER BY month ASC
    """
    return fetch_all(sql, params)


def fetch_bsr_monthly_batch(asins: List[str], site: str, is_child: Optional[int] = None) -> List[Dict[str, Any]]:
    normalized_asins = [str(value or "").strip().upper() for value in asins if str(value or "").strip()]
    if not normalized_asins:
        return []
    placeholders = ", ".join(["%s"] * len(normalized_asins))
    filters = [f"asin IN ({placeholders})", "site = %s"]
    params: List[Any] = [*normalized_asins, site]
    if is_child is not None:
        filters.append("is_child = %s")
        params.append(is_child)
    where_clause = " AND ".join(filters)
    sql = f"""
        SELECT
            asin,
            month,
            sales_volume,
            sales,
            is_child,
            price
        FROM fact_bi_amazon_product_month
        WHERE {where_clause}
        ORDER BY asin ASC, month ASC
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
            sales_volume,
            fba_price,
            fbm_price,
            strikethrough_price,
            bsr_rank,
            bsr_reciprocating_saw_blades,
            rating,
            rating_count,
            seller_count
        FROM fact_bi_amazon_product_day
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
            t.sales_volume,
            t.fba_price,
            t.fbm_price,
            t.strikethrough_price,
            t.bsr_rank,
            t.bsr_reciprocating_saw_blades,
            t.rating,
            t.rating_count,
            t.seller_count
        FROM fact_bi_amazon_product_day t
        JOIN (
            SELECT MAX(date) AS latest_date
            FROM fact_bi_amazon_product_day
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
        INSERT INTO dim_bi_amazon_item (
            asin,
            parent_asin,
            title,
            image_url,
            product_url,
            brand,
            category,
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
            %s, %s, %s, %s, %s, %s, %s
        )
        ON DUPLICATE KEY UPDATE
            parent_asin = COALESCE(VALUES(parent_asin), parent_asin),
            title = COALESCE(VALUES(title), title),
            image_url = COALESCE(VALUES(image_url), image_url),
            product_url = COALESCE(VALUES(product_url), product_url),
            brand = COALESCE(VALUES(brand), brand),
            category = COALESCE(VALUES(category), category),
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
            payload.get("category"),
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
