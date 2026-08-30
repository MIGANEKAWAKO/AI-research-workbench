import { useCurrentEditor, useEditorState } from '@tiptap/react'
import {
    Bold,
    Code,
    Highlighter,
    Image as ImageIcon,
    Italic,
    Link as LinkIcon,
    List,
    ListOrdered,
    ListTodo,
    MoreHorizontal,
    Quote,
    Redo2,
    Table as TableIcon,
    Underline,
    Undo2,
    Info,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * 编辑器工具栏（UI 重构 T5，对齐设计稿 fmt-group）：
 * 撤销重做 | H1 H2 H3 B I U | 无序/有序/任务/引用/提示框/代码块 | 链接/图片/表格 | 「更多」(高亮色)。
 * 按钮 30px 方按钮，active 反射（editor.isActive → bg-primary/10 + text-primary）。
 * 链接/图片按设计稿用 prompt 输入 URL（D3 决策）。
 */
const HL_COLORS = [
    { label: '黄色', value: '#fde047' },
    { label: '绿色', value: '#86efac' },
    { label: '蓝色', value: '#7dd3fc' },
    { label: '粉色', value: '#f9a8d4' },
    { label: '红色', value: '#fca5a5' },
]

function ToolbarButton({
    active,
    onClick,
    title,
    children,
    className,
}: {
    active?: boolean
    onClick: () => void
    title: string
    children: React.ReactNode
    className?: string
}) {
    return (
        <button
            // onMouseDown preventDefault：避免点击按钮时编辑器失焦
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            title={title}
            className={cn(
                'grid size-[30px] shrink-0 place-items-center rounded-md text-[14px] text-muted-foreground transition-colors',
                'hover:bg-background hover:text-foreground',
                active && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
                className
            )}
        >
            {children}
        </button>
    )
}

function Sep() {
    return <span className="mx-1 h-5 w-px shrink-0 bg-border" />
}

const MainToolbarContent = ({
    onHighlighterClick,
    onLinkClick,
    isMobile,
}: {
    onHighlighterClick: () => void
    onLinkClick: () => void
    isMobile: boolean
}) => {
    const { editor } = useCurrentEditor()

    const active = useEditorState({
        editor,
        selector: ({ editor }) =>
            editor
                ? {
                      h1: editor.isActive('heading', { level: 1 }),
                      h2: editor.isActive('heading', { level: 2 }),
                      h3: editor.isActive('heading', { level: 3 }),
                      bold: editor.isActive('bold'),
                      italic: editor.isActive('italic'),
                      underline: editor.isActive('underline'),
                      bullet: editor.isActive('bulletList'),
                      ordered: editor.isActive('orderedList'),
                      task: editor.isActive('taskList'),
                      quote: editor.isActive('blockquote'),
                      callout: editor.isActive('callout'),
                      code: editor.isActive('codeBlock'),
                  }
                : null,
    })

    if (!editor) return null

    const chain = () => editor.chain().focus()

    // 链接（D3：prompt 输入 URL）
    const handleLink = () => {
        if (isMobile) {
            onLinkClick()
            return
        }
        const prev = editor.getAttributes('link').href
        const url = prompt('链接地址（留空取消链接）', prev || 'https://')
        if (url === null) return
        if (url === '') chain().extendMarkRange('link').unsetLink().run()
        else chain().extendMarkRange('link').setLink({ href: url }).run()
    }

    // 图片（D3：prompt 输入 URL）
    const handleImage = () => {
        const url = prompt('图片地址', 'https://')
        if (url) chain().setImage({ src: url }).run()
    }

    const handleCallout = () => {
        chain().toggleWrap('callout').run()
    }

    const handleHighlight = (color?: string) => {
        if (color) chain().setHighlight({ color }).run()
        else chain().unsetHighlight().run()
    }

    return (
        <div className="flex items-center gap-0.5">
            {/* 撤销 / 重做 */}
            <ToolbarButton
                title="撤销"
                onClick={() => chain().undo().run()}
                active={false}
            >
                <Undo2 className="size-4" />
            </ToolbarButton>
            <ToolbarButton
                title="重做"
                onClick={() => chain().redo().run()}
                active={false}
            >
                <Redo2 className="size-4" />
            </ToolbarButton>

            <Sep />

            {/* 标题 */}
            <ToolbarButton
                title="一级标题"
                onClick={() => chain().toggleHeading({ level: 1 }).run()}
                active={active?.h1}
            >
                <span className="text-[13px] font-bold">H1</span>
            </ToolbarButton>
            <ToolbarButton
                title="二级标题"
                onClick={() => chain().toggleHeading({ level: 2 }).run()}
                active={active?.h2}
            >
                <span className="text-[13px] font-bold">H2</span>
            </ToolbarButton>
            <ToolbarButton
                title="三级标题"
                onClick={() => chain().toggleHeading({ level: 3 }).run()}
                active={active?.h3}
            >
                <span className="text-[13px] font-bold">H3</span>
            </ToolbarButton>

            <Sep />

            {/* 加粗 / 斜体 / 下划线 */}
            <ToolbarButton title="加粗" onClick={() => chain().toggleBold().run()} active={active?.bold}>
                <Bold className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="斜体" onClick={() => chain().toggleItalic().run()} active={active?.italic}>
                <Italic className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="下划线" onClick={() => chain().toggleUnderline().run()} active={active?.underline}>
                <Underline className="size-4" />
            </ToolbarButton>

            <Sep />

            {/* 列表 */}
            <ToolbarButton
                title="无序列表"
                onClick={() => chain().toggleBulletList().run()}
                active={active?.bullet}
            >
                <List className="size-4" />
            </ToolbarButton>
            <ToolbarButton
                title="有序列表"
                onClick={() => chain().toggleOrderedList().run()}
                active={active?.ordered}
            >
                <ListOrdered className="size-4" />
            </ToolbarButton>
            <ToolbarButton
                title="任务列表"
                onClick={() => chain().toggleTaskList().run()}
                active={active?.task}
            >
                <ListTodo className="size-4" />
            </ToolbarButton>

            <Sep />

            {/* 引用 / 提示框 / 代码块 */}
            <ToolbarButton title="引用" onClick={() => chain().toggleBlockquote().run()} active={active?.quote}>
                <Quote className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="提示框" onClick={handleCallout} active={active?.callout}>
                <Info className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="代码块" onClick={() => chain().toggleCodeBlock().run()} active={active?.code}>
                <Code className="size-4" />
            </ToolbarButton>

            <Sep />

            {/* 链接 / 图片 / 表格 */}
            <ToolbarButton title="链接" onClick={handleLink} active={false}>
                <LinkIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton title="图片" onClick={handleImage} active={false}>
                <ImageIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton
                title="表格"
                onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                active={false}
            >
                <TableIcon className="size-4" />
            </ToolbarButton>

            <Sep />

            {/* 「更多」：高亮色（D1 决策） */}
            {isMobile ? (
                <ToolbarButton title="高亮" onClick={onHighlighterClick} active={false}>
                    <Highlighter className="size-4" />
                </ToolbarButton>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            title="更多格式（高亮）"
                            className="grid size-[30px] shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        >
                            <MoreHorizontal className="size-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuLabel className="text-xs">高亮颜色</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {HL_COLORS.map((c) => (
                            <DropdownMenuItem
                                key={c.value}
                                onClick={() => handleHighlight(c.value)}
                                className="cursor-pointer gap-2"
                            >
                                <span
                                    className="size-3.5 rounded"
                                    style={{ background: c.value }}
                                />
                                {c.label}
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleHighlight(undefined)} className="cursor-pointer">
                            移除高亮
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    )
}

export default MainToolbarContent
