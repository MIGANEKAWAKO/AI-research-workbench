"""Research Agent 领域模型：任务、步骤、工具结果与 SSE 事件协议。

A0 阶段只钉死数据结构与状态机（协议见 docs/Research Agent最小改造方案.md 第 5-6 节），
工具注册与执行编排在 A1-A5 实现。
"""

from __future__ import annotations

import time
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    """任务级状态机：CREATED → PLANNING → EXECUTING → SYNTHESIZING → COMPLETED，终态 FAILED / CANCELLED。"""

    CREATED = "created"
    PLANNING = "planning"
    EXECUTING = "executing"
    SYNTHESIZING = "synthesizing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# 合法状态流转表；终态无出边
_TASK_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.CREATED: {TaskStatus.PLANNING, TaskStatus.FAILED, TaskStatus.CANCELLED},
    TaskStatus.PLANNING: {TaskStatus.EXECUTING, TaskStatus.FAILED, TaskStatus.CANCELLED},
    TaskStatus.EXECUTING: {TaskStatus.SYNTHESIZING, TaskStatus.FAILED, TaskStatus.CANCELLED},
    TaskStatus.SYNTHESIZING: {TaskStatus.COMPLETED, TaskStatus.FAILED},
    TaskStatus.COMPLETED: set(),
    TaskStatus.FAILED: set(),
    TaskStatus.CANCELLED: set(),
}


class ResearchScope(BaseModel):
    doc_id: str | None = None
    collection_id: str | None = None


class ToolResult(BaseModel):
    """工具执行结果，字段对齐方案文档 5.2 协议。"""

    ok: bool
    tool_name: str
    data: dict[str, Any] = Field(default_factory=dict)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    error: str | None = None


class ResearchStep(BaseModel):
    step_id: str
    title: str
    status: StepStatus = StepStatus.PENDING
    tool_calls: list[ToolResult] = Field(default_factory=list)


class ResearchTask(BaseModel):
    task_id: str
    question: str
    scope: ResearchScope = Field(default_factory=ResearchScope)
    enable_web: bool = False
    status: TaskStatus = TaskStatus.CREATED
    steps: list[ResearchStep] = Field(default_factory=list)
    answer: str = ""
    error: str | None = None
    created_at: float = Field(default_factory=time.time)

    def transition(self, next_status: TaskStatus) -> None:
        """状态机流转：非法跳转抛 ValueError，防止 Orchestrator 写出脏状态。"""
        if next_status not in _TASK_TRANSITIONS[self.status]:
            raise ValueError(
                f"非法状态流转: {self.status.value} -> {next_status.value}"
            )
        self.status = next_status


# 9 种固定 SSE 事件类型（协议见方案文档 6.3，前端按此解析）
AGENT_EVENT_TYPES = (
    "task.created",
    "plan.created",
    "step.started",
    "tool.call",
    "tool.result",
    "step.completed",
    "answer.delta",
    "task.completed",
    "task.error",
)


def make_event(event_type: str, **fields: Any) -> dict[str, Any]:
    """构造平铺 SSE 事件负载；与 main.py 的 _sse_data 组合即 `data: {json}` 帧。"""
    if event_type not in AGENT_EVENT_TYPES:
        raise ValueError(f"未知事件类型: {event_type}")
    return {"type": event_type, **fields}
