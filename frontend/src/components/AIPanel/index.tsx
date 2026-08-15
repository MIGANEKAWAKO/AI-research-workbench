import { useNoteStore } from '@/store/useNoteStore'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, User, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fetchAiResponse, type AiTaskType } from '@/services/ai'

type Message = {
    id: string
    role: 'user' | 'ai'
    content: string
}

const AI_TASKS: { type: AiTaskType; label: string }[] = [
    { type: 'summarize', label: '总结' },
    { type: 'polish', label: '润色' },
    { type: 'continue', label: '续写' },
]

const TYPEWRITER_INTERVAL_MS = 24

const AIPanel = () => {
    const { activeNoteId, isAiPanelOpen } = useNoteStore()
    const aiPrefill = useNoteStore((state) => state.aiPrefill)
    const [input, setInput] = useState('')
    const [selectedTaskType, setSelectedTaskType] = useState<AiTaskType>('summarize')
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [typingMessageId, setTypingMessageId] = useState<string | null>(null)
    const messageIdRef = useRef(0)
    const activeAiMessageIdRef = useRef<string | null>(null)
    const isFetchingRef = useRef(false)
    const typewriterQueueRef = useRef<string[]>([])
    const typewriterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const createMessage = (role: Message['role'], content: string): Message => {
        messageIdRef.current += 1
        return {
            id: `${role}-${messageIdRef.current}`,
            role,
            content,
        }
    }

    const appendAiContent = useCallback((messageId: string, content: string) => {
        setMessages((prev) =>
            prev.map((msg) => (msg.id === messageId ? { ...msg, content: msg.content + content } : msg))
        )
    }, [])

    const stopTypewriter = useCallback(() => {
        if (typewriterTimerRef.current) {
            clearInterval(typewriterTimerRef.current)
            typewriterTimerRef.current = null
        }
    }, [])

    const startTypewriter = useCallback(() => {
        if (typewriterTimerRef.current) return

        typewriterTimerRef.current = setInterval(() => {
            const messageId = activeAiMessageIdRef.current
            const nextChar = typewriterQueueRef.current.shift()

            if (!messageId || !nextChar) {
                stopTypewriter()
                if (!isFetchingRef.current) {
                    setIsLoading(false)
                    activeAiMessageIdRef.current = null
                    setTypingMessageId(null)
                }
                return
            }

            appendAiContent(messageId, nextChar)
        }, TYPEWRITER_INTERVAL_MS)
    }, [appendAiContent, stopTypewriter])

    const enqueueTypewriterText = useCallback(
        (content: string) => {
            typewriterQueueRef.current.push(...Array.from(content))
            startTypewriter()
        },
        [startTypewriter]
    )

    useEffect(() => {
        return () => {
            stopTypewriter()
        }
    }, [stopTypewriter])

    // F5：划词「问 AI」→ 打开面板并把选中文本预填进输入框（消费后清空，避免重复填入）
    useEffect(() => {
        if (aiPrefill !== null) {
            setInput(aiPrefill)
            useNoteStore.getState().clearAiPrefill()
        }
    }, [aiPrefill])

    if (!isAiPanelOpen) return null

    const handleSend = async () => {
        const question = input.trim()
        if (!question || isLoading) return

        const userMsg = createMessage('user', question)
        const aiPlaceholder = createMessage('ai', '')
        const nextMessages = [...messages, userMsg, aiPlaceholder]

        setMessages(nextMessages)
        setInput('')
        setIsLoading(true)
        isFetchingRef.current = true
        activeAiMessageIdRef.current = aiPlaceholder.id
        setTypingMessageId(aiPlaceholder.id)
        typewriterQueueRef.current = []

        const apiMessages = [...messages, userMsg].map((msg) => ({
            role: msg.role === 'ai' ? 'assistant' : msg.role,
            content: msg.content,
        }))

        const taskType = selectedTaskType

        try {
            await fetchAiResponse(
                apiMessages,
                `activeNoteId:${String(activeNoteId ?? '')}`,
                taskType,
                question,
                enqueueTypewriterText
            )
        } catch (error) {
            console.error(error)
            typewriterQueueRef.current = []
            stopTypewriter()
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === aiPlaceholder.id && !msg.content
                        ? { ...msg, content: '请求失败，请稍后重试。' }
                        : msg
                )
            )
            activeAiMessageIdRef.current = null
            setTypingMessageId(null)
        } finally {
            isFetchingRef.current = false
            if (typewriterQueueRef.current.length === 0) {
                stopTypewriter()
                setIsLoading(false)
                activeAiMessageIdRef.current = null
                setTypingMessageId(null)
            } else {
                startTypewriter()
            }
        }
    }

    return (
        <div className='flex flex-col h-full bg-white'>
            <div className='p-4 border-b flex items-center justify-between bg-gray-50/50'>
                <h2 className='text-sm font-semibold flex items-center gap-2'>
                    <Bot className='w-4 h-4 text-purple-600' /> AI 助手
                </h2>
            </div>

            <ScrollArea className='flex-1 p-4'>
                <div className='space-y-4'>
                    {messages.length === 0 && (
                        <p className='text-center text-xs text-muted-foreground mt-10'>
                            你可以选中笔记内容粘贴到下方，或者直接向我提问。
                        </p>
                    )}
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div
                                className={`p-1 mt-1 rounded-full h-fit ${
                                    msg.role === 'user' ? 'bg-purple-100' : 'bg-gray-100'
                                }`}
                            >
                                {msg.role === 'user' ? (
                                    <User className='w-3 h-3' />
                                ) : (
                                    <Bot className='w-3 h-3 text-purple-600' />
                                )}
                            </div>
                            <div
                                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                                    msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-800'
                                }`}
                            >
                                {msg.content}
                                {msg.id === typingMessageId && msg.content && (
                                    <span className='ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-gray-500' />
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && !messages.at(-1)?.content && (
                        <div className='text-xs text-muted-foreground animate-pulse'>AI 正在思考中...</div>
                    )}
                </div>
            </ScrollArea>

            <div className='p-4 border-t'>
                <div className='mb-3 flex flex-wrap gap-2'>
                    {AI_TASKS.map((task) => (
                        <Button
                            key={task.type}
                            type='button'
                            size='sm'
                            variant={selectedTaskType === task.type ? 'default' : 'outline'}
                            onClick={() => setSelectedTaskType(task.type)}
                            disabled={isLoading}
                        >
                            {task.label}
                        </Button>
                    ))}
                </div>
                <div className='relative flex items-end gap-2'>
                    <textarea
                        rows={3}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                void handleSend()
                            }
                        }}
                        placeholder='输入内容并按 Enter 发送...'
                        className='w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                    />
                    <Button
                        size='icon'
                        className='rounded-full h-8 w-8 shrink-0 mb-1'
                        onClick={() => {
                            void handleSend()
                        }}
                        disabled={isLoading || !input.trim()}
                    >
                        <Send className='h-4 w-4' />
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default AIPanel
