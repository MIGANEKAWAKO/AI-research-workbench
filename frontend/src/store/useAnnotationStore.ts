import { create } from 'zustand'
import type { PdfAnnotation } from '@/types'
import { loadAnnotations, saveAnnotations } from '@/services/annotations'

/**
 * 高亮批注数据源（M2 A1）。
 *
 * 内存全量缓存：文件本身就是单文件全量（.kb/annotations.json），个人 vault 规模
 * 足够整体驻留内存，"按 docId 过滤"是视图层的 filter，不做分组缓存（少一层间接）。
 * 变更后 300ms debounce 全量写回（后端 /api/fs 原子写），连续增删合并为一次写。
 *
 * 设计取舍（面试要点）：
 * - 为什么 debounce 而不是每次变更即写：划词添加/删除是连续交互，防抖避免写放大；
 *   代价是"关窗口瞬间的最后一次变更"可能丢失（300ms 窗口内），个人工具可接受。
 * - 为什么不做写回队列/乱序防护：debounce 已把写入频率压到单次，全量写无并发窗口。
 */

const PERSIST_DEBOUNCE_MS = 300

interface AnnotationState {
    annotations: PdfAnnotation[]
    loaded: boolean // 已从后端拉过全量（避免每次打开 reader 重复拉取）
    saveError: string | null // 最近一次持久化失败（UI 展示后由 clearSaveError 清除）

    load: () => Promise<void>
    add: (input: Omit<PdfAnnotation, 'id' | 'createdAt' | 'updatedAt'>) => void
    updateNote: (id: string, note: string) => void
    remove: (id: string) => void
    clearSaveError: () => void
}

// debounce 定时器放模块级：store 是单例，所有变更共享同一个写回队列
let persistTimer: number | null = null

function schedulePersist() {
    if (persistTimer !== null) window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => {
        persistTimer = null
        void persist()
    }, PERSIST_DEBOUNCE_MS)
}

async function persist() {
    try {
        await saveAnnotations(useAnnotationStore.getState().annotations)
    } catch (e) {
        console.error('批注保存失败:', e)
        useAnnotationStore.setState({
            saveError: e instanceof Error ? e.message : '批注保存失败',
        })
    }
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
    annotations: [],
    loaded: false,
    saveError: null,

    load: async () => {
        if (useAnnotationStore.getState().loaded) return
        try {
            const annotations = await loadAnnotations()
            set({ annotations, loaded: true })
        } catch (e) {
            set({ saveError: e instanceof Error ? e.message : '加载批注失败' })
        }
    },

    add: (input) => {
        const now = Date.now()
        const ann: PdfAnnotation = {
            ...input,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
        }
        set((state) => ({ annotations: [...state.annotations, ann] }))
        schedulePersist()
    },

    updateNote: (id, note) => {
        set((state) => ({
            annotations: state.annotations.map((a) =>
                a.id === id ? { ...a, note, updatedAt: Date.now() } : a
            ),
        }))
        schedulePersist()
    },

    remove: (id) => {
        set((state) => ({ annotations: state.annotations.filter((a) => a.id !== id) }))
        schedulePersist()
    },

    clearSaveError: () => set({ saveError: null }),
}))
