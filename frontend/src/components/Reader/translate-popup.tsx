import { useEffect, useRef, useState } from 'react'
import { Copy, Loader2, RefreshCw } from 'lucide-react'
import { fetchAiResponse } from '@/services/ai'
import { ASK_INSTRUCTIONS } from '@/lib/ai-instructions'

/** 划词选区的视口坐标（getBoundingClientRect，浮层 fixed 定位依据） */
export interface PopupRect {
    top: number
    left: number
    right: number
    bottom: number
}

interface TranslatePopupProps {
    text: string
    rect: PopupRect
    /** 单篇限定：当前阅读的文献 id（与 F7 划词提问同约定） */
    docId?: string
    onClose: () => void
}

/** 浮层估算高度：标题 + 原文 + 译文区（定位夹取用，略大无妨） */
const POPUP_ESTIMATED_HEIGHT = 320

/**
 * 划词翻译浮层（M2 A2）：点击划词浮层「翻译」后内联展示译文，不跳 AI 面板。
 *
 * 复用 F7 指令模板（ASK_INSTRUCTIONS.translate）+ /api/chat 对话模式（B7 RAG，
 * docId 单篇限定），SSE 流式输出。挂载即请求；失败可重试（retryKey 重触发 effect）。
 *
 * 设计取舍（面试要点）：
 * - 为什么前端拼指令走对话模式，而不是加后端 translate 任务模板：F7 已确立该链路
 *   且行为稳定（RAG 注入对翻译影响极小、失败静默降级），0.5d 任务不重复造轮子。
 * - 为什么不做请求中止：fetchAiResponse 无 abort 支持，关闭浮层后靠 mounted ref
 *   丢弃后续 chunk（请求本身会跑完，个人规模可接受）。
 */
export function TranslatePopup({ text, rect, docId, onClose }: TranslatePopupProps) {
    const [translation, setTranslation] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retryKey, setRetryKey] = useState(0)
    const mountedRef = useRef(true)

    useEffect(() => {
        mountedRef.current = true
        setTranslation('')
        setLoading(true)
        setError(null)

        const messages = [
            {
                role: 'user' as const,
                content: `${ASK_INSTRUCTIONS.translate}：\n\n${text}`,
            },
        ]
        void fetchAiResponse(messages, '', undefined, '', (chunk) => {
            if (mountedRef.current) setTranslation((prev) => prev + chunk)
        }, docId)
            .catch((e) => {
                if (mountedRef.current) {
                    setError(e instanceof Error ? e.message : '翻译失败，请稍后重试')
                }
            })
            .finally(() => {
                if (mountedRef.current) setLoading(false)
            })

        return () => {
            mountedRef.current = false
        }
    }, [text, docId, retryKey])

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(translation)
        } catch (e) {
            console.error('复制译文失败:', e)
        }
    }

    // 定位：水平居中于选区；优先在选区下方，贴底翻到上方（同批注浮层思路）
    const prefersBelow = rect.bottom + 8 + POPUP_ESTIMATED_HEIGHT <= window.innerHeight
    const left = Math.min(Math.max((rect.left + rect.right) / 2, 200), window.innerWidth - 200)
    const top = prefersBelow ? rect.bottom + 8 : Math.max(8, rect.top - 8)
    const transform = prefersBelow ? 'translateX(-50%)' : 'translateX(-50%) translateY(-100%)'

    return (
        <>
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <div
                className="fixed z-50 w-96 rounded-lg border border-border bg-card shadow-xl"
                style={{ left, top, transform }}
            >
                {/* 标题行 */}
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-xs font-medium text-foreground">划词翻译</span>
                    <button
                        onClick={onClose}
                        className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                        title="关闭（Esc）"
                    >
                        ✕
                    </button>
                </div>

                <div className="px-3 py-2.5">
                    {/* 原文 */}
                    <p className="max-h-16 overflow-y-auto whitespace-pre-wrap border-l-2 border-border pl-2 text-xs leading-relaxed text-muted-foreground">
                        {text}
                    </p>

                    {/* 译文区 */}
                    <div className="mt-2 min-h-16 rounded-md bg-background p-2 text-sm leading-relaxed text-foreground">
                        {loading && translation.length === 0 && (
                            <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="size-3.5 animate-spin" />
                                翻译中…
                            </span>
                        )}
                        {error && (
                            <div className="text-xs text-destructive">
                                <p>{error}</p>
                                <button
                                    onClick={() => setRetryKey((k) => k + 1)}
                                    className="mt-1.5 flex items-center gap-1 rounded-md bg-background px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted"
                                >
                                    <RefreshCw className="size-3" />
                                    重试
                                </button>
                            </div>
                        )}
                        {!error && translation}
                        {!error && !loading && translation.length === 0 && (
                            <span className="text-xs text-muted-foreground">（无返回内容）</span>
                        )}
                    </div>

                    {/* 操作行 */}
                    {!error && translation.length > 0 && (
                        <div className="mt-2 flex justify-end">
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background"
                                title="复制译文"
                            >
                                <Copy className="size-3" />
                                复制
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}
