"""vault 文件 API：开发期前端文件读写的 HTTP 兜底（发布期换 Tauri 原生 fs）。

安全：所有 path 为 vault 内相对路径，resolve 后必须仍在 vault 内（防目录穿越）。
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..vault import VaultPathError, default_vault_path, resolve_vault_path

router = APIRouter()


class WriteRequest(BaseModel):
    content: str


def _vault_root() -> Path:
    return default_vault_path().resolve()


def _resolve_vault_path(relative: str) -> Path:
    """相对 vault 的路径 → 绝对路径；越界抛 403（安全逻辑统一在 vault.resolve_vault_path）。"""
    try:
        return resolve_vault_path(relative)
    except VaultPathError:
        raise HTTPException(status_code=403, detail="路径越界")


def _require_file(target: Path) -> None:
    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    if not target.is_file():
        raise HTTPException(status_code=400, detail="不是文件")


def _require_dir(target: Path) -> None:
    if not target.exists():
        raise HTTPException(status_code=404, detail="目录不存在")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="不是目录")


@router.get("/list")
def list_dir(path: str = ""):
    target = _resolve_vault_path(path)
    _require_dir(target)
    vault = _vault_root()
    entries = []
    for entry in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        rel = str(entry.relative_to(vault)).replace("\\", "/")
        entries.append({"name": entry.name, "isDir": entry.is_dir(), "path": rel})
    return {"entries": entries}


@router.get("/read")
def read_file(path: str = ""):
    target = _resolve_vault_path(path)
    _require_file(target)
    try:
        content = target.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        raise HTTPException(status_code=400, detail="无法按文本读取（可能是二进制文件）")
    return {"content": content}


@router.get("/file")
def get_file(path: str = ""):
    """二进制文件流（PDF 等），供前端 fetch 为 blob。"""
    target = _resolve_vault_path(path)
    _require_file(target)
    return FileResponse(target)


@router.post("/write")
def write_file(req: WriteRequest, path: str = ""):
    """创建/覆盖一体；原子写（tmp + os.replace），自动保存高频写不怕半截文件。"""
    target = _resolve_vault_path(path)
    if target.exists() and target.is_dir():
        raise HTTPException(status_code=400, detail="不能写目录")
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(target.name + ".tmp")
        tmp.write_text(req.content, encoding="utf-8")
        os.replace(tmp, target)
    except OSError:
        try:
            if target.with_name(target.name + ".tmp").exists():
                target.with_name(target.name + ".tmp").unlink()
        except OSError:
            pass
        raise HTTPException(status_code=500, detail="写入失败")
    return {"ok": True}


@router.post("/mkdir")
def make_dir(path: str = ""):
    target = _resolve_vault_path(path)
    if target.exists():
        raise HTTPException(status_code=400, detail="已存在")
    try:
        target.mkdir(parents=True, exist_ok=False)
    except OSError:
        raise HTTPException(status_code=500, detail="创建目录失败")
    return {"ok": True}


@router.delete("/delete")
def delete_path(path: str = ""):
    """删除文件或空目录；目录非空拒绝（保守，防误删整棵树）。"""
    target = _resolve_vault_path(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="不存在")
    try:
        if target.is_dir():
            target.rmdir()
        else:
            target.unlink()
    except OSError:
        raise HTTPException(status_code=400, detail="目录非空或删除失败")
    return {"ok": True}


@router.get("/exists")
def path_exists(path: str = ""):
    target = _resolve_vault_path(path)
    return {"exists": target.exists()}
