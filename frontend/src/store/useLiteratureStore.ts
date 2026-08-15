import { create } from 'zustand'
import type { LiteratureEntry } from '@/types'
import { listLiterature, importLiterature, deleteLiterature } from '@/services/literature'

/**
 * 文献库数据源（F4）。
 * 内存态 + 每次 load() 从后端拉取（文献数据由后端管理，无本地缓存层——
 * 与笔记不同，文献元数据的真源是后端 literature.json）。
 */

interface LiteratureState {
    entries: LiteratureEntry[]
    activeId: string | null      // 当前选中的文献（详情面板）
    readerId: string | null      // F5：正在阅读的文献（非空 → 中间面板显示阅读器而非详情）
    loading: boolean
    importing: boolean
    error: string | null         // 最近一次操作错误（UI 展示后由 clearError 清除）

    load: () => Promise<void>
    importFile: (file: File, doi?: string, arxivId?: string) => Promise<LiteratureEntry | null>
    remove: (id: string) => Promise<void>
    setActive: (id: string | null) => void
    openReader: (id: string) => void
    closeReader: () => void
    clearError: () => void
}

export const useLiteratureStore = create<LiteratureState>((set) => ({
    entries: [],
    activeId: null,
    readerId: null,
    loading: false,
    importing: false,
    error: null,

    load: async () => {
        set({ loading: true, error: null })
        try {
            const entries = await listLiterature()
            set({ entries, loading: false })
        } catch (e) {
            set({ loading: false, error: e instanceof Error ? e.message : '加载文献列表失败' })
        }
    },

    importFile: async (file, doi, arxivId) => {
        set({ importing: true, error: null })
        try {
            const entry = await importLiterature(file, doi, arxivId)
            // 后端列表按 importedAt 倒序，新条目插头部
            set((state) => ({
                entries: [entry, ...state.entries],
                importing: false,
            }))
            return entry
        } catch (e) {
            set({
                importing: false,
                error: e instanceof Error ? e.message : '导入失败',
            })
            return null
        }
    },

    remove: async (id) => {
        set({ error: null })
        try {
            await deleteLiterature(id)
            set((state) => ({
                entries: state.entries.filter((e) => e.id !== id),
                activeId: state.activeId === id ? null : state.activeId,
            }))
        } catch (e) {
            set({ error: e instanceof Error ? e.message : '删除失败' })
        }
    },

    setActive: (id) => set({ activeId: id }),
    openReader: (id) => set({ readerId: id, activeId: id }),
    closeReader: () => set({ readerId: null }),
    clearError: () => set({ error: null }),
}))
