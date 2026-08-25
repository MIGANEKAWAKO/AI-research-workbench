"""文献 API 测试：集合归属更新（PUT /api/documents/{id}，M2 文献集合）。"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import literature as lit_store
from app.literature import LiteratureEntry
from app.routers import documents as doc_router

app = FastAPI()
app.include_router(doc_router.router, prefix="/api/documents")
client = TestClient(app)


@pytest.fixture
def tmp_vault(tmp_path, monkeypatch):
    """隔离 vault：literature.json 写入 tmp_path/.kb。"""
    monkeypatch.setattr(lit_store, "_literature_path", lambda: tmp_path / ".kb" / "literature.json")
    return tmp_path


def _make_entry(lit_id: str = "lit123456") -> LiteratureEntry:
    return LiteratureEntry(
        id=lit_id,
        title="测试文献",
        authors=[],
        year=2024,
        venue="",
        volume="",
        issue="",
        pages="",
        doi="",
        arxivId="",
        pdfPath="文献/lit123456.pdf",
        status="未读",
        collectionIds=[],
        tags=[],
        importedAt="2026-08-01T00:00:00",
    )


def test_update_collection_ids(tmp_vault):
    lit_store.add_entry(_make_entry())
    resp = client.put("/api/documents/lit123456", json={"collectionIds": ["c1", "c2"]})
    assert resp.status_code == 200
    assert resp.json()["collectionIds"] == ["c1", "c2"]
    # 重新加载仍可见（真实写盘）
    assert lit_store.get_entry("lit123456").collectionIds == ["c1", "c2"]


def test_update_collection_ids_clear_to_empty(tmp_vault):
    entry = _make_entry()
    entry.collectionIds = ["c1"]
    lit_store.add_entry(entry)
    resp = client.put("/api/documents/lit123456", json={"collectionIds": []})
    assert resp.status_code == 200
    assert resp.json()["collectionIds"] == []


def test_update_rejects_non_string_items(tmp_vault):
    lit_store.add_entry(_make_entry())
    # Pydantic 层校验：list[str] 收到非字符串 → 422（比后端过滤更严格，行为正确）
    resp = client.put("/api/documents/lit123456", json={"collectionIds": ["c1", 42, None]})
    assert resp.status_code == 422
    # 未写入
    assert lit_store.get_entry("lit123456").collectionIds == []


def test_update_unknown_document_404(tmp_vault):
    assert (
        client.put("/api/documents/c_missing", json={"collectionIds": ["c1"]}).status_code
        == 404
    )


def test_update_idempotent_no_write(tmp_vault):
    entry = _make_entry()
    entry.collectionIds = ["c1"]
    lit_store.add_entry(entry)
    # 未变提交 → 200，数据不变
    resp = client.put("/api/documents/lit123456", json={"collectionIds": ["c1"]})
    assert resp.status_code == 200
    assert resp.json()["collectionIds"] == ["c1"]


# ---- P2 元数据编辑（全字段 PUT） ----

def test_update_metadata_full(tmp_vault):
    lit_store.add_entry(_make_entry())
    resp = client.put(
        "/api/documents/lit123456",
        json={
            "title": "  RAG 检索优化研究  ",
            "authors": [{"given": "小明", "family": "张"}, {"given": "", "family": "李四"}],
            "year": 2025,
            "venue": "ACL",
            "volume": "1",
            "issue": "2",
            "pages": "100-110",
            "doi": "10.1234/test",
            "arxivId": "2501.00001",
            "tags": ["RAG", " 检索 ", "RAG"],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "RAG 检索优化研究"  # strip
    assert body["authors"] == [{"given": "小明", "family": "张"}, {"given": "", "family": "李四"}]
    assert body["year"] == 2025
    assert body["doi"] == "10.1234/test"
    assert body["tags"] == ["RAG", "检索"]  # strip + 去重保序
    # 重新加载仍可见（真实写盘）
    entry = lit_store.get_entry("lit123456")
    assert entry.title == "RAG 检索优化研究" and entry.year == 2025


def test_update_metadata_partial_keeps_others(tmp_vault):
    entry = _make_entry()
    entry.venue = "ICML"
    entry.year = 2024
    lit_store.add_entry(entry)
    # 只改 title，venue/year 保持
    resp = client.put("/api/documents/lit123456", json={"title": "新标题"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "新标题" and body["venue"] == "ICML" and body["year"] == 2024


def test_update_year_explicit_null_clears(tmp_vault):
    entry = _make_entry()
    entry.year = 2024
    lit_store.add_entry(entry)
    # 显式 null = 清空年份（与"未提供"区分）
    resp = client.put("/api/documents/lit123456", json={"year": None})
    assert resp.status_code == 200
    assert resp.json()["year"] is None


def test_update_year_invalid_400(tmp_vault):
    lit_store.add_entry(_make_entry())
    assert (
        client.put("/api/documents/lit123456", json={"year": 999}).status_code == 400
    )
    assert (
        client.put("/api/documents/lit123456", json={"year": 3000}).status_code == 400
    )


def test_update_authors_structure_422(tmp_vault):
    lit_store.add_entry(_make_entry())
    # 作者必须是对象列表：非对象元素 → Pydantic 422
    assert (
        client.put("/api/documents/lit123456", json={"authors": [123]}).status_code
        == 422
    )


def test_update_title_too_long_400(tmp_vault):
    lit_store.add_entry(_make_entry())
    assert (
        client.put("/api/documents/lit123456", json={"title": "长" * 301}).status_code
        == 400
    )
