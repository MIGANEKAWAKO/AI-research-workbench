"""笔记 frontmatter 解析（后端侧，与前端 gray-matter 解析同一文件）。"""

from __future__ import annotations

import re
from typing import Any

import yaml

FRONTMATTER_PATTERN = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.DOTALL)


def parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    """解析 frontmatter：返回 (meta dict, 正文)。无 frontmatter → ({}, 原内容)。"""
    match = FRONTMATTER_PATTERN.match(content)
    if not match:
        return {}, content
    try:
        meta = yaml.safe_load(match.group(1)) or {}
        if not isinstance(meta, dict):
            meta = {}
    except yaml.YAMLError:
        meta = {}
    return meta, content[match.end():]
