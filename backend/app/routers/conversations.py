"""会话 API：新建/列表/删除会话、查询会话消息。

消息写入不对外暴露（无 POST messages）：chat / research 流结束时
由后端自动追加（C2），避免前端显式追加导致历史断链。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..conversations import (
    Conversation,
    create_conversation,
    delete_conversation,
    get_conversation,
    load_conversations,
    update_conversation_title,
)

router = APIRouter()

VALID_SOURCES = ("chat", "research")
MAX_TITLE_LEN = 100


class CreateConversationRequest(BaseModel):
    title: str = ""
    source: str = "chat"


class UpdateTitleRequest(BaseModel):
    """标题更新：strip 后非空、限长；空/超长由路由拒绝（400）。"""

    title: str


def _summary(conv: Conversation) -> dict:
    """列表项轻量摘要：不含消息体，附带消息条数。"""
    return {
        "id": conv.id,
        "title": conv.title,
        "source": conv.source,
        "createdAt": conv.created_at,
        "updatedAt": conv.updated_at,
        "messageCount": len(conv.messages),
    }


@router.get("")
def list_conversations():
    """会话列表，按最近更新倒序。"""
    conversations = load_conversations()
    conversations.sort(key=lambda c: c.updated_at, reverse=True)
    return {"entries": [_summary(conv) for conv in conversations]}


@router.post("", status_code=201)
def create_new_conversation(req: CreateConversationRequest):
    """新建会话；source 限 chat/research。"""
    if req.source not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail=f"无效 source: {req.source}")
    conv = create_conversation(title=req.title, source=req.source)
    return conv.model_dump()


@router.get("/{conv_id}/messages")
def get_messages(conv_id: str):
    """查询会话全部消息（按写入顺序）。"""
    conv = get_conversation(conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"messages": [msg.model_dump() for msg in conv.messages]}


@router.put("/{conv_id}")
def update_title(conv_id: str, req: UpdateTitleRequest):
    """更新会话标题（C3 持久化：前端首条消息后自动生成并落盘）。

    title 未变时幂等（不写盘）；空/超长 400；会话不存在 404。
    """
    title = req.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="标题不能为空")
    if len(title) > MAX_TITLE_LEN:
        raise HTTPException(status_code=400, detail=f"标题过长（最多 {MAX_TITLE_LEN} 字）")
    conv = update_conversation_title(conv_id, title)
    if conv is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    return conv.model_dump()


@router.delete("/{conv_id}")
def delete_conversation_by_id(conv_id: str):
    """删除会话。"""
    if not delete_conversation(conv_id):
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"ok": True}
