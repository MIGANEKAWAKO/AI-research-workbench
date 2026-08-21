# TipTap 编辑器 UI 改造清单（依据《知微-编辑器-TipTap.html》）

> 状态：待执行（主界面 UI 重构已交付，编辑器是最后一块）
> 设计稿：`frontend/知微-编辑器-TipTap.html`（418 行，TipTap 2 示例 + 完整内容样式映射）
> 原则：**最小代价**——样式层全部复用现有主题 token；只新增设计稿明确要求的功能扩展；不引入不必要的库。
> 前置注意：开工前确认在 **frontend** 分支（CLAUDE.md 分支纪律）。

---

## 一、设计稿要点（本次要新增/修改的）

| # | 设计稿内容 | 现状 | 处理 |
|---|---|---|---|
| E1 | **工具栏 15 按钮**：H1/H2/H3/B/I/U/无序/有序/任务列表/引用/提示框(callout)/代码块/链接/图片/表格 + 按钮 active 状态反射（蓝底浅色） | 现有 MainToolbarContent 13 组（撤销重做/标题下拉/列表下拉/引用/代码块/加粗斜体删除线下划线/高亮/链接/对齐/上下标/图片） | 按设计稿重排（保留必要功能见决策 D1） |
| E2 | **编辑/预览切换真实实现**：`editor.setEditable(false)` + `.preview` class（cursor default），无需 markdown 渲染库 | EditorHeader 里是占位 toggle | 接线（改 EditorHeader/editor/index.tsx） |
| E3 | **callout 提示框节点**（自定义 Node，蓝底圆角块 + ⓘ 图标） | 无 | 新建节点（参考设计稿实现）+ 样式 |
| E4 | **table 表格**（圆角边框、th 底纹、selectedCell 高亮、resizable） | 无 | 安装 tiptap 表格扩展 + 样式 |
| E5 | **代码块 macOS 三圆点 + data-lang 语言标签**（::before/::after） | 现有 code-block-node.scss 是模板样式 | 改样式 + 加 data-lang 逻辑 |
| E6 | **ProseMirror 内容样式全集**：h1 26px/h2 19px/h3 15.5px、蓝点无序列表、蓝色数字有序列表、blockquote 左边框、行内 code 粉紫、img 圆角、taskList 蓝色 checkbox、placeholder | 现有各 node scss 是模板样式 | 重写内容样式（对齐设计稿） |
| E7 | **placeholder**（"开始记录你的研究笔记…"） | 无 | 安装 Placeholder 扩展 + `is-editor-empty` 样式 |
| E8 | **编辑器正文全宽**（padding 24px 28px 60px，无 648px 居中） | simple-editor.scss max-width 648px 居中 | 改布局（见决策 D2） |
| E9 | 下划线按钮 | StarterKit v3 已内置 Underline，现有未启用 | 启用即可（无需安装） |

## 二、需要安装的依赖（npm，仅 5 个 tiptap 扩展）

```bash
npm install @tiptap/extension-placeholder \
  @tiptap/extension-table \
  @tiptap/extension-table-row \
  @tiptap/extension-table-cell \
  @tiptap/extension-table-header
```

> 已验证不需要安装：`@tiptap/extension-underline`（StarterKit v3 已含）、`@tiptap/extension-link`（已含）、taskList/taskItem（现有 `@tiptap/extension-list`）。
> 无需新增 shadcn 组件（工具栏按钮用 tailwind 即可；链接输入复用现有 LinkPopover，图片复用现有上传节点）。

## 三、决策点（已确认 2026-08）

| # | 决策 | 结论 |
|---|---|---|
| D1 | 现有高级功能去留 | **设计稿 15 按钮为主 + 撤销重做 + 高亮收进「更多」下拉** |
| D2 | 正文宽度 | **保留现有 648px 居中**（不动布局） |
| D3 | 链接/图片交互 | **按设计稿**：链接/图片用 prompt 输入 URL（简化交互，非弹层） |
| D4 | callout/table markdown 存储 | **自定义 serializer**（路线 A：第三方 tiptap-markdown + 手写 extendMarkdown） |

## 四、工作步骤（WBS，按协作契约单模块交付、单独 commit）

