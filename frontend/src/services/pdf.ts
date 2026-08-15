import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

/**
 * F5 PDF 加载服务（pdfjs-dist 6.x）。
 *
 * 职责边界：只负责「worker 配置 + 拉取二进制 + 交给 pdf.js 解析」，不含渲染逻辑
 * （渲染在 components/Reader/pdf-page.tsx）。与 HttpFsAdapter 不同，PDF 是二进制，
 * 直接 fetch /api/fs/file 拿 ArrayBuffer，不经过 StorageAdapter 的文本 read()。
 *
 * 关键点：pdf.js 的解析/渲染跑在 Web Worker 独立线程，主线程只拿结果。
 * Vite 下 worker 路径必须用 new URL(..., import.meta.url)，让打包器把
 * pdf.worker.mjs 输出为独立 asset；写死字符串路径在 build 时会报错（PRD 9.4 点名的坑）。
 */
GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
).toString()

const BASE_URL = 'http://localhost:3001'

/**
 * 拉取 PDF 二进制并交给 pdf.js 解析。
 * @param pdfPath vault 内相对路径（LiteratureEntry.pdfPath）
 * @returns 已解析的 PDF 文档代理（含 numPages / getPage）
 */
export async function loadPdfDocument(pdfPath: string): Promise<PDFDocumentProxy> {
    const response = await fetch(
        `${BASE_URL}/api/fs/file?path=${encodeURIComponent(pdfPath)}`
    )
    if (!response.ok) {
        // 后端错误约定：HTTP 状态码 + {"detail": "原因"}（与 literature.ts 同款）
        let detail = `PDF 加载失败（${response.status}）`
        try {
            const data = await response.json()
            if (typeof data?.detail === 'string') detail = data.detail
        } catch {
            // 响应体不是 JSON（如网关错误页）时保留默认信息
        }
        throw new Error(detail)
    }

    // ArrayBuffer 直接交给 getDocument({ data })，比 blob 少一次转换
    const data = await response.arrayBuffer()
    return getDocument({ data }).promise
}
