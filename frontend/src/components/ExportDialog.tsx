import { useMemo, useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useDataStore } from '@/store/useDataStore'
import { exportReferences, exportBibtex, type ReferenceFormat } from '@/services/export'
import { cn } from '@/lib/utils'

/** M2 A4：集合级导出对话框——范围（全部/按集合多选）+ 格式（docx 三格式 / BibTeX）。 */

type RangeMode = 'all' | 'collections'

const FORMAT_OPTIONS: { value: ReferenceFormat | 'bibtex'; label: string; desc: string }[] = [
    { value: 'gbt7714', label: 'GB/T 7714', desc: 'Word 文档 · 中文期刊常用' },
    { value: 'apa', label: 'APA', desc: 'Word 文档 · 社科/心理' },
    { value: 'ieee', label: 'IEEE', desc: 'Word 文档 · 工程/计算机' },
    { value: 'bibtex', label: 'BibTeX', desc: '.bib 文件 · LaTeX 引用' },
]

const RANGE_SEGMENT: { value: RangeMode; label: string }[] = [
    { value: 'all', label: '全部笔记' },
    { value: 'collections', label: '按集合' },
]

export const ExportDialog = ({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) => {
    const collections = useDataStore((s) => s.collections)

    const [range, setRange] = useState<RangeMode>('all')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [format, setFormat] = useState<ReferenceFormat | 'bibtex'>('gbt7714')
    const [exporting, setExporting] = useState(false)

    // 打开时重置为默认（避免上次选择残留）
    const handleOpenChange = (next: boolean) => {
        if (!next) onOpenChange(false)
        else {
            setRange('all')
            setSelected(new Set())
            setFormat('gbt7714')
            onOpenChange(true)
        }
    }

    const toggleCollection = (name: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(name)) next.delete(name)
            else next.add(name)
            return next
        })
    }

    // 导出参数：按集合时用选中的集合名（后端按笔记 frontmatter collection 名称过滤）
    const collectionIds = useMemo(
        () => (range === 'collections' ? Array.from(selected) : []),
        [range, selected]
    )

    const canExport = range === 'all' || selected.size > 0

    const handleExport = async () => {
        if (!canExport || exporting) return
        setExporting(true)
        try {
            if (format === 'bibtex') {
                await exportBibtex({ collectionIds })
            } else {
                await exportReferences(format, { collectionIds })
            }
            toast.success(
                range === 'all'
                    ? '参考文献已导出'
                    : `已导出 ${selected.size} 个集合的参考文献`
            )
            onOpenChange(false)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : '导出失败，请重试')
        } finally {
            setExporting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="w-[420px] max-w-full rounded-xl">
                <DialogHeader>
                    <DialogTitle>导出参考文献</DialogTitle>
                    <DialogDescription>
                        导出内容 = 笔记引用的文献聚合（自动去重）；集合过滤作用于笔记归属
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-1">
                    {/* 范围 */}
                    <div>
                        <div className="mb-1.5 text-xs font-medium text-muted-foreground">范围</div>
                        <div className="flex gap-1.5">
                            {RANGE_SEGMENT.map((seg) => (
                                <button
                                    key={seg.value}
                                    onClick={() => setRange(seg.value)}
                                    className={cn(
                                        'flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors',
                                        range === seg.value
                                            ? 'border-primary bg-primary/10 font-medium text-primary'
                                            : 'border-border text-muted-foreground hover:bg-background'
                                    )}
                                >
                                    {seg.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 集合多选（按集合时显示） */}
                    {range === 'collections' && (
                        <div>
                            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                                选择集合
                            </div>
                            {collections.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    暂无集合（在笔记侧边栏创建）
                                </p>
                            ) : (
                                <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
                                    {collections.map((c) => (
                                        <label
                                            key={c.id}
                                            onClick={() => toggleCollection(c.name)}
                                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-background"
                                        >
                                            <span
                                                className={cn(
                                                    'grid size-4 shrink-0 place-items-center rounded border transition-colors',
                                                    selected.has(c.name)
                                                        ? 'border-primary bg-primary text-primary-foreground'
                                                        : 'border-input bg-background'
                                                )}
                                            >
                                                {selected.has(c.name) && (
                                                    <svg
                                                        className="size-3"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="3"
                                                    >
                                                        <path d="M20 6 9 17l-5-5" />
                                                    </svg>
                                                )}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate">
                                                {c.name}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 格式 */}
                    <div>
                        <div className="mb-1.5 text-xs font-medium text-muted-foreground">格式</div>
                        <div className="flex flex-col gap-1">
                            {FORMAT_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setFormat(opt.value)}
                                    className={cn(
                                        'flex items-center justify-between rounded-md border px-3 py-1.5 text-left text-xs transition-colors',
                                        format === opt.value
                                            ? 'border-primary bg-primary/10'
                                            : 'border-border hover:bg-background'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'font-medium',
                                            format === opt.value ? 'text-primary' : 'text-foreground'
                                        )}
                                    >
                                        {opt.label}
                                    </span>
                                    <span className="text-muted-foreground">{opt.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button onClick={handleExport} disabled={!canExport || exporting}>
                        {exporting ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <FileDown className="size-4" />
                        )}
                        {exporting ? '导出中…' : '导出'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
