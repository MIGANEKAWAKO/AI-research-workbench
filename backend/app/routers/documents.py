"""文献导入与管理 API。

导入流程：multipart 上传 → 校验 → 流式写盘（{lit_id}_{清洗原名}.pdf）→
元数据补全（失败 title 占位）→ 重复检测（DOI/arXiv 精确匹配）→
建索引（失败降级）→ literature.json 原子写。
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime
from pathlib import Path

import anyio
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .. import indexer, kb, metadata
from ..literature import (
    LiteratureEntry,
    add_entry,
    get_entry,
    load_literature,
    remove_entry,
    update_entry,
)
from ..vault import default_vault_path

logger = logging.getLogger("documents")

router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
FILE_NAME_MAX_LEN = 100  # 清洗后原名最长字符（Windows 255 限制内留余量）

VALID_STATUSES = ("未读", "在读", "已读")


class ProgressUpdate(BaseModel):
    """阅读进度更新：status / lastPage 均可选，至少提供一个（两者都空由路由拒绝）。"""

    status: str | None = None
    lastPage: int | None = None


class AuthorName(BaseModel):
    """作者姓名（对齐前端 [{given, family}] 结构）。"""

    given: str = ""
    family: str = ""


class DocumentUpdate(BaseModel):
    """文献元数据编辑（P2）：全部字段可选，None/缺失 = 不修改。

    可编辑字段：title/authors/year/venue/volume/issue/pages/doi/arxivId/tags/collectionIds。
    内部字段（id/pdfPath/status/lastPage/progressAt/importedAt）不可编辑。
    注意 year 本身可为 null（年份未知）——"清空年份"用显式 null，
    通过 model_fields_set 区分"未提供"与"显式 null"。
    """

    title: str | None = None
    authors: list[AuthorName] | None = None
    year: int | None = None
    venue: str | None = None
    volume: str | None = None
    issue: str | None = None
    pages: str | None = None
    doi: str | None = None
    arxivId: str | None = None
    tags: list[str] | None = None
    collectionIds: list[str] | None = None


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
    #    显式 identifier（DOI/arXiv）优先；未提供时自动从 PDF 首页文本提取 DOI
    identifier = doi.strip() or arxivId.strip()
    pages = None  # 抽取结果缓存：补全与索引共用，避免大 PDF 抽两次
    if not identifier:
        try:
            pages = await anyio.to_thread.run_sync(kb.extract_pdf_pages, pdf_abs)
            auto_doi = metadata.extract_doi("\n".join(pages[:2]))
            if auto_doi:
                identifier = auto_doi
                logger.info("自动提取 DOI: %s", auto_doi)
        except Exception as exc:
            logger.warning("DOI 自动提取失败（已降级，title 将用文件名占位）: %r", exc)

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

    # 5. 建索引（embedding 失败降级，不阻断导入）；复用补全阶段已抽取的 pages
    try:
        if pages is None:
            pages = await anyio.to_thread.run_sync(kb.extract_pdf_pages, pdf_abs)
        chunks = await anyio.to_thread.run_sync(
            kb.upsert_document, "paper", lit_id, entry.title, pages
        )
        # T2 修复：索引成功后同步 index_state（避免 status 误报 unindexed）
        try:
            indexer.mark_paper_indexed(pdf_rel, lit_id, chunks)
        except Exception as exc:
            logger.warning("index_state 同步失败（不影响导入）: %r", exc)
    except Exception as exc:
        logger.warning("文献索引失败（已降级）: %r", exc)

    # 6. 入库（原子写）
    add_entry(entry)
    return entry.model_dump()


@router.get("")
def list_documents():
    """文献列表，按导入时间倒序。"""
    entries = load_literature()
    entries.sort(key=lambda e: e.importedAt, reverse=True)
    return {"entries": [entry.model_dump() for entry in entries]}


@router.put("/{lit_id}/progress")
def update_progress(lit_id: str, req: ProgressUpdate):
    """更新阅读状态与进度（A3）：校验 → 原地更新 → literature.json 原子写。

    status 未变 / lastPage 未变时跳过写盘（幂等，返回当前条目）。
    """
    entry = get_entry(lit_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="文献不存在")

    if req.status is None and req.lastPage is None:
        raise HTTPException(status_code=400, detail="status 或 lastPage 至少提供一个")

    changed = False
    if req.status is not None:
        if req.status not in VALID_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"无效状态: {req.status}（可选 {'/'.join(VALID_STATUSES)}）",
            )
        if entry.status != req.status:
            entry.status = req.status
            changed = True
    if req.lastPage is not None:
        if req.lastPage < 0:
            raise HTTPException(status_code=400, detail="lastPage 不能为负数")
        if entry.lastPage != req.lastPage:
            entry.lastPage = req.lastPage
            changed = True

    if not changed:
        return entry.model_dump()

    entry.progressAt = datetime.now().isoformat(timespec="seconds")
    update_entry(entry)
    return entry.model_dump()


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
        logger.warning("索引清理失败（已降级）: %r", exc)

    # 2.5 T2 修复：同步移除 index_state 记录（避免 kb/status 虚高）
    try:
        indexer.unmark_paper_indexed(entry.pdfPath)
    except Exception as exc:
        logger.warning("index_state 清理失败（已降级）: %r", exc)

    # 3. json 移除
    remove_entry(lit_id)
    return {"ok": True}


@router.put("/{lit_id}")
def update_document(lit_id: str, req: DocumentUpdate):
    """更新文献元数据（P2 编辑 + 集合归属）→ literature.json 原子写。

    全部字段可选：model_fields_set 区分"未提供"与"显式 null"（year 显式 null = 清空）。
    校验：title/venue/volume/issue/pages/doi/arxivId strip + 限长；year 合理区间；
    tags 去空去重；collectionIds 过滤非字符串。未变时幂等不写盘。
    """
    entry = get_entry(lit_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="文献不存在")

    fields = req.model_fields_set
    changed = False

    def set_str(field: str, value: str | None, max_len: int = 500) -> None:
        nonlocal changed
        cleaned = (value or "").strip()
        if len(cleaned) > max_len:
            raise HTTPException(status_code=400, detail=f"{field} 过长（最多 {max_len} 字）")
        if getattr(entry, field) != cleaned:
            setattr(entry, field, cleaned)
            changed = True

    if "title" in fields:
        set_str("title", req.title, max_len=300)
    if "venue" in fields:
        set_str("venue", req.venue)
    if "volume" in fields:
        set_str("volume", req.volume, max_len=50)
    if "issue" in fields:
        set_str("issue", req.issue, max_len=50)
    if "pages" in fields:
        set_str("pages", req.pages, max_len=100)
    if "doi" in fields:
        set_str("doi", req.doi, max_len=200)
    if "arxivId" in fields:
        set_str("arxivId", req.arxivId, max_len=100)

    if "year" in fields:
        if req.year is not None and not (1000 <= req.year <= 2100):
            raise HTTPException(status_code=400, detail="年份无效（1000-2100）")
        if entry.year != req.year:
            entry.year = req.year
            changed = True

    if "authors" in fields:
        cleaned_authors = [{"given": a.given.strip(), "family": a.family.strip()} for a in (req.authors or [])]
        if entry.authors != cleaned_authors:
            entry.authors = cleaned_authors
            changed = True

    if "tags" in fields:
        cleaned_tags = [t.strip() for t in (req.tags or []) if t.strip()]
        # 去重保序
        seen: set[str] = set()
        unique_tags = [t for t in cleaned_tags if not (t in seen or seen.add(t))]
        if entry.tags != unique_tags:
            entry.tags = unique_tags
            changed = True

    if "collectionIds" in fields:
        cleaned = [c for c in (req.collectionIds or []) if isinstance(c, str)]
        if entry.collectionIds != cleaned:
            entry.collectionIds = cleaned
            changed = True

    if changed:
        update_entry(entry)
    return entry.model_dump()
