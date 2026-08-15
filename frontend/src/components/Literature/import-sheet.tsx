import { useRef, useState } from 'react'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import type { LiteratureEntry } from '@/types'

/**
 * 文献导入面板（F4）：
 * ①拖拽/选择 PDF（校验 .pdf） ②可选填 DOI/arXiv（后端自动补全元数据）
 * ③POST /api/documents → 展示补全结果供确认（补全失败后端 title 占位，不阻断）
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

    const [file, setFile] = useState<File | null>(null)
    const [doi, setDoi] = useState('')
    const [arxivId, setArxivId] = useState('')
    const [dragOver, setDragOver] = useState(false)
    const [result, setResult] = useState<LiteratureEntry | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const reset = () => {
        setFile(null)
        setDoi('')
        setArxivId('')
        setResult(null)
    }

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
        const entry = await importFile(file, doi, arxivId)
        if (entry) setResult(entry)
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
                    {/* 拖拽/选择区 */}
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
                        className={`flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm transition-colors ${
                            dragOver
                                ? 'border-purple-400 bg-purple-50 text-purple-600'
                                : 'border-gray-300 text-muted-foreground hover:border-purple-300'
                        }`}
                    >
                        {file ? (
                            <>
                                <span className="font-medium text-gray-800">{file.name}</span>
                                <span className="text-xs">{(file.size / 1024 / 1024).toFixed(2)} MB（点击更换）</span>
                            </>
                        ) : (
                            <>
                                <span className="text-lg">📄</span>
                                <span>拖拽 PDF 到这里，或点击选择</span>
                                <span className="text-xs">最大 50MB</span>
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
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            ⚠ {error}
                        </div>
                    )}

                    {/* 导入按钮 */}
                    <Button
                        onClick={handleImport}
                        disabled={!file || importing}
                        className="w-full"
                    >
                        {importing ? '导入中（补全元数据 + 建索引）…' : '导入'}
                    </Button>

                    {/* 补全结果展示 */}
                    {result && (
                        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                            <div className="mb-1 font-medium">✅ 导入成功，元数据补全结果：</div>
                            <div className="font-semibold">{result.title}</div>
                            <div className="mt-1 text-green-700">
                                {result.authors.map((a) => `${a.given} ${a.family}`).join(', ') || '作者未知'}
                                {result.year ? `（${result.year}）` : ''}
                            </div>
                            {result.venue && <div className="mt-0.5">{result.venue}</div>}
                            {(result.doi || result.arxivId) && (
                                <div className="mt-0.5">
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
