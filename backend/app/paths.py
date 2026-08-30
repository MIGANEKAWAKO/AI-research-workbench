"""运行目录推导（P6 PyInstaller 打包适配）。

开发态（python -m uvicorn）：可写路径 = backend/ 目录（与 __file__ 推导等价）。
打包态（PyInstaller onedir，sys.frozen）：可写路径 = exe 所在目录。

坑：打包后包内模块的 __file__ 指向 _MEIPASS 临时解压目录（每次启动随机），
在其中写 .env / 日志会丢失；因此所有"可写位置"（.env、logs/、vault 兜底）
必须经本模块推导，禁止直接 Path(__file__)。
"""

from __future__ import annotations

import sys
from pathlib import Path


def app_data_dir() -> Path:
    """应用可写根目录：开发态 backend/，打包态 exe 同目录。"""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent
