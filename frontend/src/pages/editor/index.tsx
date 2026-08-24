import { useCallback, useEffect, useRef, useState } from 'react'
import { useNotes } from '@/hooks/useNotes'
import { useNoteStore } from '@/store/useNoteStore'
import { EditorContent, EditorContext, useEditor } from '@tiptap/react'
import MainToolbarContent from './MainToolbarContent'
import MobileToolbarContent from './MobileToolbarContent'
import EditorHeader from '@/components/EditorHeader'
import { Bot, BookOpen } from "lucide-react";

// extensions
import { StarterKit } from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TextAlign } from '@tiptap/extension-text-align'
import { Typography } from '@tiptap/extension-typography'
import { Highlight } from '@tiptap/extension-highlight'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { Selection } from '@tiptap/extensions'
import { Markdown } from 'tiptap-markdown'

// node
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension'
import { HorizontalRule } from '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension'
import { Callout } from '@/components/tiptap-node/callout-node/callout-node-extension'
import { Cite } from '@/components/tiptap-node/cite-node/cite-node-extension'
import { CitationList } from '@/components/CitationList'
import { collectCiteIds } from '@/lib/citation'
import '@/components/tiptap-node/blockquote-node/blockquote-node.scss'
import '@/components/tiptap-node/code-block-node/code-block-node.scss'
import '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss'
import '@/components/tiptap-node/list-node/list-node.scss'
import '@/components/tiptap-node/image-node/image-node.scss'
import '@/components/tiptap-node/heading-node/heading-node.scss'
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss'
import '@/components/tiptap-node/callout-node/callout-node.scss'
import '@/components/tiptap-node/table-node/table-node.scss'
import '@/styles/editor-content.scss'

// hooks
import { useIsBreakpoint } from '@/hooks/use-is-breakpoint'

// Lib
import { handleImageUpload, MAX_FILE_SIZE } from '@/lib/tiptap-utils'

// styles
import '@/components/tiptap-templates/simple/simple-editor.scss'

