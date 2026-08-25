"""P1 配置 API 测试：状态脱敏 / 写 .env / vault 目录创建 / 连通测试（mock openai）。"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import config as cfg
from app.routers import config_api

app = FastAPI()
app.include_router(config_api.router, prefix="/api/config")
client = TestClient(app)


@pytest.fixture
def tmp_env(tmp_path, monkeypatch):
    """隔离 .env：ENV_PATH 指向 tmp_path/.env，settings 快照还原。"""
    monkeypatch.setattr(cfg, "ENV_PATH", tmp_path / ".env")
    # 快照字段（测试后还原，避免污染真实 settings）
    snapshot = {
        "vault_path": cfg.settings.vault_path,
        "deepseek_api_key": cfg.settings.deepseek_api_key,
        "siliconflow_api_key": cfg.settings.siliconflow_api_key,
    }
    # 测试基态：全部未配置（真实 .env 的 key 会污染断言）
    cfg.settings.vault_path = ""
    cfg.settings.deepseek_api_key = ""
    cfg.settings.siliconflow_api_key = ""
    yield tmp_path
    for key, value in snapshot.items():
        setattr(cfg.settings, key, value)


def test_get_config_masked(tmp_env):
    cfg.settings.deepseek_api_key = "sk-12345"
    resp = client.get("/api/config")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "configured": True,
        "vaultConfigured": False,
        "deepseekConfigured": True,
        "siliconflowConfigured": False,
    }
    # 不暴露 key 明文
    assert "sk-12345" not in resp.text


def test_post_config_writes_env_and_creates_vault(tmp_env):
    vault_dir = tmp_env / "my vault"
    resp = client.post(
        "/api/config",
        json={"vaultPath": str(vault_dir), "deepseekApiKey": "sk-new", "siliconflowApiKey": "sf-new"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["vaultConfigured"] is True and body["deepseekConfigured"] is True
    # vault 目录已创建
    assert vault_dir.exists()
    # .env 已写入（原子写）
    env_text = (tmp_env / ".env").read_text(encoding="utf-8")
    assert f"VAULT_PATH={vault_dir}" in env_text
    assert "DEEPSEEK_API_KEY=sk-new" in env_text
    assert "SILICONFLOW_API_KEY=sf-new" in env_text
    # 运行时生效
    assert cfg.settings.vault_path == str(vault_dir)


def test_post_config_empty_key_skipped(tmp_env):
    cfg.settings.deepseek_api_key = "sk-original"
    resp = client.post("/api/config", json={"deepseekApiKey": "   "})
    assert resp.status_code == 200
    # 空白 key 不写入（.env 未被创建/修改）
    assert cfg.settings.deepseek_api_key == "sk-original"
    assert not (tmp_env / ".env").exists()


def test_post_config_invalid_vault_400(tmp_env, monkeypatch):
    def _boom(*args, **kwargs):
        raise OSError("denied")

    monkeypatch.setattr("pathlib.Path.mkdir", _boom)
    resp = client.post("/api/config", json={"vaultPath": str(tmp_env / "x")})
    assert resp.status_code == 400
    assert "vault" in resp.json()["detail"]


def test_test_connections_skipped_when_unconfigured(tmp_env):
    cfg.settings.deepseek_api_key = ""
    cfg.settings.siliconflow_api_key = ""
    resp = client.post("/api/config/test", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["deepseek"] == {"ok": None, "error": "未配置"}
    assert body["siliconflow"] == {"ok": None, "error": "未配置"}


def test_test_connections_calls_openai(monkeypatch, tmp_env):
    """已配置时调用 openai SDK；模拟失败路径返回结构化错误。"""
    cfg.settings.deepseek_api_key = "sk-x"
    cfg.settings.siliconflow_api_key = "sf-x"

    class FakeChat:
        def __init__(self):
            self.completions = self

        def create(self, **kwargs):
            raise RuntimeError("401 invalid api key")

    class FakeEmbeddings:
        def create(self, **kwargs):
            return {"data": []}

    class FakeOpenAI:
        def __init__(self, *args, **kwargs):
            pass

        @property
        def chat(self):
            return FakeChat()

        @property
        def embeddings(self):
            return FakeEmbeddings()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    resp = client.post("/api/config/test", json={})
    body = resp.json()
    assert body["deepseek"] == {"ok": False, "error": "401 invalid api key"}
    assert body["siliconflow"] == {"ok": True}
