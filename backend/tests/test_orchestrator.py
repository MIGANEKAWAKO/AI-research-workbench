"""A3 验收：Mock LLM 驱动全链路——规划、工具循环、预算、失败降级与事件序列。"""

import asyncio

import pytest
from pydantic import BaseModel, Field

from app.agent.models import ResearchTask, TaskStatus, ToolResult
from app.agent.orchestrator import (
    MAX_TOOL_RESULT_CHARS,
    LLMReply,
    ResearchOrchestrator,
    ToolCallRequest,
    _parse_plan,
    _tool_result_to_text,
)
from app.agent.tools import BaseTool, ToolRegistry


# ---- 测试工具 ----

class _QueryArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=100)


class SearchTool(BaseTool):
    name = "search"
    description = "检索本地知识库"
    args_model = _QueryArgs
    calls = 0

    async def run(self, args: _QueryArgs) -> ToolResult:
        SearchTool.calls += 1
        return ToolResult(
            ok=True,
            tool_name=self.name,
            data={"hits": 1},
            sources=[{"title": "论文A", "snippet": "RAG 的核心是检索注入。"}],
        )


class FailTool(BaseTool):
    name = "fail_tool"
    description = "必失败工具（模拟超时）"
    args_model = _QueryArgs

    async def run(self, args: _QueryArgs) -> ToolResult:
        return ToolResult(ok=False, tool_name=self.name, error="超时")


@pytest.fixture(autouse=True)
def _reset_calls():
    SearchTool.calls = 0
    yield


class MockLLM:
    """脚本化 LLM：第 1 次调用（规划）返回 plan_content；带 tools 的调用按 rounds；
    tools=None 的调用（预算耗尽降级汇总）返回 fallback_content。"""

    def __init__(self, plan_content: str = "", rounds: list[LLMReply] | None = None, fallback_content=None):
        self.plan_content = plan_content
        self.rounds = rounds or []
        self.fallback_content = fallback_content
        self.calls: list = []

    async def complete(self, messages, tools=None):
        self.calls.append((messages, tools))
        if len(self.calls) == 1:
            return LLMReply(content=self.plan_content)
        if tools is None:
            return LLMReply(content=self.fallback_content)
        idx = min(len(self.calls) - 2, len(self.rounds) - 1)
        return self.rounds[idx] if self.rounds else LLMReply(content="（无回复）")


class EventCollector:
    def __init__(self):
        self.events: list[dict] = []

    def emit(self, ev: dict):
        self.events.append(ev)


def tool_call(name="search", query="RAG", tc_id="call_1") -> ToolCallRequest:
    return ToolCallRequest(id=tc_id, name=name, arguments={"query": query})


def assert_protocol_compliant(messages: list[dict]) -> None:
    """OpenAI 工具协议：role=tool 消息必须跟随一条带 tool_calls 的 assistant 消息。

    同一批多个 tool 消息可连续排列（都跟在同一条 assistant 后）；
    真实 DeepSeek API 违反配对要求直接 400（A6 联调踩坑），Mock 不校验协议，必须显式断言。
    """
    for i, msg in enumerate(messages):
        if msg["role"] != "tool":
            continue
        j = i - 1
        while j >= 0 and messages[j]["role"] == "tool":  # 跳过同批 tool 消息
            j -= 1
        assert j >= 0 and messages[j]["role"] == "assistant", (
            f"tool 消息必须跟随带 tool_calls 的 assistant: {messages[max(0, j):i + 1]}"
        )
        tool_calls = messages[j].get("tool_calls")
        assert tool_calls, f"assistant 消息必须带 tool_calls: {messages[j]}"
        ids = {tc["id"] for tc in tool_calls}
        assert msg["tool_call_id"] in ids, f"tool_call_id 不在 assistant.tool_calls 中: {msg}"


def run_task(orchestrator, question="研究问题", enable_web=False):
    task = ResearchTask(task_id="t_1", question=question, enable_web=enable_web)
    collector = EventCollector()
    return asyncio.run(orchestrator.run(task, collector.emit)), collector


# ---- 完整成功链路 ----

