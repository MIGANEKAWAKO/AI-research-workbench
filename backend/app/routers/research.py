"""Research Agent 任务 API：POST /api/research/tasks（SSE 事件流）。

协议：9 种固定事件类型（task.created → ... → task.completed），
错误统一 200 + task.error 事件（与 /api/chat 的 data.error 约定一致）。
第一版任务只存在于请求生命周期内（内存态，进程重启任务丢失可接受）。
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

logger = logging.getLogger("research")

from ..agent.local_tools import build_local_tools
from ..conversations import append_message, build_history_messages, get_conversation
from ..agent.models import ResearchScope, ResearchTask, make_event
from ..agent.orchestrator import DeepSeekLLMClient, ResearchOrchestrator
from ..agent.tools import ToolRegistry
from ..agent.web_tools import WebSearchTool, build_web_provider

router = APIRouter()

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def _sse_data(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def build_orchestrator(enable_web: bool) -> ResearchOrchestrator:
    """组装 Agent：本地工具 + （可选）联网搜索；provider 未配置时 web 工具执行降级失败。"""
    tools = build_local_tools()
    if enable_web:
        tools.append(WebSearchTool(build_web_provider()))
    return ResearchOrchestrator(ToolRegistry(tools), DeepSeekLLMClient())


@router.post("/tasks")
async def create_research_task(request: Request):
    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            payload = {}
    except Exception:
        payload = {}

    question = payload.get("question")
    if not isinstance(question, str) or not question.strip():
        return StreamingResponse(
            _stream_error("INVALID_REQUEST", "缺少 question 参数"),
            media_type="text/event-stream",
            headers=SSE_HEADERS,
        )

    scope_raw = payload.get("scope") if isinstance(payload.get("scope"), dict) else {}
    conv_id = payload.get("conversationId")
    conversation_id = conv_id.strip() if isinstance(conv_id, str) and conv_id.strip() else None
    task = ResearchTask(
        task_id="t_" + uuid.uuid4().hex[:8],
        question=question.strip(),
        scope=ResearchScope(
            doc_id=scope_raw.get("doc_id") if isinstance(scope_raw.get("doc_id"), str) else None,
            collection_id=(
                scope_raw.get("collection_id")
                if isinstance(scope_raw.get("collection_id"), str)
                else None
            ),
        ),
        enable_web=bool(payload.get("enable_web", False)),
    )
    logger.info(
        "research 任务创建 task=%s question_len=%d enable_web=%s",
        task.task_id,
        len(task.question),
        task.enable_web,
    )
    return StreamingResponse(
        _task_event_stream(task, build_orchestrator(task.enable_web), conversation_id),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


def _stream_error(code: str, message: str) -> AsyncGenerator[str, None]:
    yield ": \n\n"
    yield _sse_data(make_event("task.error", code=code, message=message, recoverable=False))


async def _task_event_stream(
    task: ResearchTask,
    orchestrator: ResearchOrchestrator,
    conversation_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Orchestrator 事件 → SSE 帧：后台跑任务，queue 传事件，哨兵对象收尾。

    会话写回（C2）：流结束后把 question + answer 追加到会话；
    失败仅告警，不影响任务响应（append_message 对无效 id 静默返回 None）。
    """
    queue: asyncio.Queue[Any] = asyncio.Queue()
    sentinel = object()
    started = time.monotonic()
    history = (
        build_history_messages(get_conversation(conversation_id)) if conversation_id else []
    )

    def emit(ev: dict[str, Any]) -> None:
        queue.put_nowait(ev)

    async def run_task() -> None:
        try:
            await orchestrator.run(task, emit, history)
        finally:
            queue.put_nowait(sentinel)

    runner = asyncio.create_task(run_task())
    yield ": \n\n"
    try:
        while True:
            item = await queue.get()
            if item is sentinel:
                break
            yield _sse_data(item)
    finally:
        if not runner.done():
            runner.cancel()
        await asyncio.gather(runner, return_exceptions=True)
        _persist_research(conversation_id, task)
        logger.info(
            "research 任务结束 task=%s status=%s answer_len=%d 耗时=%.2fs",
            task.task_id,
            task.status.value,
            len(task.answer or ""),
            time.monotonic() - started,
        )
        if task.error:
            logger.error("research 任务失败 task=%s error=%s", task.task_id, task.error)


def _persist_research(conversation_id: str | None, task: ResearchTask) -> None:
    """研究任务写回：user 总写，assistant 有答案才写（失败/无答案不污染历史）。"""
    if not conversation_id:
        return
    try:
        append_message(conversation_id, "user", task.question)
        if task.answer:
            append_message(conversation_id, "assistant", task.answer)
    except Exception as exc:
        logger.warning("会话写回失败（不影响任务响应）: %r", exc)
