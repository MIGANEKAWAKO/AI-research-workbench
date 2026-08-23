import { create } from 'zustand'
import type { LiteratureEntry } from '@/types'
import {
    listLiterature,
    importLiterature,
    deleteLiterature,
    updateLiteratureProgress,
} from '@/services/literature'
import { useAnnotationStore } from '@/store/useAnnotationStore'

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
    uploadOpen: boolean          // UI 重构：上传页是否打开（文献模式中间面板显示上传视图）

    load: () => Promise<void>
    importFile: (file: File, doi?: string, arxivId?: string) => Promise<LiteratureEntry | null>
    remove: (id: string) => Promise<void>
    /** M2 A3：更新阅读进度（状态/页码），成功后原地更新 entries（保持排序） */
    updateProgress: (id: string, patch: { status?: string; lastPage?: number }) => Promise<void>
    setActive: (id: string | null) => void
    openReader: (id: string) => void
    closeReader: () => void
    openUpload: () => void
    closeUpload: () => void
    clearError: () => void
}

export const useLiteratureStore = create<LiteratureState>((set) => ({
    entries: [],
    activeId: null,
    readerId: null,
    loading: false,
    importing: false,
    error: null,
    uploadOpen: false,

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
            // M2 A1：联动清理该文献的高亮批注（含持久化），不留孤儿数据
            useAnnotationStore.getState().removeByDocId(id)
        } catch (e) {
            set({ error: e instanceof Error ? e.message : '删除失败' })
        }
    },

    updateProgress: async (id, patch) => {
        set({ error: null })
        try {
            const updated = await updateLiteratureProgress(id, patch)
            // 原地更新（保持列表导入时间排序），后端幂等返回最新条目
            set((state) => ({
                entries: state.entries.map((e) => (e.id === id ? updated : e)),
            }))
        } catch (e) {
            set({ error: e instanceof Error ? e.message : '更新进度失败' })
        }
    },

    setActive: (id) => set({ activeId: id }),
    openReader: (id) => set({ readerId: id, activeId: id }),
    closeReader: () => set({ readerId: null }),
    openUpload: () => set({ uploadOpen: true }),
    closeUpload: () => set({ uploadOpen: false }),
    clearError: () => set({ error: null }),
}))
