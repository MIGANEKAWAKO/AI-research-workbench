# AI 科研工作台（AI Research Workbench）

## 项目定位

个人学术文献工作台：**文献管理 → PDF 阅读 → 笔记+引用 → AI 问答 → 论文写作导出**一条链路。本地优先，数据以普通文件存在用户自选的 vault 文件夹中。

用户为计算机专业研究生，正在赶秋招（2026-08 起投递），目标：用 AI 加速开发，同时**掌握项目全貌应对面试**。本仓库为全新开发目录（前端/后端复制自 react-note / fastapi-note-server 作为基础，不溯回原目录改动）。

## 目录结构

```
AI research workbench/
├─ frontend/                  # React 19 前端
│  └─ src/
│     ├─ pages/
│     │  ├─ home/index.tsx            # 三栏主布局（侧边栏+编辑器+AI面板）
│     │  └─ editor/                   # Tiptap 编辑器 + 自动保存
│     │     ├─ index.tsx
│     │     ├─ MainToolbarContent.tsx # 桌面工具栏
│     │     └─ MobileToolbarContent.tsx
│     ├─ components/
│     │  ├─ SiderBar/                 # 笔记/集合列表（注意拼写 SiderBar 非 SideBar）
│     │  │  ├─ index.tsx
│     │  │  ├─ draggable-note.tsx
│     │  │  └─ droppable-collection.tsx
│     │  ├─ AIPanel/                  # AI 助手面板（SSE 流式+打字机）
│     │  ├─ ui/                       # shadcn/ui 组件（sidebar/button/input/sheet 等）
│     │  ├─ tiptap-ui/                # 编辑器功能按钮（13 组）
│     │  ├─ tiptap-ui-primitive/      # 编辑器基础 UI 原语
│     │  ├─ tiptap-icons/             # 自定义 SVG 图标
│     │  ├─ tiptap-node/              # 自定义节点（image-upload、horizontal-rule）
│     │  ├─ tiptap-extension/         # node-background 扩展
│     │  └─ tiptap-templates/         # 模板代码（可能未使用，待确认清理）
│     ├─ store/
│     │  ├─ useNoteStore.ts           # Zustand：UI 状态（activeNoteId/isAiPanelOpen 等）
│     │  └─ useDataStore.ts           # Zustand：数据源（notes/collections + CRUD）★临时内存版
│     ├─ services/
│     │  └─ ai.ts                     # 唯一后端调用：POST /api/chat（SSE 流式解析）
│     ├─ hooks/
│     │  ├─ useNotes.ts               # 笔记保存/读取（对外 API 稳定，内部调 useDataStore）
│     │  └─ ...                       # 11 个编辑器/布局辅助 hook
│     ├─ types/index.ts               # Note / Collection 数据结构定义
│     ├─ lib/                         # cn()、tiptap 工具函数
│     ├─ styles/                      # SCSS 主题变量（编辑器双主题）
│     ├─ index.css                    # Tailwind 4 + shadcn 主题
│     └─ main.tsx / App.tsx           # 入口（无路由，直接渲染 Home）
├─ backend/                   # FastAPI 后端
│  └─ app/
│     ├─ main.py                      # FastAPI 入口：lifespan 启动自动扫描 + 路由挂载 + /api/chat(SSE 中转 DeepSeek)
│     ├─ config.py                    # dataclass 配置（dotenv：DEEPSEEK/SILICONFLOW key、VAULT_PATH、KB_DIR、PORT）
│     ├─ prompts.py                   # 任务提示词模板（summarize/polish/continue）
│     ├─ vault.py                     # vault 路径推导（default_vault_path/kb_root/chroma_dir，ADR-0001）
│     ├─ metadata.py                  # B2 元数据补全（Crossref/arXiv，失败返回 {}）
│     ├─ kb.py                        # B3 知识库核心（Chroma + embedding + 分块 + 增删查）
│     ├─ literature.py                # B5 文献元数据持久层（literature.json 原子读写）
│     ├─ indexer.py                   # B6 索引管理（mtime 增量扫描 + index_state.json）
│     ├─ frontmatter.py               # B8 笔记 frontmatter 解析（indexer/export 共用）
│     ├─ export.py                    # B8 导出服务（cites 聚合 + docx + BibTeX）
│     ├─ citation_formats.py          # B8 引用格式化纯函数（GB/T 7714/APA/IEEE，★用户亲手实现）
│     ├─ rag.py                       # B7 chat RAG 注入（★用户亲手实现，静默降级）
│     └─ routers/
│        ├─ fs.py                     # B4 vault 文件 API（/api/fs/*，防目录穿越）
│        ├─ documents.py              # B5 文献导入与管理（/api/documents）
│        ├─ kb_api.py                 # B6 索引状态与刷新（/api/kb）
│        └─ export_api.py             # B8 导出（/api/export）
├─ CLAUDE.md                   # 本文件：项目指引
├─ 科研工作台需求文档.md      # PRD + 架构决策 + M1 排期 WBS（第 9 章）
└─ AI协作开发流程.md          # 协作契约（每次开发会话必读）
```

## 开发进度（截至 2026-08-19）

