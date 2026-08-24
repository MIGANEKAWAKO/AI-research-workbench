"""P4 后端日志：滚动文件 + 控制台双输出。

setup_logging() 在 lifespan 启动时调用一次（幂等）；
运行路径统一用 logging.getLogger(__name__)，CLI 脚本（__main__）保留 print。
隐私约定：不记录对话/笔记全文与 API key，只记元信息（类型/长度/耗时/错误）。
"""

from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_FILE = "app.log"
MAX_BYTES = 1024 * 1024  # 1MB
BACKUP_COUNT = 3
FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"

_initialized = False


def setup_logging() -> None:
    """幂等初始化：滚动文件（1MB × 3 备份）+ 控制台输出。"""
    global _initialized
    if _initialized:
        return
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    formatter = logging.Formatter(FORMAT)

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    file_handler = RotatingFileHandler(
        LOG_DIR / LOG_FILE,
        maxBytes=MAX_BYTES,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    root.addHandler(file_handler)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    root.addHandler(console)

    _initialized = True
