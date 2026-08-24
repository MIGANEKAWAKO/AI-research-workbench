"""会话持久层：vault/.kb/conversations.json 的读/写/增/删/查。

与 literature.py 同款约定：.json 是派生数据（可删可重建），
解析失败按空库处理并告警；写一律原子写（tmp + os.replace）。
消息由后端在 chat/research 流结束时写入（C2），前端不直接写消息。
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel

from .vault import kb_root

# 历史注入滑动窗口的字符预算（token 数不可精确预知，用字符数近似控制）
DEFAULT_HISTORY_MAX_CHARS = 8000


def build_history_messages(
    conversation: Conversation | None, max_chars: int = DEFAULT_HISTORY_MAX_CHARS
) -> list[dict[str, str]]:
    """滑动窗口：取最近的 user/assistant 消息直到字符预算耗尽，按原顺序返回。

    策略：窗口优先保留最近的完整消息，最老的超长消息整条丢弃；
    仅当预算连一条消息都放不下时，才截断最近一条保留开头（保证上下文不空）。
    system 消息不持久化、不参与窗口。
    """
    if conversation is None:
        return []
    result: list[dict[str, str]] = []
    remaining = max_chars
    for msg in reversed(conversation.messages):
        if msg.role not in ("user", "assistant"):
            continue
        if remaining <= 0:
            break
        if len(msg.content) > remaining:
            if result:
                break  # 已有更近消息：最老的超长消息整条丢弃
            msg_text = msg.content[:remaining]  # 单条超预算：截断保底
            remaining = 0
        else:
            msg_text = msg.content
            remaining -= len(msg_text)
        result.append({"role": msg.role, "content": msg_text})
    result.reverse()
    return result


class Message(BaseModel):
    """会话内单条消息；system 不持久化（C2 注入时临时构造）。"""

    id: str
    role: str  # "user" | "assistant"
    content: str
    created_at: str  # ISO8601（timespec="seconds"，同 literature）


class Conversation(BaseModel):
    """一次会话：chat 或 research 的消息序列。"""

    id: str
    title: str
    source: str = "chat"  # "chat" | "research"（C3 研究答案入会话需要区分）
    created_at: str
    updated_at: str
    messages: list[Message] = []


def _conversations_path() -> Path:
    return kb_root() / "conversations.json"


def _atomic_write_text(path: Path, content: str) -> None:
    """原子写：tmp + os.replace，防半截文件（与 literature 同款思路）。"""
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def load_conversations() -> list[Conversation]:
    """读全部会话；文件不存在 → []；JSON 损坏 → 告警 + []（.kb 可重建）。"""
    path = _conversations_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return [Conversation(**item) for item in data]
    except (json.JSONDecodeError, TypeError, ValueError):
        print(f"警告: {path} 解析失败，按空库处理（.kb 可由后端重建）")
        return []


def save_conversations(conversations: list[Conversation]) -> None:
    path = _conversations_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(
        [conv.model_dump() for conv in conversations], ensure_ascii=False, indent=2
    )
    _atomic_write_text(path, content)


def get_conversation(conv_id: str) -> Conversation | None:
    for conv in load_conversations():
        if conv.id == conv_id:
            return conv
    return None


def create_conversation(title: str = "", source: str = "chat") -> Conversation:
    """新建会话（title 缺省"新对话"），写盘后返回完整会话。"""
    now = _now()
    conv = Conversation(
        id="c_" + uuid.uuid4().hex[:8],
        title=title.strip() or "新对话",
        source=source,
        created_at=now,
        updated_at=now,
    )
    conversations = load_conversations()
    conversations.append(conv)
    save_conversations(conversations)
    return conv


def delete_conversation(conv_id: str) -> bool:
    conversations = load_conversations()
    remaining = [conv for conv in conversations if conv.id != conv_id]
    if len(remaining) == len(conversations):
        return False
    save_conversations(remaining)
    return True


def append_message(conv_id: str, role: str, content: str) -> Conversation | None:
    """追加一条消息并刷新 updatedAt；会话不存在返回 None。"""
    conv = get_conversation(conv_id)
    if conv is None:
        return None
    conv.messages.append(
        Message(
            id="m_" + uuid.uuid4().hex[:8],
            role=role,
            content=content,
            created_at=_now(),
        )
    )
    conv.updated_at = _now()
    conversations = load_conversations()
    for i, item in enumerate(conversations):
        if item.id == conv_id:
            conversations[i] = conv
            break
    save_conversations(conversations)
    return conv
