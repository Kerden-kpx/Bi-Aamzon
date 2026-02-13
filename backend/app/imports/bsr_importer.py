import datetime as dt
from typing import Optional

import pandas as pd
import pymysql


def series_or_default(df: pd.DataFrame, col_name: str, default: str = "") -> pd.Series:
    if col_name in df.columns:
        return df[col_name]
    return pd.Series([default] * len(df))


def series_numeric_or_default(df: pd.DataFrame, col_name: str) -> pd.Series:
    if col_name in df.columns:
        return pd.to_numeric(df[col_name], errors="coerce")
    return pd.Series([None] * len(df))


def series_from_columns(df: pd.DataFrame, col_names: list[str], default: str = "") -> pd.Series:
    for col_name in col_names:
        if col_name in df.columns:
            return df[col_name]
    return pd.Series([default] * len(df))


def series_tags(df: pd.DataFrame, col_names: list[str]) -> pd.Series:
    series = series_from_columns(df, col_names, default="")
    return series.apply(
        lambda x: ",".join([str(item) for item in x]) if isinstance(x, (list, tuple, set)) else x
    )


def derive_type_from_brand(brand_series: pd.Series) -> pd.Series:
    normalized = brand_series.fillna("").astype(str).str.strip().str.upper()
    return normalized.apply(lambda value: 1 if value in {"EZARC", "TOLESA"} else 0)


def _extract_count_from_text(series: pd.Series) -> pd.Series:
    text = series.astype(str)
    count = text.str.extract(r"^\s*(\d+(?:\.\d+)?)")[0]
    return pd.to_numeric(count, errors="coerce")


def _read_csv_paths(csv_paths) -> pd.DataFrame:
    if isinstance(csv_paths, (list, tuple, set)):
        frames = [pd.read_csv(path) for path in csv_paths if path]
        if not frames:
            return pd.DataFrame()
        return pd.concat(frames, ignore_index=True, sort=False)
    return pd.read_csv(csv_paths)


def _read_excel_paths(excel_paths, sheet_name: int) -> pd.DataFrame:
    if isinstance(excel_paths, (list, tuple, set)):
        frames = [pd.read_excel(path, sheet_name=sheet_name) for path in excel_paths if path]
        if not frames:
            return pd.DataFrame()
        return pd.concat(frames, ignore_index=True, sort=False)
    return pd.read_excel(excel_paths, sheet_name=sheet_name)


def count_excel_rows(path) -> int:
    df = pd.read_excel(path, sheet_name=0)
    if "ASIN" in df.columns:
        series = df["ASIN"]
        mask = series.notna() & series.astype(str).str.strip().ne("")
        return int(mask.sum())
    return int(df.dropna(how="all").shape[0])


def count_csv_rows(path) -> int:
    df = pd.read_csv(path)
    if "zg-bdg-text" in df.columns:
        series = df["zg-bdg-text"]
        mask = series.notna() & series.astype(str).str.strip().ne("")
        return int(mask.sum())
    return int(df.dropna(how="all").shape[0])


def _build_temp_df(csv_paths) -> pd.DataFrame:
    temp_df = _read_csv_paths(csv_paths)
    if "zg-bdg-text" in temp_df.columns:
        rank_text = temp_df["zg-bdg-text"].astype(str).str.strip()
        rank_text = rank_text.replace("", pd.NA)
        temp_df = temp_df[rank_text.notna()]
        rank_raw = (
            rank_text.str.replace("#", "", regex=False)
            .str.replace(",", "", regex=False)
            .str.extract(r"(\d+)", expand=False)
        )
        temp_df["bsr_rank"] = pd.to_numeric(rank_raw, errors="coerce")
        temp_df.loc[temp_df["bsr_rank"] <= 0, "bsr_rank"] = None
    if "sc-iMTngq" not in temp_df.columns:
        raise ValueError("明细数据缺少 ASIN 列（sc-iMTngq 不存在）")
    asin_series = (
        temp_df["sc-iMTngq"]
        .where(temp_df["sc-iMTngq"].notna(), pd.NA)
        .astype(str)
        .str.replace(r"^ASIN:\s*", "", regex=True)
        .str.strip()
        .replace({"": pd.NA, "nan": pd.NA, "None": pd.NA})
        .str.upper()
    )
    if asin_series.isna().any():
        raise ValueError("明细数据存在空 ASIN（sc-iMTngq 为空）")
    # 统一用 sc-iMTngq 作为 ASIN 来源
    temp_df["sc-iMTngq"] = asin_series
    temp_df = temp_df[
        [
            col
            for col in [
                "sc-iMTngq",
                "ant-flex",
                "zg-bdg-text",
                "bsr_rank",
                "distributionText",
                "distributionText (3)",
                "exts-color-border-black (2)",
                "exts-color-border-black (3)",
                "exts-color-border-black (4)",
            ]
            if col in temp_df.columns
        ]
    ]

    if "ant-flex" in temp_df.columns:
        ant_flex_str = temp_df["ant-flex"].astype(str)
        extracted = ant_flex_str.str.extract(r"([0-9]+(?:\.[0-9]+)?)%?\s*([^\s]+)?")
        rate_raw = pd.to_numeric(extracted[0], errors="coerce")
        has_percent = ant_flex_str.str.contains("%", na=False)
        temp_df["conversion_rate"] = rate_raw.where(~has_percent, rate_raw / 100)
        temp_df["conversion_rate_period"] = extracted[1].replace("", None)

    if "distributionText" in temp_df.columns:
        temp_df["organic_traffic_count"] = _extract_count_from_text(temp_df["distributionText"])
    if "distributionText (3)" in temp_df.columns:
        temp_df["ad_traffic_count"] = _extract_count_from_text(temp_df["distributionText (3)"])

    return temp_df

