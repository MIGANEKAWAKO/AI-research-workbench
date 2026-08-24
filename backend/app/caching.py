"""X1 本地缓存层：内存 TTLCache（embedding / 检索结果）+ 磁盘 TTL（元数据）。

零第三方依赖，自实现（不引 Redis / cachetools）：
- TTLCache：OrderedDict LRU（move_to_end 淘汰最久未用）+ threading.Lock
  （embedding/检索跑在线程池里，必须防并发）+ TTL 惰性过期
- MetadataDiskCache：.kb/metadata_cache.json（literature.json 同款原子写 + 损坏降级），
  存磁盘是因为元数据补全是跨进程生命周期的慢网络操作，重启后仍应命中

redis_url 配置位已留在 config.py（未来多进程部署可选启用），第一版不用。
"""

from __future__ import annotations

import json
import os
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any

DEFAULT_TTL_CAPACITY = 512
DEFAULT_DISK_MAX_ENTRIES = 1000


class TTLCache:
    """通用内存缓存：LRU 容量上限 + TTL 过期 + 线程安全。

    get 命中时 move_to_end 更新 LRU 序；过期条目惰性淘汰（get 时检查删除）。
    命中打印 [cache] hit 日志（M2 验收"命中可见"；P4 日志化后迁 logging）。
    """

    def __init__(self, capacity: int = DEFAULT_TTL_CAPACITY):
        self._data: OrderedDict[str, tuple[Any, float | None]] = OrderedDict()
        self._capacity = capacity
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: str) -> Any | None:
        with self._lock:
            item = self._data.get(key)
            if item is None:
                self.misses += 1
                return None
            value, expires_at = item
            if expires_at is not None and time.monotonic() > expires_at:
                del self._data[key]
                self.misses += 1
                return None
            self._data.move_to_end(key)
            self.hits += 1
            print(f"[cache] hit: {key[:60]}")
            return value

    def set(self, key: str, value: Any, ttl_seconds: float | None = None) -> None:
        with self._lock:
            expires_at = time.monotonic() + ttl_seconds if ttl_seconds else None
            self._data[key] = (value, expires_at)
            self._data.move_to_end(key)
            while len(self._data) > self._capacity:
                self._data.popitem(last=False)  # 淘汰最久未用

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)


class MetadataDiskCache:
    """磁盘 TTL 缓存：{identifier: {data, fetched_at}}，原子写 + 损坏降级。

    7 天 TTL 惰性过期；超上限（1000 条）删除最旧（dict 保持插入序）。
    """

    def __init__(self, path: str | Path, ttl_days: float = 7, max_entries: int = DEFAULT_DISK_MAX_ENTRIES):
        self._path = Path(path)
        self._ttl_seconds = ttl_days * 86400
        self._max_entries = max_entries
        self._lock = threading.Lock()
        self._data: dict[str, dict[str, Any]] = self._load()

    def _load(self) -> dict[str, dict[str, Any]]:
        if not self._path.exists():
            return {}
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (json.JSONDecodeError, TypeError, ValueError):
            print(f"警告: {self._path} 解析失败，按空缓存处理（.kb 可重建）")
            return {}

    def get(self, identifier: str) -> dict[str, Any] | None:
        with self._lock:
            item = self._data.get(identifier)
            if item is None:
                return None
            if time.time() - item.get("fetched_at", 0) > self._ttl_seconds:
                del self._data[identifier]
                return None
            print(f"[cache] hit: {identifier}")
            return item.get("data")

    def set(self, identifier: str, data: dict[str, Any]) -> None:
        with self._lock:
            self._data[identifier] = {"data": data, "fetched_at": time.time()}
            while len(self._data) > self._max_entries:
                del self._data[next(iter(self._data))]  # 删除最旧插入的条目
            self._save()

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_name(self._path.name + ".tmp")
        tmp.write_text(
            json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        os.replace(tmp, self._path)
