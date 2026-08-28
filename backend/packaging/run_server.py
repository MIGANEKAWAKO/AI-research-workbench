"""打包/桌面运行入口：启动后端服务（PyInstaller 产物与开发共用）。

- 监听 127.0.0.1（桌面应用仅本机访问；浏览器开发模式仍用 uvicorn 直接跑）
- 端口优先级：命令行 --port N（Tauri 壳探测空闲端口后传入）> .env PORT > 3001
- 日志走 P4 滚动文件（console=False 打包时控制台不可见，文件日志是唯一现场）
"""

from __future__ import annotations

import sys
from pathlib import Path

# 开发态直接运行本脚本时，backend/ 需在 sys.path（打包态由 PyInstaller pathex 处理）
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn

from app.config import settings


def resolve_port() -> int:
    """命令行 --port 优先（Tauri 壳动态端口），否则 .env PORT（默认 3001）。"""
    args = sys.argv[1:]
    if "--port" in args:
        try:
            return int(args[args.index("--port") + 1])
        except (IndexError, ValueError):
            pass
    return settings.port


if __name__ == "__main__":
    try:
        from app import main  # noqa: PLC0415 延迟导入：让 try 覆盖完整启动链
        from app.config import settings as _settings  # noqa: PLC0415

        uvicorn.run(main.app, host="127.0.0.1", port=resolve_port())
    except Exception:
        # console=False 打包时无控制台：启动异常写 exe 旁 startup-error.log 便于排障
        import traceback

        from app.paths import app_data_dir

        try:
            (app_data_dir() / "startup-error.log").write_text(
                traceback.format_exc(), encoding="utf-8"
            )
        except Exception:
            pass
        raise
