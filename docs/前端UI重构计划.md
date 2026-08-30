# 前端 UI 重构计划（依据《知微-科研工作台.html》设计稿）

> 状态：待执行（M1 已完成，M2 暂缓，本次只做 UI 重构）
> 设计稿：`frontend/知微-科研工作台.html`（1280 行，纯 HTML/CSS/JS 原型）
> 原则：**最小代价**——只改表现层，不动数据流 / store 接口 / 后端 / 数据模型；组件优先用 shadcn/ui 现成组件，可二次封装，不引入多余依赖。

---

## 一、已确认决策（用户拍板，2026-08 定稿）

| # | 决策项 | 结论 |
|---|---|---|
| 1 | 主题默认值 | **默认浅色**（沿用现状），支持深浅切换 + **localStorage 持久化** |
| 2 | 编辑/预览切换 | **只放 UI 按钮**（视觉对齐设计稿），点击提示"开发中"，本期不实现预览功能、不引入 markdown 渲染依赖 |
| 3 | 文献导入交互 | **保留现有 Sheet 弹层**（后端仅支持单 PDF + DOI/arXiv 补全），视觉按设计稿风格换肤（拖拽区 + 进度条样式） |
| 4 | 中文字体 | **系统字体栈**（PingFang SC / Microsoft YaHei 等），零新增依赖，离线可用 |

## 二、设计稿 vs 现有项目差异清单（含处理方式）

| # | 差异 | 处理方式 |
|---|---|---|
| D1 | 顶栏缺失（logo/中央标题/主题切换/通知/头像菜单） | 新增 `TopBar` 组件，布局壳接入。通知铃铛为静态占位（点击 toast"功能开发中"） |
| D2 | 主题机制不同（设计稿深色默认 + 蓝色主色 #4C8DFF） | 设计稿色板映射为 shadcn CSS 变量（light/dark 两套），新增 `use-theme` hook 持久化，默认浅色 |
| D3 | 视图状态机不同（设计稿 4 视图 vs 现有 notes/library + readerId） | **不改 store**，保持现有状态机，只对齐视觉。reader/upload 场景由现有 readerId → PdfReader / ImportSheet 覆盖 |
| D4 | 编辑/预览切换 | 编辑器页头放「编辑/预览」toggle（UI 占位，见决策 2） |
| D5 | 文献导入交互 | 保留 Sheet，按设计稿风格换肤（见决策 3） |
| D6 | AI 面板（设计稿 360px 固定 + 快捷 chips vs 现有可拖拽 + 任务按钮） | 保留可拖拽与任务按钮（功能不砍），默认宽度对齐 360px；新增设计稿样式的快捷 chips（点击填入输入框，纯前端） |
| D7 | 文献侧边栏（设计稿集合分组 vs 现有平铺列表） | **保留平铺列表换肤**（数据模型无集合概念，改动大，不做） |
| D8 | 字体（设计稿 Google Fonts 外链） | 系统字体栈（见决策 4） |
| D9 | 无功能 UI：通知铃铛、收藏、导出备份、清空本地数据 | 静态占位 + toast"功能开发中"，视觉保留 |
| D10 | PDF 阅读器（设计稿纸张示意 vs 现有 pdf.js 真实渲染） | 保留 pdf.js 渲染，仅对齐阅读器工具栏外观（返回/标题居中/缩放/页码） |

## 三、主题变量映射表（设计稿 → shadcn token）

写入 `frontend/src/index.css`（`:root` = 浅色默认，`.dark` = 深色；保留现有 oklch 结构，值替换为设计稿色板）：

