export type AiTaskType = 'summarize' | 'polish' | 'continue'

export const fetchAiResponse = async (
  messages: { role: string; content: string }[],
  noteContext: string,
  taskType: AiTaskType,
  text: string,
  onChunk: (content: string) => void
) => {
  const response = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, noteContext, taskType, text }),
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
