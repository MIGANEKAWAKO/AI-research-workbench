# ADR 架构决策记录

> 每个技术决策记录"背景 - 方案 - 理由 - 代价"，随开发维护。

## ADR-0001：vault 路径的默认值与配置优先级（2026-08-13）

**背景**：vault 路径被 fs 路由、kb、agent 的 note_read 多处引用，需要单一权威推导。

**方案**：`.env VAULT_PATH`（显式配置）→ 开发默认 `backend/vault`（打包态为 exe 同目录 `vault/`）。
`default_vault_path()` 是唯一入口，`resolve_vault_path()` 做相对路径归一化 + `resolve()` 后 `is_relative_to(vault)` 防目录穿越（符号链接同理）。

**理由**：配置文件优先于约定优于默认；路径安全边界单点实现，避免各路由各自防御。

**代价**：用户需理解 vault 与 `.kb/` 的关系；默认路径对误用者隐藏。

## ADR-0002：B3 采用"同步核心 + 调用方 to_thread"（2026-08-13）

**背景**：chroma/langchain 均为同步 API，FastAPI async 路由直接调用会阻塞事件循环。

**方案**：`kb.py` 全部同步实现；async 路由（chat/research/kb 刷新）用 `anyio.to_thread.run_sync` 包装。

**理由**：同步核心可被 CLI/测试直接调用；`to_thread` 不引入额外依赖与复杂度；异步化留给真正并发的调用方决定。

**代价**：调用方必须记得包线程；线程池默认上限（40）对个人规模足够。

## ADR-0003：Research Agent 采用"单 Agent + 工具注册表 + 显式状态机"（2026-08-22）

**背景**：M1 后的研究任务需要多步工具调用，但第一版不引入多 Agent 框架。

**方案**：单 Agent 循环（规划→工具调用→汇总）；工具经白名单注册表 + JSON Schema 校验；显式状态机 `CREATED → PLANNING → EXECUTING → SYNTHESIZING → COMPLETED/FAILED/CANCELLED`；预算上限（5 步骤/8 工具调用）。

**理由**：单 Agent 覆盖验收场景；注册表隔离工具与编排器（未来迁移框架工具无需重写）；显式状态机可测试、事件流可观察。

**代价**：事件与状态需自定义（框架自带能力缺失）；进程重启任务丢失（可接受）；工具协议需前后端对齐。

## ADR-0004：工具消息回填必须保留供应商原始 assistant 消息（2026-08-22）

**背景**：手动构造 assistant(tool_calls) 消息回填历史，触发 DeepSeek 400（thinking 模式校验 reasoning_content 必须原样回传）；此前手动构造已踩过 tool 消息配对坑。

**方案**：`LLMReply.raw_assistant` 保存客户端返回的原始 assistant 消息（content + reasoning_content + tool_calls 原样），回填历史优先使用原始消息，仅按预算裁剪未执行的 tool_calls；Mock/降级路径无原始消息时才手动构造。

**理由**：供应商消息字段是供应商私有协议（OpenAI 兼容只保证 content/tool_calls）——任何"重建消息"都可能丢字段；能用原始消息就绝不重建。

**代价**：LLMReply 增加一个字段；不同供应商的原始消息结构需各自适配。

## ADR-0005：发布态后端端口动态探测（3001 起），前端经 backend_info 获取（2026-08-28）

**背景**：Tauri 壳需要拉起后端进程；固定端口 3001 可能与用户其他程序冲突；WebView 源无法预知后端地址。

**方案**：Rust 侧 `probe_port()` 试绑 3001-3010 取首个空闲，spawn 后端时传 `--port N`；`backend_info` command 下发端口；前端 `services/api.ts` 统一解析（Tauri 态 `http://127.0.0.1:{port}`，浏览器态维持 `http://localhost:3001`）。

**理由**：端口协商发生在后端启动前，无竞态窗口；127.0.0.1 规避 Windows localhost 的 IPv6 优先解析；浏览器开发流程零变化。

**代价**：壳与前端各有一处端口逻辑；探测释放到后端绑定之间的理论竞争窗口（概率极低）。

## ADR-0006：打包态可写路径 = exe 同目录（app_data_dir 统一推导）（2026-08-28）

**背景**：PyInstaller 打包后 `__file__` 指向 _MEIPASS 临时解压目录（每次启动随机），在此写 .env/日志会丢失。

**方案**：`app/paths.py` 的 `app_data_dir()`——`sys.frozen`（打包态）返回 `sys.executable` 同目录，否则返回 `backend/`；ENV_PATH/LOG_DIR/vault 兜底统一改走它。

**理由**：exe 同目录 = NSIS 默认 per-user 安装目录（用户可写），.env/日志/vault 直接可见、可整体备份；单一推导函数避免再次分散。

**代价**：安装目录被移到只读位置时 .env 不可写——per-user 安装约定下不触发。

## ADR-0007：发布期 StorageAdapter 复用 HttpFsAdapter，不实现 Tauri 原生 fs（2026-08-28）

**背景**：早期设想"发布期换 Tauri 原生 fs 插件，只改工厂一处"。P6 落地时重新评估：发布形态下后端进程常驻，vault 文件的读写真源仍是后端（索引直接读文件、无前端推送链路）。

**方案**：StorageAdapter 工厂继续返回 HttpFsAdapter（走 /api/fs/*），TauriFsAdapter 记入后续清单不实现。

**理由**：前端直读 vault 会引入"前端写文件 → 后端索引滞后"的双写不一致（watchdog/SSE/轮询只解决外部修改感知）；后端进程在，HttpFsAdapter 零改动复用已验证链路——最小改动原则。

**代价**：偏离"发布期原生 fs"的早期设想；依赖后端进程存活（与现状一致，前端有降级提示）。
