"""文献元数据补全服务：DOI / arXiv ID → 规范化元数据。

数据流：identifier → detect_id_type() → Crossref / arXiv API → normalize_* → 规范 dict
失败兜底：网络错误 / 404 / 解析失败一律返回 {}，由调用方判断走手动录入。
"""

from __future__ import annotations

import re
from typing import Any, Literal

import httpx
from bs4 import BeautifulSoup

CROSSREF_API = "https://api.crossref.org/works"
ARXIV_API = "https://export.arxiv.org/api/query"
REQUEST_TIMEOUT = 10.0
# httpx 默认不跟随重定向（与 requests 不同），显式开启
FOLLOW_REDIRECTS = True

# Crossref polite pool：填邮箱后限流更宽松；留空也能用
CONTACT_EMAIL = ""

DOI_PATTERN = re.compile(r"^10\.\d{4,9}/[^\s]+$")
ARXIV_PATTERN = re.compile(r"^\d{4}\.\d{4,5}$")  # 新版：2401.00001
ARXIV_OLD_PATTERN = re.compile(r"^[a-z-]+/\d{7}$")  # 老版：hep-th/0501001

# 从 PDF 文本中提取 DOI（B5 增强）：DOI 合法字符为字母数字与 -._;()/:，
# 排除空白/中文/引号防贪婪；尾部标点（句号/逗号/括号等）单独清洗
DOI_IN_TEXT_PATTERN = re.compile(r"10\.\d{4,9}/[A-Za-z0-9._;()/:+-]+")
DOI_TRAILING_TRIM = ".,;:)]}>'\""


def extract_doi(text: str) -> str | None:
    """从文本中提取 DOI（支持 doi.org/xxx、doi: xxx、裸 DOI 三种形态），无则 None。

    - 优先匹配精确形态（doi.org/ 与 doi: 前缀），避免正文误匹配
    - 裸 DOI 要求前面不是字母/数字/点（负向后顾），防止匹配到超链接的一部分
    - 尾部清洗标点：PDF 文本中 DOI 后常跟句号/逗号/括号（如 "...130053."）
    """
    if not text:
        return None

    m = re.search(r"doi\.org\s*[/:：]\s*(10\.\d{4,9}/[A-Za-z0-9._;()/:+-]+)", text, re.IGNORECASE)
    if m:
        return m.group(1).rstrip(DOI_TRAILING_TRIM)

    m = re.search(r"doi\s*[:：]\s*(10\.\d{4,9}/[A-Za-z0-9._;()/:+-]+)", text, re.IGNORECASE)
    if m:
        return m.group(1).rstrip(DOI_TRAILING_TRIM)

    m = re.search(r"(?<![\w.])10\.\d{4,9}/[A-Za-z0-9._;()/:+-]+", text)
    if m:
        return m.group(0).rstrip(DOI_TRAILING_TRIM)

    return None


def detect_id_type(identifier: str) -> Literal["doi", "arxiv", "none"]:
    """识别标识符类型：DOI / arXiv（新老版）/ 都不像。"""
    identifier = identifier.strip()
    if DOI_PATTERN.match(identifier):
        return "doi"
    if ARXIV_PATTERN.match(identifier) or ARXIV_OLD_PATTERN.match(identifier):
        return "arxiv"
    return "none"


async def fetch_metadata(identifier: str) -> dict[str, Any]:
    """统一入口：自动识别类型并补全，失败返回 {}。"""
    id_type = detect_id_type(identifier)
    if id_type == "doi":
        return await fetch_by_doi(identifier)
    if id_type == "arxiv":
        return await fetch_by_arxiv(identifier)
    return {}


async def fetch_by_doi(doi: str) -> dict[str, Any]:
    """Crossref：GET /works/{doi}，返回 JSON message 规范化结果。"""
    url = f"{CROSSREF_API}/{doi.strip()}"
    params = {"mailto": CONTACT_EMAIL} if CONTACT_EMAIL else None
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, follow_redirects=FOLLOW_REDIRECTS) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            message = resp.json().get("message")
        if not isinstance(message, dict):
            return {}
        return normalize_crossref(message)
    except (httpx.HTTPError, ValueError):
        return {}


async def fetch_by_arxiv(arxiv_id: str) -> dict[str, Any]:
    """arXiv：GET /api/query?id_list={id}，Atom XML 取第一个 entry 规范化结果。"""
    base_id = re.sub(r"v\d+$", "", arxiv_id.strip())  # 去掉版本号 2401.00001v2 → 2401.00001
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, follow_redirects=FOLLOW_REDIRECTS) as client:
            resp = await client.get(ARXIV_API, params={"id_list": base_id})
            resp.raise_for_status()
        entries = BeautifulSoup(resp.text, "xml").find_all("entry")
        if not entries:
            return {}
        return normalize_arxiv(entries[0])
    except (httpx.HTTPError, ValueError):
        return {}


