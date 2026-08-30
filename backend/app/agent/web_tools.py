"""联网搜索工具（A4）：可配置 Provider 接口 + 未配置降级。

第一版不绑定具体供应商：build_web_provider() 按配置返回 Provider 或 None；
provider 为 None 时 web_search 工具仍注册（模型可见），执行返回结构化失败，
由 Orchestrator 降级到本地结果——验收场景"联网失败仍能本地回答"即由此保证。
接入供应商时实现 WebSearchProvider 协议并在 build_web_provider() 分发即可。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Protocol

from pydantic import BaseModel, Field

logger = logging.getLogger("web_tools")

from ..config import settings
from .models import ToolResult
from .tools import BaseTool

# 单条结果 snippet 截断上限（防超长结果撑爆模型上下文）
WEB_SNIPPET_LIMIT = 200


class WebSearchProvider(Protocol):
    """搜索供应商接口：返回归一化结果列表。接入 Tavily/SearXNG 等时实现此协议。

    每条结果至少含 url/title/snippet，可选 published_at/source_name。
    """

    async def search(self, query: str, limit: int) -> list[dict[str, Any]]: ...


class WebSearchArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=200, description="搜索关键词")
    recency_days: int | None = Field(default=None, ge=1, le=365, description="限定最近 N 天")
    limit: int = Field(default=5, ge=1, le=10, description="最多返回结果数")


class WebSearchTool(BaseTool):
    name = "web_search"
    description = "搜索互联网公开信息，补充本地库之外的最新研究进展。"
    args_model = WebSearchArgs

    def __init__(self, provider: WebSearchProvider | None, timeout: float | None = None):
        self.provider = provider
        self.timeout = timeout if timeout is not None else settings.web_search_timeout

    async def run(self, args: WebSearchArgs) -> ToolResult:
        if self.provider is None:
            return ToolResult(
                ok=False, tool_name=self.name, error="联网搜索未配置，请改用本地工具"
            )
        try:
            results = await asyncio.wait_for(
                self.provider.search(args.query, args.limit), timeout=self.timeout
            )
        except asyncio.TimeoutError:
            return ToolResult(ok=False, tool_name=self.name, error="联网搜索超时")
        except Exception as exc:
            return ToolResult(ok=False, tool_name=self.name, error=f"联网搜索失败: {exc}")
        if not results:
            return ToolResult(ok=False, tool_name=self.name, error="联网搜索无结果")
        sources = [
            {
                "url": r.get("url"),
                "title": r.get("title"),
                "snippet": (r.get("snippet") or "")[:WEB_SNIPPET_LIMIT],
                "published_at": r.get("published_at"),
                "source_name": r.get("source_name"),
            }
            for r in results[: args.limit]
        ]
        return ToolResult(
            ok=True, tool_name=self.name, data={"hits": len(sources)}, sources=sources
        )


def build_web_provider() -> WebSearchProvider | None:
    """按配置构造搜索供应商；未配置返回 None（接入供应商时在此按 settings.web_search_provider 分发）。"""
    if not settings.web_search_provider:
        return None
    # 第一版无内置供应商：配置了名称但未实现时也返回 None，避免假实现
    logger.warning(
        "联网搜索供应商 %r 尚未接入，web_search 将降级失败", settings.web_search_provider
    )
    return None
