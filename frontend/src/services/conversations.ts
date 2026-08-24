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
    // 后端列表返回 {entries: [...]}，字段已 camelCase（createdAt/updatedAt/messageCount）
    const data = await request<{ entries: Conversation[] }>(
        `${BASE_URL}/api/conversations`
    )
    return data.entries
}

export const createConversation = async (title?: string): Promise<Conversation> => {
    // 后端返回裸对象，但字段是 snake_case（created_at/updated_at）→ 归一化为前端形态
    const data = await request<Conversation & { created_at?: string; updated_at?: string }>(
        `${BASE_URL}/api/conversations`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(title ? { title } : {}),
        }
    )
    const now = new Date().toISOString()
    return {
        id: data.id,
        title: data.title ?? '',
        createdAt: data.createdAt ?? data.created_at ?? now,
        updatedAt: data.updatedAt ?? data.updated_at ?? now,
    }
}

export const deleteConversation = async (id: string): Promise<void> => {
    await request<{ ok: boolean }>(`${BASE_URL}/api/conversations/${id}`, {
        method: 'DELETE',
    })
}

/** 更新会话标题（C3 标题持久化；后端 strip 校验 + 幂等——title 未变不写盘） */
export const updateConversationTitle = async (id: string, title: string): Promise<void> => {
    await request<{ ok: boolean }>(`${BASE_URL}/api/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    })
}

export const getConversationMessages = async (
    id: string
): Promise<ConversationMessage[]> => {
    // 后端消息字段是 snake_case（created_at）→ 归一化
    const data = await request<{
        messages: (ConversationMessage & { created_at?: string })[]
    }>(`${BASE_URL}/api/conversations/${id}/messages`)
    return data.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt ?? m.created_at ?? '',
    }))
}
