import type { StorageAdapter } from './types'
import { HttpFsAdapter } from './http-fs-adapter'

/**
 * 存储适配器工厂：业务代码只依赖 StorageAdapter 接口，不感知具体实现。
 * 开发期 → HttpFsAdapter（fetch 后端 /api/fs/*，后端直接读写 vault 文件）
 * 发布期 → TauriFsAdapter（M2，Tauri 原生 fs 插件），只需改这一处
 */
export function createStorageAdapter(): StorageAdapter {
    return new HttpFsAdapter()
}
