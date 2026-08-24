"""P3 验收：chroma 索引自愈——探测损坏 → 删库 → force 全量重建。

用空 tmp vault 避免真实 embedding 网络调用；get_collection 探测失败后
scan 空目录即结束，不触发 upsert。
"""

from app import indexer, kb


def _patch_vault(tmp_path, monkeypatch):
    monkeypatch.setattr(indexer, "default_vault_path", lambda: tmp_path)
    monkeypatch.setattr(indexer, "kb_root", lambda: tmp_path / ".kb")
    monkeypatch.setattr(indexer, "load_literature", lambda: [])  # 空文献库
    monkeypatch.setattr(kb, "chroma_dir", lambda: tmp_path / ".kb" / "chroma_db")


def test_heal_collection_removes_dir_and_resets_singleton(tmp_path, monkeypatch):
    chroma = tmp_path / "chroma_db"
    chroma.mkdir(parents=True)
    (chroma / "index.bin").write_text("corrupted", encoding="utf-8")
    monkeypatch.setattr(kb, "chroma_dir", lambda: chroma)
    kb._collection = object()  # 模拟已加载的单例

    kb.heal_collection()

    assert not chroma.exists()  # 目录整体删除
    assert kb._collection is None  # 单例清空，下次 get_collection 重建
    kb._collection = None


def test_scan_and_index_heals_corrupted_chroma(tmp_path, monkeypatch):
    _patch_vault(tmp_path, monkeypatch)
    heal_calls = {"n": 0}

    def fake_heal():
        heal_calls["n"] += 1

    def boom():
        raise RuntimeError("HNSW 索引损坏")

    monkeypatch.setattr(kb, "get_collection", boom)
    monkeypatch.setattr(kb, "heal_collection", fake_heal)

    report = indexer.scan_and_index()

    assert heal_calls["n"] == 1  # 触发自愈
    assert report["scanned"] == 0  # 空 vault 全量重建
    assert (tmp_path / ".kb" / "index_state.json").exists()  # state 落盘


def test_scan_and_index_healthy_does_not_heal(tmp_path, monkeypatch):
    _patch_vault(tmp_path, monkeypatch)
    heal_calls = {"n": 0}
    monkeypatch.setattr(kb, "get_collection", lambda: object())
    monkeypatch.setattr(kb, "heal_collection", lambda: heal_calls.__setitem__("n", heal_calls["n"] + 1))

    report = indexer.scan_and_index()

    assert heal_calls["n"] == 0  # 库健康不触发自愈
    assert report["errors"] == []
