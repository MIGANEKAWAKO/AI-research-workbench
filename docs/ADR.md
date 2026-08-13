# ADR 架构决策记录

> 每次拍板记录"背景-方案-理由-代价"。面试问"为什么"时，先翻这里。

## ADR-0001：vault 路径的默认值与配置优先级（2026-08-13）

**背景**：B3 需要 Chroma 持久化目录，B4 需要 vault 根路径，而 vault 是"用户自选文件夹"，前端首次启动引导（F1）尚未实现。B1 只留了 `VAULT_PATH`/`KB_DIR` 配置位。

**方案**：路径优先级 `VAULT_PATH(.env) → 开发默认 backend/vault`；`KB_DIR` 未配置时 = `{vault}/.kb`，Chroma 存 `{vault}/.kb/chroma_db`。`backend/vault/` 加入 .gitignore（不入库）。

**理由**：
- 开发期零配置可跑（B6 扫描、B5 导入都需要一个真实目录）
- vault 是数据目录，语义上跟随用户选择，开发默认值只服务于开发期
- .kb 由后端重建，损坏可删（PRD 非功能需求），不入版本库

**代价**：正式上线前需完成前端 vault 选择交互并写入 .env；开发期数据与代码同目录，发布期需迁移。

## ADR-0002：B3 采用"同步核心 + 调用方 to_thread"（2026-08-13）

**背景**：langchain 的 OpenAIEmbeddings / Chroma 只提供同步 API，而 B5/B7 路由是 async。

**方案**：kb.py 全部同步实现；async 路由里用 `anyio.to_thread.run_sync` 包一层调用。

**理由**：同步核心测试/CLI 简单；调度方式由调用侧决定，不把 async 泄漏进核心；embedding 网络 IO 经 to_thread 不阻塞事件循环。

**代价**：调用方需要记得包 to_thread（约定而非强制）；线程池调度有微小开销（每次调用一个线程）。
