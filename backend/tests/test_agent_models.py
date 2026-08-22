"""A0 验收：状态机流转合法 + 9 种事件序列化为协议 JSON（对照最小改造方案 6.3）。"""

import json

import pytest

from app.agent.models import (
    AGENT_EVENT_TYPES,
    ResearchStep,
    ResearchTask,
    TaskStatus,
    ToolResult,
    make_event,
)


# ---- 任务状态机 ----

def test_new_task_defaults_to_created():
    task = ResearchTask(task_id="t_001", question="测试")
    assert task.status == TaskStatus.CREATED
    assert task.scope.doc_id is None
    assert task.scope.collection_id is None
    assert task.enable_web is False
    assert task.steps == []
    assert task.answer == ""


def test_legal_full_transition_chain():
    task = ResearchTask(task_id="t_001", question="测试")
    for status in (
        TaskStatus.PLANNING,
        TaskStatus.EXECUTING,
        TaskStatus.SYNTHESIZING,
        TaskStatus.COMPLETED,
    ):
        task.transition(status)
    assert task.status == TaskStatus.COMPLETED


@pytest.mark.parametrize(
    "start, illegal",
    [
        (TaskStatus.CREATED, TaskStatus.COMPLETED),
        (TaskStatus.CREATED, TaskStatus.EXECUTING),
        (TaskStatus.PLANNING, TaskStatus.COMPLETED),
        (TaskStatus.EXECUTING, TaskStatus.PLANNING),
        (TaskStatus.SYNTHESIZING, TaskStatus.EXECUTING),
    ],
)
def test_illegal_transitions_rejected(start, illegal):
    task = ResearchTask(task_id="t_001", question="测试", status=start)
    with pytest.raises(ValueError):
        task.transition(illegal)


@pytest.mark.parametrize("terminal", [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED])
def test_terminal_states_have_no_outgoing_edges(terminal):
    task = ResearchTask(task_id="t_001", question="测试", status=terminal)
    for target in TaskStatus:
        if target != terminal:
            with pytest.raises(ValueError):
                task.transition(target)


def test_failure_path_reachable_from_every_stage():
    for start in (TaskStatus.CREATED, TaskStatus.PLANNING, TaskStatus.EXECUTING, TaskStatus.SYNTHESIZING):
        task = ResearchTask(task_id="t_001", question="测试", status=start)
        task.transition(TaskStatus.FAILED)
        assert task.status == TaskStatus.FAILED


# ---- 工具结果（协议 5.2） ----

def test_tool_result_protocol_fields():
    result = ToolResult(
        ok=True,
        tool_name="local_kb_search",
        data={"query": "RAG", "hits": 3},
        sources=[{"title": "某论文", "score": 0.9}],
    )
    assert result.ok and result.error is None
    assert result.model_dump() == {
        "ok": True,
        "tool_name": "local_kb_search",
        "data": {"query": "RAG", "hits": 3},
        "sources": [{"title": "某论文", "score": 0.9}],
        "error": None,
    }


def test_tool_result_failure_shape():
    result = ToolResult(ok=False, tool_name="web_search", error="超时")
    assert result.data == {} and result.sources == []


# ---- SSE 事件协议（6.3） ----

def test_event_types_fixed():
    assert AGENT_EVENT_TYPES == (
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


def test_make_event_flat_payload():
    ev = make_event(
        "tool.call", step_id="s1", tool="local_kb_search", arguments={"query": "RAG"}
    )
    assert ev == {
        "type": "tool.call",
        "step_id": "s1",
        "tool": "local_kb_search",
        "arguments": {"query": "RAG"},
    }


def test_make_event_unknown_type_rejected():
    with pytest.raises(ValueError):
        make_event("unknown.type")


def test_full_event_sequence_serializable():
    """完整事件序列（对照方案文档 6.3 示例），每条都能经 main.py 同款 _sse_data 序列化。"""
    events = [
        make_event("task.created", task_id="t_001", status="created"),
        make_event("plan.created", steps=[{"id": "s1", "title": "检索本地资料"}]),
        make_event("step.started", step_id="s1"),
        make_event("tool.call", step_id="s1", tool="local_kb_search", arguments={"query": "RAG"}),
        make_event("tool.result", step_id="s1", tool="local_kb_search", source_count=4),
        make_event("step.completed", step_id="s1"),
        make_event("answer.delta", content="结论是……"),
        make_event("task.completed", task_id="t_001"),
        make_event("task.error", code="TOOL_TIMEOUT", message="联网搜索超时", recoverable=True),
    ]
    assert len(events) == 9
    for ev in events:
        frame = f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        assert frame.startswith("data: ") and frame.endswith("\n\n")
        payload = json.loads(frame[6:].strip())
        assert payload["type"] in AGENT_EVENT_TYPES


def test_task_with_steps_serializable():
    task = ResearchTask(
        task_id="t_002",
        question="比较两种 RAG 方法",
        scope={"doc_id": "d1", "collection_id": None},
        enable_web=True,
        steps=[
            ResearchStep(
                step_id="s1",
                title="本地检索",
                tool_calls=[
                    ToolResult(ok=True, tool_name="local_kb_search", sources=[{"title": "t"}])
                ],
            )
        ],
    )
    payload = task.model_dump(mode="json")
    data = json.loads(json.dumps(payload, ensure_ascii=False))
    assert data["scope"]["doc_id"] == "d1"
    assert data["status"] == "created"
    assert data["steps"][0]["tool_calls"][0]["tool_name"] == "local_kb_search"
