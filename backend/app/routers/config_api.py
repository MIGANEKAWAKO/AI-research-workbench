"""配置 API（M2 P1 首次启动向导）：读取脱敏状态 / 写入配置 / 连通性测试。

- GET /api/config：配置状态（只返回"是否已配置"，不暴露 key 明文）
- POST /api/config：写入 vault 路径与 API key（写 .env 原子化 + 运行时更新 settings；
  vault 路径变化时重启 watcher，监听新目录）
- POST /api/config/test：连通性测试（DeepSeek chat ping / SiliconFlow embedding ping；
  仅测试已配置项；未配置返回 skipped）
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..config import settings, write_env

router = APIRouter()

# 仅校验过字段存在性，不暴露 key 明文
SECRET_KEYS = ("deepseek_api_key", "siliconflow_api_key")


def _status() -> dict:
    return {
        "configured": bool(settings.vault_path) or bool(settings.deepseek_api_key),
        "vaultConfigured": bool(settings.vault_path),
        "deepseekConfigured": bool(settings.deepseek_api_key),
        "siliconflowConfigured": bool(settings.siliconflow_api_key),
    }


class ConfigUpdate(BaseModel):
    vaultPath: str | None = None
    deepseekApiKey: str | None = None
    siliconflowApiKey: str | None = None


class ConfigTestRequest(BaseModel):
    deepseek: bool = True
    siliconflow: bool = True


@router.get("")
def get_config():
    """配置状态（脱敏）。"""
    return _status()


@router.post("")
def update_config(req: ConfigUpdate, request: Request):
    """写入配置：vault 路径（创建目录校验）+ API key → .env 持久化 + 运行时生效。"""
    vault_changed = False

    if req.vaultPath is not None:
        path = req.vaultPath.strip()
        if path:
            # 校验目录可用（可创建/已存在可写）
            try:
                Path(path).mkdir(parents=True, exist_ok=True)
            except OSError as exc:
                raise HTTPException(status_code=400, detail=f"vault 目录不可用: {exc}")
            if settings.vault_path != path:
                vault_changed = True
            settings.update(vault_path=path)
            write_env("VAULT_PATH", path)

    if req.deepseekApiKey is not None and req.deepseekApiKey.strip():
        key = req.deepseekApiKey.strip()
        settings.update(deepseek_api_key=key)
        write_env("DEEPSEEK_API_KEY", key)

    if req.siliconflowApiKey is not None and req.siliconflowApiKey.strip():
        key = req.siliconflowApiKey.strip()
        settings.update(siliconflow_api_key=key)
        write_env("SILICONFLOW_API_KEY", key)

    # vault 路径变化 → 重启 watcher（监听新目录；开发期手动重启后端同样有效）
    if vault_changed:
        watcher = getattr(request.app.state, "watcher", None)
        if watcher is not None and settings.watch_enabled:
            try:
                watcher.stop()
                watcher.start(__import__("asyncio").get_running_loop())
            except Exception as exc:  # 重启失败降级：前端 30s 轮询兜底
                print(f"警告: watcher 重启失败（降级轮询）: {exc}")

    return _status()


@router.post("/test")
def test_connections(req: ConfigTestRequest):
    """连通性测试：DeepSeek chat ping / SiliconFlow embedding ping（仅测已配置项）。"""

    result: dict = {}

    if req.deepseek and settings.deepseek_api_key:
        try:
            from openai import OpenAI

            client = OpenAI(
                base_url=settings.deepseek_base_url,
                api_key=settings.deepseek_api_key,
                timeout=15,
            )
            client.chat.completions.create(
                model="deepseek-chat",
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1,
            )
            result["deepseek"] = {"ok": True}
        except Exception as exc:
            result["deepseek"] = {"ok": False, "error": str(exc)[:200]}
    else:
        result["deepseek"] = {"ok": None, "error": "未配置"}

    if req.siliconflow and settings.siliconflow_api_key:
        try:
            from openai import OpenAI

            client = OpenAI(
                base_url=settings.siliconflow_base_url,
                api_key=settings.siliconflow_api_key,
                timeout=15,
            )
            client.embeddings.create(model=settings.embedding_model, input="ping")
            result["siliconflow"] = {"ok": True}
        except Exception as exc:
            result["siliconflow"] = {"ok": False, "error": str(exc)[:200]}
    else:
        result["siliconflow"] = {"ok": None, "error": "未配置"}

    return result
