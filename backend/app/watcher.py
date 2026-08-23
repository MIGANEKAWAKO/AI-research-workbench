"""vault 变更监听（A5）：watchdog 文件事件 → 防抖 → 增量重扫 → SSE 广播。

线程模型：watchdog Observer 是阻塞库，跑在独立线程；事件处理器把"需要重扫"
的信号放进 thread-safe queue.Queue。asyncio 后台任务（VaultWatcher._run）轮询
该队列，拿到信号后执行 scan_and_index（to_thread，增量 mtime 比对近乎零成本），
完成后 broker.publish("vault.changed")。

只监听 vault/笔记 与 vault/文献（用户可见内容）；.kb 由后端自己维护，
监听它会与"重扫写 index_state.json"形成自激循环（详见模块说明 A5 决策）。
"""

from __future__ import annotations

import asyncio
import queue
import threading
import time
from datetime import datetime
from pathlib import Path

import anyio
from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from .events import broker
from .indexer import scan_and_index
from .vault import default_vault_path

# 忽略：原子写临时文件、Office 锁文件、git 内部
_IGNORE_SUFFIXES = (".tmp", ".swp", "~")
_IGNORE_DIRS = (".git", ".kb", "node_modules", "__pycache__")

DEBOUNCE_SECONDS = 2.0  # 文件写入风暴（原子写产生多次事件）合并为一次重扫
POLL_INTERVAL = 0.3  # asyncio 侧轮询信号队列的间隔
WAIT_VAULT_INTERVAL = 5.0  # vault 尚未创建（首次启动向导前）时的探测间隔


class _VaultHandler(FileSystemEventHandler):
    """防抖处理器：任一事件重置 2s 计时器，计时器到期且期间无新事件才触发重扫。"""

    def __init__(self, signal_queue: queue.Queue[str], debounce: float) -> None:
        self._signal_queue = signal_queue
        self._debounce = debounce
        self._last_event = 0.0
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    @staticmethod
    def _should_ignore(path: str) -> bool:
        p = path.replace("\\", "/")
        if p.endswith(_IGNORE_SUFFIXES):
            return True
        return any(f"/{d}/" in f"/{p}/" for d in _IGNORE_DIRS)

    def on_any_event(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            # 目录事件与文件事件成对出现（创建/移动），只响应文件事件避免重复触发
            return
        if self._should_ignore(event.src_path):
            return
        with self._lock:
            now = time.monotonic()
            self._last_event = now
            if self._timer is not None:
                self._timer.cancel()
            timer = threading.Timer(self._debounce, self._fire, args=(now,))
            timer.daemon = True
            self._timer = timer
            timer.start()

    def _fire(self, scheduled_at: float) -> None:
        with self._lock:
            if scheduled_at < self._last_event:
                return  # 防抖窗口内又来新事件，已由新 timer 接管，本 timer 作废
            self._timer = None
        self._signal_queue.put("rescan")


class VaultWatcher:
    def __init__(self, debounce: float = DEBOUNCE_SECONDS) -> None:
        self._signal_queue: queue.Queue[str] = queue.Queue()
        self._observer = Observer()
        self._observed: set[Path] = set()
        self._debounce = debounce
        self._task: asyncio.Task | None = None

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self._observer.start()  # 必须在 schedule 前启动观察者线程
        self._task = loop.create_task(self._run())

    def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
        try:
            self._observer.stop()
            self._observer.join(timeout=2)
        except RuntimeError:
            pass  # Observer 线程未启动

    @staticmethod
    def _watch_dirs() -> list[Path]:
        vault = default_vault_path()
        return [vault / "笔记", vault / "文献"]

    async def _run(self) -> None:
        """常驻任务：vault 目录出现的逐个监听；消费重扫信号 → 重扫 → 广播。

        目录后出现（首次启动向导尚未建 vault）时耐心探测；已有目录不受其他目录缺失影响。
        """
        while True:
            dirs = [d for d in self._watch_dirs() if d.exists()]
            if not dirs:
                await asyncio.sleep(WAIT_VAULT_INTERVAL)
                continue

            self._ensure_observing(dirs)
            if not self._signal_queue.empty():
                while not self._signal_queue.empty():
                    self._signal_queue.get()  # 一轮防抖只重扫一次
                await self._rescan_and_broadcast()
            await asyncio.sleep(POLL_INTERVAL)

    def _ensure_observing(self, dirs: list[Path]) -> None:
        for watch_dir in dirs:
            if watch_dir in self._observed:
                continue
            try:
                self._observer.schedule(
                    _VaultHandler(self._signal_queue, self._debounce),
                    str(watch_dir),
                    recursive=True,
                )
                self._observed.add(watch_dir)
                print(f"watchdog: 开始监听 {watch_dir}")
            except Exception as exc:
                print(f"watchdog: 监听 {watch_dir} 失败（继续轮询兜底）: {exc!r}")

    async def _rescan_and_broadcast(self) -> None:
        try:
            report = await anyio.to_thread.run_sync(scan_and_index)
            broker.publish(
                {
                    "type": "vault.changed",
                    "report": {
                        "scanned": report["scanned"],
                        "indexed": report["indexed"],
                        "deleted": report["deleted"],
                        "skipped": report["skipped"],
                    },
                    "ts": datetime.now().isoformat(timespec="seconds"),
                }
            )
        except Exception as exc:
            print("watchdog 重扫失败（仍广播通知前端刷新）:", repr(exc))
            broker.publish(
                {
                    "type": "vault.changed",
                    "error": "增量重扫失败，索引可能滞后",
                    "ts": datetime.now().isoformat(timespec="seconds"),
                }
            )
