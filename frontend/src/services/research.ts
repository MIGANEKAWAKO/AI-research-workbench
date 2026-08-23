import type { ResearchEvent } from '@/types/research'

/**
 * A6：发起研究任务（POST /api/research/tasks，SSE 事件流）。
 * 解析模式与 ai.ts 相同（fetch + ReadableStream + \n\n 切帧 + data: 行提取），
 * 差异：按事件 type 分发（onEvent 一次一个事件对象）；错误也走 task.error 事件，
 * 解析器不需要 HTTP 分支。
 */
export const fetchResearchTask = async (
  body: {
    question: string
    enableWeb: boolean
    scope?: { doc_id?: string; collection_id?: string }
    conversationId?: string // M2 C2：研究任务答案存入会话
  },
  onEvent: (event: ResearchEvent) => void
) => {
  const payload: Record<string, unknown> = {
    question: body.question,
    enableWeb: body.enableWeb,
  }
  if (body.scope) payload.scope = body.scope
  if (body.conversationId) payload.conversation_id = body.conversationId

  const response = await fetch('http://localhost:3001/api/research/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error('Research task failed')
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is empty')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  const emitEvent = (payload: string) => {
    const data = payload.trim()
    if (!data) return
    try {
      const parsed = JSON.parse(data)
      if (parsed && typeof parsed.type === 'string') {
        onEvent(parsed as ResearchEvent)
      }
    } catch {
      // 忽略非 JSON 帧（SSE 心跳注释行等）
    }
  }

  const processBuffer = (flush = false) => {
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

      emitEvent(payload)
      boundaryIndex = buffer.indexOf('\n\n')
    }

    if (flush && buffer.trim()) {
      const payload = buffer
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, ''))
        .join('\n')

      emitEvent(payload || buffer)
      buffer = ''
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    processBuffer(false)
  }

  const tail = decoder.decode()
  if (tail) {
    buffer += tail
  }
  processBuffer(true)
}
