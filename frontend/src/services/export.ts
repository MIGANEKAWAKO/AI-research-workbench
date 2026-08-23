/**
 * 导出 API 封装（B8 后端 + M2 A4 集合过滤，见 docs/后端接口文档.md §导出）。
 * 导出内容 = 笔记引用文献聚合（去重，按文献在 literature.json 顺序）；
 * collectionIds = 笔记 frontmatter 的 collection 名称列表（后端按名称过滤）。
 * 与 literature.ts 同款错误约定：非 2xx → throw Error(后端 detail)。
 */

const BASE_URL = 'http://localhost:3001'

export type ReferenceFormat = 'gbt7714' | 'apa' | 'ieee'

interface ExportOptions {
    /** 集合名称列表（空 = 全部笔记）；语义：只导出这些集合下笔记引用的文献 */
    collectionIds: string[]
}

/** 参考文献 docx 下载（GB/T 7714 / APA / IEEE） */
export const exportReferences = async (
    format: ReferenceFormat,
    options: ExportOptions
): Promise<void> => {
    const response = await fetch(`${BASE_URL}/api/export/references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            format,
            collectionIds: options.collectionIds,
            asFile: true,
        }),
    })
    if (!response.ok) {
        throw new Error(await detailOf(response))
    }
    downloadBlob(await response.blob(), 'references.docx')
}

/** BibTeX 下载（.bib） */
export const exportBibtex = async (options: ExportOptions): Promise<void> => {
    const response = await fetch(`${BASE_URL}/api/export/bibtex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionIds: options.collectionIds, asFile: true }),
    })
    if (!response.ok) {
        throw new Error(await detailOf(response))
    }
    downloadBlob(await response.blob(), 'references.bib')
}

/** Blob → 浏览器下载（a[download] + 对象 URL） */
function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

async function detailOf(response: Response): Promise<string> {
    try {
        const data = await response.json()
        if (typeof data?.detail === 'string') return data.detail
    } catch {
        // 响应体不是 JSON 时保留默认信息
    }
    return `请求失败（${response.status}）`
}
