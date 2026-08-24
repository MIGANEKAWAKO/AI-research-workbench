import { useMemo, useState } from 'react'
import {
    ChevronRight,
    Folder,
    FolderInput,
    FolderOpen,
    FolderPlus,
    Plus,
    Search,
    Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { useSidebar } from '@/components/ui/sidebar'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { ImportSheet } from './import-sheet'
import type { LiteratureEntry } from '@/types'
import { cn } from '@/lib/utils'

/**
 * 文献侧边栏（M2 文献集合改造，对齐笔记 tab）：
 * 未分类组（全部未归属文献，置底）→ 集合树（新建的在前）+ 新建集合；
 * 文献行 hover：移动到集合（DropdownMenu）/ 删除；集合行 hover：删除集合
 * （删除集合会把归属文献移回未分类，不删文献）。
 */

/** 单行文献：状态点 + 标题 + hover 移动/删除 */
const LitRow = ({
    entry,
    active,
    onSelect,
    onDelete,
}: {
    entry: LiteratureEntry
    active: boolean
    onSelect: () => void
    onDelete: () => void
}) => {
    const collections = useLiteratureStore((s) => s.collections)
    const moveToCollection = useLiteratureStore((s) => s.moveToCollection)
    const current = entry.collectionIds ?? []

    return (
        <div
            onClick={onSelect}
            className={cn(
                'group/lit flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                active
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground'
            )}
            title={entry.title}
        >
            <span
                className={cn(
                    'h-4 w-[3px] shrink-0 rounded-[2px] bg-primary transition-opacity',
                    active ? 'opacity-100' : 'opacity-0'
                )}
            />
            {/* M2 A3：阅读状态点（灰=未读 蓝=在读 绿=已读），title 带进度 */}
            <span
                className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    entry.status === '已读'
                        ? 'bg-success'
                        : entry.status === '在读'
                          ? 'bg-primary'
                          : 'bg-muted-foreground/40'
                )}
                title={
                    entry.status +
                    (entry.lastPage && entry.lastPage > 0
                        ? ` · 已读至第 ${entry.lastPage} 页`
                        : '')
                }
            />
            <span className="min-w-0 flex-1 truncate">{entry.title || '未命名文献'}</span>

            {/* hover 操作：移动到集合 */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        onClick={(e) => e.stopPropagation()}
                        title="移动到集合"
                        className="hidden size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground group-hover/lit:grid"
                    >
                        <FolderInput className="size-3.5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 p-1">
                    <DropdownMenuItem
                        onClick={() => void moveToCollection(entry.id, null)}
                        className={cn('cursor-pointer', current.length === 0 && 'bg-primary/10 text-primary')}
                    >
                        未分类
                    </DropdownMenuItem>
                    {collections.map((c) => (
                        <DropdownMenuItem
                            key={c.id}
                            onClick={() => void moveToCollection(entry.id, c.id)}
                            className={cn(
                                'cursor-pointer',
                                current.includes(c.id) && 'bg-primary/10 text-primary'
                            )}
                        >
                            {c.name}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* hover 删除 */}
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                }}
                title="删除"
                className="hidden size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-destructive group-hover/lit:grid"
            >
                <Trash2 className="size-3.5" />
            </button>
        </div>
    )
}

