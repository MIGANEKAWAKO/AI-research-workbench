import { useNoteStore } from '@/store/useNoteStore'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { useDataStore } from '@/store/useDataStore'
import { useConversationStore } from '@/store/useConversationStore'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Globe, MessageSquare, Plus, Send, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fetchAiResponse, type AiTaskType } from '@/services/ai'
import { ASK_INSTRUCTIONS } from '@/lib/ai-instructions'
import ReactMarkdown from 'react-markdown'
import { fetchResearchTask } from '@/services/research'
import ResearchTaskView from './ResearchTaskView'
import { AiEmptyState } from './ai-empty-state'
import type { ResearchEvent, ResearchTaskState } from '@/types/research'
import { cn } from '@/lib/utils'

type Message = {
    id: string
    // M2 C3：role 对齐后端持久形态（user/assistant），渲染层统一判断
    role: 'user' | 'assistant'
    content: string
    createdAt: string
}

const AI_TASKS: { type: AiTaskType; label: string }[] = [
    { type: 'summarize', label: '总结' },
    { type: 'polish', label: '润色' },
    { type: 'continue', label: '续写' },
]

// UI 重构：设计稿快捷指令 chips（已按用户要求清除，无实际功能）
const TYPEWRITER_INTERVAL_MS = 24

