import type { LiteratureEntry } from '@/types'
import { apiFetch } from './api'

/**
 * 文献 API 封装（B5：/api/documents，见 docs/后端接口文档.md §3）。
 * 与 HttpFsAdapter 同款错误约定：非 2xx → throw Error(后端 detail)，UI 直接展示。
 */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await apiFetch(url, init)
    if (!response.ok) {
        let detail = `请求失败（${response.status}）`
        try {
            const data = await response.json()
            if (typeof data?.detail === 'string') detail = data.detail
        } catch {
            // 响应体不是 JSON 时保留默认信息
        }
        throw new Error(detail)
    }
    return response.json() as Promise<T>
}

/** 文献列表（后端已按 importedAt 倒序） */
export const listLiterature = async (): Promise<LiteratureEntry[]> => {
    const data = await request<{ entries: LiteratureEntry[] }>(`/api/documents`)
    return data.entries
}

/**
 * 导入 PDF：multipart 上传（file + 可选 doi/arxivId，后端自动补全元数据）。
 * 注意：FormData 的 Content-Type 由浏览器自动带 boundary，不能手动设置。
 */
export const importLiterature = async (
    file: File,
    doi?: string,
    arxivId?: string
): Promise<LiteratureEntry> => {
    const form = new FormData()
    form.append('file', file)
    if (doi?.trim()) form.append('doi', doi.trim())
    if (arxivId?.trim()) form.append('arxivId', arxivId.trim())
    return request<LiteratureEntry>(`/api/documents`, {
        method: 'POST',
        body: form,
    })
}

/** 删除文献（PDF + 索引 + literature.json 三连清理，后端处理） */
export const deleteLiterature = async (id: string): Promise<void> => {
    await request<{ ok: boolean }>(`/api/documents/${id}`, {
        method: 'DELETE',
    })
}

/**
 * M2 A3：更新阅读进度（状态 / 页码，至少一项；后端幂等——未变不写盘）。
 * 返回更新后的完整条目（前端用它原地更新 entries，保持列表排序）。
 */
export const updateLiteratureProgress = async (
    id: string,
    patch: { status?: string; lastPage?: number }
): Promise<LiteratureEntry> => {
    return request<LiteratureEntry>(
        `/api/documents/${id}/progress`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        }
    )
}

/**
 * M2 P2：文献元数据编辑（通用 PUT，字段可选；后端 model_fields_set 区分
 * "未提供"与"显式 null"——year 传 null = 清空年份；幂等——未变不写盘）。
 */
export interface LiteraturePatch {
    title?: string
    authors?: { given: string; family: string }[]
    year?: number | null
    venue?: string
    volume?: string
    issue?: string
    pages?: string
    doi?: string
    arxivId?: string
    tags?: string[]
    collectionIds?: string[]
}

export const updateLiteratureMetadata = async (
    id: string,
    patch: LiteraturePatch
): Promise<LiteratureEntry> => {
    return request<LiteratureEntry>(`/api/documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    })
}

/**
 * M2 文献集合归属：更新文献 collectionIds（集合定义由前端管理，
 * 后端只持久化归属、不校验集合存在性；幂等——未变不写盘）。
 */
export const updateLiteratureCollections = async (
    id: string,
    collectionIds: string[]
): Promise<LiteratureEntry> => {
    return updateLiteratureMetadata(id, { collectionIds })
}
