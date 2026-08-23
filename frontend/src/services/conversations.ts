import type { Conversation, ConversationMessage } from '@/types'

/**
 * 会话 API 封装（M2 C3，约定接口见 PRD 10.2 C1，联调对齐）：
 * - GET /api/conversations → 会话列表
 * - POST /api/conversations → 新建（body {title?}）
 * - DELETE /api/conversations/{id} → 删除
 * - GET /api/conversations/{id}/messages → 会话历史
 * 与 literature.ts 同款错误约定：非 2xx → throw Error(后端 detail)。
 */

const BASE_URL = 'http://localhost:3001'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init)
    if (!response.ok) {
        let detail = `请求失败（${response.status}）`
        try {
            const data = await response.json()
            if (typeof data?.detail === 'string') detail = data.detail
        } catch {
            // 响应体不是 JSON 时保留默认信息
        }
        throw new Error(detail)
    }
    return response.json() as Promise<T>
}

export const listConversations = async (): Promise<Conversation[]> => {
    const data = await request<{ conversations: Conversation[] }>(
        `${BASE_URL}/api/conversations`
    )
    return data.conversations
}

export const createConversation = async (title?: string): Promise<Conversation> => {
    // 兼容后端两种返回形态：裸对象 或 {conversation: ...}（联调对齐）
    const data = await request<Conversation | { conversation: Conversation }>(
        `${BASE_URL}/api/conversations`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(title ? { title } : {}),
        }
    )
    if (data && typeof data === 'object' && 'conversation' in data) {
        return (data as { conversation: Conversation }).conversation
    }
    return data as Conversation
}

export const deleteConversation = async (id: string): Promise<void> => {
    await request<{ ok: boolean }>(`${BASE_URL}/api/conversations/${id}`, {
        method: 'DELETE',
    })
}

export const getConversationMessages = async (
    id: string
): Promise<ConversationMessage[]> => {
    const data = await request<{ messages: ConversationMessage[] }>(
        `${BASE_URL}/api/conversations/${id}/messages`
    )
    return data.messages
}