const Editor = () => {
    const { saveNote, getNote } = useNotes()
    const activeNoteId = useNoteStore((state) => state.activeNoteId)
    const toggleAi = useNoteStore((state) => state.toggleAiPanel)
    const isOpen = useNoteStore((state) => state.isAiPanelOpen)

    const isMobile = useIsBreakpoint()
    const [mobileView, setMobileView] = useState<'main' | 'highlighter' | 'link'>('main')
    const toolbarRef = useRef<HTMLDivElement>(null)

    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const activeNoteIdRef = useRef<number | undefined>(activeNoteId)
    const isHydratingRef = useRef(false)

    const debouncedSaveCurrentNote = useCallback(
        (editorInstance: NonNullable<ReturnType<typeof useEditor>>) => {
            if (isHydratingRef.current) return

            const targetId = activeNoteIdRef.current
            if (!targetId) return

            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current)
            }

            saveTimerRef.current = setTimeout(async () => {
                if (activeNoteIdRef.current !== targetId) return

                const existingNote = await getNote(targetId)
                if (!existingNote) return

                // F3：title 权威化——自动保存不再用正文第一行覆盖标题（标题由
                // 新建/重命名决定，见 useDataStore.renameNote），只保存正文
                const content = editorInstance.storage.markdown.getMarkdown()

                // T1 修复：把文档里的 cite 节点同步到 cites（→ frontmatter cites，
                // B8 导出与反向引用依赖它）。全量扫描，删除引用后自动为空。
                const cites = collectCiteIds(editorInstance.state.doc)

                await saveNote({
                    ...existingNote,
                    content,
                    cites,
                    updatedAt: Date.now(),
                })
            }, 600)
        },
        [getNote, saveNote]
    )

    const editor = useEditor({
        immediatelyRender: false,
        editorProps: {
            attributes: {
                autocomplete: 'off',
                autocorrect: 'off',
                autocapitalize: 'off',
                'aria-label': 'Main content area, start typing to enter text.',
                class: 'simple-editor',
            },
        },
        extensions: [
            StarterKit.configure({
                horizontalRule: false,
                link: {
                    openOnClick: false,
                    enableClickSelection: true,
                },
            }),
            HorizontalRule,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            TaskList,
            TaskItem.configure({ nested: true }),
            Highlight.configure({ multicolor: true }),
            Image,
            Typography,
            Superscript,
            Subscript,
            Selection,
            // UI 重构 T1：placeholder + table（设计稿 E4/E7），underline/link 由 StarterKit v3 内置
            Placeholder.configure({ placeholder: '开始记录你的研究笔记…' }),
            Table.configure({ resizable: true }),
            TableRow,
            TableHeader,
            TableCell,
            ImageUploadNode.configure({
                accept: 'image/*',
                maxSize: MAX_FILE_SIZE,
                limit: 3,
                upload: handleImageUpload,
                onError: (error) => console.error('Upload failed:', error),
            }),
            Cite,
            Callout,
            Markdown,
        ],
        onUpdate: ({ editor }) => {
            debouncedSaveCurrentNote(editor)
        },
    })

    useEffect(() => {
        if (!isMobile && mobileView !== 'main') {
            setMobileView('main')
        }
    }, [isMobile, mobileView])

    // T4：代码块语言标签（pre::after 显示 data-lang，参考设计稿 refreshCodeLabels）
    useEffect(() => {
        if (!editor) return
        const refreshCodeLabels = () => {
            editor.view.dom.querySelectorAll('pre').forEach((pre) => {
                const code = pre.querySelector('code')
                const m = code && /language-([\w-]+)/.exec(code.className)
                pre.setAttribute('data-lang', m ? m[1] : 'code')
            })
        }
        refreshCodeLabels()
        editor.on('update', refreshCodeLabels)
        return () => {
            editor.off('update', refreshCodeLabels)
        }
    }, [editor])

    useEffect(() => {
        activeNoteIdRef.current = activeNoteId
    }, [activeNoteId])

    useEffect(() => {
        if (!editor) return

        let cancelled = false

        const loadNote = async () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current)
            }

            isHydratingRef.current = true

            if (!activeNoteId) {
                editor.commands.clearContent(true)
                isHydratingRef.current = false
                return
            }

            const note = await getNote(activeNoteId)

            if (cancelled) {
                isHydratingRef.current = false
                return
            }

            if (!note) {
                editor.commands.clearContent(true)
                isHydratingRef.current = false
                return
            }

            editor.commands.setContent(note.content || '')
            isHydratingRef.current = false
        }

        void loadNote()

        return () => {
            cancelled = true
        }
    }, [activeNoteId, editor, getNote])

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current)
            }
        }
    }, [])

    return (
        /* UI 重构：页头（chip/标题/meta + 格式化工具栏 + 编辑-预览）在 Provider 内，
           EditorHeader 通过 toolbar prop 承载 Tiptap 格式化按钮组（设计稿：标题下方） */
        <div className='flex h-full w-full flex-col overflow-hidden'>
            {/* 未选中笔记 → 空状态页（不可输入；hooks 照常执行保持顺序） */}
            {activeNoteId === undefined ? (
                <div className='flex h-full flex-col items-center justify-center gap-3 px-6 text-center'>
                    <div className='grid size-14 place-items-center rounded-2xl bg-background text-muted-foreground'>
                        <BookOpen className='size-6' />
                    </div>
                    <div className='text-sm font-medium text-muted-foreground'>
                        选择一篇笔记开始写作
                    </div>
                    <div className='max-w-[300px] text-xs leading-relaxed text-muted-foreground/70'>
                        从左侧列表选择笔记，或点击「新建笔记」创建一篇；AI 问答与引用功能在选中笔记后可用。
                    </div>
                </div>
            ) : (
                <EditorContext.Provider value={{ editor }}>
                <EditorHeader
                    toolbar={
                        <div
                            ref={toolbarRef}
                            className="flex items-center gap-1 overflow-x-auto py-0.5"
                        >
                            {mobileView === 'main' ? (
                                <MainToolbarContent
                                    onHighlighterClick={() => setMobileView('highlighter')}
                                    onLinkClick={() => setMobileView('link')}
                                    isMobile={isMobile}
                                />
                            ) : (
                                <MobileToolbarContent
                                    type={mobileView === 'highlighter' ? 'highlighter' : 'link'}
                                    onBack={() => setMobileView('main')}
                                />
                            )}
                        </div>
                    }
                />

                {/* divider（设计稿：页头与正文分隔） */}
                <div className="mx-7 h-px shrink-0 bg-border" />

                {/* 正文（统一由 simple-editor-wrapper 滚动；格式化工具已上移至页头） */}
                <div className='flex min-h-0 flex-1 justify-center'>
                    <div className='simple-editor-wrapper'>
                        <EditorContent
                            editor={editor}
                            role='presentation'
                            className='simple-editor-content'
                        />
                        {/* F6：笔记尾参考文献列表（扫描 cite 节点实时渲染） */}
                        <CitationList editor={editor} />
                    </div>
                </div>

                {/* AI 唤醒按钮（设计稿 ai-reopen：面板折叠时显示，48px 圆形悬浮） */}
                {!isOpen && (
                    <button
                        onClick={toggleAi}
                        title="打开 AI 助手"
                        className="fixed right-[18px] bottom-[18px] z-[900] grid size-12 place-items-center rounded-full border border-border bg-card text-primary shadow-lg transition-colors hover:border-primary hover:bg-primary hover:text-white"
                    >
                        <Bot className="size-5" />
                    </button>
                )}
                </EditorContext.Provider>
            )}
        </div>
    )
}

export default Editor
