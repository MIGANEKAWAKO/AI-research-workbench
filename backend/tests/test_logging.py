"""P4 验收：日志初始化幂等、写入滚动文件、文件轮转。"""

import logging
from logging.handlers import RotatingFileHandler

from app import log as log_module


def _cleanup_root():
    """移除测试添加的 handler，避免污染其他测试文件。"""
    root = logging.getLogger()
    for handler in root.handlers[:]:
        root.removeHandler(handler)
    log_module._initialized = False


def test_setup_logging_idempotent():
    root = logging.getLogger()
    _cleanup_root()
    try:
        log_module.setup_logging()
        first = len(root.handlers)
        log_module.setup_logging()  # 第二次调用应早退
        assert len(root.handlers) == first == 2  # file + console 各一个
    finally:
        _cleanup_root()


def test_log_writes_to_file(tmp_path, monkeypatch):
    monkeypatch.setattr(log_module, "LOG_DIR", tmp_path)
    _cleanup_root()
    try:
        log_module.setup_logging()
        logging.getLogger("test_logging").info("hello log %d", 42)
        content = (tmp_path / "app.log").read_text(encoding="utf-8")
        assert "hello log 42" in content
        assert "INFO" in content
        assert "test_logging" in content  # 模块名可见
    finally:
        _cleanup_root()


def test_log_rotates_when_full(tmp_path, monkeypatch):
    monkeypatch.setattr(log_module, "LOG_DIR", tmp_path)
    monkeypatch.setattr(log_module, "MAX_BYTES", 200)
    _cleanup_root()
    try:
        log_module.setup_logging()
        test_logger = logging.getLogger("rotate_test")
        for i in range(30):
            test_logger.info("line %d with padding to exceed the tiny limit", i)
        backups = list(tmp_path.glob("app.log.*"))
        assert backups  # 超出容量后产生轮转备份文件
    finally:
        _cleanup_root()
