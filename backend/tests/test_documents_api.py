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