export const LiteratureList = () => {
    const entries = useLiteratureStore((s) => s.entries)
    const loading = useLiteratureStore((s) => s.loading)
    const activeId = useLiteratureStore((s) => s.activeId)
    const setActive = useLiteratureStore((s) => s.setActive)
    const remove = useLiteratureStore((s) => s.remove)
    const collections = useLiteratureStore((s) => s.collections)
    const addCollection = useLiteratureStore((s) => s.addCollection)
    const deleteCollection = useLiteratureStore((s) => s.deleteCollection)
    const { state: sidebarState } = useSidebar()
    const collapsed = sidebarState === 'collapsed'

    const [keyword, setKeyword] = useState('')
    const [open, setOpen] = useState(true) // 未分类组折叠
    const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set())
    const [importOpen, setImportOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<
        { type: 'literature' | 'collection'; id: string; label: string } | null
    >(null)

    // 新建集合 Dialog
    const [createOpen, setCreateOpen] = useState(false)
    const [createValue, setCreateValue] = useState('')

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

    // 分组：未分类（无归属）与各集合
    const uncategorized = useMemo(
        () => filtered.filter((e) => !(e.collectionIds ?? []).length),
        [filtered]
    )
    const byCollection = useMemo(
        () =>
            collections.map((col) => ({
                col,
                items: filtered.filter((e) => e.collectionIds?.includes(col.id)),
            })),
        [collections, filtered]
    )

    const toggleCol = (id: string) => {
        setCollapsedCols((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // 新建文献：空列表 → 提示直接在上传页上传；非空 → 弹导入抽屉
    const handleNewLiterature = () => {
        if (entries.length === 0) {
            toast.info('文献库为空，请直接在上传页上传')
            return
        }
        setImportOpen(true)
    }

    const submitCreateCollection = () => {
        const name = createValue.trim()
        if (!name) {
            toast.error('名称不能为空')
            return
        }
        addCollection(name)
        setCreateOpen(false)
        toast.success(`集合「${name}」已创建`)
    }

    const submitDelete = async () => {
        if (!deleteTarget) return
        if (deleteTarget.type === 'literature') {
            await remove(deleteTarget.id)
            toast.success('文献已删除')
        } else {
            await deleteCollection(deleteTarget.id)
            toast.success(`集合「${deleteTarget.label}」已删除，文献已移回未分类`)
        }
        setDeleteTarget(null)
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

            {/* 集合树（未分类置底 + 集合组） */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {loading && entries.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">加载中…</div>
                ) : entries.length === 0 ? (
                    /* 空态（设计稿 empty-state）：无文献时不展示集合树 */
                    <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                        <div className="grid size-14 place-items-center rounded-2xl bg-background text-muted-foreground">
                            <Search className="size-[22px]" />
                        </div>
                        <div className="text-sm font-medium text-muted-foreground">暂无文献</div>
                        <div className="text-xs text-muted-foreground/70">点击上方「新建文献」上传 PDF</div>
                    </div>
                ) : (
                    <>
                        {/* 集合组标题 + 新建集合 */}
                        <div className="flex h-8 items-center justify-between px-2">
                            <span className="text-[11px] font-medium text-muted-foreground/70">集合</span>
                            <button
                                onClick={() => setCreateOpen(true)}
                                title="新建集合"
                                className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                            >
                                <FolderPlus className="size-3.5" />
                            </button>
                        </div>

                        {/* 集合列表（创建时间倒序，新集合在前） */}
                        <div className="flex flex-col gap-0.5">
                            {byCollection.map(({ col, items }) => (
                                <div key={col.id} className="flex flex-col gap-0.5">
                                    {/* 集合行：点击折叠/展开 */}
                                    <div
                                        onClick={() => toggleCol(col.id)}
                                        className="group/col flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                    >
                                        <ChevronRight
                                            className={cn(
                                                'size-3.5 shrink-0 text-muted-foreground transition-transform',
                                                !collapsedCols.has(col.id) && 'rotate-90'
                                            )}
                                        />
                                        {collapsedCols.has(col.id) ? (
                                            <Folder className="size-4 shrink-0 text-muted-foreground" />
                                        ) : (
                                            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                                        )}
                                        <span className="truncate">{col.name}</span>
                                        <span className="ml-auto text-[11px] text-muted-foreground/70">
                                            {items.length}
                                        </span>
                                        {/* hover 删除集合 */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setDeleteTarget({ type: 'collection', id: col.id, label: col.name })
                                            }}
                                            title="删除集合（文献移回未分类）"
                                            className="hidden size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-destructive group-hover/col:grid"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>

                                    {/* 集合下文献（未折叠时） */}
                                    {!collapsedCols.has(col.id) && (
                                        <div className="flex flex-col gap-0.5 pl-3">
                                            {items.map((entry) => (
                                                <LitRow
                                                    key={entry.id}
                                                    entry={entry}
                                                    active={activeId === entry.id}
                                                    onSelect={() =>
                                                        setActive(activeId === entry.id ? null : entry.id)
                                                    }
                                                    onDelete={() =>
                                                        setDeleteTarget({
                                                            type: 'literature',
                                                            id: entry.id,
                                                            label: entry.title || '未命名文献',
                                                        })
                                                    }
                                                />
                                            ))}
                                            {items.length === 0 && (
                                                <div className="px-2 py-1.5 text-[11px] text-muted-foreground/60">
                                                    暂无文献（可在文献行「移动」归入）
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* 未分类组（置底） */}
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
                            <span className="ml-auto text-[11px] text-muted-foreground/70">{uncategorized.length}</span>
                        </div>

                        {/* 未分类文献列表 */}
                        {open && (
                            <div className="flex flex-col gap-0.5 pl-3">
                                {uncategorized.map((entry) => (
                                    <LitRow
                                        key={entry.id}
                                        entry={entry}
                                        active={activeId === entry.id}
                                        onSelect={() => setActive(activeId === entry.id ? null : entry.id)}
                                        onDelete={() =>
                                            setDeleteTarget({
                                                type: 'literature',
                                                id: entry.id,
                                                label: entry.title || '未命名文献',
                                            })
                                        }
                                    />
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

            {/* 新建集合 Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="w-[320px] max-w-full rounded-xl">
                    <DialogHeader>
                        <DialogTitle>新建集合</DialogTitle>
                        <DialogDescription>为文献创建分组，如「RAG 调研」「秋招复习」</DialogDescription>
                    </DialogHeader>
                    <Input
                        value={createValue}
                        onChange={(e) => setCreateValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submitCreateCollection()
                        }}
                        placeholder="集合名称"
                        autoFocus
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={submitCreateCollection}>创建</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 删除确认（文献 / 集合共用） */}
            <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent className="w-[380px] max-w-full rounded-xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {deleteTarget?.type === 'collection' ? '删除集合' : '删除文献'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget?.type === 'collection' ? (
                                <>
                                    确定要删除集合「{deleteTarget.label}」吗？
                                    <br />
                                    集合内的文献将移回未分类（文献本身不删除）。
                                </>
                            ) : (
                                <>
                                    确定要删除文献「{deleteTarget?.label}」吗？
                                    <br />
                                    将同时删除 PDF 文件与向量索引，此操作不可撤销。
                                </>
                            )}
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
