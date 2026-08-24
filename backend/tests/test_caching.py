"""X1 验收：TTLCache（LRU/TTL/并发）、MetadataDiskCache（磁盘持久化/损坏降级）、
kb 检索缓存与失效钩子、metadata 磁盘缓存挂载（失败不缓存）、redis_url 配置位。"""

import asyncio
import threading

from langchain_core.documents import Document

from app import caching, kb, metadata
from app.caching import MetadataDiskCache, TTLCache
from app.config import settings


# ---- TTLCache：LRU + TTL + 线程安全 ----

def test_cache_basic_get_set():
    cache = TTLCache()
    cache.set("k", "v")
    assert cache.get("k") == "v"
    assert cache.get("missing") is None


def test_ttl_expiry(monkeypatch):
    fake_now = {"now": 0.0}
    monkeypatch.setattr(caching.time, "monotonic", lambda: fake_now["now"])
    cache = TTLCache()
    cache.set("k", "v", ttl_seconds=10)
    fake_now["now"] = 5
    assert cache.get("k") == "v"
    fake_now["now"] = 11
    assert cache.get("k") is None  # 过期惰性淘汰


def test_lru_eviction():
    cache = TTLCache(capacity=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.get("a")  # a 变为最近使用
    cache.set("c", 3)  # 容量满，淘汰最久未用的 b
    assert cache.get("b") is None
    assert cache.get("a") == 1
    assert cache.get("c") == 3


def test_cache_clear():
    cache = TTLCache()
    cache.set("k", "v")
    cache.clear()
    assert cache.get("k") is None


def test_concurrent_access():
    cache = TTLCache(capacity=16)
    errors: list[Exception] = []

    def worker(seed: int):
        try:
            for j in range(100):
                key = f"k{j % 8}"
                cache.set(key, j)
                cache.get(key)
                cache.get("missing")
        except Exception as exc:  # pragma: no cover
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors


# ---- MetadataDiskCache：磁盘持久化 + TTL + 损坏降级 ----

def test_disk_cache_persists_across_instances(tmp_path):
    path = tmp_path / "metadata_cache.json"
    MetadataDiskCache(path).set("10.1234/abc", {"title": "T"})
    cache2 = MetadataDiskCache(path)  # 模拟进程重启重新加载
    assert cache2.get("10.1234/abc") == {"title": "T"}
    assert path.exists()


def test_disk_cache_ttl_expiry(tmp_path, monkeypatch):
    monkeypatch.setattr(caching.time, "time", lambda: 0.0)
    cache = MetadataDiskCache(tmp_path / "m.json", ttl_days=7)
    cache.set("k", {"v": 1})
    assert cache.get("k") == {"v": 1}
    monkeypatch.setattr(caching.time, "time", lambda: 86400 * 8)  # 8 天后
    assert cache.get("k") is None


def test_disk_cache_corrupted_file_recovers(tmp_path):
    path = tmp_path / "metadata_cache.json"
    path.write_text("{broken json", encoding="utf-8")
    cache = MetadataDiskCache(path)  # 损坏 → 空缓存 + 告警
    assert cache.get("10.x") is None
    cache.set("10.x", {"t": 1})  # 可继续写入
    assert cache.get("10.x") == {"t": 1}


def test_disk_cache_max_entries_evicts_oldest(tmp_path):
    cache = MetadataDiskCache(tmp_path / "m.json", ttl_days=7, max_entries=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)
    assert cache.get("a") is None  # 最旧插入的被淘汰
    assert cache.get("b") == 2
    assert cache.get("c") == 3


# ---- kb 检索结果缓存 + 失效钩子 ----

class FakeCollection:
    """假 Chroma collection：similarity_search 计数（实例属性），delete/add 空实现。"""

    def __init__(self):
        self.search_calls = 0

    def similarity_search(self, query, k=5, filter=None):
        self.search_calls += 1
        return [Document(page_content=f"doc-{query}", metadata={"docId": "d1"})]

    def delete(self, where=None):
        pass

    def add_documents(self, chunks):
        pass


def _patch_fake_collection(monkeypatch) -> FakeCollection:
    fake = FakeCollection()
    monkeypatch.setattr(kb, "get_collection", lambda: fake)
    kb._retrieve_cache.clear()
    return fake


def test_retrieve_caches_result(monkeypatch):
    fake = _patch_fake_collection(monkeypatch)
    kb.retrieve("RAG")
    kb.retrieve("RAG")
    kb.retrieve("RAG")
    assert fake.search_calls == 1  # 只触发一次真实检索


def test_retrieve_cache_key_includes_scope(monkeypatch):
    fake = _patch_fake_collection(monkeypatch)
    kb.retrieve("RAG")
    kb.retrieve("RAG", doc_id="lit1")
    kb.retrieve("RAG", doc_id="lit1")
    assert fake.search_calls == 2  # 全局与单篇是不同 key


def test_delete_document_invalidates_retrieve_cache(monkeypatch):
    fake = _patch_fake_collection(monkeypatch)
    kb.retrieve("RAG")
    kb.delete_document("lit1")  # 写库 → 缓存失效
    kb.retrieve("RAG")
    assert fake.search_calls == 2  # 失效后重新检索


def test_upsert_document_invalidates_retrieve_cache(monkeypatch):
    fake = _patch_fake_collection(monkeypatch)
    kb.retrieve("RAG")
    kb.upsert_document("note", "n1", "笔记", text="新内容")
    kb.retrieve("RAG")
    assert fake.search_calls == 2


# ---- metadata 磁盘缓存挂载 ----

def _patch_metadata_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(
        metadata, "_metadata_cache", MetadataDiskCache(tmp_path / "metadata_cache.json")
    )


def test_fetch_metadata_caches_success(tmp_path, monkeypatch):
    _patch_metadata_cache(tmp_path, monkeypatch)
    calls = {"n": 0}

    async def fake_fetch(identifier):
        calls["n"] += 1
        return {"title": "T", "doi": identifier}

    monkeypatch.setattr(metadata, "fetch_by_doi", fake_fetch)
    r1 = asyncio.run(metadata.fetch_metadata("10.1234/abc"))
    r2 = asyncio.run(metadata.fetch_metadata("10.1234/abc"))
    assert r1 == r2 == {"title": "T", "doi": "10.1234/abc"}
    assert calls["n"] == 1  # 第二次命中磁盘缓存，不重打网络


def test_fetch_metadata_failure_not_cached(tmp_path, monkeypatch):
    _patch_metadata_cache(tmp_path, monkeypatch)
    calls = {"n": 0}

    async def fake_fetch(identifier):
        calls["n"] += 1
        return {}

    monkeypatch.setattr(metadata, "fetch_by_doi", fake_fetch)
    asyncio.run(metadata.fetch_metadata("10.1234/abc"))
    asyncio.run(metadata.fetch_metadata("10.1234/abc"))
    assert calls["n"] == 2  # 失败（{}）不缓存，下次仍重试


# ---- config：redis_url 配置位 ----

def test_redis_url_placeholder_is_empty():
    assert settings.redis_url == ""
