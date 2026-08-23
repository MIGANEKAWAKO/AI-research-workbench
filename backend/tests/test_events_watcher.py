"""M2 A5：事件广播 broker、SSE 端点帧格式、watcher 防抖与忽略规则。

无限流端点（GET /api/events）不能走 TestClient 直接取完整响应，改为在
同一事件循环内直接驱动 StreamingResponse 的 body_iterator（跨线程 publish
会丢失 asyncio.Queue 唤醒，见 docs/面试问答.md ④Q21）。
"""

from __future__ import annotations

import asyncio
import json
import queue
import time
from types import SimpleNamespace

from app.events import broker
from app.routers import events as events_router
from app.watcher import _VaultHandler


# ---- broker：订阅 / 广播 / 退订 ----

def test_broker_publish_and_unsubscribe():
    broker._subscribers.clear()
    q = broker.subscribe()

    async def run():
        broker.publish({"type": "vault.changed", "report": {"indexed": 1}})
        return await asyncio.wait_for(q.get(), timeout=1)

    event = asyncio.run(run())
    assert event["type"] == "vault.changed"
    broker.unsubscribe(q)
    assert len(broker._subscribers) == 0


# ---- SSE 端点：连接帧 / 事件帧 / 断开退订 ----

def test_events_endpoint_frames():
    broker._subscribers.clear()

    async def run():
        resp = await events_router.events()
        it = resp.body_iterator
        assert (await it.__anext__()).startswith(": connected")
        broker.publish({"type": "vault.changed", "report": {"indexed": 1}, "ts": "x"})
        frame = await it.__anext__()
        assert json.loads(frame[6:])["type"] == "vault.changed"
        await it.aclose()  # 模拟客户端断开 → finally 退订
        assert len(broker._subscribers) == 0

    asyncio.run(run())


def test_events_endpoint_heartbeat(monkeypatch):
    monkeypatch.setattr(events_router, "HEARTBEAT_INTERVAL", 0.1)

    async def run():
        resp = await events_router.events()
        it = resp.body_iterator
        await it.__anext__()
        frame = await asyncio.wait_for(it.__anext__(), timeout=2)
        assert frame.startswith(": ping")
        await it.aclose()

    asyncio.run(run())


# ---- handler：忽略规则 + 防抖合并 ----

def test_handler_ignores_tmp_and_git(tmp_path):
    q: queue.Queue[str] = queue.Queue()
    h = _VaultHandler(q, debounce=0.2)
    h.on_any_event(SimpleNamespace(is_directory=False, src_path=str(tmp_path / "a.md.tmp")))
    h.on_any_event(SimpleNamespace(is_directory=False, src_path=str(tmp_path / ".git" / "index")))
    h.on_any_event(SimpleNamespace(is_directory=True, src_path=str(tmp_path / "子目录")))
    time.sleep(0.4)
    assert q.empty()


def test_handler_debounce_merges_burst(tmp_path):
    q: queue.Queue[str] = queue.Queue()
    h = _VaultHandler(q, debounce=0.2)
    # 原子写事件风暴：created + modified 连续到达 → 防抖合并为一次
    for name in ("a.md", "a.md"):
        h.on_any_event(SimpleNamespace(is_directory=False, src_path=str(tmp_path / name)))
    time.sleep(0.5)
    assert q.get() == "rescan"
    assert q.empty()


# ---- 真实 watchdog 集成：文件事件 → 防抖 → 重扫信号 ----

def test_observer_delivers_rescan_signal(tmp_path):
    from watchdog.observers import Observer

    q: queue.Queue[str] = queue.Queue()
    h = _VaultHandler(q, debounce=0.2)
    obs = Observer()
    obs.schedule(h, str(tmp_path), recursive=True)
    obs.start()
    try:
        (tmp_path / "n.md").write_text("hi", encoding="utf-8")
        assert q.get(timeout=5) == "rescan"
    finally:
        obs.stop()
        obs.join(timeout=2)
