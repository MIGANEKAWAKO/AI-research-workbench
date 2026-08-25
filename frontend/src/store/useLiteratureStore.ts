import { create } from 'zustand'
import type { LiteratureEntry, LitCollection } from '@/types'
import {
    listLiterature,
    importLiterature,
    deleteLiterature,
    updateLiteratureProgress,
    updateLiteratureCollections,
    updateLiteratureMetadata,
    type LiteraturePatch,
} from '@/services/literature'
import { createStorageAdapter } from '@/services/storage'
import { useAnnotationStore } from '@/store/useAnnotationStore'

/**
 * 文献库数据源（F4 + M2 文献集合）。
 * - 文献条目：内存态 + 每次 load() 从后端拉取（真源 = 后端 literature.json）
 * - 文献集合：集合定义由前端管理（.kb/literature-collections.json，经 StorageAdapter，
 *   与笔记集合 .kb/collections.json 同款模式）；文献归属（collectionIds）存后端，
 *   经 PUT /api/documents/{id} 更新（幂等）
 */

const LIT_COLLECTIONS_PATH = '.kb/literature-collections.json'

const adapter = createStorageAdapter()

/** 读集合定义文件；不存在/损坏 → 空列表（与笔记集合同款容错） */
const loadCollectionsFile = async (): Promise<LitCollection[]> => {
    try {
        const raw = await adapter.read(LIT_COLLECTIONS_PATH)
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter(
            (c): c is LitCollection =>
                c && typeof c.id === 'string' && typeof c.name === 'string'
        )
    } catch {
        return []
    }
}

const saveCollectionsFile = (collections: LitCollection[]): Promise<void> =>
    adapter.write(LIT_COLLECTIONS_PATH, JSON.stringify(collections, null, 2))

interface LiteratureState {
    entries: LiteratureEntry[]
    activeId: string | null      // 当前选中的文献（详情面板）
    readerId: string | null      // F5：正在阅读的文献（非空 → 中间面板显示阅读器而非详情）
    loading: boolean
    importing: boolean
    error: string | null         // 最近一次操作错误（UI 展示后由 clearError 清除）
    uploadOpen: boolean          // UI 重构：上传页是否打开（文献模式中间面板显示上传视图）
    /** M2：文献集合定义（前端管理，.kb/literature-collections.json） */
    collections: LitCollection[]

    load: () => Promise<void>
    loadCollections: () => Promise<void>
    /** M2：新建文献集合（id 前端生成，名称去重） */
    addCollection: (name: string) => void
    /** M2：删除集合（同步清理归属该集合文献的 collectionIds，逐篇 PUT） */
    deleteCollection: (id: string) => Promise<void>
    /** M2：移动文献到集合（collectionId 传 null = 移回未分类；PUT 幂等） */
    moveToCollection: (litId: string, collectionId: string | null) => Promise<void>
    importFile: (file: File, doi?: string, arxivId?: string) => Promise<LiteratureEntry | null>
    remove: (id: string) => Promise<void>
    /** M2 A3：更新阅读进度（状态/页码），成功后原地更新 entries（保持排序） */
    updateProgress: (id: string, patch: { status?: string; lastPage?: number }) => Promise<void>
    /** M2 P2：更新文献元数据（编辑保存），成功后原地更新 entries */
    updateMetadata: (id: string, patch: LiteraturePatch) => Promise<void>
    setActive: (id: string | null) => void
    openReader: (id: string) => void
    closeReader: () => void
    openUpload: () => void
    closeUpload: () => void
    clearError: () => void
}

/** 集合 id：lit- + 时间戳 + 随机段（与后端 collectionIds 字符串值对应） */
function litCollectionId(): string {
    return `lit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export const useLiteratureStore = create<LiteratureState>((set, get) => ({
    entries: [],
    activeId: null,
    readerId: null,
    loading: false,
    importing: false,
    error: null,
    uploadOpen: false,
    collections: [],

    load: async () => {
        set({ loading: true, error: null })
        try {
            const entries = await listLiterature()
            set({ entries, loading: false })
        } catch (e) {
            set({ loading: false, error: e instanceof Error ? e.message : '加载文献列表失败' })
        }
    },

    loadCollections: async () => {
        const collections = await loadCollectionsFile()
        set({ collections })
    },

    addCollection: (name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        const { collections } = get()
        if (collections.some((c) => c.name === trimmed)) {
            set({ error: `集合「${trimmed}」已存在` })
            return
        }
        const next = [...collections, { id: litCollectionId(), name: trimmed, createdAt: Date.now() }]
        set({ collections: next, error: null })
        void saveCollectionsFile(next).catch((e) => {
            console.warn('文献集合保存失败:', e)
            set({ error: '集合保存失败' })
        })
    },

    deleteCollection: async (id) => {
        const { collections, entries } = get()
        const next = collections.filter((c) => c.id !== id)
        set({ collections: next, error: null })
        void saveCollectionsFile(next).catch((e) => console.warn('文献集合保存失败:', e))
        // 同步清理归属该集合的文献（逐篇 PUT，量小；失败不阻断集合删除）
        const affected = entries.filter((e) => e.collectionIds?.includes(id))
        for (const entry of affected) {
            try {
                const updated = await updateLiteratureCollections(
                    entry.id,
                    (entry.collectionIds ?? []).filter((cid) => cid !== id)
                )
                set((s) => ({
                    entries: s.entries.map((e) => (e.id === updated.id ? updated : e)),
                }))
            } catch (e) {
                console.warn('清理文献归属失败:', e)
            }
        }
    },

    moveToCollection: async (litId, collectionId) => {
        const { entries } = get()
        const entry = entries.find((e) => e.id === litId)
        if (!entry) return
        const current = entry.collectionIds ?? []
        const nextIds = collectionId === null ? [] : [collectionId]
        // 幂等：目标与当前一致则不请求
        if (JSON.stringify(current) === JSON.stringify(nextIds)) return
        try {
            const updated = await updateLiteratureCollections(litId, nextIds)
            set((s) => ({
                entries: s.entries.map((e) => (e.id === updated.id ? updated : e)),
            }))
        } catch (e) {
            set({ error: e instanceof Error ? e.message : '移动文献失败' })
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

    updateMetadata: async (id, patch) => {
        set({ error: null })
        try {
            const updated = await updateLiteratureMetadata(id, patch)
            // 原地更新（保持排序）；导出/引用/详情展示读取同一 entries，自动同步
            set((state) => ({
                entries: state.entries.map((e) => (e.id === id ? updated : e)),
            }))
        } catch (e) {
            set({ error: e instanceof Error ? e.message : '保存失败' })
            throw e
        }
    },

    setActive: (id) => set({ activeId: id }),
    openReader: (id) => set({ readerId: id, activeId: id }),
    closeReader: () => set({ readerId: null }),
    openUpload: () => set({ uploadOpen: true }),
    closeUpload: () => set({ uploadOpen: false }),
    clearError: () => set({ error: null }),
}))
