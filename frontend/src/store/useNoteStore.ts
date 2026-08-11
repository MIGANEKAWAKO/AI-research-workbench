import { create } from 'zustand';

interface NoteState {
    // 核心数据
    activeNoteId: number | undefined
    activeCollectionId: number | undefined
    
    // UI 状态
    isAiPanelOpen: boolean
    isSaving: boolean

    // 方法
    setActiveNote: (id: number | undefined) => void
    setActiveCollection: (id: number | undefined) => void
    toggleAiPanel: () => void
    setSaving: (status: boolean) => void
}

export const useNoteStore = create<NoteState>((set) => ({
    activeNoteId: undefined,
    activeCollectionId: undefined,
    isAiPanelOpen: false,
    isSaving: false,

    setActiveNote: (id) => set({ activeNoteId: id }),
    setActiveCollection: (id) => set({ activeCollectionId: id }),
    toggleAiPanel: () => set((state) => ({ isAiPanelOpen: !state.isAiPanelOpen })),
    setSaving: (status) => set({ isSaving: status })
}))