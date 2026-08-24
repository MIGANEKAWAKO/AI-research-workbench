"""C1 验收：会话持久层（原子写/损坏降级）与 /api/conversations 四个端点。"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import conversations as conv_store
from app.conversations import Conversation, Message, build_history_messages
from app.routers import conversations as conv_router

app = FastAPI()
app.include_router(conv_router.router, prefix="/api/conversations")
client = TestClient(app)


@pytest.fixture
def tmp_vault(tmp_path, monkeypatch):
    """隔离 vault：会话文件写入 tmp_path/.kb。"""
    monkeypatch.setattr(conv_store, "kb_root", lambda: tmp_path / ".kb")
    return tmp_path


# ---- 持久层 ----

def test_create_conversation_defaults(tmp_vault):
    conv = conv_store.create_conversation()
    assert conv.id.startswith("c_")
    assert conv.title == "新对话"
    assert conv.source == "chat"
    assert conv.messages == []
    assert conv.created_at == conv.updated_at
    assert (tmp_vault / ".kb" / "conversations.json").exists()


def test_create_conversation_with_title_and_source(tmp_vault):
    conv = conv_store.create_conversation(title=" 研究总结 ", source="research")
    assert conv.title == "研究总结"
    assert conv.source == "research"


def test_load_returns_saved_conversations(tmp_vault):
    conv_store.create_conversation(title="A")
    conv_store.create_conversation(title="B")
    conversations = conv_store.load_conversations()
    assert [c.title for c in conversations] == ["A", "B"]


def test_get_conversation_by_id(tmp_vault):
    conv = conv_store.create_conversation(title="A")
    assert conv_store.get_conversation(conv.id).title == "A"
    assert conv_store.get_conversation("c_missing") is None


def test_append_message_persists_and_updates_updated_at(tmp_vault):
    conv = conv_store.create_conversation()
    before = conv.updated_at
    updated = conv_store.append_message(conv.id, "user", "你好")
    assert updated is not None
    assert len(updated.messages) == 1
    msg = updated.messages[0]
    assert msg.role == "user" and msg.content == "你好"
    assert msg.id.startswith("m_")
    assert updated.updated_at >= before
    # 重新加载仍可见（真实写盘）
    assert len(conv_store.get_conversation(conv.id).messages) == 1


def test_append_message_unknown_conversation_returns_none(tmp_vault):
    assert conv_store.append_message("c_missing", "user", "x") is None


def test_delete_conversation(tmp_vault):
    conv = conv_store.create_conversation(title="A")
    assert conv_store.delete_conversation(conv.id) is True
    assert conv_store.get_conversation(conv.id) is None
    assert conv_store.delete_conversation(conv.id) is False


def test_load_corrupted_json_returns_empty(tmp_vault):
    path = tmp_vault / ".kb" / "conversations.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{broken json", encoding="utf-8")
    assert conv_store.load_conversations() == []


def test_save_roundtrip_preserves_messages(tmp_vault):
    conv = conv_store.create_conversation(title="A")
    conv_store.append_message(conv.id, "user", "q")
    conv_store.append_message(conv.id, "assistant", "a")
    raw = json.loads((tmp_vault / ".kb" / "conversations.json").read_text(encoding="utf-8"))
    assert len(raw[0]["messages"]) == 2


# ---- C2 历史滑动窗口（纯函数） ----

def _conv_with(*pairs: tuple[str, str]) -> Conversation:
    return Conversation(
        id="c_test",
        title="t",
        created_at="2026-01-01T00:00:00",
        updated_at="2026-01-01T00:00:00",
        messages=[Message(id=f"m{i}", role=r, content=c, created_at="2026-01-01T00:00:00") for i, (r, c) in enumerate(pairs)],
    )


def test_history_none_or_empty_returns_empty():
    assert build_history_messages(None) == []
    assert build_history_messages(_conv_with()) == []


def test_history_preserves_order():
    conv = _conv_with(("user", "q1"), ("assistant", "a1"), ("user", "q2"))
    history = build_history_messages(conv, max_chars=10_000)
    assert history == [
        {"role": "user", "content": "q1"},
        {"role": "assistant", "content": "a1"},
        {"role": "user", "content": "q2"},
    ]


def test_history_drops_oldest_when_over_budget():
    conv = _conv_with(("user", "很长" * 100), ("assistant", "a"), ("user", "新问题"))
    history = build_history_messages(conv, max_chars=30)
    # 预算 30：最新 "新问题"(3) + "a"(1) 优先保留，最老的超长消息被丢弃
    assert history == [
        {"role": "assistant", "content": "a"},
        {"role": "user", "content": "新问题"},
    ]


def test_history_truncates_oversized_single_message():
    conv = _conv_with(("user", "很" * 100))
    history = build_history_messages(conv, max_chars=20)
    assert len(history) == 1
    assert history[0]["content"] == "很" * 20  # 保留开头
    assert history[0]["role"] == "user"


def test_history_ignores_unknown_roles():
    conv = _conv_with(("user", "q"), ("system", "s"), ("assistant", "a"))
    history = build_history_messages(conv, max_chars=10_000)
    assert history == [
        {"role": "user", "content": "q"},
        {"role": "assistant", "content": "a"},
    ]


# ---- API 路由 ----

def test_list_empty(tmp_vault):
    resp = client.get("/api/conversations")
    assert resp.status_code == 200
    assert resp.json() == {"entries": []}


def test_create_and_list(tmp_vault):
    resp = client.post("/api/conversations", json={"title": "我的会话"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"].startswith("c_") and body["messages"] == []

    resp = client.get("/api/conversations")
    entry = resp.json()["entries"][0]
    assert entry["title"] == "我的会话"
    assert entry["messageCount"] == 0
    assert entry["source"] == "chat"


def test_list_sorted_by_updated_at_desc(tmp_vault):
    first = conv_store.create_conversation(title="旧")
    conv_store.create_conversation(title="新")
    conv_store.append_message(first.id, "user", "触发了更新")
    entries = client.get("/api/conversations").json()["entries"]
    assert [e["title"] for e in entries] == ["旧", "新"]


def test_create_invalid_source_400(tmp_vault):
    resp = client.post("/api/conversations", json={"source": "hack"})
    assert resp.status_code == 400


def test_get_messages(tmp_vault):
    conv = conv_store.create_conversation(title="A")
    conv_store.append_message(conv.id, "user", "q")
    conv_store.append_message(conv.id, "assistant", "a")
    resp = client.get(f"/api/conversations/{conv.id}/messages")
    assert resp.status_code == 200
    messages = resp.json()["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert [m["content"] for m in messages] == ["q", "a"]


def test_get_messages_404(tmp_vault):
    assert client.get("/api/conversations/c_missing/messages").status_code == 404


def test_delete_via_api(tmp_vault):
    conv = conv_store.create_conversation(title="A")
    assert client.delete(f"/api/conversations/{conv.id}").json() == {"ok": True}
    assert client.delete(f"/api/conversations/{conv.id}").status_code == 404