| 设计稿语义 | 浅色值 | 深色值 | shadcn token |
|---|---|---|---|
| bg（应用背景） | #EEF0F3 | #0E0F12 | `--background` |
| surface（面板） | #FFFFFF | #131417 | `--card` `--popover` `--sidebar` |
| elevated（浮层） | #FFFFFF | #1A1C21 | `--popover`（菜单/Toast 用 card 即可，不额外加） |
| border | #E2E5EA | #26292F | `--border` `--input` |
| text-1 | #1B1D22 | #E7E9EC | `--foreground` |
| text-2 | #5A6068 | #9AA0A8 | `--muted-foreground` |
| text-3 | #8A9098 | #6A7079 | 弱化文字：用 `text-muted-foreground/70` 或自定义 `--muted-foreground-2`（暂用前者，不新增 token） |
| blue（主色） | #2F6BFF | #4C8DFF | `--primary` `--ring` `--sidebar-primary` |
| blue-soft | rgba(47,107,255,.10) | rgba(76,141,255,.12) | 就地用 `bg-primary/10`，不新增 token |
| green（成功） | #1FA971 | #36C98C | 新增 `--success` token（badge/状态用） |
| red（危险） | #E04545 | #FF5C5C | `--destructive` |
| amber（警告） | #C9871A | #F2B347 | 新增 `--warning` token |
| paper/ink（PDF 纸张） | — | — | 仅阅读器局部样式，不全局化 |

其他配套：
- `@theme inline` 中补充 `--color-success`、`--color-warning` 映射（Tailwind 4 可产出 `text-success` / `bg-warning` 等工具类）
- 字体栈：`html { font-family: "Geist Variable", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif }`
- 全局滚动条样式按设计稿（9px、thumb=border 色）
- 移除/停用 Google Fonts 引用（本项目无，仅设计稿有；确认 index.html 无外链即可）

## 四、新增 shadcn 组件（shadcn CLI 安装，仅 7 个）

| 组件 | 用途 | 新增第三方依赖 |
|---|---|---|
| `avatar` | 顶栏头像（首字母圆形） | 无（radix 已有） |
| `badge` | chip / tag / 状态徽标 | 无 |
| `dialog` | 重命名集合/笔记、新建集合、删除确认等 modal（替换 prompt/confirm） | 无 |
| `alert-dialog` | 危险操作确认（删除笔记/文献/集合） | 无 |
| `sonner` | 全局 Toast（success/error/info，顶部居中） | sonner 一个 |
| `progress` | 导入进度条 | 无（radix 已有） |
| `textarea` | AI 输入框、重命名输入 | 无 |

> 已安装无需动的：button / input / separator / tooltip / skeleton / sheet / sidebar / dropdown-menu / collapsible / resizable / scroll-area
> 明确不引入：路由、tabs（侧边栏 Tab 用按钮即可）、markdown 渲染库、状态管理新库。

## 五、文件级改动清单

### 5.1 全局与新增

| 文件 | 动作 | 内容 |
|---|---|---|
| `frontend/src/index.css` | 改 | 主题变量替换（见第三节）、字体栈、滚动条样式 |
| `frontend/src/hooks/use-theme.ts` | 新 | 主题 hook：读 localStorage → 应用 `.dark` class → 切换写回（默认浅色） |
| `frontend/src/components/TopBar/index.tsx` | 新 | 52px 顶栏：logo「知微·科研工作台」、中央当前文档标题（读 store）、主题切换、通知占位（绿点）、Avatar + DropdownMenu（切换主题/导出备份/关于/清空本地数据，后三项 toast 占位） |
| `frontend/src/components/EditorHeader.tsx` | 新 | 设计稿 note/lit 视图页头（chip + 右侧 meta/收藏/更多占位 + 大标题 + 工具栏行），供 Editor 与 LiteratureDetail 复用 |

### 5.2 布局壳

| 文件 | 动作 | 内容 |
|---|---|---|
| `frontend/src/pages/home/index.tsx` | 改 | 外层包 TopBar；侧边栏宽度 264（保留拖拽语义）；AI 面板默认 360；浅色/深色由 use-theme 驱动 |

### 5.3 组件换肤（只动 JSX/className，不改逻辑）

