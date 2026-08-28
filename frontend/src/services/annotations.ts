import type { PdfAnnotation } from '@/types'
import { apiFetch } from './api'

/**
 * 高亮批注持久化（M2 A1）。
 * 单文件全量读写 .kb/annotations.json，走 /api/fs —— 后端 write 已是原子写
 * （tmp + os.replace），前端无需再做任何一致性问题处理。
 * 与 literature.ts 同款错误约定：非 2xx → throw Error(后端 detail)，UI 直接展示。
 */

const ANNOTATIONS_PATH = '.kb/annotations.json'

/** 文件结构带版本号：未来结构变更可在此迁移，不破坏旧文件 */
interface AnnotationsFile {
    version: 1
    annotations: PdfAnnotation[]
}

export async function loadAnnotations(): Promise<PdfAnnotation[]> {
    const response = await apiFetch(
        `/api/fs/read?path=${encodeURIComponent(ANNOTATIONS_PATH)}`
    )
    if (response.status === 404) return [] // 首次使用：文件不存在 = 无批注
    if (!response.ok) {
        throw new Error(await detailOf(response))
    }
    const data = await response.json()
    if (typeof data?.content !== 'string') return []

    // 容错取舍：个人工具，文件损坏/版本不识别时降级为空并告警，不阻塞阅读。
    // 丢数据的风险极低（写路径是原子写），且下次写入会重建文件。
    try {
        const file = JSON.parse(data.content) as AnnotationsFile
        if (file.version !== 1 || !Array.isArray(file.annotations)) return []
        return file.annotations
    } catch {
        console.warn('annotations.json 解析失败，已按空批注处理')
        return []
    }
}

export async function saveAnnotations(annotations: PdfAnnotation[]): Promise<void> {
    const file: AnnotationsFile = { version: 1, annotations }
    const response = await apiFetch(
        `/api/fs/write?path=${encodeURIComponent(ANNOTATIONS_PATH)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: JSON.stringify(file, null, 2) }),
        }
    )
    if (!response.ok) {
        throw new Error(await detailOf(response))
    }
}

/** 提取后端错误 detail（FastAPI 约定：HTTPException → {"detail": "..."}） */
async function detailOf(response: Response): Promise<string> {
    try {
        const data = await response.json()
        if (typeof data?.detail === 'string') return data.detail
    } catch {
        // 响应体不是 JSON 时保留默认信息
    }
    return `请求失败（${response.status}）`
}
