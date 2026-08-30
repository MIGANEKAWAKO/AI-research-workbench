# AI Research Workbench（知微 · 科研工作台）

## 项目定位

个人学术文献工作台：**文献管理 → PDF 阅读 → 笔记+引用 → AI 问答 → 论文写作导出**一条链路。
本地优先：数据以普通文件保存在用户自选的 vault 文件夹中，可被 Obsidian / VS Code / Git / 云盘直接使用。
本仓库为全新开发目录（前端/后端复制自 react-note / fastapi-note-server 作为基础，不溯回原目录改动）。

## 目录结构

```
AI research workbench/
├─ frontend/                  # React 19 前端
│  └─ src/
│     ├─ pages/
│     │  ├─ home/index.tsx            # 三栏主布局（侧边栏+编辑器+AI面板）
│     │  └─ editor/                   # Tiptap 编辑器 + 自动保存
│     ├─ components/
│     │  ├─ SiderBar/                 # 笔记/集合列表（注意拼写 SiderBar 非 SideBar）
│     │  ├─ AIPanel/                  # AI 助手面板（SSE 流式+打字机）
│     │  ├─ SetupWizard.tsx           # 首次启动向导（vault + API key + 连通测试）
│     │  ├─ ConfigDialog.tsx          # AI 服务配置（key/baseUrl 重配入口）
│     │  ├─ ui/                       # shadcn/ui 组件
│     │  ├─ tiptap-ui/                # 编辑器功能按钮
│     │  ├─ tiptap-node/              # 自定义节点
│     │  ├─ tiptap-extension/         # node-background 扩展
│     │  └─ ...
│     ├─ store/                       # Zustand stores（笔记/文献/会话/数据源）
│     ├─ services/
│     │  ├─ api.ts                    # 后端地址统一解析（浏览器 localhost:3001 / Tauri 动态端口）
│     │  ├─ storage/                  # StorageAdapter（HttpFsAdapter → /api/fs/*）
│     │  └─ ...                       # ai/research/conversations/literature 等 API 封装
│     ├─ hooks/ lib/ types/ styles/
│     └─ main.tsx / App.tsx           # 入口（无路由，直接渲染 Home）
├─ backend/                   # FastAPI 后端
│  ├─ app/
│  │  ├─ main.py                      # 入口：lifespan 启动自动扫描 + 路由挂载 + /api/chat(SSE 中转)
│  │  ├─ config.py                    # dataclass 配置（dotenv）
│  │  ├─ paths.py                     # 可写路径推导（开发态 backend/，打包态 exe 同目录）
│  │  ├─ vault.py                     # vault 路径推导（ADR-0001）
│  │  ├─ kb.py                        # 知识库核心（Chroma + embedding + 分块 + 增删查）
│  │  ├─ indexer.py                   # 索引管理（mtime 增量 + 自愈 + 日志）
│  │  ├─ rag.py                       # chat RAG 注入（静默降级）
│  │  ├─ agent/                       # 单 Agent：规划、工具调用、状态和结果汇总
│  │  └─ routers/                     # fs/documents/kb/export/research/conversations/config/events
│  └─ packaging/                      # PyInstaller 打包（run_server.py 入口 + backend.spec + tiktoken 词表）
├─ src-tauri/                 # Tauri 2 壳（动态端口 + 拉起后端进程 + 退出联动）
│  └─ src/lib.rs                     # probe_port → spawn_backend → backend_info → 退出 kill
├─ docs/                       # 技术文档（接口说明、ADR、验收清单）
└─ .github/workflows/         # CI（pytest + 前端 build）与 Release（Windows 安装包）
```

## 开发进度

| 状态 | 内容 |
|---|---|
| ✅ 完成 | **M1（MVP）**：B1-B8 后端（元数据补全/知识库/vault API/文献导入/索引/RAG/导出）+ F1-F7 前端（StorageAdapter/Markdown 化/侧边栏/文献库/PDF 阅读器/引用系统/AI 面板）+ T1 联调 + T2 回归 |
| ✅ 完成 | **Research Agent（A0-A7）**：单 Agent + 工具注册表 + 本地/联网工具 + Orchestrator + SSE API + 前端任务模式 |
| ✅ 完成 | **M2（产品化）**：高亮批注/划词翻译/阅读进度/集合导出/watchdog SSE；对话记忆 C1-C3；本地缓存 X1；首次向导 P1/元数据编辑 P2/索引自愈 P3/日志 P4/开源配套 P5/**Tauri 壳+打包 P6** |

**存储架构**：`useDataStore`（Zustand）唯一数据入口 + `StorageAdapter`（`HttpFsAdapter` → 后端 `/api/fs/*`）。
后端直接读 vault 建索引（无前端推送链路，前端 30s 轮询 + watchdog SSE 兜底）。
文献元数据真源 = 后端 `literature.json`。

## 常用命令

```bash
# 前端 dev（node_modules 已装）
cd frontend && npm run dev

# 前端构建验证（tsc + vite）
cd frontend && npm run build

# 后端 dev（.venv 已复制，如缺依赖先 pip install -r requirements.txt）
cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 3001 --reload

# .env 配置：复制 .env.example 为 .env，填 DEEPSEEK_API_KEY；可选 SILICONFLOW_API_KEY

# 桌面版：后端打包 + Tauri 安装包
cd backend && .venv/Scripts/pyinstaller packaging/backend.spec --noconfirm
cd frontend && npm run tauri build
```

## 已知注意事项

- 前端目录拼写 **SiderBar**（非 SideBar），导入路径需注意
- 图片上传为模拟实现（lib/tiptap-utils.ts handleImageUpload）
- 后端错误约定：一律 HTTP 200 + SSE `{"error": ...}` 事件，前端按 `data.error` 分支处理
- 后端 config.py 为 dataclass + dotenv，无 `.env` 时 key 为空串
- 打包态可写路径 = exe 同目录（NSIS per-user 安装，目录用户可写）
- Tauri 壳动态端口（3001 起探测），前端经 `backend_info` command 获取

## 技术栈

- 前端：React 19 / Vite / TypeScript / Tailwind 4 / shadcn / Zustand 5 / Tiptap 3 / pdf.js / Tauri 2
- 后端：FastAPI / openai SDK（DeepSeek 中转，SSE 流式）/ LangChain（embedding/分块/向量库侧）/ ChromaDB / watchdog / PyInstaller

## 协作约定

- 每个功能任务独立验证、单独 commit，git log 即开发时间线
- 配套产物：docs/ 技术文档、ADR 决策记录，随开发维护
