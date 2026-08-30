"""引用格式化纯函数：数据与格式分层（PRD 4.5）。

输出为无编号的纯引用条目（编号 [1] [2]... 由导出层统一添加）。
字段缺省（venue/volume/issue/pages/year 为空）时对应段不输出。
"""

from __future__ import annotations

from app.literature import LiteratureEntry


def _given_initials(given: str) -> str:
    """名首字母缩写："Shuangyao" → "S"；机构作者（given 空）→ ""。"""
    return given[:1].upper() if given else ""


def _fmt_gbt7714_authors(entry: LiteratureEntry) -> str:
    """GB/T 7714 作者：姓全大写 + 名缩写（不带点），逗号连接，末尾句号。"""
    parts = [
        f"{a['family'].upper()} {_given_initials(a['given'])}".rstrip()
        for a in entry.authors
    ]
    if not parts:
        return ""
    if len(parts) > 3:
        return ", ".join(parts[:3]) + ", et al."
    return ", ".join(parts) + "."


def _fmt_apa_authors(entry: LiteratureEntry) -> str:
    """APA 作者：family, 名缩写.；两人 "& "，多人最后一位前 ", & "。"""
    parts = []
    for a in entry.authors:
        initials = _given_initials(a["given"])
        parts.append(f"{a['family']}, {initials}." if initials else a["family"])
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return f"{parts[0]}, & {parts[1]}"
    return ", ".join(parts[:-1]) + ", & " + parts[-1]


def _fmt_ieee_authors(entry: LiteratureEntry) -> str:
    """IEEE 作者：名缩写. 姓；两人 "and"，多人最后一位前 ", and "。"""
    parts = []
    for a in entry.authors:
        initials = _given_initials(a["given"])
        parts.append(f"{initials}. {a['family']}" if initials else a["family"])
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return f"{parts[0]} and {parts[1]}"
    return ", ".join(parts[:-1]) + ", and " + parts[-1]


def format_gbt7714(entry: LiteratureEntry) -> str:
    """GB/T 7714 顺序编码制：LIU S, YUN L. 标题[J]. 刊名, 2026, 410(1): 130053. """
    # 年卷页码段：2026, 410(1): 130053（卷页用冒号紧连，与其他段逗号分隔）
    seg = []
    if entry.year:
        seg.append(str(entry.year))
    vol = entry.volume or ""
    issue = f"({entry.issue})" if entry.issue else ""
    if vol or issue:
        seg.append(f"{vol}{issue}" + (f": {entry.pages}" if entry.pages else ""))
    elif entry.pages:
        seg.append(entry.pages)
    year_vol_iss_pa = ", ".join(seg)

    authors = _fmt_gbt7714_authors(entry)
    result = f"{authors} {entry.title}[J].".strip()
    tail = []
    if entry.venue:
        tail.append(entry.venue)
    if year_vol_iss_pa:
        tail.append(year_vol_iss_pa)
    if tail:
        result += " " + ", ".join(tail) + "."
    return result


def format_apa(entry: LiteratureEntry) -> str:
    """APA 7th：Liu, S., & Yun, L. (2026). 标题. 刊名, 410(1), 130053. """
    authors = _fmt_apa_authors(entry)
    year_part = f" ({entry.year})." if entry.year else ""
    result = f"{authors}{year_part} {entry.title}.".strip()

    seg = []
    vol = entry.volume or ""
    issue = f"({entry.issue})" if entry.issue else ""
    if vol or issue:
        seg.append(f"{vol}{issue}")
    if entry.pages:
        seg.append(entry.pages)
    tail = []
    if entry.venue:
        tail.append(entry.venue)
    if seg:
        tail.append(", ".join(seg))
    if tail:
        result += " " + ", ".join(tail) + "."
    return result


def format_ieee(entry: LiteratureEntry) -> str:
    """IEEE：S. Liu and L. Yun, "标题," 刊名, vol. 410, no. 1, pp. 130053, 2026. """
    authors = _fmt_ieee_authors(entry)
    result = f'{authors}, "{entry.title},"'.strip()

    seg = []
    if entry.volume:
        seg.append(f"vol. {entry.volume}")
    if entry.issue:
        seg.append(f"no. {entry.issue}")
    if entry.pages:
        seg.append(f"pp. {entry.pages}")
    tail = []
    if entry.venue:
        tail.append(entry.venue)
    if seg:
        tail.append(", ".join(seg))
    if entry.year:
        tail.append(str(entry.year))
    if tail:
        result += " " + ", ".join(tail) + "."
    else:
        # IEEE 主体以引号逗号结尾，无尾段时必须补终止句号
        result += "."
    return result


FORMATTERS = {"gbt7714": format_gbt7714, "apa": format_apa, "ieee": format_ieee}
