"""SSE 事件流：GET /api/events，订阅 vault 变更（A5，替代前端 30s 轮询）。

事件帧：data: {"type": "vault.changed", "report": {...}, "ts": "..."}
心跳：15s 一条注释帧（": ping"）保活（代理/浏览器不超时断连）。
客户端断开：生成器被取消 → finally 退订（单连接单队列，无泄漏）。
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..events import broker

router = APIRouter()

HEARTBEAT_INTERVAL = 15.0


def _sse_data(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.get("/events")
async def events():
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    queue = broker.subscribe()

    async def stream() -> AsyncGenerator[str, None]:
        try:
            yield ": connected\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
                    yield _sse_data(event)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            broker.unsubscribe(queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers=headers,
    )
