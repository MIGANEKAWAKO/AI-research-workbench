"""A1 验收：非法工具名/参数不会执行真实工具；合法调用正常执行；Function Calling 定义可生成。"""

import asyncio

import pytest
from pydantic import BaseModel, Field

from app.agent.models import ToolResult
from app.agent.tools import BaseTool, ToolArgumentError, ToolRegistry


class _FakeArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=10)
    top_k: int = Field(default=5, ge=1, le=20)


class FakeTool(BaseTool):
    """假工具：类级 calls 记录真实执行次数，用于断言"非法调用未执行"。"""

    name = "fake_search"
    description = "假搜索工具（A1 测试用）"
    args_model = _FakeArgs
    calls: list[dict] = []

    async def run(self, args: _FakeArgs) -> ToolResult:
        FakeTool.calls.append({"query": args.query, "top_k": args.top_k})
        return ToolResult(ok=True, tool_name=self.name, data={"query": args.query})


class ExplodingTool(BaseTool):
    """执行必抛异常的工具：验证 registry 兜底为结构化失败。"""

    name = "explode"
    description = "必炸工具"
    args_model = _FakeArgs

    async def run(self, args: _FakeArgs) -> ToolResult:
        raise RuntimeError("内部错误")


@pytest.fixture(autouse=True)
def _clear_calls():
    FakeTool.calls.clear()
    yield


def _registry() -> ToolRegistry:
    return ToolRegistry([FakeTool(), ExplodingTool()])


def _run(registry: ToolRegistry, name: str, args: dict) -> ToolResult:
    return asyncio.run(registry.run(name, args))


# ---- 白名单 ----

def test_unknown_tool_not_executed():
    result = _run(_registry(), "no_such_tool", {"query": "x"})
    assert result.ok is False
    assert "未知工具" in (result.error or "")
    assert FakeTool.calls == []


def test_get_unknown_returns_none():
    assert _registry().get("no_such_tool") is None


def test_names_whitelist():
    assert _registry().names == ["explode", "fake_search"]


# ---- 参数校验：非法参数不执行 ----

@pytest.mark.parametrize(
    "arguments",
    [
        {},  # 缺必填 query
        {"query": "x", "top_k": "many"},  # 类型错误
        {"query": "x" * 11},  # 超长（max_length=10）
        {"query": "", "top_k": 5},  # 空串（min_length=1）
        {"query": "x", "top_k": 100},  # 越界（le=20）
        {"query": "x", "top_k": 0},  # 越界（ge=1）
    ],
)
def test_invalid_arguments_not_executed(arguments):
    result = _run(_registry(), "fake_search", arguments)
    assert result.ok is False
    assert "参数非法" in (result.error or "")
    assert FakeTool.calls == []


def test_validate_raises_tool_argument_error():
    with pytest.raises(ToolArgumentError):
        FakeTool().validate({"query": "x" * 11})


# ---- 合法调用 ----

def test_valid_arguments_executed():
    result = _run(_registry(), "fake_search", {"query": "RAG", "top_k": 3})
    assert result.ok is True
    assert result.data == {"query": "RAG"}
    assert FakeTool.calls == [{"query": "RAG", "top_k": 3}]


def test_defaults_applied_by_validation():
    result = _run(_registry(), "fake_search", {"query": "RAG"})
    assert result.ok is True
    assert FakeTool.calls == [{"query": "RAG", "top_k": 5}]


# ---- 执行异常兜底 ----

def test_run_exception_becomes_structured_failure():
    result = _run(_registry(), "explode", {"query": "RAG"})
    assert result.ok is False
    assert "工具执行失败" in (result.error or "")


# ---- Function Calling 定义 ----

def test_to_openai_tools_structure():
    tools = _registry().to_openai_tools()
    names = [tool["function"]["name"] for tool in tools]
    assert names == ["explode", "fake_search"]
    for tool in tools:
        fn = tool["function"]
        assert tool["type"] == "function"
        assert isinstance(fn["description"], str) and fn["description"]
        assert fn["parameters"]["type"] == "object"
        assert "query" in fn["parameters"]["properties"]
