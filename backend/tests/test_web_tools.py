"""A4 验收：web_search 的降级（未配置/超时/异常/空结果）与 Provider 归一化输出。"""

import asyncio

import pytest

from app.agent.models import ToolResult
from app.agent.web_tools import WebSearchTool


class FakeProvider:
    def __init__(self, results=None, error=None, delay=0.0):
        self.results = results or []
        self.error = error
        self.delay = delay
        self.calls: list[tuple[str, int]] = []

    async def search(self, query, limit):
        self.calls.append((query, limit))
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        return self.results


def _run(tool, args: dict) -> ToolResult:
    return asyncio.run(tool.run(tool.args_model(**args)))


# ---- 未配置降级 ----

def test_unconfigured_provider_fails_with_clear_error():
    result = _run(WebSearchTool(provider=None), {"query": "RAG 最新进展"})
    assert result.ok is False
    assert "联网搜索未配置" in (result.error or "")


# ---- 成功路径 ----

def test_provider_results_normalized():
    provider = FakeProvider(
        results=[
            {"url": "https://example.com/a", "title": "标题A", "snippet": "摘要A" * 200},
            {"url": "https://example.com/b", "title": "标题B", "snippet": "摘要B", "published_at": "2026-08-01", "source_name": "某刊"},
        ]
    )
    result = _run(WebSearchTool(provider=provider), {"query": "RAG", "limit": 2})

    assert result.ok is True and result.data == {"hits": 2}
    assert provider.calls == [("RAG", 2)]  # limit 透传给 provider
    src = result.sources[0]
    assert src["url"] == "https://example.com/a" and src["title"] == "标题A"
    assert len(src["snippet"]) <= 200  # snippet 截断
    assert result.sources[1]["source_name"] == "某刊"


def test_provider_limit_cap():
    provider = FakeProvider(results=[{"url": "u", "title": f"t{i}"} for i in range(20)])
    result = _run(WebSearchTool(provider=provider), {"query": "x", "limit": 5})
    assert len(result.sources) == 5


# ---- 失败降级 ----

def test_provider_exception_fails_structured():
    result = _run(
        WebSearchTool(provider=FakeProvider(error=RuntimeError("网络断开"))),
        {"query": "x"},
    )
    assert result.ok is False and "联网搜索失败" in (result.error or "")


def test_provider_timeout_fails_structured():
    slow = FakeProvider(delay=0.5)
    result = asyncio.run(
        WebSearchTool(provider=slow, timeout=0.1).run(
            WebSearchTool.args_model(query="x")
        )
    )
    assert result.ok is False and "超时" in (result.error or "")


def test_empty_results_fails():
    result = _run(WebSearchTool(provider=FakeProvider(results=[])), {"query": "x"})
    assert result.ok is False and "无结果" in (result.error or "")


# ---- 参数校验 ----

def test_args_bounds_rejected():
    tool = WebSearchTool(provider=None)
    for args in ({"query": ""}, {"query": "x" * 201}, {"query": "x", "limit": 0}, {"query": "x", "limit": 11}):
        with pytest.raises(Exception):
            asyncio.run(tool.run(tool.args_model(**args)))
