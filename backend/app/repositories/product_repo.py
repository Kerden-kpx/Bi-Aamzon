from __future__ import annotations

from typing import Any, Dict, List

from ..db import execute, fetch_all, fetch_one, get_connection
from . import bsr_repo

INSERT_PRODUCT_SQL = """
    INSERT INTO dim_bsr_product (
        asin, site, sku, brand, product,
        application_tags, tooth_pattern_tags, material_tags,
        spec_length, spec_quantity, spec_other,
        position_tags, status, created_at, updated_at, creator_userid
    ) VALUES (
        %s, %s, %s, %s, %s,
        %s, %s, %s,
        %s, %s, %s,
        %s, %s, COALESCE(%s, CURDATE()), COALESCE(%s, CURDATE()), %s
    )
"""

UPDATE_PRODUCT_SQL = """
    UPDATE dim_bsr_product
    SET
        sku = %s,
        brand = %s,
        product = %s,
        application_tags = %s,
        tooth_pattern_tags = %s,
        material_tags = %s,
        spec_length = %s,
        spec_quantity = %s,
        spec_other = %s,
        position_tags = %s,
        status = %s,
        updated_at = COALESCE(%s, CURDATE())
    WHERE asin = %s
      AND site = %s
"""


def fetch_products(site: str, limit: int, offset: int, role: str, userid: str, product_scope: str) -> List[Dict[str, Any]]:
    sql = """
        SELECT
            p.asin,
            p.site,
            p.sku,
            p.brand,
            p.product,
            p.application_tags,
            p.tooth_pattern_tags,
            p.material_tags,
            p.spec_length,
            p.spec_quantity,
            p.spec_other,
            p.position_tags,
            p.status,
            p.created_at,
            p.updated_at,
            p.creator_userid,
            b.parent_asin AS bsr_parent_asin,
            b.brand AS bsr_brand,
            b.title AS bsr_title,
            b.image_url AS bsr_image_url,
            b.product_url AS bsr_product_url,
            b.price AS bsr_price,
            b.list_price AS bsr_list_price,
            b.score AS bsr_score,
            b.comment_count AS bsr_comment_count,
            b.bsr_rank AS bsr_rank,
            b.category_rank AS bsr_category_rank,
            b.variation_count AS bsr_variation_count,
            b.launch_date AS bsr_launch_date,
            b.conversion_rate AS bsr_conversion_rate,
            b.conversion_rate_period AS bsr_conversion_rate_period,
            b.organic_traffic_count AS bsr_organic_traffic_count,
            b.ad_traffic_count AS bsr_ad_traffic_count,
            b.organic_search_terms AS bsr_organic_search_terms,
            b.ad_search_terms AS bsr_ad_search_terms,
            b.search_recommend_terms AS bsr_search_recommend_terms,
            b.sales_volume AS bsr_sales_volume,
            b.sales AS bsr_sales,
            b.tags AS bsr_tags,
            b.`type` AS bsr_type,
            b.site AS bsr_site,
            b.createtime AS bsr_createtime
        FROM dim_bsr_product p
        LEFT JOIN (
            SELECT
                bi.asin,
                bi.site,
                MAX(bi.createtime) AS max_createtime
            FROM dim_bsr_item bi
            WHERE bi.site = %s
            GROUP BY bi.asin, bi.site
        ) latest
          ON latest.asin = p.asin
         AND latest.site = p.site
        LEFT JOIN dim_bsr_item b
          ON b.asin = latest.asin
         AND b.site = latest.site
         AND b.createtime = latest.max_createtime
        WHERE p.site = %s
    """
    params: List[Any] = [site, site]
    if role != "admin" and product_scope == "restricted":
        sql += """
            AND (
                p.creator_userid = %s
                OR EXISTS (
                    SELECT 1
                    FROM dim_product_visibility v
                    WHERE v.operator_userid = %s
                      AND v.asin = p.asin
                )
            )
        """
        params.extend([userid, userid])
    sql += """
        ORDER BY p.updated_at DESC, p.created_at DESC, p.asin ASC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])

    return fetch_all(sql, params)


def insert_product(params: tuple[Any, ...]) -> None:
    execute(INSERT_PRODUCT_SQL, params)


def insert_product_with_bsr(params: tuple[Any, ...], bsr_payload: Dict[str, Any], asin: str, createtime, site: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(INSERT_PRODUCT_SQL, params)
            bsr_repo.upsert_bsr_from_payload_with_cursor(cursor, asin, bsr_payload, createtime, site)
        conn.commit()


def update_product(params: tuple[Any, ...]) -> int:
    return execute(UPDATE_PRODUCT_SQL, params)


def update_product_with_bsr(params: tuple[Any, ...], bsr_payload: Dict[str, Any], asin: str, site: str, createtime, bsr_site: str) -> int:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(UPDATE_PRODUCT_SQL, params)
            affected = cursor.rowcount
            bsr_repo.upsert_bsr_from_payload_with_cursor(cursor, asin, bsr_payload, createtime, bsr_site)
        conn.commit()
    return affected


def delete_product(asin: str, site: str) -> int:
    return execute("DELETE FROM dim_bsr_product WHERE asin = %s AND site = %s", (asin, site))


def product_exists(asin: str, site: str) -> bool:
    return fetch_one("SELECT 1 FROM dim_bsr_product WHERE asin = %s AND site = %s", (asin, site)) is not None


def restricted_user_can_access_product(asin: str, site: str, userid: str) -> bool:
    sql = """
        SELECT 1
        FROM dim_bsr_product p
        WHERE p.asin = %s
          AND p.site = %s
          AND (
            p.creator_userid = %s
            OR EXISTS (
                SELECT 1
                FROM dim_product_visibility v
                WHERE v.operator_userid = %s
                  AND v.asin = p.asin
            )
          )
        LIMIT 1
    """
    return fetch_one(sql, (asin, site, userid, userid)) is not None
