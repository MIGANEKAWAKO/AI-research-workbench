"""Research Agent Orchestrator：规划 → 工具循环 → 汇总 的单 Agent 循环（A3）。

LLM 客户端可注入（LLMClient Protocol），测试用 Mock 全链路驱动；
真实实现 DeepSeekLLMClient 走 openai SDK function calling（与 /api/chat 同款配置）。
事件只经 emit 回调输出（A5 路由转 SSE 帧），Orchestrator 不关心传输层。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

from openai import AsyncOpenAI

from ..config import settings
from .models import (
    ResearchStep,
    ResearchTask,
    StepStatus,
    TaskStatus,
    ToolResult,
    make_event,
)
from .prompts import PLANNER_SYSTEM_PROMPT, RESEARCHER_SYSTEM_PROMPT
from .tools import ToolRegistry

DEFAULT_MAX_STEPS = 5
DEFAULT_MAX_TOOL_CALLS = 8
# 工具结果塞回 messages 前的截断上限（防超长结果撑爆上下文）
MAX_TOOL_RESULT_CHARS = 2000


@dataclass
class ToolCallRequest:
    id: str  # OpenAI tool_call_id，执行结果以 role=tool 消息回填时关联
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMReply:
    content: str | None = None
    tool_calls: list[ToolCallRequest] = field(default_factory=list)
    # 原始 assistant 消息（含 reasoning_content 等供应商专有字段），
    # 回填消息历史时原样使用——DeepSeek thinking 模式校验必须回传 reasoning_content
    raw_assistant: dict[str, Any] | None = None


class LLMClient(Protocol):
    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMReply: ...


class DeepSeekLLMClient:
    """DeepSeek function calling 客户端（openai SDK 直连，DeepSeek 兼容该协议）。"""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str = "deepseek-v4-flash",
    ):
        self.api_key = api_key or settings.deepseek_api_key
        self.base_url = base_url or settings.deepseek_base_url
        self.model = model

    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMReply:
        client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)
        try:
            kwargs: dict[str, Any] = {"model": self.model, "messages": messages}
            if tools:
                kwargs["tools"] = tools
                kwargs["tool_choice"] = "auto"
            reply = await client.chat.completions.create(**kwargs)
            message = reply.choices[0].message
            tool_calls = []
            for tc in message.tool_calls or []:
                try:
                    arguments = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    arguments = {}
                tool_calls.append(
                    ToolCallRequest(id=tc.id, name=tc.function.name, arguments=arguments)
                )
            # 原始 assistant 消息：reasoning_content（thinking 模式）必须原样回传，
            # 否则 DeepSeek 400（A7 验收踩坑）
            raw_assistant: dict[str, Any] = {"role": "assistant", "content": message.content}
            reasoning = getattr(message, "reasoning_content", None)
            if reasoning is not None:
                raw_assistant["reasoning_content"] = reasoning
            if message.tool_calls:
                raw_assistant["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in message.tool_calls
                ]
            return LLMReply(
                content=message.content,
                tool_calls=tool_calls,
                raw_assistant=raw_assistant,
            )
        finally:
            await client.close()


class ResearchOrchestrator:
    """单 Agent 循环：PLANNING 拆步骤 → EXECUTING 工具循环 → SYNTHESIZING 汇总。

    预算：最多 max_steps 个规划步骤、max_tool_calls 次工具调用；
    超预算 → task.error(BUDGET_EXCEEDED, recoverable=True) + FAILED。
    """

    def __init__(
        self,
        registry: ToolRegistry,
        llm: LLMClient,
        max_steps: int = DEFAULT_MAX_STEPS,
        max_tool_calls: int = DEFAULT_MAX_TOOL_CALLS,
    ):
        self.registry = registry
        self.llm = llm
        self.max_steps = max_steps
        self.max_tool_calls = max_tool_calls

    async def run(
        self,
        task: ResearchTask,
        emit: Callable[[dict[str, Any]], None] | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> ResearchTask:
        """执行完整任务循环；emit 接收平铺 SSE 事件 dict（A5 路由转 SSE 帧，测试传收集器）。

        history（C2）：会话历史滑动窗口，注入 PLANNING 与 EXECUTING 的 messages，
        让模型在规划与工具循环时感知前文；None/空列表 = 无历史（向后兼容）。
        """
        emit = emit or (lambda _: None)
        emit(make_event("task.created", task_id=task.task_id, status=task.status.value))
        try:
            await self._run_impl(task, emit, history)
        except Exception as exc:
            task.status = TaskStatus.FAILED
            task.error = repr(exc)
            emit(make_event("task.error", code="INTERNAL", message=str(exc), recoverable=False))
        emit(make_event("task.completed", task_id=task.task_id))
        return task

    async def _run_impl(self, task: ResearchTask, emit, history: list[dict[str, str]] | None = None) -> None:
        history = history or []
        # ---- PLANNING：模型输出步骤 JSON，解析失败退化为单步 ----
        task.transition(TaskStatus.PLANNING)
        plan_reply = await self.llm.complete(
            messages=[
                {"role": "system", "content": PLANNER_SYSTEM_PROMPT},
                *history,
                {"role": "user", "content": task.question},
            ]
        )
        steps = _parse_plan(plan_reply.content or "")
        if not steps:
            steps = [{"id": "s1", "title": f"研究：{task.question[:50]}"}]
        task.steps = [
            ResearchStep(step_id=s["id"], title=s["title"]) for s in steps[: self.max_steps]
        ]
        emit(
            make_event(
                "plan.created",
                steps=[{"id": s.step_id, "title": s.title} for s in task.steps],
            )
        )

        # ---- EXECUTING：工具循环，直到模型输出最终答案或预算耗尽 ----
        task.transition(TaskStatus.EXECUTING)
        system_content = _scope_aware_prompt(task)
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_content},
            *history,
            {"role": "user", "content": task.question},
        ]
        tools = self.registry.to_openai_tools()
        tool_calls_used = 0
        final_content = ""
        round_index = 0

        while tool_calls_used < self.max_tool_calls:
            reply = await self.llm.complete(messages, tools)
            if not reply.tool_calls:
                final_content = reply.content or ""
                break

            # 预算内可执行的部分（超预算的 tool_calls 不执行，也绝不能进消息历史）
            remaining = self.max_tool_calls - tool_calls_used
            executable = reply.tool_calls[:remaining]
            if not executable:
                break

            # OpenAI 协议硬性要求：role=tool 消息必须紧跟在一条
            # 带 tool_calls 的 assistant 消息之后，否则 API 400（联调踩坑）。
            # 优先用客户端返回的原始消息（含 reasoning_content，thinking 模式必须回传）；
            # Mock/降级路径无原始消息时手动构造。
            if reply.raw_assistant is not None:
                assistant_msg = dict(reply.raw_assistant)
                executable_ids = {tc.id for tc in executable}
                assistant_msg["tool_calls"] = [
                    tc for tc in assistant_msg.get("tool_calls", []) if tc["id"] in executable_ids
                ]
            else:
                assistant_msg = {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": json.dumps(tc.arguments, ensure_ascii=False),
                            },
                        }
                        for tc in executable
                    ],
                }
            messages.append(assistant_msg)

            step = task.steps[min(round_index, len(task.steps) - 1)]
            round_index += 1
            step.status = StepStatus.RUNNING
            emit(make_event("step.started", step_id=step.step_id))

            for tc in executable:
                tool_calls_used += 1
                emit(
                    make_event(
                        "tool.call", step_id=step.step_id, tool=tc.name, arguments=tc.arguments
                    )
                )
                result = await self.registry.run(tc.name, tc.arguments)
                step.tool_calls.append(result)
                emit(
                    make_event(
                        "tool.result",
                        step_id=step.step_id,
                        tool=tc.name,
                        ok=result.ok,
                        source_count=len(result.sources),
                        error=result.error,
                    )
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": _tool_result_to_text(result),
                    }
                )

            step.status = StepStatus.COMPLETED
            emit(make_event("step.completed", step_id=step.step_id))

        # ---- 预算耗尽：有证据则降级汇总（不伪造、但必须给答案），无答案才失败 ----
        if not final_content:
            budget_message = f"工具调用预算耗尽（超过 {self.max_tool_calls} 次）"
            emit(make_event("task.error", code="BUDGET_EXCEEDED", message=budget_message, recoverable=True))
            if any(msg["role"] == "tool" for msg in messages):
                # 不带 tools 强制模型基于已收集证据收尾（含"资料不足"的诚实说明）
                degraded = await self.llm.complete(messages)
                final_content = degraded.content or ""
            if not final_content:
                task.transition(TaskStatus.FAILED)
                task.error = budget_message + "且无可用证据"
                emit(make_event("task.error", code="BUDGET_EXCEEDED", message=task.error, recoverable=True))
                return

        # ---- SYNTHESIZING：输出最终答案 ----
        task.transition(TaskStatus.SYNTHESIZING)
        task.answer = final_content
        emit(make_event("answer.delta", content=final_content))
        task.transition(TaskStatus.COMPLETED)


def _scope_aware_prompt(task: ResearchTask) -> str:
    """执行提示词 + 任务范围约束（scope 由请求传入，模型据此限定检索范围）。"""
    content = RESEARCHER_SYSTEM_PROMPT
    if task.scope.doc_id:
        content += f"\n本次研究限定文献：{task.scope.doc_id}（local_kb_search 请传 doc_id）"
    if task.scope.collection_id:
        content += f"\n本次研究限定集合：{task.scope.collection_id}"
    return content


def _parse_plan(content: str) -> list[dict[str, str]]:
    """从模型输出解析步骤 JSON；容错：剥 ```json 代码块、取首个 {…} 段。失败返回 []。"""
    if not content:
        return []
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.MULTILINE)
    data: Any = None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(0))
            except json.JSONDecodeError:
                return []
    steps = data.get("steps") if isinstance(data, dict) else None
    if not isinstance(steps, list):
        return []
    result: list[dict[str, str]] = []
    for i, step in enumerate(steps, start=1):
        if isinstance(step, dict) and step.get("title"):
            result.append({"id": f"s{i}", "title": str(step["title"])[:100]})
    return result


def _tool_result_to_text(result: ToolResult) -> str:
    """工具结果 → 回填给模型的 tool 消息。

    超长时退化为精简摘要：裸截断会切出非法 JSON，模型无法解析；
    摘要保留来源标题与 truncated 标记，模型仍能引用来源。
    """
    payload = {
        "ok": result.ok,
        "tool": result.tool_name,
        "data": result.data,
        "sources": result.sources,
        "error": result.error,
    }
    text = json.dumps(payload, ensure_ascii=False)
    if len(text) <= MAX_TOOL_RESULT_CHARS:
        return text
    summary = {
        "ok": result.ok,
        "tool": result.tool_name,
        "error": result.error,
        "sources": [{"title": s.get("title")} for s in result.sources[:5]],
        "truncated": True,
    }
    return json.dumps(summary, ensure_ascii=False)
