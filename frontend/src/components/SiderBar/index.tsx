import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMemo, useState } from 'react';
import { FileText, Plus, Trash2, FolderPlus, Folder, ChevronRight, Search, X } from "lucide-react"
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem
} from "@/components/ui/sidebar"
import { Input } from "@/components/ui/input"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from "@/components/ui/collapsible"
import { DraggableNote } from '@/components/SiderBar/draggable-note'
import { DroppableCollection } from '@/components/SiderBar/droppable-collection'
import { useNoteStore } from '@/store/useNoteStore';
import { useDataStore } from '@/store/useDataStore';

const SideBar = () => {
    // 订阅内存数据源（Zustand 响应式，行为与原 useLiveQuery 等价）
    const notes = useDataStore((state) => state.notes);
    const collections = useDataStore((state) => state.collections);
    const backendOnline = useDataStore((state) => state.backendOnline);
    const [searchKeyword, setSearchKeyword] = useState('');

    const activeNoteId = useNoteStore((state) => state.activeNoteId);
    const setActiveNote = useNoteStore((state) => state.setActiveNote);
    const normalizedSearchKeyword = searchKeyword.trim().toLowerCase();
    const filteredNotes = useMemo(() => {
        if (!normalizedSearchKeyword) return notes;

        return notes.filter((note) => {
            const title = note.title?.toLowerCase() || '';
            const content = note.content?.toLowerCase() || '';

            return title.includes(normalizedSearchKeyword) || content.includes(normalizedSearchKeyword);
        });
    }, [notes, normalizedSearchKeyword]);

    const handleCreateCollection = async () => {
        const name = prompt("请输入集合名称");
        if (name) {
            useDataStore.getState().addCollection(name)
        }
    }

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

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        // 1. 阻止事件冒泡，防止触发侧边栏的“选中笔记”事件
        e.preventDefault()
        e.stopPropagation()

        // 2. 二次确认（学术研究数据宝贵，加个保险）
        if (!confirm("确定要永久删除这篇笔记吗？")) return

        try {
            // 3. 从数据源删除
            useDataStore.getState().deleteNote(id)

            // ✅ 如果删除的是当前选中的笔记，重置为 undefined
            if (activeNoteId === id) {
                setActiveNote(undefined);
            }

            console.log(`🗑️ 笔记 ${id} 已删除`)
        } catch (error) {
            console.error("删除失败:", error)
        }
    }

    const handleDeleteCollection = async (e: React.MouseEvent, colId: number, colName: string) => {
        e.preventDefault()
        e.stopPropagation(); // 阻止事件冒泡

        if (!confirm(`确定要删除集合 "${colName}" 吗？\n注意：该操作不会删除笔记，笔记将变为“未分类”。`)) return;

        try {
            // 删除集合，并自动将该集合下所有笔记的 collectionId 置空（解除关联）
            useDataStore.getState().deleteCollection(colId)
            console.log(`已删除集合: ${colName}`)
        } catch (error) {
            console.error("删除集合失败:", error)
        }
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

    return (
        <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
            <Sidebar variant="floating" collapsible="icon">
                <SidebarHeader>
                    {backendOnline === false && (
                        <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            ⚠ 无法连接存储服务（localhost:3001）<br />
                            笔记不会被保存，请先启动后端
                        </div>
                    )}
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            placeholder="查找笔记"
                            className="h-8 pl-8 pr-8"
                        />
                        {searchKeyword && (
                            <button
                                type="button"
                                onClick={() => setSearchKeyword('')}
                                className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                title="清空查找"
                            >
                                <X className="h-3.5 w-3.5" />
                                <span className="sr-only">清空查找</span>
                            </button>
                        )}
                    </div>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton onClick={handleCreateCollection}>
                                <FolderPlus className="mr-2 h-4 w-4" />
                                <span>新建集合</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarHeader>

                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupLabel>未分类</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
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
                                            >
                                                <FileText className="h-4 w-4" />
                                                <span className="truncate">{note.title || "无标题"}</span>
                                            </SidebarMenuButton>
                                            {/* 删除按钮：使用 SidebarMenuAction */}
                                            <SidebarMenuAction
                                                showOnHover // 只有悬停时才显示
                                                onClick={(e) => handleDelete(e, note.id!)}
                                                className="hover:text-destructive transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">删除</span>
                                            </SidebarMenuAction>
                                        </SidebarMenuItem>
                                    </DraggableNote>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    {normalizedSearchKeyword && filteredNotes.length === 0 && (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                            未找到匹配的笔记
                        </div>
                    )}

                    {collections?.filter((col) =>
                        !normalizedSearchKeyword || filteredNotes.some((note) => note.collectionId === col.id)
                    ).map(col => (
                        <Collapsible
                            key={col.id}
                            asChild
                            defaultOpen={true} // 默认展开，也可以根据需要设置
                            className="group/collapsible"
                        >
                            <DroppableCollection key={col.id} id={col.id!}>
                                <SidebarGroup key={col.id} className="group/coll">
                                    <SidebarGroupLabel asChild>
                                        <CollapsibleTrigger className="flex w-full items-center justify-between hover:bg-sidebar-accent hover:text-sidebar-accent-foreground p-2 rounded-md transition-colors group/label">
                                            {/* 左侧：图标和名称 */}
                                            <div className="flex items-center gap-2 truncate">
                                                <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/label:rotate-90" />
                                                <Folder className="h-3.5 w-3.5" />
                                                <span className="truncate">{col.name}</span>
                                            </div>

                                            {/* 右侧：操作按钮区域 */}
                                            <div className="flex items-center gap-1 opacity-0 group-hover/label:opacity-100 transition-opacity">
                                                {/* 新建笔记按钮 */}
                                                <button
                                                    onClick={(e) => handleCreate(e, col.id)}
                                                    className="p-1 hover:bg-sidebar-accent rounded-md transition-colors"
                                                    title="在此集合下新建笔记"
                                                >
                                                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                                </button>

                                                {/* 删除集合按钮 */}
                                                <button
                                                    onClick={(e) => handleDeleteCollection(e, col.id!, col.name)}
                                                    className="p-1 hover:bg-sidebar-accent rounded-md transition-colors hover:text-destructive"
                                                    title="删除集合"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                                </button>
                                            </div>
                                        </CollapsibleTrigger>
                                    </SidebarGroupLabel>

                                    <CollapsibleContent>
                                        <SidebarGroupContent>
                                            <SidebarMenu>
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
                                                            >
                                                                <FileText className="h-4 w-4" />
                                                                <span className="truncate">{note.title || "无标题"}</span>
                                                            </SidebarMenuButton>
                                                            {/* 删除按钮：使用 SidebarMenuAction */}
                                                            <SidebarMenuAction
                                                                showOnHover // 只有悬停时才显示
                                                                onClick={(e) => handleDelete(e, note.id!)}
                                                                className="hover:text-destructive transition-colors"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                                <span className="sr-only">删除</span>
                                                            </SidebarMenuAction>
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
                </SidebarContent>
            </Sidebar>
        </DndContext>
    )
}

export default SideBar;
