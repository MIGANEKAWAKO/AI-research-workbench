import { create } from 'zustand'
import type { Note, Collection } from '@/types'
import type { FsEntry } from '@/services/storage/types'
import { createStorageAdapter } from '@/services/storage'
import { serializeNote, parseNoteFile } from '@/lib/note-file'

/**
 * 数据源：内存缓存 + StorageAdapter 文件持久化（F1 抽象层，F2 文件格式 Markdown 化）。
 *
 * 数据流：
 *   UI 组件 → useDataStore（内存缓存，响应式）→ StorageAdapter → vault 文件
 *   loadAll   ：读 .kb/collections.json + 扫描 vault/笔记/*.md → 解析 frontmatter → 内存
 *   saveNote  ：serializeNote（frontmatter + Markdown）→ 写文件 + 更新内存
 *   deleteNote：删文件 + 更新内存
 *
 * 文件格式（F2，PRD 5.4）：vault/笔记/{文件名}.md = YAML frontmatter + Markdown 正文
 *   - frontmatter 字段：title / collection(集合名，Obsidian 兼容) / tags / cites
 *   - 文件名在新建时确定后不变；编辑改变 title 只更新 frontmatter，不搬文件
 *   - 集合定义持久化于 .kb/collections.json：[{id, name, createdAt}]
 *   - id 为会话内自增，刷新后重新分配（F3 改稳定 id）
 */

const NOTES_DIR = '笔记'
const COLLECTIONS_PATH = '.kb/collections.json'

const adapter = createStorageAdapter()

let nextNoteId = 1
let nextCollectionId = 1

// 会话内映射：笔记 id ↔ 文件路径（loadAll 时建立，刷新重建）
const idToPath = new Map<number, string>()

/** 文件名清洗：替换 Windows 非法字符，避免写文件失败 */
const sanitizeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Untitled'

/** 生成不冲突的文件路径：同名时追加 " (2)"、" (3)"…（基于内存查重，同步完成） */
const uniqueNotePath = (title: string): string => {
    const base = sanitizeFileName(title)
    const used = new Set(idToPath.values())
    let name = base
    let i = 2
    while (used.has(`${NOTES_DIR}/${name}.md`)) {
        name = `${base} (${i++})`
    }
    return `${NOTES_DIR}/${name}.md`
}

/** 读集合定义文件（.kb/collections.json）；不存在/损坏 → 空列表 */
const loadCollectionsFile = async (): Promise<Collection[]> => {
    try {
        const raw = await adapter.read(COLLECTIONS_PATH)
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter(
            (c): c is Collection =>
                c && typeof c.name === 'string' && typeof c.createdAt === 'number'
        )
    } catch {
        return []
    }
}

/** 写集合定义文件（返回 Promise，由调用方处理失败提示） */
const saveCollectionsFile = (collections: Collection[]): Promise<void> =>
    adapter.write(COLLECTIONS_PATH, JSON.stringify(collections, null, 2))

interface DataState {
    notes: Note[]
    collections: Collection[]

    /**
     * 后端连接状态：null=尚未确认（初始），true=在线，false=离线。
     * 离线时 UI 显示警告条（防止"静默失败"：loadAll 空列表 / 保存丢数据无感知）。
     */
    backendOnline: boolean | null

    // 从 vault 加载全部笔记与集合到内存（应用启动时调用）
    loadAll: () => Promise<void>

    // 保存笔记：有 id 则更新，无 id 则新建（兼容原 Dexie put 语义）
    saveNote: (note: Partial<Note> & Pick<Note, 'title' | 'content'>) => number
    deleteNote: (id: number) => void

    // 重命名笔记：只改 frontmatter title 与内存（文件名是存储标识，不动——F1 决策）
    renameNote: (id: number, newTitle: string) => void

    // 从磁盘全量同步（30s 轮询兜底，感知 Obsidian/VS Code 的外部修改）
    // skipNoteId：正在编辑的笔记保留内存值，防止未保存输入被磁盘旧版覆盖
    refreshFromDisk: (skipNoteId?: number) => Promise<void>

    addCollection: (name: string) => void
    /** 重命名集合（名称去重；定义存 .kb/collections.json，笔记归属 collectionId 不变） */
    renameCollection: (id: number, name: string) => void
    deleteCollection: (id: number) => void

    moveNoteToCollection: (noteId: number, collectionId: number | undefined) => void
}

/** 判断失败是否为网络层错误（fetch 拒绝 = 后端不可达），HTTP 错误（403/404 等）不算离线 */
const isNetworkError = (e: unknown) => e instanceof TypeError

