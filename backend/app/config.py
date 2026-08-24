from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    # LLM（DeepSeek，openai SDK 直连，不进 LangChain）
    deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    port: int = int(os.getenv("PORT", "3001"))

    # Embedding（SiliconFlow，OpenAI 兼容协议，复用 openai SDK）
    siliconflow_api_key: str = os.getenv("SILICONFLOW_API_KEY", "")
    siliconflow_base_url: str = os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")

    # vault 路径（未配置时由 B3 决定默认推导逻辑）
    vault_path: str = os.getenv("VAULT_PATH", "")
    kb_dir: str = os.getenv("KB_DIR", "")

    # Research Agent 联网搜索（A4）：provider 未配置时 web_search 工具降级失败，不影响本地检索
    web_search_provider: str = os.getenv("WEB_SEARCH_PROVIDER", "")
    web_search_timeout: float = float(os.getenv("WEB_SEARCH_TIMEOUT", "10"))

    # A5 vault 变更监听：watchdog 启动失败或 CI 测试可置 0 关闭（降级为前端轮询）
    watch_enabled: bool = os.getenv("WATCH_ENABLED", "1") == "1"

    # X1 本地缓存：redis_url 留配置位（未来多进程部署可选启用；第一版内存/磁盘缓存已够，不使用）
    redis_url: str = os.getenv("REDIS_URL", "")


settings = Settings()

