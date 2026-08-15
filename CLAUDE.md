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
│     ├─ main.py                      # 全部路由：POST /api/chat(SSE 中转 DeepSeek) + / /health /ping
│     ├─ config.py                    # dataclass 配置（dotenv：DEEPSEEK_API_KEY/BASE_URL/PORT）
│     └─ prompts.py                   # 任务提示词模板（summarize/polish/continue）
├─ CLAUDE.md                   # 本文件：项目指引
├─ 科研工作台需求文档.md      # PRD + 架构决策 + M1 排期 WBS（第 9 章）
└─ AI协作开发流程.md          # 协作契约（每次开发会话必读）
```

## 开发进度（截至 2026-08-14）

| 状态    | 内容                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------- |
| ✅ 完成  | 依赖清理：移除 dexie / dexie-react-hooks / react-router-dom，删除 db.ts，类型迁入 src/types/，Dexie 调用全部替换为 `useDataStore` 内存数据源，构建通过 |
| ✅ 完成  | **F1 StorageAdapter 抽象**：接口 6 方法（用户写）+ `HttpFsAdapter`（fetch 后端 `/api/fs/*`）+ 工厂 + `useDataStore` 文件持久化（loadAll/saveNote/deleteNote），UI 层零改动，端到端验证 8/8 |
| ✅ 完成  | **F2 笔记 Markdown 化**：`src/lib/note-file.ts`（frontmatter 读写纯函数）+ editor 保存改 `getMarkdown()` + 集合持久化 `.kb/collections.json` + tiptap-markdown 类型补充，纯函数 16/16 + 端到端 20/20 验证通过 |
| ✅ 完成  | **F2 bugfix：gray-matter 浏览器 Buffer 崩溃**——弃用 gray-matter（其 utils.js 直接用全局 `Buffer.from`，浏览器必崩），自研 `src/lib/frontmatter.ts`（js-yaml@4，~50 行），格式兼容旧文件；bundle -275KB，浏览器侧 dump/load 验证通过 |
| ⚠️ 当前 | 笔记以 Markdown + frontmatter（title/collection/tags/cites）落盘，Obsidian 可直接打开；**注意：tiptap-markdown@0.9 无 extendMarkdown**（自定义节点序列化能力缺失，背景色降级，引用徽章序列化推迟 F6 前置调研） |
| ⬜ 下一步 | WBS F3（侧边栏/列表文件模式改造：数据源文件扫描 + 30s 轮询兜底 + 搜索/拖拽/重命名适配）或 F4（文献库 UI，依赖 B5） |

**前端当前存储架构**：`useDataStore`（Zustand）仍是唯一数据入口（内存缓存 = 响应式数据源）；`useNotes.ts` 保持对外 API 签名（saveNote/getNote），编辑器零改动。存储链路：UI → useDataStore → `StorageAdapter`（开发期 `HttpFsAdapter` → 后端 `/api/fs/*`）→ vault 文件（笔记 = Markdown + frontmatter，集合 = `.kb/collections.json`）。发布期换 Tauri 实现只需改工厂 `src/services/storage/index.ts` 一处。F3 起 UI 层将接触文件扫描/轮询，但 useNotes 对外 API 仍保持稳定。

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
