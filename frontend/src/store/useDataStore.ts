import { create } from 'zustand';
import type { Note, Collection } from '@/types';

// 临时内存数据源：替代已弃用的 IndexedDB（Dexie），保证前端在存储层重构期间可编译可运行。
// 注意：内存数据刷新即丢，属预期行为。
// 后续 F1 阶段：将这些 actions 的内部实现替换为 StorageAdapter（vault 文件读写），UI 层无需改动。

interface DataState {
    notes: Note[]
    collections: Collection[]

    // 从持久层加载（内存版为空操作，为 F1 文件读取预留入口）
    loadAll: () => Promise<void>

    // 保存笔记：有 id 则更新，无 id 则新增（兼容原 Dexie put 语义）
    saveNote: (note: Partial<Note> & Pick<Note, 'title' | 'content'>) => number
    deleteNote: (id: number) => void

    addCollection: (name: string) => void
    deleteCollection: (id: number) => void

    moveNoteToCollection: (noteId: number, collectionId: number | undefined) => void
}

let nextNoteId = 1
let nextCollectionId = 1

export const useDataStore = create<DataState>((set) => ({
    notes: [],
    collections: [],

    loadAll: async () => {},

    saveNote: (note) => {
        if (note.id === undefined) {
            const id = nextNoteId++
            const now = Date.now()
            set((state) => ({
                notes: [{ ...note, id, createdAt: now, updatedAt: now }, ...state.notes],
            }))
            return id
        }
        set((state) => ({
            notes: state.notes.map((n) =>
                n.id === note.id ? { ...n, ...note, updatedAt: Date.now() } : n
            ),
        }))
        return note.id
    },

    deleteNote: (id) =>
        set((state) => ({
            notes: state.notes.filter((n) => n.id !== id),
        })),

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
