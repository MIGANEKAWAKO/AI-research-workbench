# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec：后端服务打包（onedir）。

用法（backend 目录下）：
    .venv/Scripts/pyinstaller packaging/backend.spec --noconfirm --clean

产物：backend/dist/backend-server/backend-server.exe（console=False，日志走文件）

打包坑备忘（chroma 原生依赖）：
- onedir 而非 onefile：chroma/hnswlib 原生 DLL 多，onefile 解压慢且易被杀软误报
- collect_all(chromadb/uvicorn/watchdog)：原生库 + 延迟 import 子模块 + 数据文件
- onnxruntime 未安装（embedding 走 SiliconFlow API，不触发 chromadb 默认 embedding）
- telemetry 已在 kb.py 构造点禁用（anonymized_telemetry=False）
"""

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = [], [], []
for pkg in ["chromadb", "uvicorn", "watchdog", "langchain_chroma", "langchain_openai"]:
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    ["packaging/run_server.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports + [
        # 纯 python 依赖（自动分析兜底，显式列出防动态 import 遗漏）
        "pypdf",
        "docx",
        "bs4",
        "httpx",
        "yaml",
        "dotenv",
        "anyio",
        "openai",
        "langchain_text_splitters",
        "langchain_core",
        "multipart",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "tests", "pytest"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="backend-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="backend-server",
)
