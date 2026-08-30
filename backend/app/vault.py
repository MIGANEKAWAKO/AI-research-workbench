"""vault 路径推导：kb / fs / 未来 B5 共用一处定义（见 ADR-0001）。"""

from __future__ import annotations

from pathlib import Path

from .config import settings
from .paths import app_data_dir


def default_vault_path() -> Path:
    """vault 路径优先级：.env VAULT_PATH → 开发默认 backend/vault（见 ADR-0001）。

    打包态兜底为 exe 同目录 vault/（向导必填 VAULT_PATH，兜底极少触发）。
    """
    if settings.vault_path:
        return Path(settings.vault_path)
    return app_data_dir() / "vault"


def kb_root() -> Path:
    if settings.kb_dir:
        return Path(settings.kb_dir)
    return default_vault_path() / ".kb"


def chroma_dir() -> Path:
    return kb_root() / "chroma_db"


class VaultPathError(ValueError):
    """vault 相对路径越界或非法。"""


def _normalize_relative(relative: str) -> str:
    """去掉首部斜杠与 . 段，空串表示 vault 根。"""
    relative = (relative or "").strip().replace("\\", "/")
    while relative.startswith("./"):
        relative = relative[2:]
    return relative.lstrip("/")


def resolve_vault_path(relative: str) -> Path:
    """vault 内相对路径 → 绝对路径；越界抛 VaultPathError（resolve 防 ../ 与符号链接）。

    fs 路由与 agent 的 note_read 共用此安全边界（单一实现，ADR-0001 路径语义）。
    """
    vault = default_vault_path().resolve()
    target = (vault / _normalize_relative(relative)).resolve()
    if not target.is_relative_to(vault):
        raise VaultPathError(f"路径越界: {relative!r}")
    return target