def test_full_flow_emits_protocol_events():
    llm = MockLLM(
        plan_content='{"steps": [{"title": "检索本地资料"}, {"title": "汇总结论"}]}',
        rounds=[LLMReply(tool_calls=[tool_call()]), LLMReply(content="最终答案：RAG 综述。")],
    )
    task, collector = run_task(ResearchOrchestrator(ToolRegistry([SearchTool()]), llm))

    assert task.status == TaskStatus.COMPLETED
    assert task.answer == "最终答案：RAG 综述。"
    assert [s.title for s in task.steps] == ["检索本地资料", "汇总结论"]
    assert task.steps[0].tool_calls[0].ok is True

    types = [ev["type"] for ev in collector.events]
    assert types == [
        "task.created",
        "plan.created",
        "step.started",
        "tool.call",
        "tool.result",
        "step.completed",
        "answer.delta",
        "task.completed",
    ]
    plan_event = collector.events[1]
    assert plan_event["steps"] == [
        {"id": "s1", "title": "检索本地资料"},
        {"id": "s2", "title": "汇总结论"},
    ]


def test_tool_result_fed_back_as_tool_message():
    llm = MockLLM(
        plan_content="",
        rounds=[LLMReply(tool_calls=[tool_call()]), LLMReply(content="答案")],
    )
    _, collector = run_task(ResearchOrchestrator(ToolRegistry([SearchTool()]), llm))

    second_call_messages = llm.calls[1][0]
    assert second_call_messages[-1]["role"] == "tool"
    assert "论文A" in second_call_messages[-1]["content"]
    assert second_call_messages[-1]["tool_call_id"] == "call_1"


# ---- 规划退化 ----

def test_plan_parse_failure_falls_back_to_single_step():
    llm = MockLLM(plan_content="抱歉，我无法理解这个问题。", rounds=[LLMReply(content="答案")])
    task, collector = run_task(ResearchOrchestrator(ToolRegistry([SearchTool()]), llm))

    assert task.status == TaskStatus.COMPLETED
    assert len(task.steps) == 1
    assert task.steps[0].title.startswith("研究：")
    plan_event = collector.events[1]
    assert len(plan_event["steps"]) == 1


def test_plan_with_code_block_parsed():
    llm = MockLLM(
        plan_content='```json\n{"steps": [{"title": "查文献"}]}\n```',
        rounds=[LLMReply(content="答案")],
    )
    task, _ = run_task(ResearchOrchestrator(ToolRegistry([SearchTool()]), llm))
    assert [s.title for s in task.steps] == ["查文献"]


# ---- 非法/失败工具不炸任务 ----

def test_unknown_tool_call_does_not_break_task():
    llm = MockLLM(
        plan_content="",
        rounds=[
            LLMReply(tool_calls=[ToolCallRequest(id="c1", name="hack_tool", arguments={})]),
            LLMReply(content="完成"),
        ],
    )
    task, collector = run_task(ResearchOrchestrator(ToolRegistry([SearchTool()]), llm))

    assert task.status == TaskStatus.COMPLETED
    tool_result_event = next(ev for ev in collector.events if ev["type"] == "tool.result")
    assert tool_result_event["ok"] is False
    assert "未知工具" in (tool_result_event["error"] or "")
    assert SearchTool.calls == 0  # 真实工具未被调用


def test_failing_tool_is_recoverable():
    llm = MockLLM(
        plan_content="",
        rounds=[
            LLMReply(tool_calls=[tool_call(name="fail_tool")]),
            LLMReply(content="基于部分资料给出结论"),
        ],
    )
    task, collector = run_task(ResearchOrchestrator(ToolRegistry([FailTool()]), llm))

    assert task.status == TaskStatus.COMPLETED
    tool_result_event = next(ev for ev in collector.events if ev["type"] == "tool.result")
    assert tool_result_event["ok"] is False and tool_result_event["error"] == "超时"


# ---- 预算耗尽：有证据降级汇总，无答案才失败 ----

def test_budget_exceeded_with_evidence_degrades_to_answer():
    """验收任务暴露的真实缺陷：预算耗尽不能空手失败，应基于已收集证据降级汇总。"""
    rounds = [LLMReply(tool_calls=[tool_call(tc_id=f"call_{i}")]) for i in range(8)]
    llm = MockLLM(plan_content="", rounds=rounds, fallback_content="本地资料不足，仅能给出部分结论。")
    task, collector = run_task(ResearchOrchestrator(ToolRegistry([SearchTool()]), llm))

    assert task.status == TaskStatus.COMPLETED
    assert task.answer == "本地资料不足，仅能给出部分结论。"
    assert SearchTool.calls == 8
    error_event = next(ev for ev in collector.events if ev["type"] == "task.error")
    assert error_event["code"] == "BUDGET_EXCEEDED" and error_event["recoverable"] is True
    # 降级汇总调用不带 tools（强制模型收尾而非继续调工具）
    assert llm.calls[-1][1] is None
    answer_event = next(ev for ev in collector.events if ev["type"] == "answer.delta")
    assert answer_event["content"] == "本地资料不足，仅能给出部分结论。"


