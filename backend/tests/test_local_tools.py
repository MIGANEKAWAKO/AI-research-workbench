"""A2 验收：三个本地工具的行为与安全边界（检索/元数据/笔记读取均不触达真实 Chroma 与网络）。"""

import asyncio
from unittest.mock import patch

import pytest
from langchain_core.documents import Document
from pydantic import BaseModel, Field

from app.agent.local_tools import (
    LiteratureLookupTool,
    LocalKbSearchTool,
    NoteReadTool,
)
from app.agent.models import ToolResult
from app.literature import LiteratureEntry


def _run(tool, args: dict) -> ToolResult:
    return asyncio.run(tool.run(tool.args_model(**args)))


# ---- local_kb_search ----

def test_kb_search_returns_sources(monkeypatch):
    fake_docs = [
        Document(
            page_content="RAG 检索增强生成的核心是把检索结果注入提示词。",
            metadata={"docId": "p1", "docType": "paper", "title": "论文A", "page": 3},
        )
    ]
    monkeypatch.setattr("app.agent.local_tools.kb.retrieve", lambda query, doc_id, top_k: fake_docs)

    result = _run(LocalKbSearchTool(), {"query": "RAG"})

    assert result.ok is True
    assert result.data == {"query": "RAG", "hits": 1}
    src = result.sources[0]
    assert src["doc_id"] == "p1" and src["doc_type"] == "paper"
    assert src["title"] == "论文A" and src["page"] == 3
    assert "检索增强" in src["snippet"]


def test_kb_search_forwards_doc_id_and_top_k(monkeypatch):
    captured = {}

    def fake_retrieve(query, doc_id, top_k):
        captured.update(query=query, doc_id=doc_id, top_k=top_k)
        return []

    monkeypatch.setattr("app.agent.local_tools.kb.retrieve", fake_retrieve)
    _run(LocalKbSearchTool(), {"query": "对比", "doc_id": "p9", "top_k": 3})
    assert captured == {"query": "对比", "doc_id": "p9", "top_k": 3}


def test_kb_search_params_bounds_rejected():
    tool = LocalKbSearchTool()
    for args in ({"query": ""}, {"query": "x" * 501}, {"query": "x", "top_k": 0}, {"query": "x", "top_k": 21}):
        with pytest.raises(Exception):
            _run(tool, args)


# ---- literature_lookup ----

def _entries():
    return [
        LiteratureEntry(
            id="lit1",
            title="检索增强生成综述",
            authors=[{"name": "张三"}, {"name": "李四"}],
            year=2024,
            venue="软件学报",
            doi="10.1000/lit1",
        ),
        LiteratureEntry(id="lit2", title="注意力机制", authors=[{"name": "王五"}], year=2023),
    ]


def test_lookup_by_doc_id(monkeypatch):
    monkeypatch.setattr("app.agent.local_tools.load_literature", _entries)
    monkeypatch.setattr("app.agent.local_tools.get_entry", lambda lit_id: next((e for e in _entries() if e.id == lit_id), None))

    result = _run(LiteratureLookupTool(), {"doc_id": "lit2"})

    assert result.ok is True and result.data == {"hits": 1}
    assert result.sources[0]["title"] == "注意力机制"


def test_lookup_by_keyword_title(monkeypatch):
    monkeypatch.setattr("app.agent.local_tools.load_literature", _entries)
    result = _run(LiteratureLookupTool(), {"query": "检索增强"})
    assert [s["title"] for s in result.sources] == ["检索增强生成综述"]


def test_lookup_by_author_keyword(monkeypatch):
    monkeypatch.setattr("app.agent.local_tools.load_literature", _entries)
    result = _run(LiteratureLookupTool(), {"query": "张三"})
    assert [s["title"] for s in result.sources] == ["检索增强生成综述"]


def test_lookup_unknown_doc_id(monkeypatch):
    monkeypatch.setattr("app.agent.local_tools.load_literature", _entries)
    monkeypatch.setattr("app.agent.local_tools.get_entry", lambda lit_id: None)
    result = _run(LiteratureLookupTool(), {"doc_id": "nope"})
    assert result.ok is True and result.sources == []


def test_lookup_limit(monkeypatch):
    monkeypatch.setattr("app.agent.local_tools.load_literature", _entries)
    result = _run(LiteratureLookupTool(), {"limit": 1})
    assert len(result.sources) == 1


# ---- note_read（含路径安全边界） ----

def test_note_read_ok(tmp_path, monkeypatch):
    note = tmp_path / "notes" / "my-note.md"
    note.parent.mkdir()
    note.write_text("---\ntitle: 我的笔记\ntags: [RAG, 面试]\ncites:\n- lit1\n---\n正文内容……", encoding="utf-8")
    monkeypatch.setattr("app.vault.default_vault_path", lambda: tmp_path)

    result = _run(NoteReadTool(), {"path": "notes/my-note.md"})

    assert result.ok is True
    assert result.data["note_id"] == "my-note"
    assert result.data["title"] == "我的笔记"
    assert result.data["tags"] == ["RAG", "面试"]
    assert result.data["cites"] == ["lit1"]
    assert "正文内容" in result.data["content"]


def test_note_read_traversal_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr("app.vault.default_vault_path", lambda: tmp_path)
    result = _run(NoteReadTool(), {"path": "../secret.md"})
    assert result.ok is False and "路径越界" in (result.error or "")


def test_note_read_non_md_rejected(tmp_path, monkeypatch):
    (tmp_path / "x.pdf").write_text("pdf", encoding="utf-8")
    monkeypatch.setattr("app.vault.default_vault_path", lambda: tmp_path)
    result = _run(NoteReadTool(), {"path": "x.pdf"})
    assert result.ok is False and "必须是 vault 内 .md" in (result.error or "")


def test_note_read_missing_file(tmp_path, monkeypatch):
    monkeypatch.setattr("app.vault.default_vault_path", lambda: tmp_path)
    result = _run(NoteReadTool(), {"path": "no-such.md"})
    assert result.ok is False and "文件不存在" in (result.error or "")


def test_note_read_plain_text_without_frontmatter(tmp_path, monkeypatch):
    note = tmp_path / "plain.md"
    note.write_text("没有 frontmatter 的正文", encoding="utf-8")
    monkeypatch.setattr("app.vault.default_vault_path", lambda: tmp_path)

    result = _run(NoteReadTool(), {"path": "plain.md"})

    assert result.ok is True
    assert result.data["title"] == "plain"  # 无 title 时回退文件名
    assert result.data["content"] == "没有 frontmatter 的正文"
