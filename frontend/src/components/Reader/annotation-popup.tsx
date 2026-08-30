import { useEffect, useState } from 'react'
import type { PdfAnnotation } from '@/types'

interface AnnotationPopupProps {
    annotation: PdfAnnotation
    /** mark 的视口坐标（getBoundingClientRect），浮层 fixed 定位依据 */
    rect: DOMRect
    onSave: (note: string) => void
    onDelete: () => void
    onClose: () => void
}

/** 浮层估算高度：标题 + 原文 + textarea + 按钮（定位夹取用，略大无妨） */
const POPUP_ESTIMATED_HEIGHT = 230

/**
 * 批注编辑浮层（M2 A1）：点击高亮 mark 弹出。
 * - 展示高亮原文（segments 拼接）+ 批注编辑框（保存按钮式，明确提交）
 * - 删除 = 移除该高亮（store 自动持久化）
 * - 定位：水平居中于 mark，优先在 mark 下方；底部超视口则翻到上方；
 *   与 SelectionToolbar 同款 fixed 定位思路（rect 是视口坐标）。
 * - Esc 关闭；外部 backdrop 点击关闭（backdrop 在浮层之下 z-40）。
 */
export function AnnotationPopup({ annotation, rect, onSave, onDelete, onClose }: AnnotationPopupProps) {
    const [note, setNote] = useState(annotation.note)
    const excerpt = annotation.segments.map((s) => s.text).join('')

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [onClose])

    const prefersBelow = rect.bottom + 8 + POPUP_ESTIMATED_HEIGHT <= window.innerHeight
    const left = Math.min(
        Math.max((rect.left + rect.right) / 2, 160),
        window.innerWidth - 160
    )
    const top = prefersBelow ? rect.bottom + 8 : Math.max(8, rect.top - 8)
    const transform = prefersBelow ? 'translateX(-50%)' : 'translateX(-50%) translateY(-100%)'

    return (
        <>
            {/* 点击外部关闭（放在浮层下方） */}
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <div
                className="fixed z-50 w-80 rounded-lg border border-border bg-card shadow-xl"
                style={{ left, top, transform }}
            >
                {/* 标题行 */}
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-xs font-medium text-foreground">
                        批注 · 第 {annotation.pageNumber} 页
                    </span>
                    <button
                        onClick={onClose}
                        className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                        title="关闭（Esc）"
                    >
                        ✕
                    </button>
                </div>

                <div className="px-3 py-2.5">
                    {/* 高亮原文（黄色引用条标识） */}
                    <p className="max-h-20 overflow-y-auto whitespace-pre-wrap border-l-2 border-yellow-400 pl-2 text-xs leading-relaxed text-muted-foreground">
                        {excerpt || '（无原文）'}
                    </p>

                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        placeholder="写点批注…（可为空，仅保留高亮）"
                        className="mt-2 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        autoFocus
                    />

                    <div className="mt-2 flex items-center justify-between">
                        <button
                            onClick={onDelete}
                            className="rounded-md px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
                            title="删除该高亮与批注"
                        >
                            删除
                        </button>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={onClose}
                                className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-background"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => onSave(note)}
                                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
