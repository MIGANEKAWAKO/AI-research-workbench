import { useEffect, useRef, useState } from 'react'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { FileUp } from 'lucide-react'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import type { LiteratureEntry } from '@/types'
import { cn } from '@/lib/utils'

/**
 * 文献导入面板（F4 + UI 重构 Step 5）：
 * ①拖拽/选择 PDF（校验 .pdf） ②可选填 DOI/arXiv（后端自动补全元数据）
 * ③POST /api/documents → 展示补全结果供确认（补全失败后端 title 占位，不阻断）
 * 拖拽区/进度条样式对齐设计稿 dropzone（虚线框 + 蓝色图标 + 模拟进度）。
 */
export const ImportSheet = ({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) => {
    const importFile = useLiteratureStore((s) => s.importFile)
    const importing = useLiteratureStore((s) => s.importing)
    const error = useLiteratureStore((s) => s.error)
    const setActive = useLiteratureStore((s) => s.setActive)

    const [file, setFile] = useState<File | null>(null)
    const [doi, setDoi] = useState('')
    const [arxivId, setArxivId] = useState('')
    const [dragOver, setDragOver] = useState(false)
    const [result, setResult] = useState<LiteratureEntry | null>(null)
    const [progress, setProgress] = useState(0)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const reset = () => {
        setFile(null)
        setDoi('')
        setArxivId('')
        setResult(null)
        setProgress(0)
        if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current)
            progressTimerRef.current = null
        }
    }

    // 组件卸载时清理模拟进度定时器
    useEffect(() => {
        return () => {
            if (progressTimerRef.current) clearInterval(progressTimerRef.current)
        }
    }, [])

    const pickFile = (f: File | undefined) => {
        if (!f) return
        if (!f.name.toLowerCase().endsWith('.pdf')) {
            alert('仅支持 PDF 文件')
            return
        }
        setFile(f)
        setResult(null)
    }

    const handleImport = async () => {
        if (!file) return
        // 模拟进度（后端无进度事件）：导入中递增至 95%，完成后跳 100
        setProgress(8)
        progressTimerRef.current = setInterval(() => {
            setProgress((p) => (p < 95 ? Math.min(95, p + Math.random() * 14 + 5) : p))
        }, 400)

        const entry = await importFile(file, doi, arxivId)
        if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current)
            progressTimerRef.current = null
        }
        if (entry) {
            setProgress(100)
            setResult(entry)
            // 导入成功自动选中（中间面板直接显示新文献详情）
            setActive(entry.id)
        } else {
            setProgress(0)
        }
    }

    return (
        <Sheet
            open={open}
            onOpenChange={(o) => {
                onOpenChange(o)
                if (!o) reset()
            }}
        >
            <SheetContent className="w-full sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>导入文献</SheetTitle>
                    <SheetDescription>
                        拖入 PDF（或点击选择），可选填 DOI / arXiv ID 自动补全元数据
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex flex-col gap-4">
                    {/* 拖拽/选择区（设计稿 dropzone：虚线框 + 蓝色图标方块） */}
                    <div
                        onDragOver={(e) => {
                            e.preventDefault()
                            setDragOver(true)
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault()
                            setDragOver(false)
                            pickFile(e.dataTransfer.files?.[0])
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed px-6 py-10 transition-colors',
                            dragOver
                                ? 'border-primary bg-primary/5'
                                : 'border-border bg-card text-muted-foreground hover:border-primary/60'
                        )}
                    >
                        <div className="grid size-12 place-items-center rounded-[14px] bg-primary/10 text-primary">
                            <FileUp className="size-6" />
                        </div>
                        {file ? (
                            <>
                                <span className="font-medium text-foreground">{file.name}</span>
                                <span className="text-xs">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB（点击更换）
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="text-sm font-semibold text-foreground">
                                    拖拽 PDF 到这里，或点击选择
                                </span>
                                <span className="text-xs">支持 PDF 单文件 · 最大 50MB</span>
                            </>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => pickFile(e.target.files?.[0] ?? undefined)}
                        />
                    </div>

                    {/* 导入进度（设计稿 prog 进度条） */}
                    {importing && (
                        <div className="space-y-1">
                            <Progress value={progress} className="h-1" />
                            <div className="text-center text-xs text-muted-foreground">
                                导入中（补全元数据 + 建索引）… {Math.floor(progress)}%
                            </div>
                        </div>
                    )}

                    {/* DOI / arXiv（可选） */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-muted-foreground">DOI（可选）</label>
                            <Input
                                value={doi}
                                onChange={(e) => setDoi(e.target.value)}
                                placeholder="10.xxxx/xxxxx"
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-muted-foreground">arXiv ID（可选）</label>
                            <Input
                                value={arxivId}
                                onChange={(e) => setArxivId(e.target.value)}
                                placeholder="1706.03762"
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            ⚠ {error}
                        </div>
                    )}

                    {/* 导入按钮 */}
                    <Button
                        onClick={handleImport}
                        disabled={!file || importing}
                        className="w-full"
                    >
                        {importing ? '导入中…' : '导入'}
                    </Button>

                    {/* 补全结果展示 */}
                    {result && (
                        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                            <div className="mb-1 font-medium">✅ 导入成功，元数据补全结果：</div>
                            <div className="font-semibold text-foreground">{result.title}</div>
                            <div className="mt-1 text-success">
                                {result.authors.map((a) => `${a.given} ${a.family}`).join(', ') || '作者未知'}
                                {result.year ? `（${result.year}）` : ''}
                            </div>
                            {result.venue && <div className="mt-0.5 text-success">{result.venue}</div>}
                            {(result.doi || result.arxivId) && (
                                <div className="mt-0.5 text-success">
                                    {result.doi && <>DOI: {result.doi}</>}
                                    {result.doi && result.arxivId && ' ｜ '}
                                    {result.arxivId && <>arXiv: {result.arxivId}</>}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
