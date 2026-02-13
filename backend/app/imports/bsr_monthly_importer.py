import datetime as dt
import re
from typing import Optional

import pandas as pd
import pymysql


def _normalize_month_col(col) -> str:
    if isinstance(col, (pd.Timestamp, dt.date, dt.datetime)):
        return col.strftime("%Y-%m")
    col_str = str(col).strip()
    match = re.match(r"(\d{4}-\d{2})", col_str)
    return match.group(1) if match else col_str


def _extract_month_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    col_map = {c: _normalize_month_col(c) for c in df.columns}
    df = df.rename(columns=col_map)
    month_cols = [c for c in df.columns if re.fullmatch(r"\d{4}-\d{2}", str(c))]
    return df, month_cols


def _to_numeric(series: pd.Series) -> pd.Series:
    cleaned = series.astype(str).str.replace(",", "", regex=False).str.replace(r"[^\d\.-]", "", regex=True)
    return pd.to_numeric(cleaned, errors="coerce")


def _build_long_df(excel_path: str, sheet_name: str, value_col: str) -> pd.DataFrame:
    df = pd.read_excel(excel_path, sheet_name=sheet_name)
    if "ASIN" not in df.columns:
        raise ValueError(f"{sheet_name} 缺少 ASIN 列")

    df, month_cols = _extract_month_columns(df)
    if not month_cols:
        raise ValueError(f"{sheet_name} 未找到 YYYY-MM 格式的日期列")

    df = df[["ASIN"] + month_cols].copy()
    df["ASIN"] = df["ASIN"].astype(str).str.strip()
    df = df[df["ASIN"] != ""]

    long_df = df.melt(id_vars=["ASIN"], value_vars=month_cols, var_name="month", value_name=value_col)
    return long_df


def _try_build_long_df(excel_path: str, sheet_name: str, value_col: str) -> pd.DataFrame:
    try:
        return _build_long_df(excel_path, sheet_name, value_col)
    except ValueError:
        return pd.DataFrame(columns=["ASIN", "month", value_col])


def _debug_df(label: str, df: pd.DataFrame, max_rows: int = 5) -> None:
    print(f"[bsr_monthly] {label}: shape={df.shape}")
    print(f"[bsr_monthly] {label} columns: {list(df.columns)}")
    if not df.empty:
        print(df.head(max_rows))


def import_bsr_monthly(
    excel_path: str,
    site: str,
    connection: Optional[pymysql.connections.Connection] = None,
    debug: bool = False,
) -> pd.DataFrame:
    site_value = (site or "").strip().upper()
    if not site_value:
        raise ValueError("缺少站点信息（site）")
    if connection is None:
        raise ValueError("缺少数据库连接")

    volume_df = _build_long_df(excel_path, "产品历史月销量", "sales_volume")
    sales_df = _build_long_df(excel_path, "历史月销售额", "sales")
    child_volume_df = _try_build_long_df(excel_path, "子体历史月销量", "sales_volume")
    child_sales_df = _try_build_long_df(excel_path, "子体历史月销售额", "sales")
    price_df = _try_build_long_df(excel_path, "历史月价格", "price")
    if debug:
        _debug_df("volume_df_raw", volume_df)
        _debug_df("sales_df_raw", sales_df)
        _debug_df("child_volume_raw", child_volume_df)
        _debug_df("child_sales_raw", child_sales_df)
        _debug_df("price_raw", price_df)

    volume_df["sales_volume"] = _to_numeric(volume_df["sales_volume"]).round(0).astype("Int64")
    sales_df["sales"] = _to_numeric(sales_df["sales"])
    if not child_volume_df.empty:
        child_volume_df["sales_volume"] = _to_numeric(child_volume_df["sales_volume"]).round(0).astype("Int64")
    if not child_sales_df.empty:
        child_sales_df["sales"] = _to_numeric(child_sales_df["sales"])
    if not price_df.empty:
        price_df["price"] = _to_numeric(price_df["price"])

    merged_parent = pd.merge(volume_df, sales_df, on=["ASIN", "month"], how="outer")
    merged_parent = merged_parent.rename(columns={"ASIN": "asin"})
    merged_parent["site"] = site_value
    merged_parent["is_child"] = 0

    merged_child = pd.DataFrame(columns=merged_parent.columns)
    if not child_volume_df.empty or not child_sales_df.empty:
        merged_child = pd.merge(child_volume_df, child_sales_df, on=["ASIN", "month"], how="outer")
        merged_child = merged_child.rename(columns={"ASIN": "asin"})
        merged_child["site"] = site_value
        merged_child["is_child"] = 1
    if debug:
        _debug_df("merged_parent", merged_parent)
        _debug_df("merged_child", merged_child)

    if not price_df.empty:
        price_df = price_df.rename(columns={"ASIN": "asin"})
        price_df = price_df[["asin", "month", "price"]]
        merged_parent = merged_parent.merge(price_df, on=["asin", "month"], how="left")

    merged = pd.concat([merged_parent, merged_child], ignore_index=True)
    merged = merged.sort_values(["site", "asin", "month", "is_child"], ascending=[True, True, True, False])
    merged = merged.drop_duplicates(subset=["site", "asin", "month", "is_child"], keep="last")
    if debug:
        _debug_df("merged_with_price", merged)

    merged = merged[~(merged["sales_volume"].isna() & merged["sales"].isna())]
    merged["sales_volume"] = merged["sales_volume"].where(pd.notna(merged["sales_volume"]), None)
    merged["sales"] = merged["sales"].where(pd.notna(merged["sales"]), None)
    merged["is_child"] = merged["is_child"].where(pd.notna(merged["is_child"]), None)
    if "price" in merged.columns:
        merged["price"] = merged["price"].where(pd.notna(merged["price"]), None)
    merged = merged.astype(object).where(pd.notna(merged), None)
    if debug:
        _debug_df("final_merged", merged)

    columns = ["site", "asin", "month", "sales_volume", "sales", "is_child", "price"]
    sql = """
        INSERT INTO fact_bsr_monthly (site, asin, month, sales_volume, sales, is_child, price)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            sales_volume = VALUES(sales_volume),
            sales = VALUES(sales),
            is_child = VALUES(is_child),
            price = VALUES(price)
    """

    data = [tuple(row) for row in merged[columns].itertuples(index=False, name=None)]

    with connection.cursor() as cursor:
        cursor.executemany(sql, data)
    connection.commit()

    return merged


__all__ = ["import_bsr_monthly"]