| 文件 | 动作 | 内容 |
|---|---|---|
| `src/components/SiderBar/index.tsx` | 改 | Tab 改设计稿样式（激活蓝底白字，笔记📄/文献图标）；新建按钮蓝色主按钮；搜索框样式；集合行 chevron 旋转 + count + hover 重命名/删除；note-row 激活左侧蓝色 accent 竖条；支持折叠为 60px 图标模式（沿用 shadcn sidebar collapsible="icon" 机制） |
| `src/components/Literature/literature-list.tsx` | 改 | 状态过滤 chips 用 badge；导入按钮蓝色；列表行 hover/选中样式对齐设计稿 |
| `src/components/Literature/literature-detail.tsx` | 改 | 页头用 EditorHeader（chip「博士论文·参考文献」+ meta + 收藏/更多占位）；正文对齐设计稿：meta-row 三格卡片（作者/期刊/年份）、摘要块、DOI mono 蓝字、tag-row、阅读文献（primary）/复制引用（ghost）按钮；删除移到操作区 |
| `src/components/Literature/import-sheet.tsx` | 改 | 拖拽区样式对齐设计稿 dropzone（虚线框 + 图标 + 点击选择）；导入中显示 progress 进度条；结果展示样式对齐 |
| `src/components/Reader/pdf-reader.tsx` | 改 | 工具栏对齐设计稿 reader-toolbar：返回（蓝色文字按钮）、标题居中省略、缩放组、页码 |
| `src/components/AIPanel/index.tsx` | 改 | 头部对齐（渐变 logo 方块 + 「AI 助手/在线」+ 折叠按钮）；消息气泡对齐设计稿（user 蓝底右对齐 / ai 灰底左对齐 + 头像块）；输入区（textarea + 蓝色圆形发送按钮）+ 快捷 chips 行（总结当前笔记/解释这段代码/生成引用，点击填入输入框）；保留任务按钮与上下文指示条（样式微调）；底部悬浮「打开 AI」按钮样式对齐 ai-reopen |
| `src/pages/editor/index.tsx` | 改 | 页头替换为 EditorHeader（chip/标题/meta/收藏更多占位/编辑-预览 toggle 占位）；**不动** tiptap 工具栏、编辑逻辑、保存逻辑 |

### 5.4 不动的东西（防范围蔓延）

- store（useNoteStore / useDataStore / useLiteratureStore）接口与状态机
- useNotes / services（ai / literature / pdf / storage）与后端
- tiptap 编辑器核心、13 组工具栏、自定义节点、SCSS 主题
- 文献数据模型（无集合概念）、导入单文件协议
- pdf.js 渲染逻辑（pdf-page / selection-toolbar / cite-picker）
- 拖拽（dnd-kit）与 Resizable 能力

## 六、实施顺序（每步独立可验证）

1. **Step 0** 安装 shadcn 组件：`npx shadcn add avatar badge dialog alert-dialog sonner progress textarea`
2. **Step 1** 主题基建：index.css 变量替换 + `use-theme` hook（验证：浅/深切换、刷新持久化）
3. **Step 2** 布局壳：TopBar + home/index.tsx 接入（验证：顶栏渲染、菜单、主题切换联动）
4. **Step 3** 侧边栏换肤（SiderBar，验证：Tab/搜索/集合折叠/行操作/折叠模式）
5. **Step 4** 编辑器页头（EditorHeader + editor/index.tsx 接入，验证：chip/标题/meta/toggle 占位）
6. **Step 5** 文献模块换肤（列表/详情/导入 Sheet，验证：详情三格卡片、导入进度条）
7. **Step 6** PDF 阅读器工具栏换肤（验证：返回/居中标题/缩放/页码）
8. **Step 7** AI 面板换肤（验证：气泡样式、快捷 chips、发送、划词提问联动、reopen 按钮）
9. **Step 8** 收尾：确认无 prompt/confirm 残留（删除类改 alert-dialog）、`npm run build` 通过、T1 回归（导入→阅读→划词引用→问答→导出）

## 七、验收标准

- [ ] 视觉与设计稿一致（布局、配色、间距、圆角、字号）
- [ ] 浅色默认，深浅切换可用且刷新后保持
- [ ] 全部现有功能无回归（导入、阅读、划词引用/问 AI、AI 问答、笔记 CRUD、拖拽）
- [ ] `npm run build`（tsc + vite）零错误
- [ ] 无新增非必要依赖（仅 sonner 一个第三方库）
