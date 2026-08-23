import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Bell, Download, Info, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/hooks/use-theme'
import { useNoteStore } from '@/store/useNoteStore'
import { useDataStore } from '@/store/useDataStore'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { ExportDialog } from '@/components/ExportDialog'
import { cn } from '@/lib/utils'

/**
 * 顶栏（UI 重构 Step 2，对齐设计稿 52px topbar）：
 * 左：logo「知微·科研工作台」；中：当前打开文档标题（空则隐藏）；
 * 右：主题切换、通知占位（绿点）、头像 + 个人菜单。
 * 通知/关于/清空本地数据为占位项（后端暂无对应接口，点击 toast 提示）；
 * 导出已接入 M2 A4 集合级导出（ExportDialog：docx 三格式 / BibTeX + 集合过滤）。
 */
const TopBar = () => {
    const { theme, toggleTheme } = useTheme()
    const view = useNoteStore((s) => s.view)
    const activeNoteId = useNoteStore((s) => s.activeNoteId)
    const notes = useDataStore((s) => s.notes)
    const readerId = useLiteratureStore((s) => s.readerId)
    const activeLitId = useLiteratureStore((s) => s.activeId)
    const entries = useLiteratureStore((s) => s.entries)
    const [exportOpen, setExportOpen] = useState(false)

    // 中央标题：文献模式取 readerId ?? activeId 对应文献；笔记模式取当前笔记
    const openTitle = useMemo(() => {
        if (view === 'library') {
            const id = readerId ?? activeLitId
            return entries.find((e) => e.id === id)?.title ?? ''
        }
        return notes.find((n) => n.id === activeNoteId)?.title ?? ''
    }, [view, readerId, activeLitId, entries, activeNoteId, notes])

    const isDark = theme === 'dark'
    const ThemeIcon = isDark ? Moon : Sun

    return (
        <header className="flex h-[52px] shrink-0 items-center gap-4 border-b border-border bg-card px-4">
            {/* 左：logo + 应用名 */}
            <div className="flex items-center gap-2.5">
                <div
                    className="grid size-7 place-items-center rounded-lg text-white"
                    style={{ background: 'linear-gradient(135deg, var(--primary), #7AA8FF)' }}
                >
                    <ShieldCheck className="size-4" strokeWidth={1.8} />
                </div>
                <span className="text-[16px] font-bold tracking-[0.3px]">知微</span>
                <span className="text-xs text-muted-foreground/70">科研工作台</span>
            </div>

            {/* 中：当前打开文档标题 */}
            <div
                className={cn(
                    'flex flex-1 items-center justify-center overflow-hidden px-3 text-[13.5px] font-medium text-muted-foreground',
                    'truncate whitespace-nowrap',
                    !openTitle && 'hidden'
                )}
                title={openTitle}
            >
                {openTitle}
            </div>

            {/* 右：主题切换 / 通知 / 头像菜单 */}
            <div className="ml-auto flex items-center gap-2">
                <button
                    onClick={toggleTheme}
                    title={isDark ? '切换为浅色' : '切换为深色'}
                    className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                >
                    <ThemeIcon className="size-[18px]" strokeWidth={1.8} />
                </button>

                <button
                    onClick={() => toast.info('通知功能开发中')}
                    title="通知"
                    className="relative grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                >
                    <Bell className="size-[18px]" strokeWidth={1.8} />
                    <span className="absolute right-[9px] top-[8px] size-[7px] rounded-full border-2 border-card bg-success" />
                </button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button title="个人菜单">
                            <Avatar
                                size="default"
                                className="size-8 cursor-pointer text-white"
                                style={{ background: 'var(--primary)' }}
                            >
                                <AvatarFallback
                                    className="bg-transparent font-bold text-white"
                                    style={{ background: 'transparent' }}
                                >
                                    知
                                </AvatarFallback>
                            </Avatar>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52 p-1.5">
                        <DropdownMenuLabel className="border-b border-border pb-2 font-normal">
                            <div className="text-[13px] font-semibold">知微用户</div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                                本地档案 · 数据仅存于本机
                            </div>
                        </DropdownMenuLabel>

                        <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                            <ThemeIcon className="size-4 text-muted-foreground" />
                            {isDark ? '切换为浅色' : '切换为深色'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => setExportOpen(true)}
                            className="cursor-pointer"
                        >
                            <Download className="size-4 text-muted-foreground" />
                            导出 / 备份数据
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.info('知微 · 个人科研工作台 v0.1（本地优先）')} className="cursor-pointer">
                            <Info className="size-4 text-muted-foreground" />
                            关于知微
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => toast.error('清空本地数据功能开发中')}
                            className="cursor-pointer text-destructive focus:text-destructive"
                        >
                            <Trash2 className="size-4 text-destructive" />
                            清空本地数据
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* M2 A4：集合级导出对话框（docx 三格式 / BibTeX + 集合过滤） */}
            <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
        </header>
    )
}

export default TopBar
