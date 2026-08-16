## B7 chat RAG 检索注入 · 设计讲解

### 1. 解决什么问题

现有 `/api/chat` 是纯 LLM 中转：对话模式只带 `noteContext`（前端目前传的是 `activeNoteId:xxx` 占位），AI 看不到 vault 里的笔记/文献内容，回答无法结合"你的知识库"。B7 让对话模式在调 DeepSeek 前**先做向量检索，把命中的内容片段注入 system prompt**，并支持单篇限定（PRD 4.6 的全局问答 / 单篇问答）。

### 2. 数据流

复制

```
POST /api/chat（对话模式，新增可选字段 docId）
  → 提取 query = 最后一条 user 消息 content
  → to_thread(kb.retrieve)(query, doc_id=docId, top_k=5)
      ├─ 全局：doc_id=None → similarity_search 全库
      └─ 单篇：doc_id=当前文献ID → where={"docId": doc_id} 限定
  → Document 列表（page_content + metadata{title,page,docId,docType}）
  → 拼成 RAG 上下文文本（附标题+页码）
  → 注入 system prompt（"基于片段回答 + 附来源"）
  → DeepSeek SSE 流式（★协议逐字节不变）
  → 检索异常（无 key/网络/库空）→ 降级为无 RAG 对话（照旧）
```

### 3. 关键改动点（具体到文件与函数）

