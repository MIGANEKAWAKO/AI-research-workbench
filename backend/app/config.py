from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from .paths import app_data_dir


# .env 文件路径（开发态 backend/.env，打包态 exe 同目录；P1 向导写入配置用）
ENV_PATH = app_data_dir() / ".env"

# 显式加载指定路径的 .env：打包后 cwd 不确定，默认的 cwd 查找不可靠
load_dotenv(ENV_PATH)


def write_env(key: str, value: str) -> None:
    """更新 .env 中的单个键值（不存在则追加）；原子写（tmp + os.replace）。

    值原样写入（不包引号）：Windows 路径含空格时 dotenv 按行尾解析保留空格；
    反斜杠不做转义处理（load_dotenv 对无引号值原样读取）。
    """
    lines: list[str] = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    found = False
    for i, line in enumerate(lines):
        if line.strip().startswith(f"{key}="):
            lines[i] = f"{key}={value}"
            found = True
            break
    if not found:
        lines.append(f"{key}={value}")
    tmp = ENV_PATH.with_name(ENV_PATH.name + ".tmp")
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.replace(tmp, ENV_PATH)


@dataclass
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

    def update(self, **kwargs: object) -> None:
        """运行时更新配置字段（P1 向导使用）；None 值跳过（不修改）。

        调用方负责同步写 .env 持久化（write_env）；仅改内存则重启后丢失。
        """
        for key, value in kwargs.items():
            if value is not None and hasattr(self, key):
                setattr(self, key, value)


settings = Settings()
