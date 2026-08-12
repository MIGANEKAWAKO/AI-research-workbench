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


settings = Settings()