| 位置               | 改动                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/main.py`    | `chat()` 解析新字段 `docId`（可选）；`_build_messages()` 的对话分支里，调检索并把 context 塞进 system prompt                                                                         |
| `app/main.py`    | 新增 `_extract_query(messages)`（取最后一条 user 消息）；新增 `_retrieve_context(query, doc_id)`（`anyio.to_thread.run_sync(kb.retrieve, ...)` 包一层，try/except 返回 `None` 降级） |
| `app/prompts.py` | 新增 RAG 版 system prompt 模板（含 `{rag_context}` 占位 + "回答附来源：文献标题+页码"约束）                                                                                          |
| `app/kb.py`      | **零改动**（`retrieve` 已是最终形态，B3 交付）                                                                                                                             |

### 4. 协议约定（★这是 F7 前端对接的合同，写死别改）

对话模式请求体，新增**可选**字段：

json

复制

```
{ "messages": [...], "noteContext": "...", "docId": "12位hex文献ID" }
```

- **不传 `docId`** → 全局检索（全库笔记+文献混合）
- **传 `docId`** → 单篇检索（`where={"docId": docId}` 限定当前文献）

`docId` 就是 `LiteratureEntry.id`（12 位 hex，与向量块元数据 `docId` 一致，见 B5/B6）。**SSE 响应格式不变**（`data: {"content": ...}` / `data: {"error": ...}`），前端 `services/ai.ts` 零改动即可对接。

### 5. 设计取舍（面试要点，写的时候心里有数）

1. **query 取最后一条 user 消息**：对话上下文是多轮，但检索只需要"当前问题"——取 `messages` 里最后一条 `role=='user'` 的 content 最精准，不把历史回答混进检索向量。
2. **检索结果拼成"来源片段"而非直接贴原文**：每个 Document 带 `title/page`，拼成 `【《标题》第 N 页】\n片段`，system prompt 才能要求模型"回答附来源标题+页码"（PRD 5.6）。
3. **降级 = 检索失败时用无 RAG 对话**：embedding 无 key（`_get_embeddings` 会抛 RuntimeError）、网络断、Chroma 空——全部 try/except 捕获后走现有 `SYSTEM_PROMPT_TEMPLATE`，**检索失败绝不阻断对话**（延续 B2/B5/B6 的降级约定，PRD 5.6）。
4. **to_thread 调度**：`kb.retrieve` 是同步（embedding + Chroma），在 async 路由里必须 `anyio.to_thread.run_sync` 包一层，否则阻塞事件循环（B3 决策 2、B5 已踩过"run_sync 只接受位置参数"的坑）。
5. **SSE 逐字节不变**：RAG 只是改发给 DeepSeek 的 messages，SSE 事件格式、错误约定、打字机体验全部不动（PRD 9.2 硬性要求）。
6. **任务模式（总结/润色/续写）不接 RAG**：任务模式处理的是用户直接给的 text（划词/选区），不是知识库问答，检索反而多余。

### 6. 验证建议（写完后自己先验）

1. 全局：对话模式不带 docId → 问一个 vault 里有答案的问题 → 回答应引用笔记/文献内容（附标题+页码）
2. 单篇：带某文献 docId → 回答只应来自该文献（where 过滤生效）
3. 降级：临时把 `.env` 的 `SILICONFLOW_API_KEY` 清空 → 对话照常返回（无来源标注），不报错
4. 回归：任务模式三件套 SSE 逐字节不变



B7 讲解：chat RAG 注入（你亲手实现的部分）

  一、B7 要做什么（整体）

  现在 /api/chat 的对话流程是"裸问答"：你的问题直接进 DeepSeek，它只知道自己的知识。B7 让它在回答前先检索你的知识库——把相关段落（笔记/文献）注入 system
  prompt，让它"带着资料回答问题"，并要求回答附来源（文献标题 + 页码）（PRD 5.6）。

  三件事：

1. 对话模式（messages 分支）检索 top-k=5 注入 system prompt

2. 支持单篇限定（docId → 限定该文献检索）

3. SSE 协议逐字节不变（前端打字机零改动，PRD 9.2 硬性要求）；embedding 失败降级为无 RAG
   
   二、现有 chat 流程（你要改的地方）
   
   POST /api/chat  payload: {messages, noteContext} 或 {taskType, text}
   │
   ▼ main.py _build_messages(payload)          ← ★ 对话模式分支在这里加检索
   messages = [system(SYSTEM_PROMPT_TEMPLATE.format(note_context=...)), *user消息]
   │
   ▼ _stream_chat_completion(messages)          ← 不改（SSE 逐字节不变）
   SSE: data: {"content": ...}
   
   改造后：
   
   messages 分支：
   ① 提取检索 query（最新一条 user 消息的 content，截断 ~500 字）
   ② kb.retrieve(query, doc_id=payload.get("docId"), top_k=5)  ← 同步函数，to_thread 包
   ③ 组装上下文文本：[来源: 标题, 第N页] chunk...
   ④ system content = 模板 + 检索上下文 + 来源要求
   ⑤ 检索异常 → 空上下文（降级，照常对话）
   
   三、协议扩展（前端 F7 对接依据，我会同步接口文档）
   
   POST /api/chat
   {
   "messages": [...],
   "noteContext": "...",
   "docId": "文献ID 或 笔记相对路径"    // 新增：缺省 = 全局检索
   }
   
   docId 就是 kb 索引的 docId：文献 = literature 的 id，笔记 = 笔记/xxx.md 去 .md 的相对路径。
   
   四、你要实现的（约 100 行，建议新建 backend/app/rag.py）
   
   ┌───────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────┐
   │                         函数                          │                                            职责                                             │
   ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
   │ build_rag_context(query, doc_id=None, top_k=5) -> str │ 核心：调 kb.retrieve → 组装上下文文本；任何异常返回空串（降级）；同步函数，路由里 to_thread │
   ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
   │ _format_chunk(doc) -> str                             │ 单块格式化：[来源: {title}, 第{page}页] {text}（title/page 在 doc.metadata）                │
   └───────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────┘
   
   然后在 main.py 的 _build_messages 对话分支里接上：
   query = 最新一条 user 消息
   rag_text = await anyio.to_thread.run_sync(rag.build_rag_context, query, payload.get("docId"))
   system_content = SYSTEM_PROMPT_TEMPLATE.format(note_context=...) + rag_text
   
   五、关键决策与边界（先想清楚再写）

4. 任务模式（taskType）不注入 RAG：总结/润色/续写是处理"现有文本"，不是问答，检索无意义

5. 检索 query 截断：超长消息只取前 ~500 字检索（embedding 输入有上限）

6. 降级是"静默"的：失败返回空串，用户无感知，绝不报错打断对话

7. 来源格式：[来源: 标题, 第N页]——注意文献的 page 在 metadata、标题也在 metadata；笔记块没有页码，格式要兼容（无 page 就不带页码）

8. system prompt 里要明确要求模型引用来源："回答基于以上检索内容，并注明来源"——否则模型会当普通文本回答，来源标注失效
   
   六、面试要点（你写完要能答）
- 为什么注入 system prompt 而不是拼接在 user 消息里：system 消息定义助手角色与约束，检索结果属于"回答时的参考资料"，语义上属于系统约束；且 prompt
  注入（恶意用户内容）不会污染检索上下文

- 为什么降级是静默的：RAG 是增强能力，不是主流程——检索失败 ≠ 问答失败（B5 双重降级同思想）

- top_k=5 为什么是 5：上下文窗口预算——5 块 × 500 字 ≈ 2500 字，加上对话历史，DeepSeek 长上下文无压力，太多则稀释注意力
  
  七、我的角色

- 写之前：上面这些边界已讲清，你动手

- 写之后：我 review 你的 diff + 端到端验证（真实检索注入、降级分支、SSE 协议对比），并把接口文档的 docId 字段补上
