import { Bot, Copy, FileText } from 'lucide-react'
import type { TextSelection } from './pdf-page'

interface SelectionToolbarProps {
    selection: TextSelection
    onCopy: () => void
    onCite: () => void
    onAskAi: () => void
}

/**
 * 划词浮层菜单（F5 核心交互）：转笔记引用 / 问 AI / 复制。
 *
 * 定位：selection.rect 是 getBoundingClientRect 的视口坐标，浮层用 fixed 直接定位，
 * 水平居中于选区、垂直在选区上方；选区贴顶时夹到视口内。
 * onMouseDown 阻止默认：避免点击按钮瞬间浏览器清空选区导致视觉闪烁。
 */
export function SelectionToolbar({ selection, onCopy, onCite, onAskAi }: SelectionToolbarProps) {
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
            <button onClick={onAskAi} className={buttonClass} title="问 AI">
                <Bot className="h-3.5 w-3.5" />
                问 AI
            </button>
            <button onClick={onCopy} className={buttonClass} title="复制选中文本">
                <Copy className="h-3.5 w-3.5" />
                复制
            </button>
        </div>
    )
}
