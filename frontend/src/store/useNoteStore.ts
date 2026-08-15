import { create } from 'zustand';

// 视图模式：笔记（默认）/ 文献库（F4 侧边栏 Tab 切换，无路由用 state）
export type ViewMode = 'notes' | 'library';

interface NoteState {
    // 核心数据
    activeNoteId: number | undefined
    activeCollectionId: number | undefined
    
    // UI 状态
    view: ViewMode
    isAiPanelOpen: boolean
    isSaving: boolean
    // F5：划词「问 AI」的预填文本（AIPanel 消费后清空，见 prefillAi）
    aiPrefill: string | null

    // 方法
    setActiveNote: (id: number | undefined) => void
    setActiveCollection: (id: number | undefined) => void
    setView: (view: ViewMode) => void
    toggleAiPanel: () => void
    setSaving: (status: boolean) => void
    prefillAi: (text: string) => void
    clearAiPrefill: () => void
}

export const useNoteStore = create<NoteState>((set) => ({
    activeNoteId: undefined,
    activeCollectionId: undefined,
    view: 'notes',
    isAiPanelOpen: false,
    isSaving: false,
    aiPrefill: null,

    setActiveNote: (id) => set({ activeNoteId: id }),
    setActiveCollection: (id) => set({ activeCollectionId: id }),
    setView: (view) => set({ view }),
    toggleAiPanel: () => set((state) => ({ isAiPanelOpen: !state.isAiPanelOpen })),
    setSaving: (status) => set({ isSaving: status }),
    prefillAi: (text) => set({ aiPrefill: text, isAiPanelOpen: true }),
    clearAiPrefill: () => set({ aiPrefill: null }),
}))
