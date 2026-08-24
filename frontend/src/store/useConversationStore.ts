import { create } from 'zustand'
import type { Conversation, ConversationMessage } from '@/types'
import {
    listConversations,
    createConversation,
    deleteConversation,
    getConversationMessages,
} from '@/services/conversations'

/**
 * M2 C3：AI 会话数据源。
 *
 * 双模式（面试要点）：
 * - 真模式（backendOk=true）：会话/消息由后端 C1 持久化（.kb/conversations.json）；
 *   消息落库靠 C2（/api/chat 带 conversation_id），前端只拉历史 + 乐观追加。
 * - 降级模式（backendOk=false）：后端不可用时会话/消息仅存内存，UI 完整可用——
 *   延续项目"静默降级"传统（B7 RAG/B2 元数据同款），也是联调前的前端验证路径。
 *
 * 消息按会话缓存（messagesByConv）：切换会话优先用缓存，缺失才拉历史；
 * 发送/回答/研究答案乐观追加（appendMessage/appendAiContent），不刷新页面。
 */

/** 本地降级模式的会话/消息 id 前缀（真模式 id 由后端生成） */
const LOCAL_ID_PREFIX = 'local-'
let localSeq = 0

interface ConversationState {
    conversations: Conversation[]
    activeId: string | null
    /** 按会话缓存的历史消息（含乐观追加的进行中消息） */
    messagesByConv: Record<string, ConversationMessage[]>
    loading: boolean
    error: string | null
    /** true = 后端 C1 接口可用（真模式）；false = 内存降级 */
    backendOk: boolean

    load: () => Promise<void>
    select: (id: string) => Promise<void>
    /** 新建并激活会话，返回新会话 id（失败返回 null） */
    create: () => Promise<string | null>
    remove: (id: string) => Promise<void>
    /** 乐观追加一条消息（不请求后端；C2 负责落库） */
    appendMessage: (convId: string, msg: ConversationMessage) => void
    /** 打字机追加：更新指定消息的 content（追加而非替换） */
    appendAiContent: (convId: string, msgId: string, content: string) => void
    clearError: () => void
}

/** 首条用户消息自动生成标题（后端 C1 无标题更新接口，展示层本地维护） */
const TITLE_FROM_MESSAGE_LEN = 20

function localId(prefix: string): string {
    localSeq += 1
    return `${LOCAL_ID_PREFIX}${prefix}-${Date.now()}-${localSeq}`
}

function makeLocalConversation(title: string): Conversation {
    const now = new Date().toISOString()
    return { id: localId('conv'), title, createdAt: now, updatedAt: now }
}

export const useConversationStore = create<ConversationState>((set, get) => ({
    conversations: [],
    activeId: null,
    messagesByConv: {},
    loading: false,
    error: null,
    backendOk: false,

    load: async () => {
        // 每次面板打开都尝试（真模式刷新列表；降级模式重试——后端恢复后自动切真模式，
        // 降级期间的本地会话会被后端列表覆盖，符合"降级数据不持久"约定）
        set({ loading: true, error: null })
        try {
            const conversations = await listConversations()
            set({ conversations, backendOk: true, loading: false })
        } catch (e) {
            // 后端不可用 → 静默降级内存模式（不弹错误，console 留痕）
            console.warn('会话接口不可用，降级为内存模式:', e)
            set({ backendOk: false, loading: false })
        }
    },

    select: async (id) => {
        const state = get()
        if (state.activeId === id) return
        set({ activeId: id })
        // 历史未缓存且后端可用 → 拉取；降级模式缓存即全量
        if (state.backendOk && !state.messagesByConv[id]) {
            try {
                const messages = await getConversationMessages(id)
                set((s) => ({ messagesByConv: { ...s.messagesByConv, [id]: messages } }))
            } catch (e) {
                console.warn('拉取会话历史失败:', e)
            }
        }
    },

    create: async () => {
        const { backendOk } = get()
        let conv: Conversation
        try {
            if (backendOk) {
                conv = await createConversation()
            } else {
                conv = makeLocalConversation('新对话')
            }
        } catch (e) {
            // 真模式下创建失败 → 降级为内存会话（保持 UI 可用）
            console.warn('创建会话失败，降级为内存会话:', e)
            conv = makeLocalConversation('新对话')
        }
        set((s) => ({
            conversations: [conv, ...s.conversations],
            activeId: conv.id,
            messagesByConv: { ...s.messagesByConv, [conv.id]: [] },
        }))
        return conv.id
    },

    remove: async (id) => {
        const { backendOk, conversations, activeId } = get()
        if (backendOk) {
            try {
                await deleteConversation(id)
            } catch (e) {
                console.warn('删除会话失败:', e)
                return
            }
        }
        const rest = conversations.filter((c) => c.id !== id)
        const nextActive =
            activeId === id ? (rest[0]?.id ?? null) : activeId
        set((s) => {
            const { [id]: _removed, ...others } = s.messagesByConv
            return {
                conversations: rest,
                activeId: nextActive,
                messagesByConv: others,
            }
        })
    },

    appendMessage: (convId, msg) => {
        set((s) => {
            const list = s.messagesByConv[convId] ?? []
            const nextList = [...list, msg]
            // 首条用户消息自动生成标题（前端展示层，后端无更新接口）
            let conversations = s.conversations
            if (msg.role === 'user' && msg.content.trim()) {
                const conv = conversations.find((c) => c.id === convId)
                if (conv && (!conv.title || conv.title === '新对话')) {
                    const title =
                        msg.content.trim().slice(0, TITLE_FROM_MESSAGE_LEN) +
                        (msg.content.trim().length > TITLE_FROM_MESSAGE_LEN ? '…' : '')
                    conversations = conversations.map((c) =>
                        c.id === convId ? { ...c, title } : c
                    )
                }
            }
            return {
                messagesByConv: { ...s.messagesByConv, [convId]: nextList },
                conversations,
            }
        })
    },

    appendAiContent: (convId, msgId, content) => {
        set((s) => {
            const list = s.messagesByConv[convId]
            if (!list) return s
            return {
                messagesByConv: {
                    ...s.messagesByConv,
                    [convId]: list.map((m) =>
                        m.id === msgId ? { ...m, content: m.content + content } : m
                    ),
                },
            }
        })
    },

    clearError: () => set({ error: null }),
}))
