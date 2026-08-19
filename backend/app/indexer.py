"""索引管理：扫描 vault 笔记/文献，按 mtime+size 增量维护向量索引。

state 文件 .kb/index_state.json 记录每个已索引文件的时间戳与块数，
是"元数据的元数据"——丢了可 force 全量重建，非用户数据。

笔记 docId = 相对路径去 .md（PRD 5.4 笔记 frontmatter 无 id 字段，路径是天然稳定键）；
文献 docId = literature.json 中的 lit_id（B5 权威元数据）。
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from . import kb
from .frontmatter import parse_frontmatter
from .literature import load_literature
from .vault import default_vault_path, kb_root

NOTE_DIR = "笔记"
INDEX_STATE_FILE = "index_state.json"


def _state_path() -> Path:
    return kb_root() / INDEX_STATE_FILE


def _load_state() -> dict[str, Any]:
    path = _state_path()
    if not path.exists():
        return {"lastScan": "", "note": {}, "paper": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {
            "lastScan": data.get("lastScan", ""),
            "note": data.get("note", {}),
            "paper": data.get("paper", {}),
        }
    except (json.JSONDecodeError, TypeError, ValueError):
        print(f"警告: {path} 解析失败，按空状态处理（将全量重建）")
        return {"lastScan": "", "note": {}, "paper": {}}


def _save_state(state: dict[str, Any]) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    os.replace(tmp, path)


def _file_signature(path: Path) -> tuple[int, int]:
    stat = path.stat()
    return int(stat.st_mtime), stat.st_size


def _extract_note_text(path: Path) -> tuple[str, str]:
    """解析笔记 frontmatter：返回 (title, 正文)。frontmatter 不进向量。"""
    content = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(content)
    title = str(meta["title"]) if meta.get("title") else path.stem
    return title, body.strip()


def _rel_to_vault(path: Path, vault: Path) -> str:
    return str(path.relative_to(vault)).replace("\\", "/")


def scan_and_index(force: bool = False) -> dict[str, Any]:
    """全量/增量扫描 vault 并维护索引，返回报告。"""
    vault = default_vault_path()
    report = {"scanned": 0, "indexed": 0, "deleted": 0, "skipped": 0,
              "errors": [], "totalChunks": 0}
    state = _load_state()

    # force：按旧 state 全部清理，再全量重建（解决 state 损坏/索引逻辑升级）
    if force:
        for doc_type, items in (("note", state["note"]), ("paper", state["paper"])):
            for rel, info in items.items():
                doc_id = info.get("docId") or rel[:-3]
                kb.delete_document(doc_id)
        state = {"lastScan": "", "note": {}, "paper": {}}

    # ---- 笔记侧：glob vault/笔记/*.md ----
    note_dir = vault / NOTE_DIR
    notes: dict[str, Path] = {}
    if note_dir.exists():
        notes = {
            _rel_to_vault(p, vault): p for p in note_dir.glob("*.md")
        }
    report["scanned"] += len(notes)

    for rel, note_path in notes.items():
        old = state["note"].get(rel)
        try:
            sig = _file_signature(note_path)
            if old and (old["mtime"], old["size"]) == sig:
                report["skipped"] += 1
                continue
            doc_id = rel[:-3]
            title, text = _extract_note_text(note_path)
            chunks = kb.upsert_document("note", doc_id, title, text=text)
            state["note"][rel] = {"docId": doc_id, "mtime": sig[0],
                                  "size": sig[1], "chunks": chunks}
            report["indexed"] += 1
        except Exception as exc:
            report["errors"].append(f"{rel}: {exc!r}")

    # ---- 文献侧：literature.json 是权威 ----
    papers = {entry.pdfPath: entry for entry in load_literature()}
    report["scanned"] += len(papers)

    for pdf_rel, entry in papers.items():
        pdf_abs = vault / pdf_rel
        old = state["paper"].get(pdf_rel)
        try:
            if not pdf_abs.exists():
                # literature 有记录但文件丢失：清索引，literature 由 B5 删除流程管
                kb.delete_document(entry.id)
                state["paper"].pop(pdf_rel, None)
                report["deleted"] += 1
                continue
            sig = _file_signature(pdf_abs)
            if old and (old["mtime"], old["size"]) == sig:
                report["skipped"] += 1
                continue
            chunks = kb.upsert_document(
                "paper", entry.id, entry.title,
                pages=kb.extract_pdf_pages(pdf_abs),
            )
            state["paper"][pdf_rel] = {"docId": entry.id, "mtime": sig[0],
                                       "size": sig[1], "chunks": chunks}
            report["indexed"] += 1
        except Exception as exc:
            report["errors"].append(f"{pdf_rel}: {exc!r}")

    # ---- 消失清理：state 有但磁盘/literature 已无 ----
    for rel in list(state["note"]):
        if rel not in notes:
            kb.delete_document(state["note"][rel]["docId"])
            del state["note"][rel]
            report["deleted"] += 1
    for rel in list(state["paper"]):
        if rel not in papers:
            kb.delete_document(state["paper"][rel]["docId"])
            del state["paper"][rel]
            report["deleted"] += 1

    # ---- 收尾 ----
    state["lastScan"] = datetime.now().isoformat(timespec="seconds")
    _save_state(state)
    report["totalChunks"] = sum(
        info.get("chunks", 0) for info in state["note"].values()
    ) + sum(info.get("chunks", 0) for info in state["paper"].values())
    return report


def get_index_status() -> dict[str, Any]:
    """索引健康度：chunk 数、已索引/未索引文件、上次扫描时间。"""
    vault = default_vault_path()
    state = _load_state()
    indexed_notes = len(state["note"])
    indexed_papers = len(state["paper"])

    unindexed: list[str] = []
    note_dir = vault / NOTE_DIR
    if note_dir.exists():
        for p in note_dir.glob("*.md"):
            rel = _rel_to_vault(p, vault)
            if rel not in state["note"]:
                unindexed.append(rel)
    for entry in load_literature():
        if entry.pdfPath not in state["paper"]:
            unindexed.append(entry.pdfPath)

    return {
        "chunks": sum(info.get("chunks", 0)
                      for info in list(state["note"].values())
                      + list(state["paper"].values())),
        "indexedNotes": indexed_notes,
        "indexedPapers": indexed_papers,
        "unindexedFiles": unindexed,
        "lastScan": state["lastScan"],
    }
