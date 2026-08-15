import { useEffect, useRef } from 'react'
import { TextLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import './reader.scss'

/** 划词选中的文本 + 页码 + 选区屏幕坐标（getBoundingClientRect，供浮层 fixed 定位） */
export interface TextSelection {
    text: string
    pageNumber: number
    rect: { top: number; left: number; right: number; bottom: number }
}

interface PdfPageProps {
    pdf: PDFDocumentProxy
    pageNumber: number
    scale: number
    onTextSelect: (selection: TextSelection | null) => void
}

/**
 * 单页渲染：canvas（位图）+ textLayer（透明文字层，承载划词选中）。
 *
 * 设计取舍（面试要点）：
 * - 文字层用透明 <span> 覆盖而非 canvas 画字：canvas 位图文字无法被浏览器选中/复制；
 *   pdf.js 的 TextLayer 生成绝对定位的透明 span，文字可选可复制。
 * - 高清屏适配：canvas 物理像素 = CSS 尺寸 × devicePixelRatio，否则 Retina 下文字发虚。
 * - 竞态保护：翻页/缩放会触发 effect 重跑，用 cancelled 标记丢弃过期异步结果
 *   （快速连翻页时旧页渲染可能晚于新页返回，不丢弃会页面错乱）。
 */
export function PdfPage({ pdf, pageNumber, scale, onTextSelect }: PdfPageProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const textLayerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        const textLayerDiv = textLayerRef.current
        if (!canvas || !textLayerDiv) return

        let cancelled = false
        let renderTask: RenderTask | null = null
        let textLayer: TextLayer | null = null

        const run = async () => {
            try {
                const page = await pdf.getPage(pageNumber)
                if (cancelled) return

                const viewport = page.getViewport({ scale })
                const outputScale = window.devicePixelRatio || 1

                // 物理像素 = CSS 尺寸 × devicePixelRatio（高清屏）
                canvas.width = Math.floor(viewport.width * outputScale)
                canvas.height = Math.floor(viewport.height * outputScale)
                canvas.style.width = `${Math.floor(viewport.width)}px`
                canvas.style.height = `${Math.floor(viewport.height)}px`

                // 位图渲染：transform 把 canvas 内容放大到物理像素
                renderTask = page.render({
                    canvas,
                    viewport,
                    transform:
                        outputScale !== 1
                            ? [outputScale, 0, 0, outputScale, 0, 0]
                            : undefined,
                })
                await renderTask.promise
                if (cancelled) return

                // 文字层：透明 span 覆盖在 canvas 上，文字可选中可复制
                textLayerDiv.innerHTML = ''
                const textContent = await page.getTextContent()
                if (cancelled) return

                textLayer = new TextLayer({
                    textContentSource: textContent,
                    container: textLayerDiv,
                    viewport,
                })
                await textLayer.render()
            } catch (e) {
                if (!cancelled) console.error('页面渲染失败:', e)
            }
        }

        void run()

        return () => {
            cancelled = true
            renderTask?.cancel()
            textLayer?.cancel()
        }
    }, [pdf, pageNumber, scale])

    // 划词：mouseup 时读 getSelection()。注意必须此刻就把文本/坐标存进 state——
    // 点击浮层按钮会清空浏览器选区，按钮回调里再读实时 selection 就为空了。
    const handleMouseUp = () => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) {
            onTextSelect(null)
            return
        }
        // 折叠换行/多空格为单空格（PDF 文本行内常有多余空白）
        const text = selection.toString().replace(/\s+/g, ' ').trim()
        if (!text) {
            onTextSelect(null)
            return
        }
        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        onTextSelect({
            text,
            pageNumber,
            rect: {
                top: rect.top,
                left: rect.left,
                right: rect.right,
                bottom: rect.bottom,
            },
        })
    }

    return (
        <div className="relative shadow-md ring-1 ring-black/5">
            <canvas ref={canvasRef} className="block" />
            <div
                ref={textLayerRef}
                className="pdf-text-layer"
                onMouseUp={handleMouseUp}
            />
        </div>
    )
}