const AIPanel = () => {
    const { activeNoteId, isAiPanelOpen } = useNoteStore()
    const toggleAiPanel = useNoteStore((state) => state.toggleAiPanel)
    const aiTask = useNoteStore((state) => state.aiTask)
    const notes = useDataStore((state) => state.notes)
    const readerId = useLiteratureStore((state) => state.readerId)
    const entries = useLiteratureStore((state) => state.entries)

    const [input, setInput] = useState('')
    // F7：null = 对话问答模式（RAG）；选中任务按钮 = 任务模式（处理文本）
    const [selectedTaskType, setSelectedTaskType] = useState<AiTaskType | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [typingMessageId, setTypingMessageId] = useState<string | null>(null)
    const messageIdRef = useRef(0)
    const activeAiMessageIdRef = useRef<string | null>(null)
    const isFetchingRef = useRef(false)
    const typewriterQueueRef = useRef<string[]>([])
    const typewriterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // M2 C3：会话数据源——消息按当前会话渲染；发送/回答/研究答案乐观追加到当前会话
    // 注意：selector 只返回 store 内的稳定引用（数组或 undefined），空数组兜底放组件层——
    // 若在 selector 里 ?? []，activeId 无效时会话缓存为空时每次返回新数组，
    // useSyncExternalStore 认为快照恒变 → 无限循环白屏（React 19 报 getSnapshot 未缓存）。
    const conversations = useConversationStore((s) => s.conversations)
    const activeConvId = useConversationStore((s) => s.activeId)
    const rawMessages = useConversationStore((s) => s.messagesByConv[s.activeId ?? ''])
    const messages = rawMessages ?? []
    const loadConversations = useConversationStore((s) => s.load)
    const selectConversation = useConversationStore((s) => s.select)
    const createConversation = useConversationStore((s) => s.create)
    const removeConversation = useConversationStore((s) => s.remove)
    const appendMessage = useConversationStore((s) => s.appendMessage)
    const appendAiContent = useConversationStore((s) => s.appendAiContent)

    // M2 C3：面板打开时确保有可用会话（首次拉取列表；无会话则自动新建）
    // P6 优化：已有"未开始的空对话"（默认标题 + 0 消息）时直接进入，不再新建——
    // 否则每次打开应用都会堆积空"新对话"；全部会话都有内容才新建。
    useEffect(() => {
        if (!isAiPanelOpen) return
        void (async () => {
            await loadConversations()
            const { activeId, conversations, messagesByConv } =
                useConversationStore.getState()
            if (activeId) return
            const idle = conversations.find((c) => {
                // 默认标题（新对话/空）且无消息 = 未开始的空对话，可复用
                if (c.title && c.title !== '新对话') return false
                const localMsgs = messagesByConv[c.id]
                if (localMsgs && localMsgs.length > 0) return false
                if (typeof c.messageCount === 'number' && c.messageCount > 0) return false
                return true
            })
            if (idle) {
                await selectConversation(idle.id)
                return
            }
            await createConversation()
        })()
    }, [isAiPanelOpen, loadConversations, selectConversation, createConversation])

    // A6：研究任务模式（与任务模式互斥；过程进 ResearchTaskView，答案进消息流）
    const [researchMode, setResearchMode] = useState(false)
    const [enableWeb, setEnableWeb] = useState(false)
    const [researchRunning, setResearchRunning] = useState(false)
    const [researchState, setResearchState] = useState<ResearchTaskState | null>(null)
    const researchAnswerRef = useRef('')

    // F7：单篇问答的上下文 = 正在阅读的文献（B7 协议 docId）
    const readerEntry = entries.find((e) => e.id === readerId) ?? null

    const createMessage = useCallback((role: Message['role'], content: string): Message => {
        messageIdRef.current += 1
        return {
            id: `${role}-${messageIdRef.current}`,
            role,
            content,
            createdAt: new Date().toISOString(),
        }
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

            // M2 C3：打字机追加写入当前会话（发送后 activeId 不变；切会话会先停打字机）
            appendAiContent(useConversationStore.getState().activeId ?? '', messageId, nextChar)
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
     * M2 C3：消息乐观追加到当前会话；请求带 conversation_id（历史注入 + 落库）。
     */
    const sendMessage = useCallback(
        async (content: string, taskType?: AiTaskType) => {
            const question = content.trim()
            const convId = useConversationStore.getState().activeId
            if (!question || isLoading || !convId) return

            const userMsg = createMessage('user', question)
            const aiPlaceholder = createMessage('assistant', '')
            appendMessage(convId, userMsg)
            appendMessage(convId, aiPlaceholder)
            setInput('')
            setIsLoading(true)
            isFetchingRef.current = true
            activeAiMessageIdRef.current = aiPlaceholder.id
            setTypingMessageId(aiPlaceholder.id)
            typewriterQueueRef.current = []

            // 发送给后端的消息：真模式只发本轮（历史由后端 C2 滑动窗口注入，
            // 前端再发全量会与 history 重复）；降级模式发全量（前端携带历史兜底）。
            const convStore = useConversationStore.getState()
            const apiMessages = convStore.backendOk
                ? [{ role: 'user' as const, content: question }]
                : convStore.messagesByConv[convId].map((msg) => ({
                      role: msg.role === 'assistant' ? 'assistant' : 'user',
                      content: msg.content,
                  }))

            // 单篇限定 = 正在阅读的文献（readerId）；无阅读器 = 全局 RAG
            const docId = readerId ?? undefined
            // C1（P6 验收）：单篇文献问答时注入"当前笔记"会干扰模型（回答出现
            // "根据您提供的笔记内容"——笔记上下文与文献问答无关）；全局问答保留标题
            const noteContext =
                docId === undefined && activeNoteId !== undefined
                    ? `当前笔记：${notes.find((n) => n.id === activeNoteId)?.title ?? ''}`
                    : ''

            try {
                await fetchAiResponse(
                    apiMessages,
                    noteContext,
                    taskType,
                    question,
                    enqueueTypewriterText,
                    docId,
                    convId
                )
            } catch (error) {
                console.error(error)
                typewriterQueueRef.current = []
                stopTypewriter()
                // 占位为空 → 直接写入错误文本（追加语义，空串追加等于替换）
                appendAiContent(convId, aiPlaceholder.id, '请求失败，请稍后重试。')
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
            isLoading,
            activeNoteId,
            notes,
            readerId,
            createMessage,
            appendMessage,
            appendAiContent,
            enqueueTypewriterText,
            stopTypewriter,
            startTypewriter,
        ]
    )

    /** A6：researchState 补丁（s 可能为 null——首个事件到达前 state 未初始化）。 */
    const patchResearchState = useCallback(
        (patch: (s: ResearchTaskState) => ResearchTaskState) => {
            setResearchState((prev) =>
                patch(prev ?? { taskId: '', status: 'created', steps: [], error: null })
            )
        },
        []
    )

    /**
     * A6：研究任务 SSE 事件分发 → researchState 更新。
     * 答案不在这里展示：answer.delta 只累积，task.completed 时进消息流（打字机）。
     */
    const handleResearchEvent = useCallback(
        (ev: ResearchEvent) => {
            switch (ev.type) {
                case 'task.created':
                    patchResearchState((s) => ({ ...s, taskId: ev.task_id, status: 'created' }))
                    break
                case 'plan.created':
                    patchResearchState((s) => ({
                        ...s,
                        status: 'planning',
                        steps: ev.steps.map((st) => ({
                            id: st.id,
                            title: st.title,
                            status: 'pending' as const,
                            toolCalls: [],
                        })),
                    }))
                    break
                case 'step.started':
                    patchResearchState((s) => ({
                        ...s,
                        status: 'executing',
                        steps: s.steps.map((st) =>
                            st.id === ev.step_id ? { ...st, status: 'running' as const } : st
                        ),
                    }))
                    break
                case 'tool.call':
                    patchResearchState((s) => ({
                        ...s,
                        steps: s.steps.map((st) =>
                            st.id === ev.step_id
                                ? { ...st, toolCalls: [...st.toolCalls, { tool: ev.tool, ok: null }] }
                                : st
                        ),
                    }))
                    break
                case 'tool.result':
                    patchResearchState((s) => ({
                        ...s,
                        steps: s.steps.map((st) => {
                            if (st.id !== ev.step_id) return st
                            // 补齐该步骤内第一个尚未出结果的同工具调用（按顺序对应）
                            const targetIdx = st.toolCalls.findIndex(
                                (tc) => tc.tool === ev.tool && tc.ok === null
                            )
                            return {
                                ...st,
                                toolCalls: st.toolCalls.map((tc, idx) =>
                                    idx === targetIdx ? { ...tc, ok: ev.ok, error: ev.error ?? null } : tc
                                ),
                            }
                        }),
                    }))
                    break
                case 'step.completed':
                    patchResearchState((s) => ({
                        ...s,
                        steps: s.steps.map((st) =>
                            st.id === ev.step_id ? { ...st, status: 'completed' as const } : st
                        ),
                    }))
                    break
                case 'answer.delta':
                    researchAnswerRef.current += ev.content
                    patchResearchState((s) => ({ ...s, status: 'synthesizing' }))
                    break
                case 'task.completed':
                    patchResearchState((s) => ({ ...s, status: 'completed' }))
                    // 答案进消息流：复用现有气泡 + 打字机（M2 C3：写入当前会话）
                    const answer = researchAnswerRef.current
                    const convId = useConversationStore.getState().activeId
                    if (answer && convId) {
                        const aiMsg = createMessage('assistant', '')
                        appendMessage(convId, aiMsg)
                        activeAiMessageIdRef.current = aiMsg.id
                        setTypingMessageId(aiMsg.id)
                        typewriterQueueRef.current = []
                        enqueueTypewriterText(answer)
                    }
                    break
                case 'task.error':
                    patchResearchState((s) => ({
                        ...s,
                        status: 'failed',
                        error: { code: ev.code, message: ev.message, recoverable: ev.recoverable },
                    }))
                    break
            }
        },
        [patchResearchState, createMessage, enqueueTypewriterText]
    )

    /**
     * A6：发起研究任务（研究模式专用）。
     * scope：阅读器打开时单篇限定（与对话模式同语义，docId = readerId）。
     */
    const sendResearchTask = useCallback(
        async (content: string) => {
            const question = content.trim()
            const convId = useConversationStore.getState().activeId
            if (!question || isLoading || researchRunning || !convId) return

            const userMsg = createMessage('user', question)
            appendMessage(convId, userMsg)
            setInput('')
            setResearchRunning(true)
            setResearchState({ taskId: '', status: 'created', steps: [], error: null })
            researchAnswerRef.current = ''

            const scope = readerId ? { doc_id: readerId } : undefined

            try {
                await fetchResearchTask(
                    { question, enableWeb, scope, conversationId: convId },
                    handleResearchEvent
                )
            } catch (error) {
                console.error(error)
                patchResearchState((s) => ({
                    ...s,
                    status: 'failed',
                    error: { code: 'NETWORK', message: '任务中断：后端不可用，请稍后重试。', recoverable: true },
                }))
            } finally {
                setResearchRunning(false)
            }
        },
        [isLoading, researchRunning, readerId, enableWeb, createMessage, appendMessage, handleResearchEvent, patchResearchState]
    )

    const handleSend = useCallback(() => {
        if (researchMode) {
            void sendResearchTask(input)
        } else {
            void sendMessage(input, selectedTaskType ?? undefined)
        }
    }, [researchMode, input, selectedTaskType, sendMessage, sendResearchTask])

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

    // M2 C3：切换会话 → 清理进行中的打字机/请求状态/研究任务视图。
    // 在途请求不受影响（发送时已捕获旧 convId，结果仍写入旧会话，数据不串）。
    useEffect(() => {
        stopTypewriter()
        typewriterQueueRef.current = []
        isFetchingRef.current = false
        activeAiMessageIdRef.current = null
        setIsLoading(false)
        setTypingMessageId(null)
        setResearchState(null)
        researchAnswerRef.current = ''
    }, [activeConvId, stopTypewriter])

    if (!isAiPanelOpen) return null

    return (
        <div className='flex h-full flex-col bg-card'>
            {/* 头部（设计稿 ai-header：渐变 logo + 标题/在线 + 折叠按钮） */}
            <div className='flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-4'>
                <div
                    className='grid size-7 shrink-0 place-items-center rounded-lg text-white'
                    style={{ background: 'linear-gradient(135deg, var(--primary), #7AA8FF)' }}
                >
                    <ShieldCheck className='size-4' strokeWidth={1.8} />
                </div>
                <div className='min-w-0'>
                    <div className='text-sm font-bold'>AI 助手</div>
                    <div className='flex items-center gap-1.5 text-[11px] text-success'>
                        <span className='size-1.5 rounded-full bg-success' />
                        在线
                    </div>
                </div>
                <button
                    onClick={toggleAiPanel}
                    title='折叠'
                    className='ml-auto grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground'
                >
                    <ChevronRight className='size-4' />
                </button>
            </div>

            {/* M2 C3：会话栏——当前会话切换（下拉）+ 新建（研究任务运行中禁用） */}
            <div className='flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-1.5'>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className='flex h-7 max-w-[240px] items-center gap-1 rounded-md border border-border bg-background px-2 text-xs text-foreground transition-colors hover:border-muted-foreground/50'
                            title='切换会话'
                        >
                            <MessageSquare className='size-3 shrink-0 text-muted-foreground' />
                            <span className='truncate'>
                                {conversations.find((c) => c.id === activeConvId)?.title ?? '新对话'}
                            </span>
                            <ChevronDown className='size-3 shrink-0 text-muted-foreground' />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='start' className='w-60 p-1'>
                        {conversations.length === 0 && (
                            <div className='px-2 py-3 text-center text-xs text-muted-foreground'>
                                暂无会话
                            </div>
                        )}
                        {conversations.map((conv) => (
                            <DropdownMenuItem
                                key={conv.id}
                                onClick={() => void selectConversation(conv.id)}
                                disabled={researchRunning}
                                className={cn(
                                    'cursor-pointer',
                                    conv.id === activeConvId && 'bg-primary/10 text-primary'
                                )}
                            >
                                <span className='min-w-0 flex-1 truncate'>{conv.title}</span>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        void removeConversation(conv.id)
                                    }}
                                    title='删除会话'
                                    className='grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-destructive'
                                >
                                    <X className='size-3' />
                                </button>
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => void createConversation()}
                            disabled={researchRunning}
                            className='cursor-pointer'
                        >
                            <Plus className='size-3.5 text-muted-foreground' />
                            新建会话
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <button
                    onClick={() => void createConversation()}
                    disabled={researchRunning}
                    title='新建会话'
                    className='grid size-7 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground disabled:opacity-40'
                >
                    <Plus className='size-3.5' />
                </button>
            </div>

            {/* F7：问答范围指示条（单篇 = 正在阅读的文献；否则全局） */}
            <div
                className={cn(
                    'shrink-0 border-b px-4 py-1.5 text-xs',
                    readerEntry
                        ? 'border-warning/20 bg-warning/10 text-warning'
                        : 'border-border bg-background text-muted-foreground'
                )}
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

            {/* 消息区（设计稿 ai-messages：who 方块 + 气泡）
                min-h-0：flex 子项收缩（消息再多也不撑破，输入区固定在底部） */}
            <ScrollArea className='min-h-0 flex-1'>
                {/* min-h-full：内容少时占满视口高度，让空状态 margin:auto 垂直居中 */}
                <div className='flex min-h-full flex-col gap-3.5 p-4'>
                    {/* A6：研究任务进度区（过程展示；答案进消息流） */}
                    {researchMode && researchState && <ResearchTaskView state={researchState} />}
                    {/* 空状态：新建对话且未发送任何消息时展示（设计稿 aiEmpty 移植）；
                        研究任务进行中（researchState 非空）时让位给进度视图 */}
                    {messages.length === 0 && !researchState && <AiEmptyState />}
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div
                                className={cn(
                                    'grid size-[26px] shrink-0 place-items-center rounded-lg text-xs font-bold text-white',
                                    msg.role === 'user'
                                        ? 'bg-primary'
                                        : 'bg-gradient-to-br from-primary to-[#7AA8FF]'
                                )}
                            >
                                {msg.role === 'user' ? '我' : 'AI'}
                            </div>
                            {/* 消息气泡：ReactMarkdown 渲染（AI 回答含加粗/列表/代码块等格式） */}
                            <div
                                className={cn(
                                    'max-w-[85%] rounded-xl px-3 py-2.5 text-[13.5px] leading-relaxed break-words',
                                    msg.role === 'user'
                                        ? 'rounded-tr-[3px] bg-primary text-primary-foreground'
                                        : 'rounded-tl-[3px] bg-muted text-foreground'
                                )}
                            >
                                <ReactMarkdown
                                    components={{
                                        p: ({ children }) => (
                                            <p className='mb-1.5 last:mb-0'>{children}</p>
                                        ),
                                        strong: ({ children }) => (
                                            <strong className='font-semibold'>{children}</strong>
                                        ),
                                        em: ({ children }) => <em>{children}</em>,
                                        a: ({ children, href }) => (
                                            <a
                                                href={href}
                                                target='_blank'
                                                rel='noreferrer'
                                                className='underline underline-offset-2 opacity-80 hover:opacity-100'
                                            >
                                                {children}
                                            </a>
                                        ),
                                        ul: ({ children }) => (
                                            <ul className='mb-1.5 list-disc space-y-0.5 pl-4 last:mb-0'>
                                                {children}
                                            </ul>
                                        ),
                                        ol: ({ children }) => (
                                            <ol className='mb-1.5 list-decimal space-y-0.5 pl-4 last:mb-0'>
                                                {children}
                                            </ol>
                                        ),
                                        li: ({ children }) => <li>{children}</li>,
                                        // 块级代码：语言类名存在（pre > code.language-*）
                                        // bg-foreground/10：跟随主题（原 bg-black/10 深色主题下不可见）
                                        code: ({ className, children }) =>
                                            className ? (
                                                <code
                                                    className={cn(
                                                        'block overflow-x-auto rounded-md bg-foreground/10 p-2 font-mono text-[12.5px]',
                                                        className
                                                    )}
                                                >
                                                    {children}
                                                </code>
                                            ) : (
                                                <code className='rounded bg-foreground/10 px-1 py-0.5 font-mono text-[12px]'>
                                                    {children}
                                                </code>
                                            ),
                                        pre: ({ children }) => (
                                            <pre className='my-1.5 rounded-md bg-foreground/10 p-2 last:mb-0'>
                                                {children}
                                            </pre>
                                        ),
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>
                                {msg.id === typingMessageId && msg.content && (
                                    <span className='ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-foreground/60' />
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && !messages.at(-1)?.content && (
                        <div className='text-xs text-muted-foreground animate-pulse'>AI 正在思考中...</div>
                    )}
                </div>
            </ScrollArea>

            {/* 输入区（设计稿 ai-input：任务按钮 + 快捷 chips + box） */}
            <div className='flex shrink-0 flex-col gap-2 border-t border-border p-3'>
                {/* 模式按钮：任务模式（总结/润色/续写）与研究任务互斥 */}
                <div className='flex flex-wrap items-center gap-1.5'>
                    {!researchMode &&
                        AI_TASKS.map((task) => (
                            <Button
                                key={task.type}
                                type='button'
                                size='sm'
                                variant={selectedTaskType === task.type ? 'default' : 'outline'}
                                onClick={() => {
                                    setResearchMode(false)
                                    setSelectedTaskType((prev) => (prev === task.type ? null : task.type))
                                }}
                                disabled={isLoading || researchRunning}
                                className='h-7 px-2.5 text-xs'
                            >
                                {task.label}
                            </Button>
                        ))}
                    <Button
                        type='button'
                        size='sm'
                        variant={researchMode ? 'default' : 'outline'}
                        onClick={() => {
                            setResearchMode((prev) => !prev)
                            setSelectedTaskType(null)
                        }}
                        disabled={isLoading || researchRunning}
                        className='h-7 px-2.5 text-xs'
                    >
                        研究任务
                    </Button>
                    {researchMode && (
                        <button
                            type='button'
                            onClick={() => setEnableWeb((prev) => !prev)}
                            disabled={researchRunning}
                            className={`flex h-7 items-center gap-1 rounded-lg border px-2.5 text-xs transition-colors ${
                                enableWeb
                                    ? 'border-primary/50 bg-primary/10 text-primary'
                                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Globe className='size-3' />
                            联网 {enableWeb ? '开' : '关'}
                        </button>
                    )}
                    <span className='text-[11px] text-muted-foreground'>
                        {researchMode
                            ? '研究任务（Agent 多步执行）'
                            : selectedTaskType
                              ? '任务模式（处理输入文本）'
                              : '对话问答（RAG 检索）'}
                    </span>
                </div>

                {/* 输入框（设计稿 box：textarea + 蓝色发送按钮） */}
                <div className='flex items-end gap-2 rounded-[10px] border border-border bg-background p-2.5'>
                    <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                void handleSend()
                            }
                        }}
                        placeholder='向知微提问，或输入 / 调用指令…'
                        className='max-h-[120px] flex-1 resize-none bg-transparent text-[13.5px] leading-relaxed outline-none placeholder:text-muted-foreground/60'
                    />
                    <button
                        onClick={() => {
                            void handleSend()
                        }}
                        disabled={isLoading || researchRunning || !input.trim()}
                        title='发送'
                        /* 设计稿 .send-btn：32×32 / 圆角 8px / 纯色 var(--blue) 底 + 白色图标 /
                           hover filter brightness(1.07)（静态稿原值，非 Tailwind 默认 1.1）。
                           无 disabled 视觉变化：去掉 opacity 后按钮始终呈现设计稿纯蓝色
                           （原 disabled:opacity-40 会让空输入时按钮发灰） */
                        className='grid size-8 shrink-0 place-items-center rounded-[8px] bg-primary text-white transition-[filter] hover:brightness-[1.07]'
                    >
                        <Send className='size-4' />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AIPanel
