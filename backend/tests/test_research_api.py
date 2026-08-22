"""A5 验收：/api/research/tasks 的 SSE 事件流、参数校验与 scope 注入（Mock LLM 驱动）。"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from app.agent.models import ResearchTask, ToolResult
from app.agent.orchestrator import LLMReply, ResearchOrchestrator, ToolCallRequest
from app.agent.tools import BaseTool, ToolRegistry
from app.routers import research

app = FastAPI()
app.include_router(research.router, prefix="/api/research")
client = TestClient(app)


class _QueryArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=100)


class SearchTool(BaseTool):
    name = "search"
    description = "检索本地知识库"
    args_model = _QueryArgs

    async def run(self, args: _QueryArgs) -> ToolResult:
        return ToolResult(
            ok=True,
            tool_name=self.name,
            data={"hits": 1},
            sources=[{"title": "论文A", "snippet": "RAG 的核心是检索注入。"}],
        )


class MockLLM:
    def __init__(self, plan_content="", rounds=None):
        self.plan_content = plan_content
        self.rounds = rounds or []
        self.calls = []

    async def complete(self, messages, tools=None):
        self.calls.append((messages, tools))
        if len(self.calls) == 1:
            return LLMReply(content=self.plan_content)
        idx = min(len(self.calls) - 2, len(self.rounds) - 1)
        return self.rounds[idx] if self.rounds else LLMReply(content="（无回复）")


def _mock_orchestrator_factory(llm: MockLLM):
    return lambda enable_web: ResearchOrchestrator(ToolRegistry([SearchTool()]), llm)


def _parse_events(body: str) -> list[dict]:
    events = []
    for frame in body.split("\n\n"):
        for line in frame.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


# ---- 参数校验（200 + task.error，与 /api/chat 约定一致） ----

def test_missing_question_returns_error_event():
    resp = client.post("/api/research/tasks", json={})
    assert resp.status_code == 200
    events = _parse_events(resp.text)
    assert events[0]["type"] == "task.error"
    assert events[0]["code"] == "INVALID_REQUEST"
    assert events[0]["recoverable"] is False


def test_non_string_question_returns_error_event():
    resp = client.post("/api/research/tasks", json={"question": 123})
    events = _parse_events(resp.text)
    assert events[0]["code"] == "INVALID_REQUEST"


# ---- 完整 SSE 事件流 ----

def test_full_task_streams_protocol_events(monkeypatch):
    llm = MockLLM(
        plan_content='{"steps": [{"title": "检索"}]}',
        rounds=[LLMReply(tool_calls=[ToolCallRequest(id="c1", name="search", arguments={"query": "RAG"})]),
                LLMReply(content="结论：RAG 综述。")],
    )
    monkeypatch.setattr(research, "build_orchestrator", _mock_orchestrator_factory(llm))

    resp = client.post("/api/research/tasks", json={"question": "总结 RAG"})

    assert resp.status_code == 200
    events = _parse_events(resp.text)
    types = [ev["type"] for ev in events]
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
    assert events[0]["task_id"].startswith("t_")
    answer = next(ev for ev in events if ev["type"] == "answer.delta")
    assert answer["content"] == "结论：RAG 综述。"


# ---- scope 注入 ----

def test_scope_doc_id_injected_into_system_prompt(monkeypatch):
    llm = MockLLM(plan_content="", rounds=[LLMReply(content="答案")])
    monkeypatch.setattr(research, "build_orchestrator", _mock_orchestrator_factory(llm))

    client.post(
        "/api/research/tasks",
        json={"question": "总结", "scope": {"doc_id": "lit42", "collection_id": "col7"}},
    )
    system_prompt = llm.calls[1][0][0]["content"]  # 执行阶段的 system 消息
    assert "lit42" in system_prompt and "col7" in system_prompt


def test_no_scope_leaves_prompt_clean(monkeypatch):
    llm = MockLLM(plan_content="", rounds=[LLMReply(content="答案")])
    monkeypatch.setattr(research, "build_orchestrator", _mock_orchestrator_factory(llm))

    client.post("/api/research/tasks", json={"question": "总结"})
    system_prompt = llm.calls[1][0][0]["content"]
    assert "限定" not in system_prompt


# ---- enable_web 组装（provider 未配置 → web 工具注册但降级失败） ----

def test_enable_web_registers_web_tool_with_unconfigured_provider(monkeypatch):
    monkeypatch.setattr(research, "build_web_provider", lambda: None)
    orch = research.build_orchestrator(enable_web=True)
    assert "web_search" in orch.registry.names
    assert "local_kb_search" in orch.registry.names


def test_disable_web_excludes_web_tool(monkeypatch):
    monkeypatch.setattr(research, "build_web_provider", lambda: None)
    orch = research.build_orchestrator(enable_web=False)
    assert "web_search" not in orch.registry.names
