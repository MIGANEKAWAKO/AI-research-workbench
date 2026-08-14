import type { FsEntry, StorageAdapter } from './types'

/**
 * HttpFsAdapter：StorageAdapter 的 HTTP 实现（开发期）。
 * 每个方法对应后端一个 /api/fs/* 接口（见 docs/后端接口文档.md §2.1）：
 *   read  → GET    /api/fs/read?path=
 *   write → POST   /api/fs/write?path=    body: {content}
 *   list  → GET    /api/fs/list?path=
 *   mkdir → POST   /api/fs/mkdir?path=
 *   delete→ DELETE /api/fs/delete?path=
 *   exists→ GET    /api/fs/exists?path=
 *
 * 职责边界：
 * - 只负责 HTTP 细节（URL 拼接、编码、解包、错误转换），不含业务逻辑
 * - path 为 vault 内相对路径（空串 = vault 根），必须 encodeURIComponent 编码（中文路径）
 * - 非 2xx 一律 throw Error(后端 detail)，成功才返回业务数据
 */

const BASE_URL = 'http://localhost:3001'

export class HttpFsAdapter implements StorageAdapter {
    /**
     * 统一请求入口
     * @param httpMethod  HTTP 方法（GET/POST/DELETE）
     * @param endpoint    后端接口名（list/read/write/mkdir/delete/exists）
     * @param path        vault 内相对路径
     * @param body        可选请求体（write 传 {content}）
     */
    private async request<T>(
        httpMethod: 'GET' | 'POST' | 'DELETE',
        endpoint: string,
        path: string,
        body?: unknown
    ): Promise<T> {
        const url = `${BASE_URL}/api/fs/${endpoint}?path=${encodeURIComponent(path)}`
        const response = await fetch(url, {
            method: httpMethod,
            headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        })

        if (!response.ok) {
            // 后端错误约定：HTTP 状态码 + {"detail": "原因"}
            let detail = `请求失败（${response.status}）`
            try {
                const data = await response.json()
                if (typeof data?.detail === 'string') detail = data.detail
            } catch {
                // 响应体不是 JSON 时保留默认信息
            }
            throw new Error(detail)
        }

        // 204/空响应体时返回 undefined，避免 JSON 解析报错
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return undefined as T
        }
        return response.json() as Promise<T>
    }

    async list(path: string): Promise<FsEntry[]> {
        const data = await this.request<{ entries: FsEntry[] }>('GET', 'list', path)
        return data.entries
    }

    async read(path: string): Promise<string> {
        const data = await this.request<{ content: string }>('GET', 'read', path)
        return data.content
    }

    async write(path: string, content: string): Promise<void> {
        await this.request<{ ok: boolean }>('POST', 'write', path, { content })
    }

    async mkdir(path: string): Promise<void> {
        await this.request<{ ok: boolean }>('POST', 'mkdir', path)
    }

    async delete(path: string): Promise<void> {
        await this.request<{ ok: boolean }>('DELETE', 'delete', path)
    }

    async exists(path: string): Promise<boolean> {
        const data = await this.request<{ exists: boolean }>('GET', 'exists', path)
        return data.exists
    }
}
