import { useNoteStore, type AiAskType } from '@/store/useNoteStore'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { useDataStore } from '@/store/useDataStore'
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

// F7：划词提问的指令模板（对话模式发送，带 docId 限定当前文献）
// 结尾不加冒号：消费时动态拼出处信息（文献标题 + 页码），见 aiTask effect
const ASK_INSTRUCTIONS: Record<AiAskType, string> = {
    explain: '请用中文解释以下论文片段，说明其核心含义与研究背景',
    translate: '请将以下论文片段翻译成中文',
    summarize: '请用要点总结以下论文片段的核心内容',
}

const TYPEWRITER_INTERVAL_MS = 24

const AIPanel = () => {
    const { activeNoteId, isAiPanelOpen } = useNoteStore()
    const aiTask = useNoteStore((state) => state.aiTask)
    const notes = useDataStore((state) => state.notes)
    const readerId = useLiteratureStore((state) => state.readerId)
    const entries = useLiteratureStore((state) => state.entries)

    const [input, setInput] = useState('')
    // F7：null = 对话问答模式（RAG）；选中任务按钮 = 任务模式（处理文本）
    const [selectedTaskType, setSelectedTaskType] = useState<AiTaskType | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [typingMessageId, setTypingMessageId] = useState<string | null>(null)
    const messageIdRef = useRef(0)
    const activeAiMessageIdRef = useRef<string | null>(null)
    const isFetchingRef = useRef(false)
    const typewriterQueueRef = useRef<string[]>([])
    const typewriterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // F7：单篇问答的上下文 = 正在阅读的文献（B7 协议 docId）
    const readerEntry = entries.find((e) => e.id === readerId) ?? null

    const createMessage = useCallback((role: Message['role'], content: string): Message => {
        messageIdRef.current += 1
        return {
            id: `${role}-${messageIdRef.current}`,
            role,
            content,
        }
    }, [])

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

    /**
     * F7：发送一条消息。
     * taskType 有值 → 任务模式（后端处理 text）；为空 → 对话模式（B7 RAG，
     * docId = 正在阅读的文献 id 时单篇限定，否则全局）。
     */
    const sendMessage = useCallback(
        async (content: string, taskType?: AiTaskType) => {
            const question = content.trim()
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

            // 单篇限定 = 正在阅读的文献（readerId）；无阅读器 = 全局 RAG
            const docId = readerId ?? undefined
            // noteContext：activeNoteId 占位改为当前笔记标题（后端注入 system prompt）
            const noteContext =
                activeNoteId !== undefined
                    ? `当前笔记：${notes.find((n) => n.id === activeNoteId)?.title ?? ''}`
                    : ''

            try {
                await fetchAiResponse(
                    apiMessages,
                    noteContext,
                    taskType,
                    question,
                    enqueueTypewriterText,
                    docId
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
        },
        [
            messages,
            isLoading,
            activeNoteId,
            notes,
            readerId,
            createMessage,
            enqueueTypewriterText,
            stopTypewriter,
            startTypewriter,
        ]
    )

    const handleSend = useCallback(() => {
        void sendMessage(input, selectedTaskType ?? undefined)
    }, [input, selectedTaskType, sendMessage])

    // F7：划词提问（解释/翻译/总结）→ 打开面板（prefillAiTask 已开）+ 自动发送对话模式消息
    // bugfix：带出处信息（文献标题 + 页码），AI 回答的来源标注与划词页码一致
    useEffect(() => {
        if (!aiTask) return
        const instruction = ASK_INSTRUCTIONS[aiTask.type]
        const origin =
            aiTask.docTitle && aiTask.pageNumber
                ? `（出自《${aiTask.docTitle}》第 ${aiTask.pageNumber} 页）`
                : ''
        void sendMessage(`${instruction}${origin}：\n\n${aiTask.text}`)
        useNoteStore.getState().clearAiTask()
    }, [aiTask, sendMessage])

    if (!isAiPanelOpen) return null

    return (
        <div className='flex flex-col h-full bg-white'>
            <div className='p-4 border-b flex items-center justify-between bg-gray-50/50'>
                <h2 className='text-sm font-semibold flex items-center gap-2'>
                    <Bot className='w-4 h-4 text-purple-600' /> AI 助手
                </h2>
            </div>

            {/* F7：问答范围指示条（单篇 = 正在阅读的文献；否则全局） */}
            <div
                className={`px-4 py-1.5 text-xs border-b ${
                    readerEntry
                        ? 'bg-amber-50 text-amber-700 border-amber-100'
                        : 'bg-gray-50 text-gray-500'
                }`}
            >
                {readerEntry ? (
                    <>
                        单篇问答：<span className='font-medium'>{readerEntry.title}</span>
                        （回答仅基于该文献）
                    </>
                ) : (
                    '全局问答：检索笔记 + 文献库'
                )}
            </div>

            <ScrollArea className='flex-1 p-4'>
                <div className='space-y-4'>
                    {messages.length === 0 && (
                        <p className='text-center text-xs text-muted-foreground mt-10'>
                            对话问答会检索你的知识库；在阅读器中提问则限定当前文献。
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
                <div className='mb-3 flex flex-wrap items-center gap-2'>
                    {AI_TASKS.map((task) => (
                        <Button
                            key={task.type}
                            type='button'
                            size='sm'
                            variant={selectedTaskType === task.type ? 'default' : 'outline'}
                            onClick={() =>
                                setSelectedTaskType((prev) => (prev === task.type ? null : task.type))
                            }
                            disabled={isLoading}
                        >
                            {task.label}
                        </Button>
                    ))}
                    <span className='text-xs text-muted-foreground'>
                        {selectedTaskType ? '任务模式（处理输入文本）' : '对话问答（RAG 检索）'}
                    </span>
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
                        placeholder='输入问题并按 Enter 发送；或先选任务按钮处理文本...'
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
