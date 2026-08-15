"""知识库维护 API：索引状态查询与刷新（手动触发，启动时自动扫描一次）。"""

from __future__ import annotations

import anyio
from fastapi import APIRouter
from pydantic import BaseModel

from .. import indexer

router = APIRouter()


class RefreshRequest(BaseModel):
    force: bool = False


@router.get("/status")
async def kb_status():
    """索引健康度：chunk 数、已索引/未索引文件、上次扫描时间。"""
    return await anyio.to_thread.run_sync(indexer.get_index_status)


@router.post("/refresh")
async def kb_refresh(req: RefreshRequest):
    """增量扫描（默认）/ 全量重建（force=true）。"""
    return await anyio.to_thread.run_sync(indexer.scan_and_index, req.force)
