import { useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { useSidebar } from '@/components/ui/sidebar'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { ImportSheet } from './import-sheet'
import type { LiteratureEntry } from '@/types'
import { cn } from '@/lib/utils'

/**
 * 文献侧边栏（UI 重构，对齐设计稿：搜索 + 集合树结构）。
 * 数据模型无文献集合（决策 D7），以「未分类」组承载全部文献，按导入时间倒序。
 * 新建文献双模式：列表为空 → 提示直接在上传页上传（不弹抽屉）；非空 → 打开导入抽屉。
 * 折叠时隐藏列表（设计稿 collapsed 只留 Tab 图标）。
 */
export const LiteratureList = () => {
    const entries = useLiteratureStore((s) => s.entries)
    const loading = useLiteratureStore((s) => s.loading)
    const activeId = useLiteratureStore((s) => s.activeId)
    const setActive = useLiteratureStore((s) => s.setActive)
    const remove = useLiteratureStore((s) => s.remove)
    const { state: sidebarState } = useSidebar()
    const collapsed = sidebarState === 'collapsed'

    const [keyword, setKeyword] = useState('')
    const [open, setOpen] = useState(true)
    const [importOpen, setImportOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<LiteratureEntry | null>(null)

    // 搜索：标题 / 作者
    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase()
        if (!kw) return entries
        return entries.filter((e) => {
            const authorText = e.authors.map((a) => `${a.given} ${a.family}`).join(' ')
            return (
                e.title.toLowerCase().includes(kw) ||
                authorText.toLowerCase().includes(kw)
            )
        })
    }, [entries, keyword])

    // 新建文献：空列表 → 提示直接在上传页上传；非空 → 弹导入抽屉
    const handleNewLiterature = () => {
        if (entries.length === 0) {
            toast.info('文献库为空，请直接在上传页上传')
            return
        }
        setImportOpen(true)
    }

    const submitDelete = async () => {
        if (!deleteTarget) return
        await remove(deleteTarget.id)
        setDeleteTarget(null)
        toast.success('文献已删除')
    }

    return (
        <div className={cn('flex h-full flex-col gap-3 px-3', collapsed && 'hidden')}>
            {/* 新建文献按钮（设计稿 new-btn） */}
            <button
                onClick={handleNewLiterature}
                className="flex h-[38px] items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110"
            >
                <Plus className="size-4" />
                新建文献
            </button>

            {/* 搜索（设计稿 side-search） */}
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="搜索文献…"
                    className="h-8 rounded-[7px] border-border bg-background pl-8 text-xs"
                />
            </div>

            {/* 集合树（设计稿 coll-list：未分类组承载全部文献；空列表时不显示） */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {loading && entries.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">加载中…</div>
                ) : entries.length === 0 ? (
                    /* 空态（设计稿 empty-state）：无文献时不展示空的「未分类」组 */
                    <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                        <div className="grid size-14 place-items-center rounded-2xl bg-background text-muted-foreground">
                            <Search className="size-[22px]" />
                        </div>
                        <div className="text-sm font-medium text-muted-foreground">暂无文献</div>
                        <div className="text-xs text-muted-foreground/70">点击上方「新建文献」上传 PDF</div>
                    </div>
                ) : (
                    <>
                        {/* coll-item：未分类 */}
                        <div
                            onClick={() => setOpen((o) => !o)}
                            className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        >
                            <ChevronRight
                                className={cn(
                                    'size-3.5 shrink-0 text-muted-foreground transition-transform',
                                    open && 'rotate-90'
                                )}
                            />
                            {open ? (
                                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                                <Folder className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate">未分类</span>
                            <span className="ml-auto text-[11px] text-muted-foreground/70">{filtered.length}</span>
                        </div>

                        {/* note-rows：文献列表（缩进 12px） */}
                        {open && (
                            <div className="flex flex-col gap-0.5 pl-3">
                                {filtered.map((entry) => (
                                    <div
                                        key={entry.id}
                                        onClick={() => setActive(activeId === entry.id ? null : entry.id)}
                                        className={cn(
                                            'group/lit flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                                            activeId === entry.id
                                                ? 'bg-primary/10 text-foreground'
                                                : 'text-muted-foreground hover:bg-background hover:text-foreground'
                                        )}
                                        title={entry.title}
                                    >
                                        <span
                                            className={cn(
                                                'h-4 w-[3px] shrink-0 rounded-[2px] bg-primary transition-opacity',
                                                activeId === entry.id ? 'opacity-100' : 'opacity-0'
                                            )}
                                        />
                                        <span className="min-w-0 flex-1 truncate">{entry.title || '未命名文献'}</span>
                                        {/* hover 删除（设计稿 row-actions del） */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setDeleteTarget(entry)
                                            }}
                                            title="删除"
                                            className="hidden size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-destructive group-hover/lit:grid"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 搜索空态（有文献但无匹配） */}
                        {filtered.length === 0 && (
                            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                                <div className="grid size-14 place-items-center rounded-2xl bg-background text-muted-foreground">
                                    <Search className="size-[22px]" />
                                </div>
                                <div className="text-sm font-medium text-muted-foreground">未找到匹配的文献</div>
                                <div className="text-xs text-muted-foreground/70">换个关键词试试</div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* 导入抽屉（非空列表时使用） */}
            <ImportSheet open={importOpen} onOpenChange={setImportOpen} />

            {/* 删除确认（AlertDialog） */}
            <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent className="w-[380px] max-w-full rounded-xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除文献</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除文献「{deleteTarget?.title}」吗？
                            <br />
                            将同时删除 PDF 文件与向量索引，此操作不可撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submitDelete}
                            className="bg-destructive text-white hover:bg-destructive/90"
                        >
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