| 状态 | 内容 |
|---|---|
| ✅ 完成 | **后端 B1-B8 全部完成**：B1 依赖配置 → B2 元数据补全（Crossref/arXiv）→ B3 知识库（Chroma+bge-m3+中文分块）→ B4 vault 文件 API（防目录穿越）→ B5 文献导入管理（multipart+补全+索引+literature.json 原子写）→ B5.1 导入自动提取 DOI → B6 索引管理（mtime 增量 + lifespan 启动自动扫描）→ B7 chat RAG 注入（★用户亲手实现，静默降级）→ B8 导出（GB/T 7714/APA/IEEE 纯函数 ★用户亲手实现 + docx + BibTeX） |
| ✅ 完成 | **前端 F1-F7 全部完成**：F1 StorageAdapter → F2 Markdown 化（+gray-matter Buffer 修复）→ F3 侧边栏文件模式 → F4 文献库 UI → F5 PDF 阅读器（pdfjs-dist + 划词转引用/问AI/复制）→ F6 引用系统 UI（Cite 内联节点 + markdown round-trip）→ F7 AI 面板适配（全局/单篇问答 + 划词提问） |
| ⚠️ 当前 | **M1 功能开发收官，待联调**：T1 端到端（导入→阅读→划词引用→问答→导出）与 T2 回归（笔记编辑/任务模式/断网降级）尚未执行；已知遗留：文献元数据编辑接口（PUT /api/documents/{id}）未实现，F4 详情页只读；背景色节点序列化降级为纯文本 |
| ⬜ 下一步 | T1/T2 联调验收；之后 M2（高亮批注、watchdog + SSE、Tauri 壳） |

**存储架构**：`useDataStore`（Zustand）唯一数据入口（内存缓存 = 响应式数据源）+ `StorageAdapter`（开发期 `HttpFsAdapter` → 后端 `/api/fs/*`；发布期换 Tauri 只改工厂 `src/services/storage/index.ts` 一处）。后端直接读 vault 建索引（无前端推送链路，前端 30s 轮询兜底）。文献元数据真源 = 后端 `literature.json`（前端纯消费者，无内存缓存层）。

## 必读文档（按序）

1. **AI协作开发流程.md** — 协作契约。每次会话严格执行"讲→写→读→考"、单模块交付、禁止代写用户核心模块。
2. **科研工作台需求文档.md** — PRD 全部内容；第 9 章为 M1 WBS 排期（任务粒度：B1-B8 后端、F1-F7 前端、T1-T2 联调）。

## 架构决策速览（详见 PRD 5.2）

- **弃用 IndexedDB → 本地文件 vault**：笔记存 Markdown+frontmatter，PDF 存原文件，元数据存 `.kb/literature.json`（当前已去 Dexie，存储层待 F1 实现文件读写）
- 后端直接读 vault 建索引（**无前端推送同步链路**）
- RAG：SiliconFlow embedding（`BAAI/bge-m3`）+ ChromaDB + DeepSeek chat（现有 SSE 中转协议不变）
- PDF 抽取 pypdf 起步；运行形态：开发期浏览器 + 发布期 Tauri 2；存储层抽象 `StorageAdapter`

## 技术栈

- 前端：React 19 / Vite 8 / TypeScript / Tailwind 4 / shadcn / Zustand 5 / Tiptap 3 / pdf.js（待引入）
- 后端：FastAPI / openai SDK（DeepSeek 中转，SSE 流式）/ LangChain RAG（待引入）/ 无数据库

## 常用命令

```bash
# 前端 dev（node_modules 已装）
cd frontend && npm run dev

# 前端构建验证（tsc + vite）
cd frontend && npm run build

# 后端 dev（.venv 已复制，如缺依赖先 pip install -r requirements.txt）
cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 3001 --reload

# .env 配置：复制 .env.example 为 .env，填 DEEPSEEK_API_KEY；后续加 SILICONFLOW_API_KEY
```

## 已知注意事项（坑）

- 前端目录拼写 **SiderBar**（非 SideBar），导入路径需注意
- 前端硬编码 `http://localhost:3001/api/chat`（services/ai.ts）
- 图片上传为模拟实现（lib/tiptap-utils.ts handleImageUpload）
- **数据源是内存态**：刷新页面后笔记/集合丢失（F1 前属预期）
- 后端错误约定：一律 HTTP 200 + SSE `{"error": ...}` 事件，前端按 `data.error` 分支处理
- 后端 config.py 为 dataclass + dotenv，无 `.env` 时 key 为空串

## 协作契约要点（完整版见 AI协作开发流程.md）

- **单次交付一个 WBS 任务**（如 B3、F2），禁止一口气写完里程碑
- 写代码前先"讲"（问题/数据流/关键函数/设计取舍，具体到文件与函数名）
- 交付后**必须停下**，等用户 review diff 并提问
- **禁止代写**：RAG 检索注入、GB/T 7714 格式化、StorageAdapter 接口（用户亲手写，只可讲解+审查）
- 配套产物：`docs/模块说明.md`、`docs/面试问答.md`、ADR 决策记录，随开发维护
- 所有交流与文档用中文

## 分支结构

  master（发布基线，只接受合并）
  ├─ frontend ── 前端开发线（F1-F7 都在这里）
  └─ backend  ── 后端开发线（B1-B8 都在这里）

## 约定与注意

- 目录纪律：**frontend 分支只改 frontend/**，**backend 分支只改 backend/**。若有跨端改动，回到 master 开 feature 分支做
- 文档共享：CLAUDE.md、需求文档、docs/ 属两份共享，两边改动会重复提交——可以接受；后续如需要可用 git merge backend 到 frontend 定期同步
- 演进路径：到具体功能时，**从对应开发分支切 feature/xxx**，**完成合并回开发分支**；hotfix 从 master 切出修完合回 master 并同步两个开发分支
- 提交粒度：**每个 WBS 任务一个 commit**，git log 即开发时间线
