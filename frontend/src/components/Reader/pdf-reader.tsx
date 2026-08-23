import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ArrowLeft, Bot, ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { loadPdfDocument } from '@/services/pdf'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { useAnnotationStore } from '@/store/useAnnotationStore'
import { useNoteStore, type AiAskType } from '@/store/useNoteStore'
import { PdfPage, type TextSelection } from './pdf-page'
import { SelectionToolbar } from './selection-toolbar'
import { AnnotationPopup } from './annotation-popup'
import { TranslatePopup } from './translate-popup'
import { CitePicker } from './cite-picker'

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const SCALE_STEP = 0.25

/**
 * PDF 阅读器（F5）主组件：加载 + 工具栏（翻页/缩放/页码）+ 划词浮层编排。
 * 渲染在中间面板（文献模式 + readerId 非空时替代文献详情）。
 */
export function PdfReader() {
    const entries = useLiteratureStore((s) => s.entries)
    const readerId = useLiteratureStore((s) => s.readerId)
    const closeReader = useLiteratureStore((s) => s.closeReader)
    const prefillAiTask = useNoteStore((s) => s.prefillAiTask)
    const toggleAiPanel = useNoteStore((s) => s.toggleAiPanel)
    const isAiPanelOpen = useNoteStore((s) => s.isAiPanelOpen)

    // M2 A1：高亮批注数据源（进入阅读器时 load 一次全量，store 内部去重）
    const annotations = useAnnotationStore((s) => s.annotations)
    const loadAnnotations = useAnnotationStore((s) => s.load)
    const addAnnotation = useAnnotationStore((s) => s.add)
    const updateNote = useAnnotationStore((s) => s.updateNote)
    const removeAnnotation = useAnnotationStore((s) => s.remove)

    useEffect(() => {
        void loadAnnotations()
    }, [loadAnnotations])

    const entry = useMemo(
        () => entries.find((e) => e.id === readerId) ?? null,
        [entries, readerId]
    )

    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pageNumber, setPageNumber] = useState(1)
    const [totalPages, setTotalPages] = useState(0)
    const [scale, setScale] = useState(1)
    const [selection, setSelection] = useState<TextSelection | null>(null)
    const [citeOpen, setCiteOpen] = useState(false)
    // M2 A1：批注浮层状态（点击高亮 mark 打开；rect 供浮层定位）
    const [popup, setPopup] = useState<{ annId: string; rect: DOMRect } | null>(null)
    // M2 A2：翻译浮层状态（点击划词浮层「翻译」打开；text/rect 在清选区前捕获）
    const [translatePopup, setTranslatePopup] = useState<{
        text: string
        rect: { top: number; left: number; right: number; bottom: number }
    } | null>(null)

    // 加载 PDF：entry.id 变化（切换文献/关闭）时重载；cleanup 释放旧文档
    useEffect(() => {
        if (!entry) return
        let cancelled = false
        let doc: PDFDocumentProxy | null = null

        setLoading(true)
        setError(null)
        setPageNumber(1)
        setTotalPages(0)
        setSelection(null)
        setCiteOpen(false)
        setPopup(null)
        setTranslatePopup(null)

        loadPdfDocument(entry.pdfPath)
            .then((d) => {
                if (cancelled) {
                    void d.cleanup()
                    return
                }
                doc = d
                setPdf(d)
                setTotalPages(d.numPages)
                setPageNumber(1)
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : 'PDF 加载失败')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
            if (doc) void doc.cleanup()
            setPdf(null)
        }
    }, [entry?.id])

    const clearSelection = useCallback(() => setSelection(null), [])

    // M2 A1：当前页高亮（docId + pageNumber 过滤；渲染注入见 PdfPage）
    const pageAnnotations = useMemo(
        () =>
            entry
                ? annotations.filter(
                      (a) => a.docId === entry.id && a.pageNumber === pageNumber
                  )
                : [],
        [annotations, entry, pageNumber]
    )

    // 翻页/缩放统一走这里：夹边界 + 清空划词浮层
    const goTo = useCallback(
        (n: number) => {
            setPageNumber(Math.max(1, Math.min(totalPages || 1, n)))
            clearSelection()
        },
        [totalPages, clearSelection]
    )

    const zoom = useCallback(
        (next: number) => {
            setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, next)))
        },
        []
    )

    // 划词动作
    const handleCopy = useCallback(async () => {
        if (!selection) return
        try {
            await navigator.clipboard.writeText(selection.text)
        } catch (e) {
            console.error('复制失败:', e)
        }
        clearSelection()
    }, [selection, clearSelection])

    // F7：划词提问三子项（解释/翻译/总结）→ 打开面板并自动发送（对话模式 + 单篇限定）
    // bugfix：带出处信息（文献标题 + 页码），AI 回答的来源标注与划词页码一致
    const handleAskAi = useCallback(
        (type: AiAskType) => {
            if (!selection || !entry) return
            prefillAiTask(type, selection.text, selection.pageNumber, entry.title)
            clearSelection()
        },
        [selection, entry, prefillAiTask, clearSelection]
    )

    const handleCite = useCallback(() => {
        setCiteOpen(true)
    }, [])

    // M2 A1：划词 → 固化为高亮（锚定段为空 = 文本层未就绪，不落空数据）
    const handleHighlight = useCallback(() => {
        if (!selection || !entry) return
        if (selection.segments.length === 0) return
        addAnnotation({
            docId: entry.id,
            pageNumber: selection.pageNumber,
            segments: selection.segments,
            note: '',
        })
        clearSelection()
    }, [selection, entry, addAnnotation, clearSelection])

    // M2 A2：划词翻译 → 打开译文浮层（text/rect 在清选区前捕获，浮层不依赖选区存活）
    const handleTranslate = useCallback(() => {
        if (!selection) return
        setTranslatePopup({ text: selection.text, rect: selection.rect })
        clearSelection()
    }, [selection, clearSelection])

    // M2 A1：点击高亮 mark → 打开批注浮层（同时关闭划词浮层，避免重叠）
    const handleAnnotationClick = useCallback(
        (annId: string, rect: DOMRect) => {
            setPopup({ annId, rect })
            clearSelection()
        },
        [clearSelection]
    )

    // M2 A1：浮层展示的数据（annotation 被删除/数据未加载时浮层不渲染）
    const popupAnnotation = useMemo(
        () => (popup ? annotations.find((a) => a.id === popup.annId) ?? null : null),
        [annotations, popup]
    )

    const handleCiteClose = useCallback(() => {
        setCiteOpen(false)
        clearSelection()
    }, [clearSelection])

    if (!entry) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                未选择文献
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background">
            {/* 工具栏（UI 重构 Step 6，设计稿 reader-toolbar：48px、surface 底、返回蓝字、标题居中） */}
            <div className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
                {/* 返回详情（设计稿 .back：蓝色文字按钮） */}
                <button
                    onClick={closeReader}
                    className="flex h-8 items-center gap-1.5 rounded-[7px] py-0 pl-2.5 pr-3 text-[13px] font-medium text-primary transition-colors hover:bg-background"
                    title="返回文献详情"
                >
                    <ArrowLeft className="size-4" />
                    返回详情
                </button>

                {/* 标题（设计稿 .rtitle：居中省略） */}
                <div className="min-w-0 flex-1 truncate text-center text-[13px] text-muted-foreground" title={entry.title}>
                    {entry.title || '未命名文献'}
                </div>

                {/* 缩放组（设计稿 zoom-group：− 100% +） */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => zoom(scale - SCALE_STEP)}
                        disabled={scale <= MIN_SCALE}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
                        title="缩小"
                    >
                        <ZoomOut className="size-4" />
                    </button>
                    <span className="w-11 text-center font-mono text-xs text-foreground">
                        {Math.round(scale * 100)}%
                    </span>
                    <button
                        onClick={() => zoom(scale + SCALE_STEP)}
                        disabled={scale >= MAX_SCALE}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
                        title="放大"
                    >
                        <ZoomIn className="size-4" />
                    </button>
                </div>

                {/* 页码组（设计稿 page-info：第 x / n 页） */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => goTo(pageNumber - 1)}
                        disabled={pageNumber <= 1}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
                        title="上一页"
                    >
                        <ChevronLeft className="size-4" />
                    </button>
                    <input
                        type="number"
                        value={pageNumber}
                        min={1}
                        max={totalPages || 1}
                        onChange={(e) => {
                            const v = Number(e.target.value)
                            if (Number.isFinite(v)) goTo(v)
                        }}
                        className="h-8 w-14 rounded-md border border-input bg-background px-1 text-center text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <span className="text-xs text-muted-foreground">/ {totalPages}</span>
                    <button
                        onClick={() => goTo(pageNumber + 1)}
                        disabled={pageNumber >= totalPages}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
                        title="下一页"
                    >
                        <ChevronRight className="size-4" />
                    </button>
                </div>

                {/* F7：单篇问答入口（docId = 当前文献，AI 面板上下文条显示单篇） */}
                <button
                    onClick={toggleAiPanel}
                    className={`flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] transition-colors ${
                        isAiPanelOpen
                            ? 'bg-primary font-medium text-primary-foreground'
                            : 'text-muted-foreground hover:bg-background hover:text-foreground'
                    }`}
                    title="问 AI（问答自动限定当前文献）"
                >
                    <Bot className="size-4" />
                    问 AI
                </button>
            </div>

            {/* 页面区 */}
            <div className="relative flex-1 overflow-auto">
                <div className="flex min-h-full flex-col items-center gap-4 py-6">
                    {loading && (
                        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            加载 PDF 中…
                        </div>
                    )}

                    {!loading && error && (
                        <div className="py-16 text-sm text-destructive">{error}</div>
                    )}

                    {!loading && !error && pdf && (
                        <PdfPage
                            pdf={pdf}
                            pageNumber={pageNumber}
                            scale={scale}
                            onTextSelect={setSelection}
                            annotations={pageAnnotations}
                            onAnnotationClick={handleAnnotationClick}
                        />
                    )}
                </div>
            </div>

            {/* 划词浮层 */}
            {selection && !citeOpen && (
                <SelectionToolbar
                    selection={selection}
                    onCopy={handleCopy}
                    onCite={handleCite}
                    onAskAi={handleAskAi}
                    onHighlight={handleHighlight}
                    onTranslate={handleTranslate}
                />
            )}

            {/* M2 A1：批注编辑浮层（key 保证 annotation 切换时编辑态重置） */}
            {popup && popupAnnotation && (
                <AnnotationPopup
                    key={popupAnnotation.id}
                    annotation={popupAnnotation}
                    rect={popup.rect}
                    onSave={(note) => {
                        updateNote(popupAnnotation.id, note)
                        setPopup(null)
                    }}
                    onDelete={() => {
                        removeAnnotation(popupAnnotation.id)
                        setPopup(null)
                    }}
                    onClose={() => setPopup(null)}
                />
            )}

            {/* M2 A2：划词翻译浮层（挂载即请求，流式显示译文） */}
            {translatePopup && (
                <TranslatePopup
                    text={translatePopup.text}
                    rect={translatePopup.rect}
                    docId={entry.id}
                    onClose={() => setTranslatePopup(null)}
                />
            )}

            {/* 转笔记引用选择器 */}
            <CitePicker
                open={citeOpen}
                literature={{ id: entry.id, title: entry.title }}
                pageNumber={selection?.pageNumber ?? pageNumber}
                text={selection?.text ?? ''}
                onClose={handleCiteClose}
            />
        </div>
    )
}
