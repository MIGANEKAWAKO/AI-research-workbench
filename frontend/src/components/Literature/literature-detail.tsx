import { useState } from 'react'
import { BookOpen, ClipboardCopy, FileText, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { useDataStore } from '@/store/useDataStore'
import { LiteratureEditDialog } from './literature-edit-dialog'
import { formatReference } from '@/lib/citation'
import { cn } from '@/lib/utils'
import { LiteratureEmptyState } from '@/components/WorkbenchEmpty'

/** 设计稿 meta-cell：surface 底 + 边框的圆角信息格 */
const MetaCell = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-[10px] border border-border bg-card px-3.5 py-2.5">
        <div className="mb-0.5 text-[11px] text-muted-foreground/70">{label}</div>
        <div className="truncate text-[12.5px] font-medium text-foreground" title={value}>
            {value}
        </div>
    </div>
)

// M2 A3：阅读状态循环（chip 点击切换：未读 → 在读 → 已读 → 未读）
const STATUS_CYCLE = ['未读', '在读', '已读'] as const

/**
 * 文献详情（F4 + UI 重构 Step 5，对齐设计稿 lit-detail）：
 * 页头（状态 chip + meta + × 关闭 + 大标题）→ divider → meta-row 三格卡片
 * （作者/期刊/年份）→ 元数据详情 → DOI 行（蓝色 mono）→ tags → 反向引用 →
 * action-row（阅读 PDF / 复制引用）→ 底部删除（AlertDialog 确认）。
 * 注：LiteratureEntry 无 abstract 字段（后端 B5 未抽取摘要），摘要块暂缺；
 * 收藏/更多按钮暂未实现（代码注释保留，后续规划）。
 */
