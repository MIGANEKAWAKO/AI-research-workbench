import { create } from 'zustand';

// 视图模式：笔记（默认）/ 文献库（F4 侧边栏 Tab 切换，无路由用 state）
export type ViewMode = 'notes' | 'library';

// F7：划词提问的子项类型（解释 / 翻译 / 总结）
export type AiAskType = 'explain' | 'translate' | 'summarize';

// F7：划词提问任务（AIPanel 消费后清空，见 prefillAiTask）
export interface AiTask {
    type: AiAskType
    text: string
    /** F7 bugfix：划词所在页码（拼进出处信息，AI 回答来源与划词页一致） */
    pageNumber?: number
    /** F7 bugfix：文献标题（出处信息） */
    docTitle?: string
}

interface NoteState {
    // 核心数据
    activeNoteId: number | undefined
    activeCollectionId: number | undefined
    
    // UI 状态
    view: ViewMode
    isAiPanelOpen: boolean
    isSaving: boolean
    // F7：划词提问任务（解释/翻译/总结，打开面板并自动发送）
    aiTask: AiTask | null

    // 方法
    setActiveNote: (id: number | undefined) => void
    setActiveCollection: (id: number | undefined) => void
    setView: (view: ViewMode) => void
    toggleAiPanel: () => void
    setSaving: (status: boolean) => void
    prefillAiTask: (type: AiAskType, text: string, pageNumber?: number, docTitle?: string) => void
    clearAiTask: () => void
}

export const useNoteStore = create<NoteState>((set) => ({
    activeNoteId: undefined,
    activeCollectionId: undefined,
    view: 'notes',
    isAiPanelOpen: false,
    isSaving: false,
    aiTask: null,

    setActiveNote: (id) => set({ activeNoteId: id }),
    setActiveCollection: (id) => set({ activeCollectionId: id }),
    setView: (view) => set({ view }),
    toggleAiPanel: () => set((state) => ({ isAiPanelOpen: !state.isAiPanelOpen })),
    setSaving: (status) => set({ isSaving: status }),
    prefillAiTask: (type, text, pageNumber, docTitle) =>
        set({ aiTask: { type, text, pageNumber, docTitle }, isAiPanelOpen: true }),
    clearAiTask: () => set({ aiTask: null }),
}))
