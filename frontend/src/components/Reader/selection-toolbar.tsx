import { useState } from 'react'
import { Bot, Copy, FileText } from 'lucide-react'
import type { AiAskType } from '@/store/useNoteStore'
import type { TextSelection } from './pdf-page'

interface SelectionToolbarProps {
    selection: TextSelection
    onCopy: () => void
    onCite: () => void
    onAskAi: (type: AiAskType) => void
}

/**
 * 划词浮层菜单（F5 核心交互，F7 升级）：
 * 转笔记引用 / 问 AI（点击展开：解释/翻译/总结）/ 复制。
 *
 * 定位：selection.rect 是 getBoundingClientRect 的视口坐标，浮层用 fixed 直接定位，
 * 水平居中于选区、垂直在选区上方；选区贴顶时夹到视口内。
 * onMouseDown 阻止默认：避免点击按钮瞬间浏览器清空选区导致视觉闪烁。
 */
export function SelectionToolbar({ selection, onCopy, onCite, onAskAi }: SelectionToolbarProps) {
    const [expanded, setExpanded] = useState(false)
    const { rect } = selection
    const left = (rect.left + rect.right) / 2
    const top = Math.max(8, rect.top - 48)

    const buttonClass =
        'flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-gray-100 transition-colors hover:bg-gray-700'

    return (
        <div
            className="fixed z-50 flex items-center gap-0.5 rounded-lg bg-gray-900 px-1 py-1 shadow-xl"
            style={{ left, top, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => e.preventDefault()}
        >
            <button onClick={onCite} className={buttonClass} title="转笔记引用（带页码与摘录）">
                <FileText className="h-3.5 w-3.5" />
                转笔记引用
            </button>

            {!expanded ? (
                <button onClick={() => setExpanded(true)} className={buttonClass} title="问 AI（解释/翻译/总结）">
                    <Bot className="h-3.5 w-3.5" />
                    问 AI
                </button>
            ) : (
                <>
                    {/* F7：三子项，点击即打开 AI 面板并自动发送（对话模式 + 单篇限定） */}
                    <button onClick={() => onAskAi('explain')} className={buttonClass} title="解释选中内容">
                        解释
                    </button>
                    <button onClick={() => onAskAi('translate')} className={buttonClass} title="翻译选中内容">
                        翻译
                    </button>
                    <button onClick={() => onAskAi('summarize')} className={buttonClass} title="总结选中内容">
                        总结
                    </button>
                    <button
                        onClick={() => setExpanded(false)}
                        className={buttonClass}
                        title="收起"
                    >
                        ✕
                    </button>
                </>
            )}

            <button onClick={onCopy} className={buttonClass} title="复制选中文本">
                <Copy className="h-3.5 w-3.5" />
                复制
            </button>
        </div>
    )
}