export const LiteratureDetail = () => {
    const entries = useLiteratureStore((s) => s.entries)
    const activeId = useLiteratureStore((s) => s.activeId)
    const setActive = useLiteratureStore((s) => s.setActive)
    const remove = useLiteratureStore((s) => s.remove)
    const openReader = useLiteratureStore((s) => s.openReader)
    const updateProgress = useLiteratureStore((s) => s.updateProgress)
    const notes = useDataStore((s) => s.notes)

    const [deleteOpen, setDeleteOpen] = useState(false)
    // M2 P2：元数据编辑对话框
    const [editOpen, setEditOpen] = useState(false)

    const entry = entries.find((e) => e.id === activeId) ?? null

    // 未选中文献 → 文献空状态页（设计稿 view-lit-empty：HERO 插画 + 快捷操作 + 最近导入）
    if (!entry) {
        return <LiteratureEmptyState />
    }

    // 反向引用：扫笔记 cites 字段（文献 ID 匹配）
    const citedBy = notes.filter((n) => n.cites?.includes(entry.id))

    const handleDelete = async () => {
        setDeleteOpen(false)
        await remove(entry.id)
        toast.success('文献已删除')
    }

    const handleCopyCitation = async () => {
        try {
            await navigator.clipboard.writeText(formatReference(entry))
            toast.success('引用已复制到剪贴板')
        } catch {
            toast.error('复制失败，请重试')
        }
    }

    // M2 A3：chip 点击循环切换阅读状态（未读 → 在读 → 已读 → 未读）
    const handleCycleStatus = () => {
        const idx = STATUS_CYCLE.indexOf(entry.status as (typeof STATUS_CYCLE)[number])
        const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
        void updateProgress(entry.id, { status: next })
    }

    // 状态 chip 配色（设计稿 chip：圆角胶囊 + 边框）
    const statusChipClass =
        entry.status === '已读'
            ? 'border-success/30 bg-success/10 text-success'
            : entry.status === '在读'
              ? 'border-warning/30 bg-warning/10 text-warning'
              : 'border-border bg-background text-muted-foreground'

    const authorsText = entry.authors.map((a) => `${a.given} ${a.family}`).join(', ') || '作者未知'

    const detailFields: { label: string; value: string }[] = [
        { label: '卷/期/页码', value: [entry.volume, entry.issue, entry.pages].filter(Boolean).join(' / ') || '—' },
        { label: 'arXiv', value: entry.arxivId || '—' },
        { label: 'PDF 路径', value: entry.pdfPath || '—' },
    ]

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            {/* 页头（设计稿 editor-header） */}
            <div className="flex flex-col gap-3 px-7 pt-5 pb-4">
                <div className="flex items-center gap-3">
                    {/* M2 A3：状态 chip 可点击切换（title 提示） */}
                    <button
                        onClick={handleCycleStatus}
                        title={`点击切换阅读状态（当前：${entry.status}）`}
                        className={cn(
                            'inline-flex h-[26px] cursor-pointer items-center rounded-full border px-2.5 text-xs font-medium transition-colors hover:brightness-95',
                            statusChipClass
                        )}
                    >
                        {entry.status}
                    </button>

                    {/* M2 A3：阅读进度（lastPage > 0 时展示） */}
                    {entry.lastPage && entry.lastPage > 0 && (
                        <span className="text-xs text-muted-foreground">
                            已读至第 {entry.lastPage} 页
                        </span>
                    )}

                    <div className="ml-auto flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                            PDF · 被 {citedBy.length} 篇笔记引用
                        </span>
                        {/* 收藏/更多暂不实现（后续规划），先注释保留；右上角改为 × 关闭当前文献 */}
                        {/* <button
                            onClick={() => toast.info('收藏功能开发中')}
                            title="收藏"
                            className="grid size-[30px] place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        >
                            <Star className="size-4" />
                        </button>
                        <button
                            onClick={() => toast.info('更多操作开发中')}
                            title="更多"
                            className="grid size-[30px] place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        >
                            <MoreHorizontal className="size-4" />
                        </button> */}
                        <button
                            onClick={() => setActive(null)}
                            title="关闭文献"
                            className="grid size-[30px] place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                </div>
                <h1 className="text-2xl leading-tight font-bold">{entry.title}</h1>
            </div>

            {/* divider（设计稿 .divider） */}
            <div className="mx-7 h-px shrink-0 bg-border" />

            {/* 正文（设计稿 .lit-detail） */}
            <div className="flex flex-col gap-6 px-7 pt-6 pb-10">
                {/* meta-row：作者 / 期刊 / 年份 三格卡片 */}
                <div className="grid grid-cols-3 gap-3">
                    <MetaCell label="作者" value={authorsText} />
                    <MetaCell label="期刊" value={entry.venue || '—'} />
                    <MetaCell label="年份" value={entry.year !== null && entry.year !== undefined ? String(entry.year) : '—'} />
                </div>

                {/* 其他元数据详情 */}
                <div className="space-y-1.5 text-sm">
                    {detailFields.map((f) => (
                        <div key={f.label} className="flex gap-3">
                            <dt className="w-20 shrink-0 text-muted-foreground">{f.label}</dt>
                            <dd className="min-w-0 break-all text-muted-foreground/80">{f.value}</dd>
                        </div>
                    ))}
                </div>

                {/* DOI 行（设计稿 doi-row：蓝色 mono） */}
                {entry.doi && (
                    <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-muted-foreground">DOI</span>
                        <span className="font-mono text-primary">{entry.doi}</span>
                    </div>
                )}

                {/* tags（设计稿 tag-row） */}
                {entry.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {entry.tags.map((t) => (
                            <span
                                key={t}
                                className="inline-flex h-6 items-center rounded-full border border-border bg-background px-2.5 text-xs text-muted-foreground"
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                )}

                {/* 反向引用 */}
                <div>
                    <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                        被笔记引用（{citedBy.length}）
                    </h2>
                    {citedBy.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            暂无笔记引用此文献（在阅读器中划词可一键插入引用徽章）
                        </p>
                    ) : (
                        <ul className="space-y-1">
                            {citedBy.map((n) => (
                                <li key={n.id} className="flex items-center gap-2 text-sm">
                                    <FileText className="size-3.5 text-muted-foreground" />
                                    {n.title}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* action-row（设计稿：阅读文献 primary + 复制引用 ghost + 编辑元数据） */}
                <div className="flex gap-3">
                    <Button onClick={() => openReader(entry.id)}>
                        <BookOpen className="size-4" />
                        阅读 PDF
                    </Button>
                    <Button variant="outline" onClick={handleCopyCitation}>
                        <ClipboardCopy className="size-4" />
                        复制引用
                    </Button>
                    {/* M2 P2：编辑元数据（保存后导出/引用同步生效） */}
                    <Button variant="outline" onClick={() => setEditOpen(true)}>
                        <Pencil className="size-4" />
                        编辑信息
                    </Button>
                </div>

                {/* 底部操作区：删除 */}
                <div className="mt-auto border-t border-border pt-4">
                    <button
                        onClick={() => setDeleteOpen(true)}
                        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
                    >
                        <Trash2 className="size-4" />
                        删除文献（PDF + 索引 + 元数据）
                    </button>
                </div>
            </div>

            {/* M2 P2：编辑文献信息（保存后 entries 原地更新，详情/导出/引用同步） */}
            <LiteratureEditDialog entry={entry} open={editOpen} onOpenChange={setEditOpen} />

            {/* 删除确认（AlertDialog，替换 confirm） */}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent className="w-[380px] max-w-full rounded-xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除文献</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除文献「{entry.title}」吗？
                            <br />
                            将同时删除 PDF 文件与向量索引，此操作不可撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-white hover:bg-destructive/90"
                        >
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
