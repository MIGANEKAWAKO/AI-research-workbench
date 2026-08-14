"""vault 路径推导：kb / fs / 未来 B5 共用一处定义（见 ADR-0001）。"""

from __future__ import annotations

from pathlib import Path

from .config import settings


def default_vault_path() -> Path:
    """vault 路径优先级：.env VAULT_PATH → 开发默认 backend/vault（见 ADR-0001）。"""
    if settings.vault_path:
        return Path(settings.vault_path)
    return Path(__file__).resolve().parent.parent / "vault"


def kb_root() -> Path:
    if settings.kb_dir:
        return Path(settings.kb_dir)
    return default_vault_path() / ".kb"


def chroma_dir() -> Path:
    return kb_root() / "chroma_db"
