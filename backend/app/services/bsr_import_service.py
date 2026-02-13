from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional
import shutil
import tempfile
import uuid

from fastapi import HTTPException, UploadFile

from ..core.config import normalize_site
from ..db import get_connection
from ..imports.bsr_importer import import_bsr_data
from ..imports.bsr_monthly_importer import import_bsr_monthly
from ..repositories import bsr_repo


def import_bsr_files(
    seller_file: Optional[UploadFile],
    seller_file_detail: Optional[UploadFile],
    jimu_file: Optional[UploadFile],
    jimu_file_51_100: Optional[UploadFile],
    site: str,
) -> Dict[str, Any]:
    normalized_site = normalize_site(site)
    has_detail = seller_file_detail is not None
    has_bundle = any([seller_file, jimu_file, jimu_file_51_100])
    if not has_detail and not has_bundle:
        raise HTTPException(status_code=400, detail="请上传卖家精灵明细（销量、销售额）或完整的明细数据三件套")
    if has_bundle and not (seller_file and jimu_file and jimu_file_51_100):
        raise HTTPException(
            status_code=400,
            detail="卖家精灵明细 + 极木与西柚#1-50 + 极木与西柚#51-100 必须一起上传",
        )

    tmp_dir = Path(tempfile.mkdtemp(prefix="bsr-import-"))
    try:
        saved: Dict[str, Path] = {}
        for key, upload in (
            ("seller_file", seller_file),
            ("seller_file_detail", seller_file_detail),
            ("jimu_file", jimu_file),
            ("jimu_file_51_100", jimu_file_51_100),
        ):
            if upload is None:
                continue
            filename = upload.filename or ""
            suffix = Path(filename).suffix.lower()
            if not suffix:
                raise HTTPException(status_code=400, detail="文件缺少扩展名")
            target = tmp_dir / f"{uuid.uuid4().hex}{suffix}"
            content = upload.file.read()
            if not content:
                raise HTTPException(status_code=400, detail="上传文件为空")
            target.write_bytes(content)
            saved[key] = target

        seller_excel_path = saved.get("seller_file")
        seller_detail_path = saved.get("seller_file_detail")
        jimu_csv_path = saved.get("jimu_file")
        jimu_csv_next_path = saved.get("jimu_file_51_100")

        if has_bundle:
            if seller_excel_path is None or jimu_csv_path is None or jimu_csv_next_path is None:
                raise HTTPException(status_code=400, detail="明细导入缺少文件")
            if seller_excel_path.suffix.lower() not in {".xls", ".xlsx"}:
                raise HTTPException(status_code=400, detail="卖家精灵文件需为 Excel（.xls/.xlsx）")
            if jimu_csv_path.suffix.lower() != ".csv" or jimu_csv_next_path.suffix.lower() != ".csv":
                raise HTTPException(status_code=400, detail="极木与西柚文件需为 CSV（.csv）")

            from ..imports.bsr_importer import count_excel_rows, count_csv_rows

            seller_count = count_excel_rows(seller_excel_path)
            if seller_count != 100:
                raise HTTPException(
                    status_code=400,
                    detail=f"卖家精灵明细第一张表数据量应为100条，实际为{seller_count}条",
                )
            jimu_count = count_csv_rows(jimu_csv_path)
            if jimu_count != 50:
                raise HTTPException(
                    status_code=400,
                    detail=f"极木与西柚数据#1-50数据量应为50条，实际为{jimu_count}条",
                )
            jimu_next_count = count_csv_rows(jimu_csv_next_path)
            if jimu_next_count != 50:
                raise HTTPException(
                    status_code=400,
                    detail=f"极木与西柚数据#51-100数据量应为50条，实际为{jimu_next_count}条",
                )

        if has_detail:
            if seller_detail_path is None:
                raise HTTPException(status_code=400, detail="卖家精灵明细（销量、销售额）缺少文件")
            if seller_detail_path.suffix.lower() not in {".xls", ".xlsx"}:
                raise HTTPException(status_code=400, detail="卖家精灵明细需为 Excel（.xls/.xlsx）")
            from ..imports.bsr_importer import count_excel_rows

            seller_detail_count = count_excel_rows(seller_detail_path)
            if seller_detail_count != 100:
                raise HTTPException(
                    status_code=400,
                    detail=f"卖家精灵明细（销量、销售额）第一张表数据量应为100条，实际为{seller_detail_count}条",
                )

        insert_df = None
        monthly_df = None
        with get_connection() as conn:
            if has_bundle and seller_excel_path and jimu_csv_path and jimu_csv_next_path:
                bsr_repo.delete_bsr_items_for_today(normalized_site)
                insert_df = import_bsr_data(
                    str(seller_excel_path),
                    [str(jimu_csv_path), str(jimu_csv_next_path)],
                    connection=conn,
                    site=normalized_site,
                )
            if has_detail and seller_detail_path:
                monthly_df = import_bsr_monthly(
                    str(seller_detail_path),
                    connection=conn,
                    site=normalized_site,
                )

        return {
            "rows": len(insert_df) if insert_df is not None else 0,
            "monthly_rows": len(monthly_df) if monthly_df is not None else 0,
        }
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
