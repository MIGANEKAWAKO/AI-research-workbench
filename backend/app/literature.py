"""文献元数据持久层：vault/.kb/literature.json 的读/写/增/删/查。

.json 是派生数据（可删可重建）：解析失败按空库处理并告警。
写一律原子写（tmp + os.replace），防止写一半损坏核心元数据。
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from pydantic import BaseModel

from .vault import kb_root


class LiteratureEntry(BaseModel):
    """文献元数据，字段对齐 PRD 5.4。"""

    id: str
    title: str
    authors: list[dict[str, str]] = []
    year: int | None = None
    venue: str = ""
    volume: str = ""
    issue: str = ""
    pages: str = ""
    doi: str = ""
    arxivId: str = ""
    pdfPath: str = ""  # vault 内相对路径
    status: str = "未读"
    collectionIds: list[str] = []
    tags: list[str] = []
    importedAt: str = ""


def _literature_path() -> Path:
    return kb_root() / "literature.json"


def _atomic_write_text(path: Path, content: str) -> None:
    """原子写：tmp + os.replace，防半截文件（与 fs.write 同款思路）。"""
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)


def load_literature() -> list[LiteratureEntry]:
    """读文献列表；文件不存在 → []；JSON 损坏 → 告警 + []（.kb 可重建）。"""
    path = _literature_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return [LiteratureEntry(**item) for item in data]
    except (json.JSONDecodeError, TypeError, ValueError):
        print(f"警告: {path} 解析失败，按空库处理（.kb 可由后端重建）")
        return []


def save_literature(entries: list[LiteratureEntry]) -> None:
    path = _literature_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(
        [entry.model_dump() for entry in entries], ensure_ascii=False, indent=2
    )
    _atomic_write_text(path, content)


def get_entry(lit_id: str) -> LiteratureEntry | None:
    for entry in load_literature():
        if entry.id == lit_id:
            return entry
    return None


def add_entry(entry: LiteratureEntry) -> None:
    entries = load_literature()
    entries.append(entry)
    save_literature(entries)


def remove_entry(lit_id: str) -> bool:
    entries = load_literature()
    remaining = [entry for entry in entries if entry.id != lit_id]
    if len(remaining) == len(entries):
        return False
    save_literature(remaining)
    return True
