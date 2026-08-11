import { useCallback, useEffect, useRef, useState } from 'react'
import { useNotes } from '@/hooks/useNotes'
import { useNoteStore } from '@/store/useNoteStore'
import { EditorContent, EditorContext, useEditor } from '@tiptap/react'
import MainToolbarContent from './MainToolbarContent'
import MobileToolbarContent from './MobileToolbarContent'
import { Bot } from "lucide-react";

// extensions
import { StarterKit } from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TextAlign } from '@tiptap/extension-text-align'
import { Typography } from '@tiptap/extension-typography'
import { Highlight } from '@tiptap/extension-highlight'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { Selection } from '@tiptap/extensions'
import { Markdown } from 'tiptap-markdown'

// UI
import { Toolbar } from '@/components/tiptap-ui-primitive/toolbar'

// node
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension'
import { HorizontalRule } from '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension'
import '@/components/tiptap-node/blockquote-node/blockquote-node.scss'
import '@/components/tiptap-node/code-block-node/code-block-node.scss'
import '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss'
import '@/components/tiptap-node/list-node/list-node.scss'
import '@/components/tiptap-node/image-node/image-node.scss'
import '@/components/tiptap-node/heading-node/heading-node.scss'
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss'

// hooks
import { useIsBreakpoint } from '@/hooks/use-is-breakpoint'
import { useWindowSize } from '@/hooks/use-window-size'
import { useCursorVisibility } from '@/hooks/use-cursor-visibility'

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
    const { height } = useWindowSize()
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

                const content = editorInstance.getHTML()
                const firstLine =
                    editorInstance
                        .getText()
                        .split('\n')
                        .find((line) => line.trim().length > 0)
                        ?.trim() || ''
                const title = firstLine.slice(0, 30) || 'Untitled'

                await saveNote({
                    ...existingNote,
                    title,
                    content,
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
            ImageUploadNode.configure({
                accept: 'image/*',
                maxSize: MAX_FILE_SIZE,
                limit: 3,
                upload: handleImageUpload,
                onError: (error) => console.error('Upload failed:', error),
            }),
            Markdown,
        ],
        onUpdate: ({ editor }) => {
            debouncedSaveCurrentNote(editor)
        },
    })

    const rect = useCursorVisibility({
        editor,
        overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
    })

    useEffect(() => {
        if (!isMobile && mobileView !== 'main') {
            setMobileView('main')
        }
    }, [isMobile, mobileView])

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
        <div className='flex h-full w-full justify-center'>
            <div className='simple-editor-wrapper'>
                <EditorContext.Provider value={{ editor }}>
                    <Toolbar
                        ref={toolbarRef}
                        style={{
                            ...(isMobile
                                ? {
                                      bottom: `calc(100% - ${height - rect.y}px)`,
                                  }
                                : {}),
                        }}
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
                    </Toolbar>

                    <div className="flex flex-col h-full overflow-hidden">
                        <EditorContent
                            editor={editor}
                            role='presentation'
                            className='simple-editor-content'
                        />
                    </div>

                    {/* AI 唤醒按钮 */}
                    <button
                        onClick={toggleAi}
                        className={`fixed bottom-8 right-8 p-4 rounded-full shadow-2xl transition-all ${
                            isOpen ? "bg-purple-600 text-white -translate-x-80" : "bg-white text-purple-600"
                        }`}
                    >
                        <Bot className="h-6 w-6" />
                    </button>
                </EditorContext.Provider>
            </div>
        </div>
    )
}

export default Editor
