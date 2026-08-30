import { useState } from 'react'
import { toast } from 'sonner'
import { Download, FolderOpen, Info, KeyRound, Loader2, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { ExportDialog } from '@/components/ExportDialog'
import { ConfigDialog } from '@/components/ConfigDialog'
import { saveConfig } from '@/services/config'
import { useNoteStore } from '@/store/useNoteStore'
import { useDataStore } from '@/store/useDataStore'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { useConversationStore } from '@/store/useConversationStore'

/**
 * 顶栏（UI 重构 Step 2，对齐设计稿 52px topbar）：
 * 左：logo「知微·科研工作台」；右：主题切换、头像 + 个人菜单。
 * 个人菜单：「修改文件保存地址」（vault 目录 Dialog，保存后重新加载新目录数据）/
 * 导出 / 关于 / 清空本地数据（占位 toast）。
 * 主题切换入口仅保留顶栏右侧图标按钮（菜单项已改为 vault 修改）。
 */
const TopBar = () => {
    const { theme, toggleTheme } = useTheme()
    const [exportOpen, setExportOpen] = useState(false)

    // P6 补缺：AI 服务配置（key/baseUrl；P1 只有首次向导，配置残留/换 key 无入口）
    const [configOpen, setConfigOpen] = useState(false)

    // M2 P1 补充：修改 vault 目录（与首次启动向导同一保存通道 POST /api/config）
    const [vaultOpen, setVaultOpen] = useState(false)
    const [vaultPath, setVaultPath] = useState('')
    const [vaultSaving, setVaultSaving] = useState(false)

    const isDark = theme === 'dark'
    const ThemeIcon = isDark ? Moon : Sun

    /** 保存新 vault 路径 → 重置选中状态（旧目录 id 失效）→ 重新加载新目录数据 */
    const handleSaveVault = async () => {
        const path = vaultPath.trim()
        if (!path) {
            toast.error('请输入数据目录路径')
            return
        }
        if (vaultSaving) return
        setVaultSaving(true)
        try {
            await saveConfig({ vaultPath: path })
            toast.success('数据目录已更新，正在加载新目录…')
            setVaultOpen(false)
            setVaultPath('')

            // 清空旧目录的内存数据 + 重置选中（笔记 id / 文献 id 均为旧目录分配）
            useDataStore.setState({ notes: [] })
            useLiteratureStore.setState({ entries: [] })
            useNoteStore.getState().setActiveNote(undefined)
            useNoteStore.getState().setActiveCollection(undefined)
            useLiteratureStore.getState().setActive(null)
            useLiteratureStore.getState().closeReader()
            useLiteratureStore.getState().closeUpload()

            // 重新加载：笔记 vault 扫描 + 文献列表/集合 + AI 会话（均在 .kb/ 下）
            await useDataStore.getState().loadAll()
            await useLiteratureStore.getState().load()
            void useLiteratureStore.getState().loadCollections()
            void useConversationStore.getState().load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : '保存失败')
        } finally {
            setVaultSaving(false)
        }
    }

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

            {/* 右：主题切换 / 头像菜单 */}
            <div className="ml-auto flex items-center gap-2">
                <button
                    onClick={toggleTheme}
                    title={isDark ? '切换为浅色' : '切换为深色'}
                    className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
                >
                    <ThemeIcon className="size-[18px]" strokeWidth={1.8} />
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

                        <DropdownMenuItem
                            onClick={() => {
                                setVaultPath('')
                                setVaultOpen(true)
                            }}
                            className="cursor-pointer"
                        >
                            <FolderOpen className="size-4 text-muted-foreground" />
                            修改文件保存地址
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => setConfigOpen(true)}
                            className="cursor-pointer"
                        >
                            <KeyRound className="size-4 text-muted-foreground" />
                            AI 服务配置
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

            {/* P6：AI 服务配置（key/baseUrl + 连通测试，与首次向导同通道） */}
            <ConfigDialog open={configOpen} onOpenChange={setConfigOpen} />

            {/* M2 P1：修改文件保存地址（vault 目录，样式对齐首次启动向导第一步） */}
            <Dialog open={vaultOpen} onOpenChange={setVaultOpen}>
                <DialogContent className="w-[480px] max-w-full rounded-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderOpen className="size-4 text-primary" />
                            修改文件保存地址（vault）
                        </DialogTitle>
                        <DialogDescription>
                            所有笔记、PDF 与知识库数据都存放在该文件夹中。修改后工作台将重新加载新目录的数据；旧目录中的文件不会被删除。
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        value={vaultPath}
                        onChange={(e) => setVaultPath(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSaveVault()
                        }}
                        placeholder="例如 D:\Research\my-vault"
                        className="font-mono text-xs"
                        autoFocus
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setVaultOpen(false)} disabled={vaultSaving}>
                            取消
                        </Button>
                        <Button onClick={handleSaveVault} disabled={vaultSaving}>
                            {vaultSaving ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
                            {vaultSaving ? '保存中…' : '保存并重新加载'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </header>
    )
}

export default TopBar
