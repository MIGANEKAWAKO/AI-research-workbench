"""文献导入与管理 API。

导入流程：multipart 上传 → 校验 → 流式写盘（{lit_id}_{清洗原名}.pdf）→
元数据补全（失败 title 占位）→ 重复检测（DOI/arXiv 精确匹配）→
建索引（失败降级）→ literature.json 原子写。
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from pathlib import Path

import anyio
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from .. import kb, metadata
from ..literature import LiteratureEntry, add_entry, get_entry, load_literature, remove_entry
from ..vault import default_vault_path

router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
FILE_NAME_MAX_LEN = 100  # 清洗后原名最长字符（Windows 255 限制内留余量）


def _clean_filename(raw: str) -> str:
    """清洗上传文件名：取 basename、非法字符替换、限长；空则 untitled。"""
    name = Path((raw or "").replace("\\", "/")).name
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name)
    if len(name) > FILE_NAME_MAX_LEN:
        stem, suffix = Path(name).stem, Path(name).suffix
        name = stem[: FILE_NAME_MAX_LEN - len(suffix)] + suffix
    return name or "untitled.pdf"


def _find_duplicate(
    entries: list[LiteratureEntry], doi: str, arxiv_id: str
) -> LiteratureEntry | None:
    """重复检测：DOI 精确匹配（大小写不敏感）/ arXiv ID 精确匹配。"""
    for entry in entries:
        if doi and entry.doi and entry.doi.lower() == doi.lower():
            return entry
        if arxiv_id and entry.arxivId and entry.arxivId == arxiv_id:
            return entry
    return None


@router.post("", status_code=201)
async def import_document(
    file: UploadFile = File(...),
    doi: str = Form(""),
    arxivId: str = Form(""),
):
    """导入 PDF：自动补全元数据 + 建索引 + 入库。"""
    # 1. 校验类型
    filename = file.filename or ""
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")

    # 2. 流式写盘（边读边写，防大文件占内存）；文件名 = ID + 清洗原名（方案 C）
    lit_id = uuid.uuid4().hex[:12]
    saved_name = f"{lit_id}_{_clean_filename(filename)}"
    pdf_rel = f"文献/{saved_name}"
    pdf_abs = default_vault_path() / pdf_rel
    pdf_abs.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    try:
        with pdf_abs.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise HTTPException(status_code=400, detail="文件超过 50MB")
                out.write(chunk)
    except HTTPException:
        pdf_abs.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    # 3. 元数据补全（失败兜底：title 用原名占位，照常入库）
    identifier = doi.strip() or arxivId.strip()
    meta: dict = await metadata.fetch_metadata(identifier) if identifier else {}

    entry = LiteratureEntry(
        id=lit_id,
        title=meta.get("title") or Path(filename).stem or "未命名文献",
        authors=meta.get("authors") or [],
        year=meta.get("year"),
        venue=meta.get("venue") or "",
        volume=meta.get("volume") or "",
        issue=meta.get("issue") or "",
        pages=meta.get("pages") or "",
        doi=meta.get("doi") or doi.strip(),
        arxivId=meta.get("arxivId") or arxivId.strip(),
        pdfPath=pdf_rel,
        status="未读",
        importedAt=datetime.now().isoformat(timespec="seconds"),
    )

    # 4. 重复检测（需要先有元数据才知道 DOI/arXiv）
    duplicate = _find_duplicate(load_literature(), entry.doi, entry.arxivId)
    if duplicate:
        pdf_abs.unlink(missing_ok=True)
        raise HTTPException(status_code=409, detail=f"文献已存在（{duplicate.title}）")

    # 5. 建索引（embedding 失败降级，不阻断导入）
    try:
        pages = await anyio.to_thread.run_sync(kb.extract_pdf_pages, pdf_abs)
        await anyio.to_thread.run_sync(
            kb.upsert_document, "paper", lit_id, entry.title, pages
        )
    except Exception as exc:
        print("文献索引失败（已降级）:", repr(exc))

    # 6. 入库（原子写）
    add_entry(entry)
    return entry.model_dump()


@router.get("")
def list_documents():
    """文献列表，按导入时间倒序。"""
    entries = load_literature()
    entries.sort(key=lambda e: e.importedAt, reverse=True)
    return {"entries": [entry.model_dump() for entry in entries]}


@router.delete("/{lit_id}")
def delete_document(lit_id: str):
    """删除文献：PDF 文件 + 索引 + literature.json 三处同步清理。"""
    entry = get_entry(lit_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="文献不存在")

    # 1. 删 PDF（文件缺失也容忍，继续清理）
    try:
        (default_vault_path() / entry.pdfPath).unlink(missing_ok=True)
    except OSError:
        pass

    # 2. 清索引（失败降级）
    try:
        kb.delete_document(lit_id)
    except Exception as exc:
        print("索引清理失败（已降级）:", repr(exc))

    # 3. json 移除
    remove_entry(lit_id)
    return {"ok": True}
