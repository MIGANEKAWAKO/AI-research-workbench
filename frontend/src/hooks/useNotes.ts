import { useCallback } from 'react'
import type { Note } from '@/types'
import { useDataStore } from '@/store/useDataStore'

// 对外 API 与原有签名保持一致（编辑器调用方零改动）
export const useNotes = () => {
    const saveNote = useCallback(async (note: Note) => {
        return useDataStore.getState().saveNote(note)
    }, [])

    // 根据 ID 获取笔记
    const getNote = useCallback(async (id: number) => {
        return useDataStore.getState().notes.find((n) => n.id === id)
    }, [])

    return { saveNote, getNote }
}