def test_budget_exceeded_without_answer_fails():
    rounds = [LLMReply(tool_calls=[tool_call(tc_id=f"call_{i}")]) for i in range(8)]
    llm = MockLLM(plan_content="", rounds=rounds, fallback_content=None)  # 降级也无内容
    task, collector = run_task(ResearchOrchestrator(ToolRegistry([SearchTool()]), llm))

    assert task.status == TaskStatus.FAILED
    assert "预算耗尽" in (task.error or "")
    assert SearchTool.calls == 8
    assert collector.events[-1]["type"] == "task.completed"


# ---- 内部异常兜底 ----

def test_internal_exception_fails_task():
    class BoomLLM:
        async def complete(self, messages, tools=None):
            raise RuntimeError("LLM 挂了")

    task, collector = run_task(ResearchOrchestrator(ToolRegistry([SearchTool()]), BoomLLM()))

    assert task.status == TaskStatus.FAILED
    error_event = next(ev for ev in collector.events if ev["type"] == "task.error")
    assert error_event["code"] == "INTERNAL" and error_event["recoverable"] is False


# ---- OpenAI 工具协议合规（role=tool 必须跟在带 tool_calls 的 assistant 后） ----

def test_tool_messages_follow_assistant_tool_calls():
    """修复回归：A6 联调踩坑——缺 assistant(tool_calls) 消息导致 DeepSeek 400。"""
    llm = MockLLM(
        plan_content="",
        rounds=[LLMReply(tool_calls=[tool_call()]), LLMReply(content="答案")],
    )
    _, _ = run_task(ResearchOrchestrator(ToolRegistry([SearchTool()]), llm))

    second_call_messages = llm.calls[1][0]  # 第二轮 complete 收到的完整历史
    assert_protocol_compliant(second_call_messages)
    # 且 assistant 消息的 tool_calls 与 tool 消息配对（同一 id）
    assistant = second_call_messages[-2]
    assert assistant["tool_calls"][0]["id"] == "call_1"
    assert second_call_messages[-1]["tool_call_id"] == "call_1"


def test_budget_cut_tool_calls_stay_paired():
    """预算截断时（模型一轮返回超预算 tool_calls），未执行部分不进历史，配对仍完整。"""
    llm = MockLLM(
        plan_content="",
        rounds=[
            LLMReply(
                tool_calls=[tool_call(tc_id=f"call_{i}") for i in range(10)],  # 10 个但预算 8
            ),
            LLMReply(content="答案"),
        ],
    )
    orchestrator = ResearchOrchestrator(
        ToolRegistry([SearchTool()]), llm, max_tool_calls=8
    )
    task, collector = run_task(orchestrator)

    assert task.status == TaskStatus.FAILED  # 预算耗尽
    assert SearchTool.calls == 8
    # 每轮 complete 收到的历史仍须协议合规
    for messages, _ in llm.calls[1:]:
        assert_protocol_compliant(messages)


# ---- 工具结果截断 ----

def test_tool_result_truncated_to_valid_summary():
    result = ToolResult(
        ok=True, tool_name="search", data={"x": "y"}, sources=[{"title": "论文A", "snippet": "长" * 5000}]
    )
    text = _tool_result_to_text(result)
    assert len(text) <= MAX_TOOL_RESULT_CHARS
    payload = json_loads(text)  # 截断后必须是合法 JSON，模型才能解析
    assert payload["ok"] is True
    assert payload["truncated"] is True
    assert payload["sources"] == [{"title": "论文A"}]


def test_short_tool_result_not_truncated():
    result = ToolResult(ok=True, tool_name="search", sources=[{"title": "t", "snippet": "短"}])
    text = _tool_result_to_text(result)
    assert json_loads(text).get("truncated") is not True


def json_loads(text: str) -> dict:
    import json

    return json.loads(text)
