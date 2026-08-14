import { create } from 'zustand'
import type { Note, Collection } from '@/types'
import type { FsEntry } from '@/services/storage/types'
import { createStorageAdapter } from '@/services/storage'

/**
 * 数据源：内存缓存 + StorageAdapter 文件持久化（F1）。
 *
 * 数据流：
 *   UI 组件 → useDataStore（内存缓存，响应式）→ StorageAdapter → vault 文件
 *   loadAll   ：扫描 vault/笔记/*.md → 读入内存（启动时调用一次）
 *   saveNote  ：写文件 + 更新内存（对外保持同步签名，写文件为异步 fire-and-forget）
 *   deleteNote：删文件 + 更新内存
 *
 * F1 临时文件约定（F2 演进为 frontmatter + 稳定 id，届时 UI 层无需改动）：
 *   - 笔记文件：vault/笔记/{新建时的标题}.md，内容为 Tiptap HTML（F2 换 Markdown）
 *   - 文件名在新建时确定后不变；编辑改变 title 只更新内存，不搬文件
 *   - id 为会话内自增，刷新后按文件名重新分配
 *   - 集合仍为内存态（F2 迁移 collections.json）
 */

const NOTES_DIR = '笔记'

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

interface DataState {
    notes: Note[]
    collections: Collection[]

    // 从 vault 加载全部笔记到内存（F1 起从文件读取，此前为空操作）
    loadAll: () => Promise<void>

    // 保存笔记：有 id 则更新，无 id 则新建（兼容原 Dexie put 语义）
    saveNote: (note: Partial<Note> & Pick<Note, 'title' | 'content'>) => number
    deleteNote: (id: number) => void

    addCollection: (name: string) => void
    deleteCollection: (id: number) => void

    moveNoteToCollection: (noteId: number, collectionId: number | undefined) => void
}

export const useDataStore = create<DataState>((set) => ({
    notes: [],
    collections: [],

    loadAll: async () => {
        // 1. 扫描笔记目录；目录不存在（首次启动）则创建
        let entries: FsEntry[] = []
        try {
            entries = await adapter.list(NOTES_DIR)
        } catch {
            await adapter.mkdir(NOTES_DIR).catch(() => {})
        }

        // 2. 逐个读取 .md 文件 → Note（单个文件失败跳过，不阻断整体加载）
        const notes: Note[] = []
        for (const entry of entries) {
            if (entry.isDir || !entry.name.endsWith('.md')) continue
            try {
                const content = await adapter.read(entry.path)
                const id = nextNoteId++
                idToPath.set(id, entry.path)
                notes.push({
                    id,
                    title: entry.name.replace(/\.md$/, ''),
                    content,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                })
            } catch (e) {
                console.warn(`读取笔记失败，跳过: ${entry.path}`, e)
            }
        }
        set({ notes })
    },

    saveNote: (note) => {
        if (note.id === undefined) {
            // 新建：分配 id → 确定唯一文件路径 → 写文件 + 更新内存
            const id = nextNoteId++
            const now = Date.now()
            const path = uniqueNotePath(note.title)
            idToPath.set(id, path)
            const full: Note = { ...note, id, createdAt: now, updatedAt: now }
            adapter.write(path, note.content).catch((e) => console.error('笔记写入失败:', path, e))
            set((state) => ({ notes: [full, ...state.notes] }))
            return id
        }

        // 更新：写回原文件（路径新建时已定，title 变化不搬文件）
        const path = idToPath.get(note.id)
        if (path) {
            adapter.write(path, note.content ?? '').catch((e) => console.error('笔记写入失败:', path, e))
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
            adapter.delete(path).catch((e) => console.error('笔记删除失败:', path, e))
        }
        set((state) => ({
            notes: state.notes.filter((n) => n.id !== id),
        }))
    },

    addCollection: (name) => {
        set((state) => ({
            collections: [...state.collections, { id: nextCollectionId++, name, createdAt: Date.now() }],
        }))
    },

    deleteCollection: (id) =>
        set((state) => ({
            collections: state.collections.filter((c) => c.id !== id),
            notes: state.notes.map((n) =>
                n.collectionId === id ? { ...n, collectionId: undefined } : n
            ),
        })),

    moveNoteToCollection: (noteId, collectionId) =>
        set((state) => ({
            notes: state.notes.map((n) => (n.id === noteId ? { ...n, collectionId } : n)),
        })),
}))
