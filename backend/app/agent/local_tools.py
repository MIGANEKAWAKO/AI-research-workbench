"""本地工具（A2）：复用 kb.py / literature.py / vault 安全读取，供 Research Agent 调用。

输出统一为 ToolResult；检索片段与文献条目放 sources（Synthesizer 引用来源），
笔记正文放 data（单条数据而非来源列表）。
"""

from __future__ import annotations

import asyncio

from pydantic import BaseModel, Field

from .. import kb
from ..frontmatter import parse_frontmatter
from ..literature import get_entry, load_literature
from ..vault import VaultPathError, resolve_vault_path
from .models import ToolResult
from .tools import BaseTool

# 笔记正文截断上限：防止单条工具结果撑爆模型上下文
NOTE_CONTENT_LIMIT = 2000
SNIPPET_LIMIT = 200


class LocalKbSearchArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=500, description="检索关键词")
    doc_id: str | None = Field(default=None, max_length=200, description="限定单篇文献/笔记 id")
    top_k: int = Field(default=5, ge=1, le=20, description="返回片段数")


class LocalKbSearchTool(BaseTool):
    name = "local_kb_search"
    description = "检索本地知识库（笔记与文献全文），返回片段与来源。"
    args_model = LocalKbSearchArgs

    async def run(self, args: LocalKbSearchArgs) -> ToolResult:
        docs = await asyncio.to_thread(kb.retrieve, args.query, args.doc_id, args.top_k)
        sources = [
            {
                "doc_id": doc.metadata.get("docId"),
                "doc_type": doc.metadata.get("docType"),
                "title": doc.metadata.get("title"),
                "page": doc.metadata.get("page"),
                "snippet": doc.page_content[:SNIPPET_LIMIT],
                # kb.retrieve 基于 similarity_search，第一版无相似度分数，保留字段置 None
                "score": None,
            }
            for doc in docs
        ]
        return ToolResult(
            ok=True,
            tool_name=self.name,
            data={"query": args.query, "hits": len(sources)},
            sources=sources,
        )


class LiteratureLookupArgs(BaseModel):
    doc_id: str | None = Field(default=None, max_length=200, description="文献 id（精确匹配）")
    query: str | None = Field(default=None, max_length=200, description="标题/作者/DOI 关键词")
    limit: int = Field(default=10, ge=1, le=50, description="最多返回条数")


class LiteratureLookupTool(BaseTool):
    name = "literature_lookup"
    description = "查询本地文献元数据：按 id 精确，或按标题/作者/DOI 关键词模糊匹配。"
    args_model = LiteratureLookupArgs

    async def run(self, args: LiteratureLookupArgs) -> ToolResult:
        entries = load_literature()
        if args.doc_id:
            entry = get_entry(args.doc_id)
            matched = [entry] if entry else []
        else:
            matched = _match_by_keyword(entries, args.query) if args.query else entries
        matched = matched[: args.limit]
        sources = [
            {
                "id": entry.id,
                "title": entry.title,
                "authors": [a.get("name", "") for a in entry.authors],
                "year": entry.year,
                "venue": entry.venue,
                "doi": entry.doi,
                "status": entry.status,
            }
            for entry in matched
        ]
        return ToolResult(
            ok=True, tool_name=self.name, data={"hits": len(sources)}, sources=sources
        )


def _match_by_keyword(entries, query: str):
    q = query.lower()
    return [e for e in entries if q in _entry_haystack(e)]


def _entry_haystack(entry) -> str:
    parts = [entry.title, entry.venue, entry.doi]
    parts += [a.get("name", "") for a in entry.authors]
    return " ".join(parts).lower()


class NoteReadArgs(BaseModel):
    path: str = Field(..., min_length=1, max_length=500, description="vault 内相对路径（.md 笔记）")


class NoteReadTool(BaseTool):
    name = "note_read"
    description = "读取指定笔记（vault 内 Markdown）的 frontmatter 与正文。"
    args_model = NoteReadArgs

    async def run(self, args: NoteReadArgs) -> ToolResult:
        try:
            target = resolve_vault_path(args.path)
        except VaultPathError as exc:
            return ToolResult(ok=False, tool_name=self.name, error=f"路径越界: {exc}")
        if not target.is_file():
            return ToolResult(ok=False, tool_name=self.name, error="文件不存在")
        if target.suffix.lower() != ".md":
            return ToolResult(ok=False, tool_name=self.name, error="必须是 vault 内 .md 笔记文件")
        try:
            content = target.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError) as exc:
            return ToolResult(ok=False, tool_name=self.name, error=f"读取失败: {exc}")
        meta, body = parse_frontmatter(content)
        return ToolResult(
            ok=True,
            tool_name=self.name,
            data={
                "note_id": target.stem,
                "title": meta.get("title", target.stem),
                "tags": meta.get("tags", []),
                "cites": meta.get("cites", []),
                "content": body[:NOTE_CONTENT_LIMIT],
            },
        )


def build_local_tools() -> list[BaseTool]:
    return [LocalKbSearchTool(), LiteratureLookupTool(), NoteReadTool()]
