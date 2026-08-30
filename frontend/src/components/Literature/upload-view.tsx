import { useEffect, useRef, useState } from 'react'
import { FileText, FileUp, List, X } from 'lucide-react'
import { toast } from 'sonner'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { cn } from '@/lib/utils'

/** 文件大小人性化显示（设计稿 humanSize） */
function humanSize(b: number): string {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
    return `${(b / 1024 / 1024).toFixed(1)} MB`
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

/**
 * 上传页（UI 重构，对齐设计稿 upload view）：
 * 渲染在文献模式中间面板——文献列表为空时自动显示（不弹抽屉）；
 * 也支持通过 openUpload 手动打开（有文献时关闭按钮可用）。
 * 单文件上传：选择/拖入 PDF 后立即导入（后端单文件接口），期间显示 loading 进度。
 */
export const UploadView = () => {
    const uploadOpen = useLiteratureStore((s) => s.uploadOpen)
    const closeUpload = useLiteratureStore((s) => s.closeUpload)
    const importFile = useLiteratureStore((s) => s.importFile)
    const setActive = useLiteratureStore((s) => s.setActive)

    const [file, setFile] = useState<File | null>(null)
    const [status, setStatus] = useState<UploadStatus>('idle')
    const [progress, setProgress] = useState(0)
    const [dragOver, setDragOver] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // 卸载时清理进度定时器
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [])

    const startUpload = (f: File) => {
        if (status === 'uploading') return
        if (!/\.pdf$/i.test(f.name)) {
            toast.error('仅支持 PDF 文件')
            return
        }

        setFile(f)
        setStatus('uploading')
        setProgress(8)
        // 模拟进度（后端无进度事件）：递增至 95%，完成后跳 100
        timerRef.current = setInterval(() => {
            setProgress((p) => (p < 95 ? Math.min(95, p + Math.random() * 14 + 5) : p))
        }, 300)

        void (async () => {
            try {
                const entry = await importFile(f)
                if (entry) {
                    setProgress(100)
                    setStatus('done')
                    // 导入成功自动选中（空列表时直接进入详情）
                    setActive(entry.id)
                    toast.success(`「${f.name}」导入完成`)
                } else {
                    setStatus('error')
                    toast.error(useLiteratureStore.getState().error ?? '导入失败')
                }
            } catch {
                setStatus('error')
                toast.error('导入失败')
            } finally {
                if (timerRef.current) {
                    clearInterval(timerRef.current)
                    timerRef.current = null
                }
            }
        })()
    }

    const pickFiles = (list: FileList | null) => {
        if (!list?.length) return
        startUpload(list[0])
    }

    return (
        <div className="flex h-full flex-col">
            {/* 页头（设计稿 editor-header：chip「新建文献」+ 关闭按钮 + 大标题） */}
            <div className="flex flex-col gap-3 px-7 pt-5 pb-4">
                <div className="flex items-center gap-3">
                    <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs text-muted-foreground">
                        <List className="size-3.5" />
                        新建文献
                    </span>
                    {uploadOpen && (
                        <button
                            onClick={closeUpload}
                            title="关闭"
                            className="ml-auto grid size-[30px] place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    )}
                </div>
                <h1 className="text-2xl leading-tight font-bold">导入文献</h1>
            </div>
            <div className="mx-7 h-px shrink-0 bg-border" />

            {/* upload-wrap（设计稿：居中卡片 + dropzone + 文件行） */}
            <div className="flex flex-1 items-center justify-center overflow-y-auto px-10 py-8">
                <div className="w-[520px] max-w-full">
                    <div className="text-center text-lg font-bold">上传文献文件</div>
                    <div className="mt-1.5 text-center text-[13px] text-muted-foreground">
                        支持 PDF 文件，选择后自动上传并补全元数据
                    </div>

                    {/* dropzone（设计稿：虚线框 + 蓝色图标方块 + hover 蓝边） */}
                    <div
                        onClick={() => {
                            if (status !== 'uploading') inputRef.current?.click()
                        }}
                        onDragOver={(e) => {
                            e.preventDefault()
                            setDragOver(true)
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault()
                            setDragOver(false)
                            pickFiles(e.dataTransfer.files)
                        }}
                        className={cn(
                            'mt-5 flex cursor-pointer flex-col items-center gap-3 rounded-[14px] border-2 border-dashed px-6 py-11 transition-colors',
                            status === 'uploading' && 'pointer-events-none opacity-70',
                            dragOver
                                ? 'border-primary bg-primary/5'
                                : 'border-border bg-card hover:border-primary/60'
                        )}
                    >
                        <div className="grid size-12 place-items-center rounded-[14px] bg-primary/10 text-primary">
                            <FileUp className="size-[22px]" />
                        </div>
                        <div className="text-sm font-semibold text-foreground">拖拽文件到此处</div>
                        <div className="text-xs text-muted-foreground">
                            或 <span className="font-semibold text-primary">点击选择文件</span>
                        </div>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => {
                                pickFiles(e.target.files)
                                e.target.value = '' // 允许重复选择同一文件
                            }}
                        />
                    </div>

                    {/* 文件行（设计稿 file-item：图标 + 名称 + 大小 + 进度 + 状态） */}
                    {file && (
                        <div className="mt-4 flex items-center gap-3 rounded-[10px] border border-border bg-card px-3.5 py-3">
                            <div className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                <FileText className="size-[18px]" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] text-foreground">{file.name}</div>
                                <div className="mt-0.5 text-[11px] text-muted-foreground">
                                    {humanSize(file.size)}
                                </div>
                                {status === 'uploading' && (
                                    <div className="mt-1.5 h-1 overflow-hidden rounded-[2px] bg-border">
                                        <div
                                            className="h-full bg-primary transition-[width] duration-200"
                                            style={{ width: `${Math.floor(progress)}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                            <div
                                className={cn(
                                    'shrink-0 text-xs font-semibold',
                                    status === 'done' && 'text-success',
                                    status === 'error' && 'text-destructive',
                                    (status === 'idle' || status === 'uploading') && 'text-muted-foreground'
                                )}
                            >
                                {status === 'done'
                                    ? '✓ 完成'
                                    : status === 'error'
                                      ? '× 失败'
                                      : status === 'uploading'
                                        ? `${Math.floor(progress)}%`
                                        : '—'}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
