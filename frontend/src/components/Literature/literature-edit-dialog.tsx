import { useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { useLiteratureStore } from '@/store/useLiteratureStore'
import type { LiteratureEntry } from '@/types'
import { cn } from '@/lib/utils'

/**
 * M2 P2：文献元数据编辑对话框。
 * 可编辑字段：标题/作者（动态行 given+family）/年份/期刊/卷/期/页码/DOI/arXiv/标签。
 * 保存 → PUT /api/documents/{id}（后端幂等）→ store 原地更新 → 导出/引用/详情自动同步。
 */

const FIELD_LABEL = 'mb-1 block text-[11px] font-medium text-muted-foreground/70'

export const LiteratureEditDialog = ({
    entry,
    open,
    onOpenChange,
}: {
    entry: LiteratureEntry
    open: boolean
    onOpenChange: (open: boolean) => void
}) => {
    const updateMetadata = useLiteratureStore((s) => s.updateMetadata)

    const [title, setTitle] = useState(entry.title)
    const [authors, setAuthors] = useState(
        entry.authors.length > 0
            ? entry.authors.map((a) => ({ given: a.given, family: a.family }))
            : [{ given: '', family: '' }]
    )
    const [year, setYear] = useState(entry.year !== null && entry.year !== undefined ? String(entry.year) : '')
    const [venue, setVenue] = useState(entry.venue)
    const [volume, setVolume] = useState(entry.volume)
    const [issue, setIssue] = useState(entry.issue)
    const [pages, setPages] = useState(entry.pages)
    const [doi, setDoi] = useState(entry.doi)
    const [arxivId, setArxivId] = useState(entry.arxivId)
    const [tags, setTags] = useState((entry.tags ?? []).join(', '))
    const [saving, setSaving] = useState(false)

    const updateAuthor = (idx: number, field: 'given' | 'family', value: string) => {
        setAuthors((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)))
    }

    const handleSave = async () => {
        if (saving) return
        const yearNum = year.trim() === '' ? null : Number(year)
        const patch = {
            title: title.trim(),
            authors: authors
                .map((a) => ({ given: a.given.trim(), family: a.family.trim() }))
                .filter((a) => a.given || a.family),
            year: yearNum,
            venue: venue.trim(),
            volume: volume.trim(),
            issue: issue.trim(),
            pages: pages.trim(),
            doi: doi.trim(),
            arxivId: arxivId.trim(),
            tags: tags
                .split(/[,，]/)
                .map((t) => t.trim())
                .filter(Boolean),
        }
        setSaving(true)
        try {
            await updateMetadata(entry.id, patch)
            toast.success('文献信息已保存')
            onOpenChange(false)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : '保存失败，请重试')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                // 打开时用最新 entry 初始化表单（避免上次编辑残留）
                if (next) {
                    setTitle(entry.title)
                    setAuthors(
                        entry.authors.length > 0
                            ? entry.authors.map((a) => ({ given: a.given, family: a.family }))
                            : [{ given: '', family: '' }]
                    )
                    setYear(entry.year !== null && entry.year !== undefined ? String(entry.year) : '')
                    setVenue(entry.venue)
                    setVolume(entry.volume)
                    setIssue(entry.issue)
                    setPages(entry.pages)
                    setDoi(entry.doi)
                    setArxivId(entry.arxivId)
                    setTags((entry.tags ?? []).join(', '))
                }
                onOpenChange(next)
            }}
        >
            <DialogContent className="max-h-[85vh] w-[520px] max-w-full overflow-y-auto rounded-xl">
                <DialogHeader>
                    <DialogTitle>编辑文献信息</DialogTitle>
                    <DialogDescription>
                        保存后导出（GB/T 7714 / APA / IEEE / BibTeX）与引用自动同步
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3.5 py-1">
                    {/* 标题 */}
                    <div>
                        <label className={FIELD_LABEL}>标题</label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="论文标题" />
                    </div>

                    {/* 作者（动态行） */}
                    <div>
                        <label className={FIELD_LABEL}>作者</label>
                        <div className="flex flex-col gap-1.5">
                            {authors.map((a, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                    <Input
                                        value={a.given}
                                        onChange={(e) => updateAuthor(idx, 'given', e.target.value)}
                                        placeholder="名（given）"
                                        className="h-8 flex-1 text-xs"
                                    />
                                    <Input
                                        value={a.family}
                                        onChange={(e) => updateAuthor(idx, 'family', e.target.value)}
                                        placeholder="姓（family）"
                                        className="h-8 flex-1 text-xs"
                                    />
                                    <button
                                        onClick={() => setAuthors((prev) => prev.filter((_, i) => i !== idx))}
                                        disabled={authors.length <= 1}
                                        title="删除该作者"
                                        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-destructive disabled:opacity-30"
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => setAuthors((prev) => [...prev, { given: '', family: '' }])}
                                className="flex h-7 items-center gap-1 self-start rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                            >
                                <Plus className="size-3" />
                                添加作者
                            </button>
                        </div>
                    </div>

                    {/* 年份 + 期刊 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={FIELD_LABEL}>年份（留空 = 未知）</label>
                            <Input
                                type="number"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                placeholder="2025"
                                className="h-8 text-xs"
                            />
                        </div>
                        <div>
                            <label className={FIELD_LABEL}>期刊 / 会议</label>
                            <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="ACL / ICML…" className="h-8 text-xs" />
                        </div>
                    </div>

                    {/* 卷 / 期 / 页码 */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className={FIELD_LABEL}>卷</label>
                            <Input value={volume} onChange={(e) => setVolume(e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div>
                            <label className={FIELD_LABEL}>期</label>
                            <Input value={issue} onChange={(e) => setIssue(e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div>
                            <label className={FIELD_LABEL}>页码</label>
                            <Input value={pages} onChange={(e) => setPages(e.target.value)} placeholder="100-110" className="h-8 text-xs" />
                        </div>
                    </div>

                    {/* DOI / arXiv */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={FIELD_LABEL}>DOI</label>
                            <Input value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="10.xxxx/xxxx" className="h-8 font-mono text-xs" />
                        </div>
                        <div>
                            <label className={FIELD_LABEL}>arXiv ID</label>
                            <Input value={arxivId} onChange={(e) => setArxivId(e.target.value)} placeholder="2501.00001" className="h-8 font-mono text-xs" />
                        </div>
                    </div>

                    {/* 标签 */}
                    <div>
                        <label className={FIELD_LABEL}>标签（逗号分隔）</label>
                        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="RAG, 检索优化" className="h-8 text-xs" />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        取消
                    </Button>
                    <Button onClick={handleSave} disabled={saving} className={cn(saving && 'opacity-70')}>
                        {saving && <Loader2 className="size-4 animate-spin" />}
                        {saving ? '保存中…' : '保存'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
