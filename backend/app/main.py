from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Dict, List

import anyio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from openai import AsyncOpenAI

from .config import settings
from .indexer import scan_and_index
from .prompts import (
    AI_ERROR_MESSAGE,
    INVALID_TASK_ERROR,
    MISSING_MESSAGES_ERROR,
    MISSING_TEXT_ERROR,
    SYSTEM_PROMPT_TEMPLATE,
    TASK_PROMPTS,
)
from .routers import conversations, documents, events, export_api, fs, kb_api, research
from .watcher import VaultWatcher

from .rag import build_rag_context


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动自动扫描索引（失败不阻断启动，打印警告即可）
    try:
        await anyio.to_thread.run_sync(scan_and_index)
        print("启动索引扫描完成")
    except Exception as exc:
        print("启动索引扫描失败（继续启动）:", repr(exc))

    # A5：watchdog 监听 vault 变更 → 增量重扫 → SSE 广播；失败降级为前端 30s 轮询
    watcher = None
    if settings.watch_enabled:
        try:
            watcher = VaultWatcher()
            watcher.start(asyncio.get_running_loop())
        except Exception as exc:
            print("watchdog 启动失败（降级为前端轮询）:", repr(exc))
    yield
    if watcher is not None:
        watcher.stop()


app = FastAPI(title="AI Note Server", lifespan=lifespan)

app.include_router(fs.router, prefix="/api/fs")
app.include_router(documents.router, prefix="/api/documents")
app.include_router(kb_api.router, prefix="/api/kb")
app.include_router(export_api.router, prefix="/api/export")
app.include_router(research.router, prefix="/api/research")
app.include_router(conversations.router, prefix="/api/conversations")
app.include_router(events.router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalize_role(role: Any) -> Any:
    return "assistant" if role == "ai" else role


def _sse_data(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _build_messages(payload: Dict[str, Any]) -> Dict[str, Any]:
    task_type = payload.get("taskType")
    text = payload.get("text")
    messages = payload.get("messages")
    note_context = payload.get("noteContext")

    if task_type or text:
        prompt = TASK_PROMPTS.get(task_type)

        if not prompt:
            return {"error": INVALID_TASK_ERROR}

        if not isinstance(text, str) or not text.strip():
            return {"error": MISSING_TEXT_ERROR}

        return {
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": text.strip()},
            ]
        }

    if not isinstance(messages, list):
        return {"error": MISSING_MESSAGES_ERROR}

    formatted_messages: List[Dict[str, Any]] = []

    note_context_text = note_context if isinstance(note_context, str) and note_context.strip() else "无"

    for item in messages:
        if isinstance(item, dict):
            role = normalize_role(item.get("role"))
            content = item.get("content")
        else:
            role = None
            content = None
        formatted_messages.append({"role": role, "content": content})

    query = ''

    for msg in reversed(formatted_messages):
        if msg["role"] == "user" and isinstance(msg["content"], str):
            query = msg["content"]
            break
    query = query[:500]

    doc_id = payload.get("docId")
    rag_text = await anyio.to_thread.run_sync(build_rag_context, query, doc_id)
    
    system_content = SYSTEM_PROMPT_TEMPLATE.format(note_context=note_context_text) + rag_text

    return {
        "messages": [
            {
                "role": "system",
                "content": system_content,
            },
            *formatted_messages,
        ]
    }


async def _stream_chat_completion(messages: List[Dict[str, Any]]) -> AsyncGenerator[str, None]:
    yield ": \n\n"

    client = None
    try:
        client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        )
        stream = await client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=messages,
            stream=True,
        )

        async for chunk in stream:
            content = None
            if getattr(chunk, "choices", None):
                delta = chunk.choices[0].delta
                content = getattr(delta, "content", None)

            if content:
                yield _sse_data({"content": content})
    except Exception as exc:  # pragma: no cover - runtime integration path
        print("DeepSeek API Error:", repr(exc))
        yield _sse_data({"error": AI_ERROR_MESSAGE})
    finally:
        try:
            if client is not None:
                await client.close()
        except Exception:
            pass


async def _stream_error(error_message: str) -> AsyncGenerator[str, None]:
    yield ": \n\n"
    yield _sse_data({"error": error_message})


@app.post("/api/chat")
async def chat(request: Request):
    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            payload = {}
    except Exception:
        payload = {}

    completion_messages = await _build_messages(payload)
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    if "error" in completion_messages:
        return StreamingResponse(
            _stream_error(completion_messages["error"]),
            media_type="text/event-stream",
            headers=headers,
            status_code=200,
        )

    return StreamingResponse(
        _stream_chat_completion(completion_messages["messages"]),
        media_type="text/event-stream",
        headers=headers,
        status_code=200,
    )


@app.get("/")
async def root():
    return {"message": "AI Note Server is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ping", response_class=PlainTextResponse)
async def ping():
    return "pong"


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)

