import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMemo, useState } from 'react';
import { FileText, Plus, Trash2, Folder, ChevronRight, Search, X, Pencil, ChevronsLeft, ChevronsRight, BookOpen } from "lucide-react"
import { toast } from 'sonner'
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { DraggableNote } from '@/components/SiderBar/draggable-note'
import { DroppableCollection } from '@/components/SiderBar/droppable-collection'
import { useNoteStore } from '@/store/useNoteStore';
import { useDataStore } from '@/store/useDataStore';
import { LiteratureList } from '@/components/Literature/literature-list';
import { cn } from '@/lib/utils';

/**
 * 侧边栏（UI 重构 Step 3 + 修复）：
 * tabs（笔记/文献，激活蓝底白字）→ 新建按钮 → 搜索 → 集合树（新建的置顶、未分类置底）
 * → note-row 激活左侧蓝色 accent 竖条；底部折叠按钮。
 * 集合间距对齐设计稿（coll-list gap 2px / note-rows gap 2px + 12px 缩进）。
 * 新建/重命名/删除均使用 shadcn Dialog / AlertDialog（替换浏览器 prompt/confirm）。
 * 逻辑与拖拽（dnd-kit）保持不变。
 */
const SideBar = () => {
    // 订阅内存数据源（Zustand 响应式，行为与原 useLiveQuery 等价）
    const notes = useDataStore((state) => state.notes);
    const collections = useDataStore((state) => state.collections);
    const backendOnline = useDataStore((state) => state.backendOnline);
    const [searchKeyword, setSearchKeyword] = useState('');

    const activeNoteId = useNoteStore((state) => state.activeNoteId);
    const setActiveNote = useNoteStore((state) => state.setActiveNote);
    const view = useNoteStore((state) => state.view);
    const setView = useNoteStore((state) => state.setView);
    const { toggleSidebar, state: sidebarState } = useSidebar();
    const collapsed = sidebarState === 'collapsed';

    // 新建集合置顶：按 id 倒序渲染（id 单调递增）
    const sortedCollections = useMemo(
        () => [...collections].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)),
        [collections]
    );

    const normalizedSearchKeyword = searchKeyword.trim().toLowerCase();
    const filteredNotes = useMemo(() => {
        if (!normalizedSearchKeyword) return notes;

        return notes.filter((note) => {
            const title = note.title?.toLowerCase() || '';
            const content = note.content?.toLowerCase() || '';

            return title.includes(normalizedSearchKeyword) || content.includes(normalizedSearchKeyword);
        });
    }, [notes, normalizedSearchKeyword]);

    // ---------- 新建集合（Dialog） ----------
    const [createOpen, setCreateOpen] = useState(false)
    const [createValue, setCreateValue] = useState('')

    const handleCreateCollection = () => {
        setCreateValue('')
        setCreateOpen(true)
    }

    const submitCreateCollection = () => {
        const name = createValue.trim()
        if (!name) {
            toast.error('名称不能为空')
            return
        }
        useDataStore.getState().addCollection(name)
        setCreateOpen(false)
        toast.success(`集合「${name}」已创建`)
    }

    // ---------- 重命名笔记（Dialog） ----------
    const [renameTarget, setRenameTarget] = useState<{ id: number; title: string } | null>(null)
    const [renameValue, setRenameValue] = useState('')

    // F3：重命名笔记（只改 frontmatter title，文件名不动）
    const handleRename = (e: React.MouseEvent, id: number, oldTitle: string) => {
        e.preventDefault()
        e.stopPropagation()
        setRenameValue(oldTitle)
        setRenameTarget({ id, title: oldTitle })
    }

    const submitRename = () => {
        if (!renameTarget) return
        const newTitle = renameValue.trim()
        if (!newTitle) {
            toast.error('名称不能为空')
            return
        }
        useDataStore.getState().renameNote(renameTarget.id, newTitle)
        setRenameTarget(null)
        toast.success('已重命名')
    }

    // ---------- 删除（AlertDialog，笔记 / 集合共用） ----------
    const [deleteTarget, setDeleteTarget] = useState<{ type: 'note' | 'collection'; id: number; label: string } | null>(null)

    const handleDelete = (e: React.MouseEvent, id: number, title: string) => {
        e.preventDefault()
        e.stopPropagation()
        setDeleteTarget({ type: 'note', id, label: title })
    }

    const handleDeleteCollection = (e: React.MouseEvent, colId: number, colName: string) => {
        e.preventDefault()
        e.stopPropagation()
        setDeleteTarget({ type: 'collection', id: colId, label: colName })
    }

    const submitDelete = () => {
        if (!deleteTarget) return
        if (deleteTarget.type === 'note') {
            useDataStore.getState().deleteNote(deleteTarget.id)
            // 如果删除的是当前选中的笔记，重置为 undefined
            if (activeNoteId === deleteTarget.id) {
                setActiveNote(undefined)
            }
            toast.success('笔记已删除')
        } else {
            // 删除集合：集合下笔记自动变为"未分类"
            useDataStore.getState().deleteCollection(deleteTarget.id)
            toast.success(`集合「${deleteTarget.label}」已删除`)
        }
        setDeleteTarget(null)
    }

    // ---------- 新建笔记 ----------
    const handleCreate = async (e: React.MouseEvent, collectionId?: number) => {
        e.preventDefault()
        e.stopPropagation()

        const id = useDataStore.getState().saveNote({
            title: "新笔记",
            content: "",
            collectionId, // 绑定到当前文件夹
        })
        setActiveNote(id)
    }

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8 // 关键：只有移动超过 8px 才会开启拖拽，小于这个距离会被识别为 Click
            }
        })
    )

    // 处理拖拽结束
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        
        if (over && active.data.current && over.data.current) {
            const noteId = active.data.current.noteId;
            const targetColId = over.data.current.collectionId === 'inbox' 
                                ? undefined 
                                : over.data.current.collectionId

            // 更新笔记所属集合
            useDataStore.getState().moveNoteToCollection(noteId, targetColId)
            console.log(`🚚 笔记 ${noteId} 已移动到集合 ${targetColId}`)
        }
    }

    // 集合行头部（设计稿 coll-item：高 32px、gap 2px、hover 时 count 换成操作按钮）
    const collTriggerClass =
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium ' +
        'text-muted-foreground transition-colors hover:bg-background hover:text-foreground group/label'

    // 笔记行（设计稿 note-row：激活 = 蓝底浅色 + 左侧 accent 竖条；覆盖 shadcn 默认 data-active 灰底）
    const noteButtonClass = (isActive: boolean) =>
        cn(
            'h-8 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors',
            'hover:bg-background hover:text-foreground',
            isActive &&
                'bg-primary/10 text-foreground hover:bg-primary/10 data-active:bg-primary/10 data-active:text-foreground',
        )

    return (
        <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
            {/* 覆盖 shadcn 默认 fixed inset-y-0：顶栏 52px 下方开始（否则遮住顶栏 logo）；
                宽度变量已在 SidebarProvider 定义（展开 264px / 折叠 60px） */}
            <Sidebar collapsible="icon" className="top-[52px] h-auto">
                {/* 设计稿 .sidebar padding: 16px 12px */}
                <SidebarHeader className="gap-3 px-3 pt-4 pb-2">
                    {backendOnline === false && (
                        <div className="mb-1 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            ⚠ 无法连接存储服务（localhost:3001）<br />
                            笔记不会被保存，请先启动后端
                        </div>
                    )}

                    {/* F4：视图模式切换 Tab（笔记 / 文献库），设计稿 tabs 样式；折叠时垂直放大 */}
                    <div className={cn('flex gap-[3px] rounded-[9px] bg-background p-[3px]', collapsed && 'flex-col gap-1')}>
                        <button
                            onClick={() => setView('notes')}
                            className={cn(
                                'flex h-[30px] flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[13px] font-medium text-muted-foreground transition-colors',
                                view === 'notes' && 'bg-primary font-semibold text-primary-foreground',
                                collapsed && 'h-[42px] flex-col justify-center gap-1',
                            )}
                        >
                            <FileText className={cn('size-4 shrink-0', collapsed && 'size-[24px]')} />
                            <span>笔记</span>
                        </button>
                        <button
                            onClick={() => setView('library')}
                            className={cn(
                                'flex h-[30px] flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[13px] font-medium text-muted-foreground transition-colors',
                                view === 'library' && 'bg-primary font-semibold text-primary-foreground',
                                collapsed && 'h-[42px] flex-col justify-center gap-1',
                            )}
                        >
                            <BookOpen className={cn('size-4 shrink-0', collapsed && 'size-[24px]')} />
                            <span>文献</span>
                        </button>
                    </div>

                    {/* 笔记模式：新建按钮 + 搜索 + 集合头（设计稿 side-top，折叠时隐藏） */}
                    {!collapsed && view === 'notes' ? (
                        <>
                            <button
                                onClick={(e) => handleCreate(e)}
                                className="flex h-[38px] items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110"
                            >
                                <Plus className="size-4" />
                                新建笔记
                            </button>

                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={searchKeyword}
                                    onChange={(e) => setSearchKeyword(e.target.value)}
                                    placeholder="搜索笔记…"
                                    className="h-8 rounded-[7px] border-border bg-background pl-8 pr-8 text-xs"
                                />
                                {searchKeyword && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchKeyword('')}
                                        className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                                        title="清空查找"
                                    >
                                        <X className="size-3.5" />
                                        <span className="sr-only">清空查找</span>
                                    </button>
                                )}
                            </div>

                            {/* 集合头：标题 + 新建集合 */}
                            <div className="flex items-center justify-between px-1 py-0.5">
                                <span className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground/70 uppercase">
                                    集合
                                </span>
                                <button
                                    onClick={handleCreateCollection}
                                    title="新建集合"
                                    className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:text-primary"
                                >
                                    <Plus className="size-3.5" />
                                </button>
                            </div>
                        </>
                    ) : null}
                </SidebarHeader>

                {/* 折叠时列表内容不可见但保留布局占位（invisible 而非 hidden）：
                    SidebarContent 的 flex-1 仍生效，底部折叠按钮始终贴在侧边栏最下侧。
                    笔记模式加 px-3：列表项与侧边栏间距对齐文献列表（LiteratureList 根 px-3） */}
                <SidebarContent className={cn('gap-0.5', collapsed && 'invisible', view === 'notes' && 'px-3')}>
                    {view === 'library' ? (
                        <LiteratureList />
                    ) : (
                        <>
                            {/* 集合列表（新建的置顶） */}
                            {sortedCollections?.filter((col) =>
                                !normalizedSearchKeyword || filteredNotes.some((note) => note.collectionId === col.id)
                            ).map(col => (
                                <Collapsible
                                    key={col.id}
                                    asChild
                                    defaultOpen={true}
                                    className="group/collapsible"
                                >
                                    <DroppableCollection key={col.id} id={col.id!}>
                                        <SidebarGroup key={col.id} className="group/coll gap-0.5 p-0">
                                            <SidebarGroupLabel asChild>
                                                <CollapsibleTrigger className={collTriggerClass}>
                                                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/label:rotate-90" />
                                                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                                                    <span className="truncate">{col.name}</span>
                                                    <span className="ml-auto text-[11px] text-muted-foreground/70 group-hover/label:hidden">
                                                        {filteredNotes.filter((n) => n.collectionId === col.id).length}
                                                    </span>
                                                    {/* hover 操作：新建笔记 + 删除集合 */}
                                                    <div className="ml-auto hidden items-center gap-0.5 group-hover/label:flex">
                                                        <button
                                                            onClick={(e) => handleCreate(e, col.id)}
                                                            className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                                            title="在此集合下新建笔记"
                                                        >
                                                            <Plus className="size-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleDeleteCollection(e, col.id!, col.name)}
                                                            className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                                                            title="删除集合"
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                        </button>
                                                    </div>
                                                </CollapsibleTrigger>
                                            </SidebarGroupLabel>

                                            <CollapsibleContent>
                                                <SidebarGroupContent>
                                                    <SidebarMenu className="gap-0.5 pl-3">
                                                        {filteredNotes.filter(n => n.collectionId === col.id).map(note => (
                                                            <DraggableNote key={note.id} id={note.id!}>
                                                                <SidebarMenuItem key={note.id} className="group/item">
                                                                    <SidebarMenuButton
                                                                        isActive={activeNoteId === note.id}
                                                                        onClick={(e) => {
                                                                            e.preventDefault()
                                                                            e.stopPropagation()
                                                                            setActiveNote(note.id)
                                                                        }}
                                                                        className={noteButtonClass(activeNoteId === note.id)}
                                                                    >
                                                                        <span
                                                                            className={cn(
                                                                                'h-4 w-[3px] shrink-0 rounded-[2px] bg-primary opacity-0 transition-opacity',
                                                                                activeNoteId === note.id && 'opacity-100',
                                                                                'group-data-[collapsible=icon]:hidden',
                                                                            )}
                                                                        />
                                                                        <span className="truncate">{note.title || "无标题"}</span>
                                                                    </SidebarMenuButton>
                                                                    {/* 操作按钮组：重命名 + 删除 */}
                                                                    <div className="absolute top-1.5 right-1 flex items-center">
                                                                        <SidebarMenuAction
                                                                            showOnHover
                                                                            onClick={(e) => handleRename(e, note.id!, note.title)}
                                                                            className="static text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                                                                        >
                                                                            <Pencil className="size-3.5" />
                                                                            <span className="sr-only">重命名</span>
                                                                        </SidebarMenuAction>
                                                                        <SidebarMenuAction
                                                                            showOnHover
                                                                            onClick={(e) => handleDelete(e, note.id!, note.title)}
                                                                            className="static text-muted-foreground hover:bg-background hover:text-destructive transition-colors"
                                                                        >
                                                                            <Trash2 className="size-3.5" />
                                                                            <span className="sr-only">删除</span>
                                                                        </SidebarMenuAction>
                                                                    </div>
                                                                </SidebarMenuItem>
                                                            </DraggableNote>
                                                        ))}
                                                    </SidebarMenu>
                                                </SidebarGroupContent>
                                            </CollapsibleContent>
                                        </SidebarGroup>
                                    </DroppableCollection>
                                </Collapsible>
                            ))}

                            {/* 未分类（始终在最下方，可折叠，可拖入；无未分类笔记时隐藏） */}
                            {filteredNotes.filter((n) => !n.collectionId).length > 0 && (
                            <Collapsible defaultOpen className="group/coll">
                                <DroppableCollection id="inbox">
                                    <SidebarGroup className="group/coll gap-0.5 p-0">
                                        <SidebarGroupLabel asChild>
                                            <CollapsibleTrigger className={collTriggerClass}>
                                                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/label:rotate-90" />
                                                <Folder className="size-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">未分类</span>
                                                <span className="ml-auto text-[11px] text-muted-foreground/70 group-hover/label:hidden">
                                                    {filteredNotes.filter((n) => !n.collectionId).length}
                                                </span>
                                            </CollapsibleTrigger>
                                        </SidebarGroupLabel>
                                        <CollapsibleContent>
                                            <SidebarGroupContent>
                                                <SidebarMenu className="gap-0.5 pl-3">
                                                    {filteredNotes.filter(n => !n.collectionId).map(note => (
                                                        <DraggableNote key={note.id} id={note.id!}>
                                                            <SidebarMenuItem key={note.id}>
                                                                <SidebarMenuButton
                                                                    isActive={activeNoteId === note.id}
                                                                    onClick={(e) => {
                                                                        e.preventDefault()
                                                                        e.stopPropagation()
                                                                        setActiveNote(note.id);
                                                                    }}
                                                                    className={noteButtonClass(activeNoteId === note.id)}
                                                                >
                                                                    <span
                                                                        className={cn(
                                                                            'h-4 w-[3px] shrink-0 rounded-[2px] bg-primary opacity-0 transition-opacity',
                                                                            activeNoteId === note.id && 'opacity-100',
                                                                            'group-data-[collapsible=icon]:hidden',
                                                                        )}
                                                                    />
                                                                    <span className="truncate">{note.title || "无标题"}</span>
                                                                </SidebarMenuButton>
                                                                {/* 操作按钮组：重命名 + 删除 */}
                                                                <div className="absolute top-1.5 right-1 flex items-center">
                                                                    <SidebarMenuAction
                                                                        showOnHover
                                                                        onClick={(e) => handleRename(e, note.id!, note.title)}
                                                                        className="static text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                                                                    >
                                                                        <Pencil className="size-3.5" />
                                                                        <span className="sr-only">重命名</span>
                                                                    </SidebarMenuAction>
                                                                    <SidebarMenuAction
                                                                        showOnHover
                                                                        onClick={(e) => handleDelete(e, note.id!, note.title)}
                                                                        className="static text-muted-foreground hover:bg-background hover:text-destructive transition-colors"
                                                                    >
                                                                        <Trash2 className="size-3.5" />
                                                                        <span className="sr-only">删除</span>
                                                                    </SidebarMenuAction>
                                                                </div>
                                                            </SidebarMenuItem>
                                                        </DraggableNote>
                                                    ))}
                                                </SidebarMenu>
                                            </SidebarGroupContent>
                                        </CollapsibleContent>
                                    </SidebarGroup>
                                </DroppableCollection>
                            </Collapsible>
                            )}

                            {normalizedSearchKeyword && filteredNotes.length === 0 && (
                                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                                    未找到匹配的笔记
                                </div>
                            )}
                        </>
                    )}
                </SidebarContent>

                {/* 底部折叠按钮（设计稿 side-collapse） */}
                <SidebarFooter className="px-3 pt-2 pb-4">
                    <button
                        onClick={toggleSidebar}
                        title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
                        className="ml-auto grid size-[30px] place-items-center rounded-[7px] border border-border bg-background text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                    >
                        {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
                    </button>
                </SidebarFooter>
            </Sidebar>

            {/* 新建集合 Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="w-[380px] max-w-full rounded-xl">
                    <DialogHeader>
                        <DialogTitle>新建集合</DialogTitle>
                    </DialogHeader>
                    <Input
                        value={createValue}
                        onChange={(e) => setCreateValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submitCreateCollection()
                        }}
                        placeholder="请输入集合名称"
                        autoFocus
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={submitCreateCollection}>确定</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 重命名笔记 Dialog */}
            <Dialog open={renameTarget !== null} onOpenChange={(o) => !o && setRenameTarget(null)}>
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
                        <Button variant="outline" onClick={() => setRenameTarget(null)}>
                            取消
                        </Button>
                        <Button onClick={submitRename}>保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 删除确认 AlertDialog（笔记 / 集合共用） */}
            <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
                <AlertDialogContent className="w-[380px] max-w-full rounded-xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {deleteTarget?.type === 'note' ? '删除笔记' : '删除集合'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget?.type === 'note'
                                ? `确定要删除笔记「${deleteTarget?.label}」吗？此操作不可撤销。`
                                : `确定要删除集合「${deleteTarget?.label}」吗？其中的笔记将移入「未分类」。`}
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
        </DndContext>
    )
}

export default SideBar;
