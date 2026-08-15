import { useState } from 'react'
import { useDataStore } from '@/store/useDataStore'

interface CitePickerProps {
    open: boolean
    literature: { id: string; title: string }
    pageNumber: number
    text: string
    onClose: () => void
}

/**
 * 转笔记引用的目标选择器（F5）：
 * 「追加到现有笔记」（下拉列出全部笔记）或「新建笔记」（输入标题）。
 *
 * 引用内容写入 Markdown 纯文本（blockquote 摘录 + 页码 + [[cite:id]] 标记），
 * F6 引用系统再把 [[cite:id]] 渲染成「作者+年份」徽章——F5 先落纯文本、保持源文件可读。
 */
export function CitePicker({ open, literature, pageNumber, text, onClose }: CitePickerProps) {
    const notes = useDataStore((s) => s.notes)
    const saveNote = useDataStore((s) => s.saveNote)

    const [mode, setMode] = useState<'existing' | 'new'>('existing')
    const [noteId, setNoteId] = useState<number | ''>('')
    const [newTitle, setNewTitle] = useState('')

    if (!open) return null

    // 引用块格式：摘录 + 出处（《标题》第 N 页）+ 引用标记
    const markdown = `> ${text}\n\n（《${literature.title}》，第 ${pageNumber} 页）[[cite:${literature.id}]]`

    const handleConfirm = () => {
        if (mode === 'new') {
            const title = newTitle.trim() || '文献笔记'
            saveNote({ title, content: markdown })
        } else if (noteId !== '') {
            const note = notes.find((n) => n.id === noteId)
            if (note) {
                // 追加到末尾（空正文不加前置空行）
                const content = note.content
                    ? `${note.content}\n\n${markdown}`
                    : markdown
                saveNote({ ...note, content })
            }
        }
        // 重置下次打开的状态
        setNoteId('')
        setNewTitle('')
        setMode('existing')
        onClose()
    }

    const canConfirm = mode === 'new' || noteId !== ''

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={onClose}
        >
            <div
                className="w-96 rounded-xl bg-white p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="mb-2 text-sm font-semibold">转笔记引用</h3>
                <p className="mb-3 max-h-24 overflow-y-auto rounded-md bg-gray-50 p-2 text-xs leading-relaxed text-muted-foreground">
                    {text}
                </p>

                {/* 模式切换 */}
                <div className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-gray-100 p-1 text-xs">
                    <button
                        onClick={() => setMode('existing')}
                        className={`rounded px-2 py-1 transition-colors ${
                            mode === 'existing'
                                ? 'bg-white font-medium shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        追加到笔记
                    </button>
                    <button
                        onClick={() => setMode('new')}
                        className={`rounded px-2 py-1 transition-colors ${
                            mode === 'new'
                                ? 'bg-white font-medium shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        新建笔记
                    </button>
                </div>

                {mode === 'existing' ? (
                    <select
                        value={noteId}
                        onChange={(e) => setNoteId(e.target.value === '' ? '' : Number(e.target.value))}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        <option value="">选择笔记…</option>
                        {notes.map((n) => (
                            <option key={n.id} value={n.id}>
                                {n.title}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="新笔记标题"
                        autoFocus
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                )}

                <div className="mt-4 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-gray-100"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className="rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        确认
                    </button>
                </div>
            </div>
        </div>
    )
}