| 顺序 | 任务 | 主要改动 | 估时 | 验收 |
|---|---|---|---|---|
| T1 | **依赖与扩展接线** | npm 装 5 个扩展；`editor/index.tsx` extensions 增加 Placeholder/Table×4/Underline（启用） | 0.5d | 表格可插入、placeholder 出现、下划线可用 |
| T2 | **Callout 节点** | 新建 `tiptap-node/callout-node/`（Node.create 参考设计稿）+ markdown serializer/parser（D4-A 时） | 1d | 插入/渲染/保存/重开 round-trip 无损 |
| T3 | **Table 扩展接入 + round-trip 验证** | 表格按钮接线（insertTable 3×3）；验证 tiptap-markdown 对 table 的序列化；按 D4 处理 | 1d | 表格增删行列、保存重开不丢 |
| T4 | **内容样式重写** | 重写 heading/paragraph/blockquote/code-block/list/image/hr 各 node scss + placeholder + table + taskList 样式（对齐 E6/E5/E7） | 1d | 视觉与设计稿一致、深浅主题正常 |
| T5 | **工具栏重构** | `MainToolbarContent.tsx` 按设计稿 15 按钮重排（fmt-btn 30px、active 反射用 editor.isActive）；按 D1 处理高级按钮；保留 tiptap-ui 现有组件或换 tailwind 简单按钮 | 1d | 按钮功能 + active 高亮正确 |
| T6 | **编辑/预览切换接线** | EditorHeader view-toggle 接 `editor.setEditable` + `.preview` class；代码块 data-lang 刷新逻辑 | 0.5d | 预览只读、光标消失、切换正常 |
| T7 | **布局调整 + 回归** | 正文宽度按 D2；`npm run build`；T1 回归（笔记 CRUD/保存/cite 引用/图片上传/粘贴）；更新 docs | 0.5d | 全部无回归 |

## 五、风险点（提前标注）

1. **tiptap-markdown 对 table 无内置支持**（已验证 dist 无 table 相关）：table 的保存/重开 round-trip 是本改造最大风险，T3 必须先做序列化验证小实验再继续；最坏情况 table 序列化为 HTML 块（丑但可用）或自定义 serializer
2. **StarterKit v3 与设计稿 v2 差异**：设计稿 importmap 用 tiptap 2，项目是 3.22；API 兼容（Node.create/configure 相同），但 StarterKit v3 的默认配置不同（如 link 已内置），接线时以 v3 实际行为为准
3. **现有模板 scss 冲突**：`_variables.scss` 定义 --tt-* 模板变量，重写内容样式时注意别误删编辑器功能所需样式（如 .ProseMirror 基础 reset）
4. **cite 节点（F6 引用系统）必须保留**：内容样式重写时保留 cite-node.scss 的关键样式，避免引用徽章样式回归
5. **callout 嵌套序列化**：callout 内容为 `block+`，markdown serializer 需处理内部块级元素

## 六、不动的东西（防范围蔓延）

- 编辑器保存链路（`storage.markdown.getMarkdown()` + debounce 自动保存）
- cite 节点与引用系统、image-upload 上传节点、图片模拟上传
- AIPanel/侧边栏/顶栏（已完成的主界面重构）
- 后端与数据模型

## 七、备选路线：官方 @tiptap/markdown（暂不采用，已评估）

> 2026-08 调研结论（源码级验证 @tiptap/markdown@3.30.2）：**暂走路线 A（第三方 tiptap-markdown 0.9 + 手写 serializer）**，官方方案留作备选。

**官方方案要点（已验证）**：
- 机制：`Markdown.configure({ extensions: [Cite, Callout, Table…] })` 注册 tiptap 扩展即自动解析/渲染（靠扩展自带 parseHTML/renderHTML 往返），无需手写 serializer；引擎为 **marked**（非 markdown-it）
- **硬约束**：peerDependencies 要求 `@tiptap/core` / `@tiptap/pm` **恰为 3.30.2**，项目现为 3.22.4 → 必须升级整个 tiptap 家族（core/pm/react/starter-kit/extensions + 十余个 extension-* 包）
- 保存 API 不同：官方 storage 为 `{ manager }`（`manager.serialize()`），需改 `editor/index.tsx` 保存代码、cite 节点 `MarkdownNodeSpec` 适配、删除 `types/tiptap-markdown.d.ts` 补充
- **table 有已知 bug**：[#7435 不支持 Markdown table 语法](https://github.com/ueberdosis/tiptap/issues/7435)、[#5750 table 转 markdown 不正确](https://github.com/ueberdosis/tiptap/issues/5750)、[#7502 table 对齐失效](https://github.com/ueberdosis/tiptap/issues/7502)

**启用条件（任一时满足则切到官方方案）**：
1. T3 验证发现第三方 tiptap-markdown 手写 table serializer 工作量过大或不可行
2. 官方修复 table 相关 issue（7435/5750/7502）后，且用户同意升级 tiptap

**切换步骤（届时在独立 feature 分支执行，不污染 frontend）**：
1. 升级全部 @tiptap/* 到 3.30.2 → 回归现有功能
2. `npm uninstall tiptap-markdown && npm install @tiptap/markdown@3.30.2`
3. 改 editor/index.tsx（configure extensions + 保存 API）、cite 节点适配、删类型补充文件
4. 实测 table/cite/callout 的 markdown round-trip 通过后合并