export const useDataStore = create<DataState>((set, get) => ({
    notes: [],
    collections: [],
    backendOnline: null,

    loadAll: async () => {
        // 1. 集合定义：读 .kb/collections.json（不存在 → 空）
        const collections = await loadCollectionsFile()
        if (collections.length > 0) {
            nextCollectionId = Math.max(...collections.map((c) => c.id ?? 0)) + 1
        }
        const nameToId = (name?: string) =>
            collections.find((c) => c.name === name)?.id

        // 2. 扫描笔记目录；网络失败 → 标记离线并降级为空列表；目录不存在 → 创建
        let entries: FsEntry[] = []
        try {
            entries = await adapter.list(NOTES_DIR)
        } catch (e) {
            if (isNetworkError(e)) {
                console.error('无法连接存储服务（后端未启动？）', e)
                set({ notes: [], collections, backendOnline: false })
                return
            }
            await adapter.mkdir(NOTES_DIR).catch(() => {})
        }

        // 3. 逐个读取 .md 文件 → 解析 frontmatter → Note（单个失败跳过，不阻断）
        const notes: Note[] = []
        for (const entry of entries) {
            if (entry.isDir || !entry.name.endsWith('.md')) continue
            try {
                const raw = await adapter.read(entry.path)
                const parsed = parseNoteFile(raw, entry.name)
                const id = nextNoteId++
                idToPath.set(id, entry.path)
                notes.push({
                    id,
                    title: parsed.title,
                    content: parsed.content,
                    tags: parsed.tags,
                    cites: parsed.cites,
                    collectionId: nameToId(parsed.collectionName),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                })
            } catch (e) {
                console.warn(`读取笔记失败，跳过: ${entry.path}`, e)
            }
        }
        set({ notes, collections, backendOnline: true })
    },

    saveNote: (note) => {
        const collectionName = note.collectionId !== undefined
            ? get().collections.find((c) => c.id === note.collectionId)?.name
            : undefined

        if (note.id === undefined) {
            // 新建：分配 id → 确定唯一文件路径 → 写文件（frontmatter + markdown）+ 更新内存
            const id = nextNoteId++
            const now = Date.now()
            const path = uniqueNotePath(note.title)
            idToPath.set(id, path)
            const full: Note = { ...note, id, createdAt: now, updatedAt: now }
            adapter
                .write(path, serializeNote(full, collectionName))
                .then(() => set({ backendOnline: true }))
                .catch((e) => {
                    console.error('笔记写入失败:', path, e)
                    if (isNetworkError(e)) set({ backendOnline: false })
                })
            set((state) => ({ notes: [full, ...state.notes] }))
            return id
        }

        // 更新：写回原文件（路径新建时已定，title 变化只改 frontmatter 不搬文件）
        const path = idToPath.get(note.id)
        if (path) {
            const merged: Note = {
                ...get().notes.find((n) => n.id === note.id),
                ...note,
                updatedAt: Date.now(),
            } as Note
            adapter
                .write(path, serializeNote(merged, collectionName))
                .then(() => set({ backendOnline: true }))
                .catch((e) => {
                    console.error('笔记写入失败:', path, e)
                    if (isNetworkError(e)) set({ backendOnline: false })
                })
        }
        set((state) => ({
            notes: state.notes.map((n) =>
                n.id === note.id ? { ...n, ...note, updatedAt: Date.now() } : n
            ),
        }))
        return note.id
    },

    deleteNote: (id) => {
        const path = idToPath.get(id)
        if (path) {
            idToPath.delete(id)
            adapter
                .delete(path)
                .then(() => set({ backendOnline: true }))
                .catch((e) => {
                    console.error('笔记删除失败:', path, e)
                    if (isNetworkError(e)) set({ backendOnline: false })
                })
        }
        set((state) => ({
            notes: state.notes.filter((n) => n.id !== id),
        }))
    },

    renameNote: (id, newTitle) => {
        const path = idToPath.get(id)
        const note = get().notes.find((n) => n.id === id)
        if (!note || !path) return

        const collectionName =
            note.collectionId !== undefined
                ? get().collections.find((c) => c.id === note.collectionId)?.name
                : undefined
        const renamed: Note = { ...note, title: newTitle, updatedAt: Date.now() }

        // 内存立即生效；文件只更新 frontmatter title（文件名是存储标识，不动）
        set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? renamed : n)),
        }))
        adapter
            .write(path, serializeNote(renamed, collectionName))
            .then(() => set({ backendOnline: true }))
            .catch((e) => {
                console.error('笔记重命名失败:', path, e)
                if (isNetworkError(e)) set({ backendOnline: false })
            })
    },

    refreshFromDisk: async (skipNoteId) => {
        // 1. 扫描目录；失败（离线/目录不存在）→ 保持现状，静默返回
        let entries: FsEntry[] = []
        try {
            entries = await adapter.list(NOTES_DIR)
        } catch {
            return
        }

        const current = get()
        const nameToId = (name?: string) =>
            current.collections.find((c) => c.name === name)?.id

        // 2. 逐文件读 + 解析，与内存合并（以磁盘为准，skipNoteId 保留内存值）
        const nextNotes: Note[] = []
        const nextIdToPath = new Map<number, string>()

        for (const entry of entries) {
            if (entry.isDir || !entry.name.endsWith('.md')) continue
            try {
                const raw = await adapter.read(entry.path)
                const parsed = parseNoteFile(raw, entry.name)
                const existing = current.notes.find(
                    (n) => n.id !== undefined && idToPath.get(n.id) === entry.path
                )

                if (existing && existing.id === skipNoteId) {
                    // 正在编辑：保留内存值，防止未保存输入被磁盘旧版覆盖
                    // （内存笔记必有 id，见 loadAll/saveNote 分配逻辑）
                    nextNotes.push(existing)
                    nextIdToPath.set(existing.id!, entry.path)
                    continue
                }

                const id = existing?.id ?? nextNoteId++
                nextIdToPath.set(id, entry.path)
                nextNotes.push({
                    id,
                    title: parsed.title,
                    content: parsed.content,
                    tags: parsed.tags,
                    cites: parsed.cites,
                    collectionId: nameToId(parsed.collectionName),
                    createdAt: existing?.createdAt ?? Date.now(),
                    updatedAt: Date.now(),
                })
            } catch (e) {
                console.warn(`轮询读取失败，跳过: ${entry.path}`, e)
            }
        }

        // 3. 同步映射（模块级 idToPath 重建）与状态
        idToPath.clear()
        for (const [k, v] of nextIdToPath) idToPath.set(k, v)
        set({ notes: nextNotes, backendOnline: true })
    },

    addCollection: (name) => {
        const id = nextCollectionId++
        const collections = [
            ...get().collections,
            { id, name, createdAt: Date.now() },
        ]
        set({ collections })
        saveCollectionsFile(collections)
            .then(() => set({ backendOnline: true }))
            .catch((e) => {
                console.error('集合写入失败:', e)
                if (isNetworkError(e)) set({ backendOnline: false })
            })
    },

    renameCollection: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        const { collections } = get()
        if (collections.some((c) => c.id !== id && c.name === trimmed)) return
        const next = collections.map((c) => (c.id === id ? { ...c, name: trimmed } : c))
        set({ collections: next })
        saveCollectionsFile(next)
            .then(() => set({ backendOnline: true }))
            .catch((e) => {
                console.error('集合写入失败:', e)
                if (isNetworkError(e)) set({ backendOnline: false })
            })
    },

    deleteCollection: (id) => {
        // 集合删除后：笔记变为未分类（内存立即生效；文件 frontmatter 的 collection
        // 字段在下次保存时清除，重载时因集合不存在自动映射为未分类，可接受）
        const collections = get().collections.filter((c) => c.id !== id)
        set((state) => ({
            collections,
            notes: state.notes.map((n) =>
                n.collectionId === id ? { ...n, collectionId: undefined } : n
            ),
        }))
        saveCollectionsFile(collections)
            .then(() => set({ backendOnline: true }))
            .catch((e) => {
                console.error('集合写入失败:', e)
                if (isNetworkError(e)) set({ backendOnline: false })
            })
    },

    moveNoteToCollection: (noteId, collectionId) => {
        set((state) => ({
            notes: state.notes.map((n) => (n.id === noteId ? { ...n, collectionId } : n)),
        }))

        // 集合归属变化 → 立即重写该笔记文件（更新 frontmatter 的 collection 字段）
        const note = get().notes.find((n) => n.id === noteId)
        const path = idToPath.get(noteId)
        if (!note || !path) return
        const collectionName =
            collectionId !== undefined
                ? get().collections.find((c) => c.id === collectionId)?.name
                : undefined
        adapter
            .write(path, serializeNote(note, collectionName))
            .then(() => set({ backendOnline: true }))
            .catch((e) => {
                console.error('笔记写入失败:', path, e)
                if (isNetworkError(e)) set({ backendOnline: false })
            })
    },
}))
