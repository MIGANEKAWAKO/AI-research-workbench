"""C2 验收：/api/chat 的会话历史注入（conversationId）与流结束写回。

FakeOpenAI 模拟 DeepSeek 流式响应，避免真实网络调用；
build_rag_context mock 掉 embedding 网络请求。
"""

import asyncio
from types import SimpleNamespace

from app import conversations as conv_store
from app import main as main_module


def _make_conversation_with_history(tmp_path, monkeypatch, pairs, title="测试会话"):
    monkeypatch.setattr(conv_store, "kb_root", lambda: tmp_path / ".kb")
    conv = conv_store.create_conversation(title=title)
    for role, content in pairs:
        conv_store.append_message(conv.id, role, content)
    return conv


def _run(coro):
    return asyncio.run(coro)


# ---- _build_messages 历史注入 ----

def test_build_messages_injects_history(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "build_rag_context", lambda query, doc_id: "")
    conv = _make_conversation_with_history(
        tmp_path, monkeypatch, [("user", "前问"), ("assistant", "前答")]
    )

    payload = {
        "messages": [{"role": "user", "content": "现在问"}],
        "conversationId": conv.id,
    }
    result = _run(main_module._build_messages(payload))
    roles = [m["role"] for m in result["messages"]]
    contents = [m["content"] for m in result["messages"]]
    assert roles == ["system", "user", "assistant", "user"]
    assert contents[1:] == ["前问", "前答", "现在问"]
    assert result["conversation_id"] == conv.id
    assert result["user_text"] == "现在问"


def test_build_messages_without_conversation_no_history(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "build_rag_context", lambda query, doc_id: "")
    payload = {"messages": [{"role": "user", "content": "问题"}]}
    result = _run(main_module._build_messages(payload))
    assert [m["role"] for m in result["messages"]] == ["system", "user"]
    assert result["conversation_id"] is None


def test_build_messages_invalid_conversation_id_treated_as_none(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "build_rag_context", lambda query, doc_id: "")
    payload = {"messages": [{"role": "user", "content": "问题"}], "conversationId": 123}
    result = _run(main_module._build_messages(payload))
    assert result["conversation_id"] is None


# ---- _stream_chat_completion 流结束写回（FakeOpenAI 全链路） ----

class FakeChunk:
    choices = [SimpleNamespace(delta=SimpleNamespace(content="你好"))]


class FakeStream:
    async def __aiter__(self):
        yield FakeChunk()


class FakeCompletions:
    async def create(self, **kwargs):
        return FakeStream()


class FakeChat:
    completions = FakeCompletions()


class FakeClient:
    chat = FakeChat()

    async def close(self):
        pass


async def _collect(gen):
    parts = []
    async for frame in gen:
        parts.append(frame)
    return "".join(parts)


def _stream_to_text(gen):
    """单事件循环内消费生成器（跨 loop 逐帧 __anext__ 会挂起 async generator）。"""
    return _run(_collect(gen))


def test_stream_chat_persists_user_and_assistant(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "AsyncOpenAI", lambda **kwargs: FakeClient())
    conv = _make_conversation_with_history(tmp_path, monkeypatch, [])

    gen = main_module._stream_chat_completion(
        [{"role": "user", "content": "问题"}], conversation_id=conv.id, user_text="问题"
    )
    output = _stream_to_text(gen)

    assert '"content": "你好"' in output
    conv_after = conv_store.get_conversation(conv.id)
    assert [(m.role, m.content) for m in conv_after.messages] == [
        ("user", "问题"),
        ("assistant", "你好"),
    ]


def test_persist_chat_skips_empty_assistant(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "AsyncOpenAI", lambda **kwargs: FakeClient())
    conv = _make_conversation_with_history(tmp_path, monkeypatch, [])
    main_module._persist_chat(conv.id, "问题", "")
    conv_after = conv_store.get_conversation(conv.id)
    assert [(m.role, m.content) for m in conv_after.messages] == [("user", "问题")]


def test_persist_chat_without_conversation_is_noop(tmp_path, monkeypatch):
    monkeypatch.setattr(conv_store, "kb_root", lambda: tmp_path / ".kb")
    main_module._persist_chat(None, "问题", "回答")
    assert not (tmp_path / ".kb" / "conversations.json").exists()
