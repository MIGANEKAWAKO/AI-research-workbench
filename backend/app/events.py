"""事件广播（A5）：SSE 推送的进程内发布/订阅中枢。

watcher 的 asyncio 任务 publish → 所有 SSE 订阅者队列收到事件。
单进程内存实现；多进程部署（未来 settings.redis_url）时换实现、接口不变。
"""

from __future__ import annotations

import asyncio
from typing import Any

MAX_QUEUE_SIZE = 100


class EventBroker:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        """SSE 连接建立时调用；返回该连接的专属队列。"""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(queue)

    def publish(self, event: dict[str, Any]) -> None:
        """广播事件；消费过慢的订阅者丢最旧事件（SSE 是幂等刷新信号，不积压）。"""
        for queue in list(self._subscribers):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass


broker = EventBroker()