def normalize_crossref(message: dict[str, Any]) -> dict[str, Any]:
    """Crossref message → 规范化 dict（纯函数）。"""
    title = _first_or_empty(message.get("title"))
    venue = _first_or_empty(message.get("container-title"))
    year = _parse_year(
        message.get("published-print")
        or message.get("published-online")
        or message.get("issued")
    )
    keywords = message.get("subject") or []
    arxiv_id = ""
    for link in message.get("link") or []:
        url = link.get("URL") or ""
        if "arxiv" in url:
            arxiv_id = url.rsplit("/", 1)[-1]
            break
    return {
        "title": title,
        "authors": _parse_authors_crossref(message.get("author") or []),
        "year": year,
        "venue": venue,
        "volume": message.get("volume") or "",
        "issue": message.get("issue") or "",
        "pages": message.get("page") or "",
        "doi": message.get("DOI") or "",
        "arxivId": arxiv_id,
        "keywords": keywords,
    }


def normalize_arxiv(entry: Any) -> dict[str, Any]:
    """arXiv Atom entry → 规范化 dict（纯函数）。"""
    title = _arxiv_text(entry, "title").replace("\n", " ").strip()
    authors = [
        _parse_author_name(author.get_text(strip=True))
        for author in entry.find_all("author")
        if author.find("name")
    ]
    published = _arxiv_text(entry, "published")
    year = int(published[:4]) if re.match(r"^\d{4}", published) else None
    arxiv_id = re.sub(r"v\d+$", "", _arxiv_text(entry, "id").rsplit("/", 1)[-1])
    keywords = []
    primary = entry.find("arxiv:primary_category") or entry.find("primary_category")
    if primary and primary.get("term"):
        keywords = [primary["term"]]
    return {
        "title": title,
        "authors": authors,
        "year": year,
        "venue": _arxiv_text(entry, "journal_ref"),
        "volume": "",
        "issue": "",
        "pages": "",
        "doi": "",
        "arxivId": re.sub(r"v\d+$", "", arxiv_id),
        "keywords": keywords,
    }


def _parse_authors_crossref(authors: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Crossref author 列表 → [{given, family}]；机构作者名放入 family。"""
    result = []
    for author in authors:
        given = author.get("given") or ""
        family = author.get("family") or ""
        name = author.get("name") or ""
        if name and not (given or family):
            result.append({"given": "", "family": name})
        elif family or given:
            result.append({"given": given, "family": family})
    return result


def _parse_author_name(full_name: str) -> dict[str, str]:
    """"John Smith" → {given: John, family: Smith}；单 token 视为 family。"""
    parts = full_name.strip().split()
    if not parts:
        return {"given": "", "family": ""}
    if len(parts) == 1:
        return {"given": "", "family": parts[0]}
    return {"given": " ".join(parts[:-1]), "family": parts[-1]}


def _parse_year(date_info: Any) -> int | None:
    """Crossref 日期 {"date-parts": [[2024, 1, 1]]} → 2024。"""
    if not isinstance(date_info, dict):
        return None
    date_parts = date_info.get("date-parts")
    if not date_parts or not isinstance(date_parts[0], list) or not date_parts[0]:
        return None
    year = date_parts[0][0]
    return year if isinstance(year, int) else None


def _first_or_empty(values: Any) -> str:
    """Crossref 字段常为 [value] 列表，取首个非空字符串。"""
    if isinstance(values, list):
        for value in values:
            if value:
                return str(value)
        return ""
    return str(values) if values else ""


def _arxiv_text(entry: Any, tag_name: str) -> str:
    """取 Atom entry 内指定 tag 的文本，兼容命名空间前缀（arxiv:journal_ref）。"""
    for tag in entry.find_all():
        if tag.name == tag_name or (tag.name and tag.name.endswith(f":{tag_name}")):
            return tag.get_text(strip=True)
    return ""


if __name__ == "__main__":  # CLI：python -m app.metadata <DOI 或 arXiv ID>
    import asyncio
    import json
    import sys

    identifier = sys.argv[1] if len(sys.argv) > 1 else ""
    if not identifier:
        print("用法: python -m app.metadata <DOI 或 arXiv ID>")
        sys.exit(1)
    result = asyncio.run(fetch_metadata(identifier))
    print(json.dumps(result, ensure_ascii=False, indent=2))
