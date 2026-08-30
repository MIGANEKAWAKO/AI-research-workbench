export type AiTaskType = 'summarize' | 'polish' | 'continue'

import { apiFetch } from './api'

/**
 * F7：调 /api/chat（B7 起对话模式自动做 RAG 检索注入）。
 * - taskType 有值 → 任务模式（处理 text，无 RAG）
 * - taskType 为空 → 对话模式（RAG 全局检索；docId 非空时单篇限定，B7 协议）
 * SSE 解析逻辑不变。
 */
export const fetchAiResponse = async (
  messages: { role: string; content: string }[],
  noteContext: string,
  taskType: AiTaskType | undefined,
  text: string,
  onChunk: (content: string) => void,
  docId?: string,
  conversationId?: string // M2 C2：会话记忆——历史注入上下文 + 新消息落库
) => {
  const body: Record<string, unknown> = { messages, noteContext }
  if (taskType && text.trim()) {
    body.taskType = taskType
    body.text = text
  }
  if (docId) body.docId = docId
  // M2 C2 联调对齐：后端解析 camelCase conversationId
  if (conversationId) body.conversationId = conversationId

  const response = await apiFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error('AI response failed')
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is empty')
  }

  const decoder = new TextDecoder()
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  const isNdjson = contentType.includes('application/x-ndjson')
  const isSse = contentType.includes('text/event-stream')
  let buffer = ''

  const emitPayload = (payload: string) => {
    const data = payload.trim()
    if (!data || data === '[DONE]') return

    try {
      const parsed = JSON.parse(data)
      const content =
        parsed?.content ??
        parsed?.delta ??
        parsed?.text ??
        parsed?.choices?.[0]?.delta?.content ??
        parsed?.choices?.[0]?.text

      if (typeof content === 'string' && content.length > 0) {
        onChunk(content)
      }

      if (typeof parsed?.error === 'string' && parsed.error.length > 0) {
        onChunk(parsed.error)
      }
      return
    } catch {
      onChunk(data)
    }
  }

  const processSseBuffer = (flush = false) => {
    buffer = buffer.replace(/\r\n/g, '\n')
    let boundaryIndex = buffer.indexOf('\n\n')

    while (boundaryIndex !== -1) {
      const rawEvent = buffer.slice(0, boundaryIndex)
      buffer = buffer.slice(boundaryIndex + 2)

      const payload = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, ''))
        .join('\n')

      emitPayload(payload)
      boundaryIndex = buffer.indexOf('\n\n')
    }

    if (flush && buffer.trim()) {
      const payload = buffer
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, ''))
        .join('\n')

      emitPayload(payload || buffer)
      buffer = ''
    }
  }

  const processLineBuffer = (flush = false) => {
    const lines = buffer.split(/\r?\n/)
    const remainder = flush ? '' : lines.pop() || ''

    for (const line of lines) {
      emitPayload(line)
    }

    if (flush && remainder.trim()) {
      emitPayload(remainder)
    }

    buffer = remainder
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })

    if (isSse || chunk.includes('data:')) {
      buffer += chunk
      processSseBuffer(false)
      continue
    }

    if (isNdjson) {
      buffer += chunk
      processLineBuffer(false)
      continue
    }

    onChunk(chunk)
  }

  const tail = decoder.decode()
  if (tail) {
    buffer += tail
  }

  if (isSse || buffer.includes('data:')) {
    processSseBuffer(true)
  } else if (isNdjson) {
    processLineBuffer(true)
  } else if (buffer) {
    onChunk(buffer)
  }
}