def _debug_df(label: str, df: pd.DataFrame, max_rows: int = 5) -> None:
    print(f"[bsr_import] {label}: shape={df.shape}")
    print(f"[bsr_import] {label} columns ({len(df.columns)}):")
    for col in df.columns:
        print(f"  - {col}")
    if not df.empty:
        with pd.option_context("display.max_columns", None, "display.width", 2000, "display.max_colwidth", None):
            print(df.head(max_rows))


def _debug_jimu_columns(temp_df: pd.DataFrame) -> None:
    columns = [col for col in temp_df.columns if col != "bsr_rank"]
    print(f"[bsr_import] jimu columns used ({len(columns)}):")
    for col in columns:
        print(f"  - {col}")


def import_bsr_data(
    bsr_excel_path,
    temp_csv_path,
    connection: pymysql.connections.Connection,
    site: Optional[str] = None,
    debug: bool = False,
    debug_stage: Optional[str] = None,
) -> pd.DataFrame:
    site_value = (site or "").strip().upper()
    if not site_value:
        raise ValueError("缺少站点信息（site）")
    bsr_df = _read_excel_paths(bsr_excel_path, sheet_name=0)
    if "ASIN" in bsr_df.columns:
        bsr_df["ASIN"] = bsr_df["ASIN"].astype(str).str.strip().str.upper()
    temp_df = _build_temp_df(temp_csv_path)
    if debug:
        if debug_stage == "jimu_columns":
            _debug_jimu_columns(temp_df)
        else:
            _debug_df("seller_excel", bsr_df)
            _debug_df("jimu_csv_temp", temp_df)

    def _normalize_asin_series(series: pd.Series) -> pd.Series:
        normalized = series.where(series.notna(), pd.NA).astype(str).str.strip().str.upper()
        return normalized.replace({"": pd.NA, "NAN": pd.NA, "NONE": pd.NA})

    bsr_df["asin_key"] = _normalize_asin_series(bsr_df.get("ASIN", pd.Series([], dtype=object)))
    temp_df["sc_key"] = _normalize_asin_series(temp_df.get("sc-iMTngq", pd.Series([], dtype=object)))

    merged_df = bsr_df.merge(temp_df, left_on="asin_key", right_on="sc_key", how="left")
    if "sc_key" in merged_df.columns:
        merged_df.drop(columns=["sc_key"], inplace=True)
    if "asin_key" in merged_df.columns:
        merged_df.drop(columns=["asin_key"], inplace=True)
    if debug and debug_stage != "jimu_columns":
        _debug_df("merged_df", merged_df)

    insert_df = pd.DataFrame(
        {
            "asin": series_or_default(merged_df, "ASIN"),
            "site": site_value,
            "parent_asin": series_or_default(merged_df, "父ASIN"),
            "title": series_or_default(merged_df, "商品标题"),
            "image_url": series_or_default(merged_df, "商品主图"),
            "product_url": series_or_default(merged_df, "商品详情页链接"),
            "brand": series_or_default(merged_df, "品牌"),
            "price": series_numeric_or_default(merged_df, "价格($)"),
            "list_price": series_numeric_or_default(merged_df, "原价"),
            "score": series_numeric_or_default(merged_df, "评分"),
            "comment_count": series_numeric_or_default(merged_df, "评分数"),
            "bsr_rank": series_numeric_or_default(merged_df, "bsr_rank"),
            "category_rank": series_numeric_or_default(merged_df, "大类BSR"),
            "variation_count": series_numeric_or_default(merged_df, "变体数"),
            "launch_date": series_or_default(merged_df, "上架时间"),
            "conversion_rate": series_numeric_or_default(merged_df, "conversion_rate"),
            "conversion_rate_period": series_or_default(merged_df, "conversion_rate_period"),
            "organic_traffic_count": series_numeric_or_default(merged_df, "organic_traffic_count"),
            "ad_traffic_count": series_numeric_or_default(merged_df, "ad_traffic_count"),
            "sales_volume": series_numeric_or_default(merged_df, "月销量"),
            "sales": series_numeric_or_default(merged_df, "月销售额($)"),
            "organic_search_terms": series_numeric_or_default(merged_df, "exts-color-border-black (2)"),
            "ad_search_terms": series_numeric_or_default(merged_df, "exts-color-border-black (3)"),
            "search_recommend_terms": series_numeric_or_default(merged_df, "exts-color-border-black (4)"),
            "tags": "",
            "type": derive_type_from_brand(series_or_default(merged_df, "品牌")),
        }
    )

    if "上架时间" in merged_df.columns:
        insert_df["launch_date"] = pd.to_datetime(insert_df["launch_date"], errors="coerce").dt.date

    insert_df["createtime"] = dt.date.today().isoformat()
    insert_df = insert_df.astype(object).where(pd.notna(insert_df), None)
    if debug and debug_stage != "jimu_columns":
        null_rank = insert_df["bsr_rank"].isna().sum() if "bsr_rank" in insert_df.columns else "N/A"
        print(f"[bsr_import] insert_df bsr_rank nulls: {null_rank}")
        _debug_df("insert_df", insert_df)

    if "bsr_rank" in insert_df.columns:
        rank_series = pd.to_numeric(insert_df["bsr_rank"], errors="coerce")
        invalid_mask = rank_series.isna() | (rank_series <= 0)
        if invalid_mask.any():
            invalid_count = int(invalid_mask.sum())
            sample_asins = insert_df.loc[invalid_mask, "asin"].astype(str).head(5).tolist()
            sample_text = ", ".join(sample_asins) if sample_asins else "-"
            raise ValueError(f"BSR排名不能为空或为0，受影响ASIN示例: {sample_text}，共{invalid_count}条")

    columns = [
        "asin",
        "site",
        "parent_asin",
        "title",
        "image_url",
        "product_url",
        "brand",
        "price",
        "list_price",
        "score",
        "comment_count",
        "bsr_rank",
        "category_rank",
        "variation_count",
        "launch_date",
        "conversion_rate",
        "conversion_rate_period",
        "organic_traffic_count",
        "ad_traffic_count",
        "sales_volume",
        "sales",
        "organic_search_terms",
        "ad_search_terms",
        "search_recommend_terms",
        "tags",
        "type",
        "createtime",
    ]

    sql = f"""
    INSERT INTO dim_bsr_item ({','.join(columns)})
    VALUES ({','.join(['%s'] * len(columns))})
    ON DUPLICATE KEY UPDATE
    parent_asin=VALUES(parent_asin),
    title=VALUES(title),
    image_url=VALUES(image_url),
    product_url=VALUES(product_url),
    brand=VALUES(brand),
    price=VALUES(price),
    list_price=VALUES(list_price),
    score=VALUES(score),
    comment_count=VALUES(comment_count),
    bsr_rank=VALUES(bsr_rank),
    category_rank=VALUES(category_rank),
    variation_count=VALUES(variation_count),
    launch_date=VALUES(launch_date),
    conversion_rate=VALUES(conversion_rate),
    conversion_rate_period=VALUES(conversion_rate_period),
    organic_traffic_count=VALUES(organic_traffic_count),
    ad_traffic_count=VALUES(ad_traffic_count),
    sales_volume=VALUES(sales_volume),
    sales=VALUES(sales),
    organic_search_terms=VALUES(organic_search_terms),
    ad_search_terms=VALUES(ad_search_terms),
    search_recommend_terms=VALUES(search_recommend_terms),
    tags=VALUES(tags),
    type=VALUES(type)
    """

    data = [tuple(row) for row in insert_df[columns].itertuples(index=False, name=None)]
    with connection.cursor() as cursor:
        cursor.executemany(sql, data)
    connection.commit()

    return insert_df


__all__ = ["import_bsr_data"]
