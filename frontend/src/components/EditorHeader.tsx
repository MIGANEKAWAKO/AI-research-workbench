import { useMemo, useState } from 'react'
import { List, PenLine, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentEditor } from '@tiptap/react'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useNoteStore } from '@/store/useNoteStore'
import { useDataStore } from '@/store/useDataStore'
import { cn } from '@/lib/utils'

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 */
function formatRelativeTime(ts: number): string {
    if (!ts) return ''
    const diff = Date.now() - ts
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes} 分钟前`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} 小时前`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} 天前`
    return new Date(ts).toLocaleDateString('zh-CN')
}

/**
 * 编辑器页头（UI 重构 Step 4，对齐设计稿 editor-header）：
 * chip（所属集合）+ meta（更新时间/字数）+ × 关闭当前笔记 + 标题（点击重命名）
 * + toolbar 行：格式化按钮组（prop 传入，Tiptap 工具）+ 编辑/预览 view-toggle。
 * 设计稿：工具栏位于标题下方（与标题同区域），下方有 divider 与正文隔开。
 * 收藏/更多按钮暂未实现（代码注释保留，后续规划）。
 */
const EditorHeader = ({ toolbar }: { toolbar?: React.ReactNode }) => {
    const activeNoteId = useNoteStore((s) => s.activeNoteId)
    const notes = useDataStore((s) => s.notes)
    const collections = useDataStore((s) => s.collections)
    const { editor } = useCurrentEditor()

    const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
    const [renameOpen, setRenameOpen] = useState(false)
    const [renameValue, setRenameValue] = useState('')

    // T5：编辑/预览切换（设计稿 view-toggle，真实 setEditable）
    const switchView = (mode: 'edit' | 'preview') => {
        setViewMode(mode)
        if (!editor) return
        editor.setEditable(mode === 'edit')
        editor.view.dom.classList.toggle('preview', mode === 'preview')
    }

    const note = useMemo(
        () => notes.find((n) => n.id === activeNoteId) ?? null,
        [notes, activeNoteId]
    )

    if (!note) return null

    const collectionName = collections.find((c) => c.id === note.collectionId)?.name ?? '未分类'
    const wordCount = note.content?.length ?? 0

    const openRename = () => {
        setRenameValue(note.title)
        setRenameOpen(true)
    }

    const submitRename = () => {
        const value = renameValue.trim()
        if (!value) {
            toast.error('标题不能为空')
            return
        }
        useDataStore.getState().renameNote(note.id!, value)
        setRenameOpen(false)
        toast.success(`已重命名为「${value}」`)
    }

    return (
        <div className="flex shrink-0 flex-col gap-3 px-7 pt-5 pb-4">
            {/* header-top：chip + 右侧 meta/收藏/更多 */}
            <div className="flex items-center gap-3">
                <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs text-muted-foreground">
                    <List className="size-3.5" />
                    {collectionName}
                </span>

                <div className="ml-auto flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                        更新于 {formatRelativeTime(note.updatedAt)} · {wordCount.toLocaleString('zh-CN')} 字
                    </span>
                    {/* 收藏/更多暂不实现（后续规划），先注释保留；右上角改为 × 关闭当前笔记 */}
                    {/* <button
                        onClick={() => toast.info('收藏功能开发中')}
                        title="收藏"
                        className="grid size-[30px] place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    >
                        <Star className="size-4" />
                    </button>
                    <button
                        onClick={() => toast.info('更多操作开发中')}
                        title="更多"
                        className="grid size-[30px] place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    >
                        <MoreHorizontal className="size-4" />
                    </button> */}
                    <button
                        onClick={() => useNoteStore.getState().setActiveNote(undefined)}
                        title="关闭笔记"
                        className="grid size-[30px] place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </div>
            </div>

            {/* 标题：hover 显示重命名铅笔 */}
            <div className="group/title flex items-center gap-2">
                <h1 className="text-2xl leading-tight font-bold">{note.title || '无标题'}</h1>
                <button
                    onClick={openRename}
                    title="重命名"
                    className="grid size-[30px] place-items-center rounded-[7px] text-muted-foreground opacity-0 transition-all hover:bg-background hover:text-foreground group-hover/title:opacity-100"
                >
                    <PenLine className="size-3.5" />
                </button>
            </div>

            {/* toolbar 行（设计稿：格式化按钮组在标题下方，右侧编辑/预览切换） */}
            <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 overflow-x-auto">{toolbar}</div>
                <div className="shrink-0">
                    <div className="flex rounded-lg bg-background p-[3px]">
                        <button
                            onClick={() => switchView('edit')}
                            className={cn(
                                'rounded-md px-3 py-[5px] text-xs transition-colors',
                                viewMode === 'edit'
                                    ? 'bg-card font-medium text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            编辑
                        </button>
                        <button
                            onClick={() => switchView('preview')}
                            className={cn(
                                'rounded-md px-3 py-[5px] text-xs transition-colors',
                                viewMode === 'preview'
                                    ? 'bg-card font-medium text-foreground'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            预览
                        </button>
                    </div>
                </div>
            </div>

            {/* 重命名 Dialog（替换原 prompt） */}
            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent className="w-[380px] max-w-full rounded-xl">
                    <DialogHeader>
                        <DialogTitle>重命名笔记</DialogTitle>
                    </DialogHeader>
                    <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename()
                        }}
                        autoFocus
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={submitRename}>保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default EditorHeader
