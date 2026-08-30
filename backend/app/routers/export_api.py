"""导出 API：参考文献 docx（GB/T 7714 / APA / IEEE）与 BibTeX。"""

from __future__ import annotations

import anyio
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .. import export
from ..citation_formats import FORMATTERS

router = APIRouter()

DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


class ReferencesRequest(BaseModel):
    format: str = "gbt7714"
    noteId: str | None = None
    collectionId: str | None = None
    collectionIds: list[str] = Field(default_factory=list)
    asFile: bool = True


class BibtexRequest(BaseModel):
    noteId: str | None = None
    collectionId: str | None = None
    collectionIds: list[str] = Field(default_factory=list)
    asFile: bool = True


@router.post("/references")
async def export_references(req: ReferencesRequest):
    """参考文献列表：asFile=true 下载 docx；false 返回 JSON 文本（前端格式预览）。"""
    if req.format not in FORMATTERS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的格式: {req.format}（可选 {', '.join(FORMATTERS)}）",
        )
    entries = await anyio.to_thread.run_sync(
        export.collect_references, req.noteId, req.collectionId, req.collectionIds
    )
    formatter = FORMATTERS[req.format]
    if req.asFile:
        data = await anyio.to_thread.run_sync(
            export.build_references_docx, entries, formatter
        )
        return Response(
            content=data,
            media_type=DOCX_MEDIA_TYPE,
            headers={"Content-Disposition": 'attachment; filename="references.docx"'},
        )
    refs = await anyio.to_thread.run_sync(export.format_references, entries, formatter)
    return {"references": refs}


@router.post("/bibtex")
async def export_bibtex(req: BibtexRequest):
    """BibTeX 导出：asFile=true 下载 .bib；false 返回 JSON 文本。"""
    entries = await anyio.to_thread.run_sync(
        export.collect_references, req.noteId, req.collectionId, req.collectionIds
    )
    text = await anyio.to_thread.run_sync(export.build_bibtex, entries)
    if req.asFile:
        return Response(
            content=text,
            media_type="application/x-bibtex",
            headers={"Content-Disposition": 'attachment; filename="references.bib"'},
        )
    return {"bibtex": text}
