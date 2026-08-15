import { BookOpen, FileText, Trash2 } from 'lucide-react'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { useDataStore } from '@/store/useDataStore'

/**
 * 文献详情（F4，渲染在中间面板文献模式下）：
 * 元数据展示 + 阅读状态 + 反向引用（扫笔记 cites 字段，F6 引用系统的前瞻实现）+ 删除
 * 注：元数据编辑/状态更新依赖后端 PUT 接口（后续任务，当前只读）
 */
export const LiteratureDetail = () => {
    const entries = useLiteratureStore((s) => s.entries)
    const activeId = useLiteratureStore((s) => s.activeId)
    const remove = useLiteratureStore((s) => s.remove)
    const notes = useDataStore((s) => s.notes)

    const entry = entries.find((e) => e.id === activeId) ?? null

    if (!entry) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <BookOpen className="h-10 w-10" />
                <p className="text-sm">从左侧选择一篇文献查看详情</p>
                <p className="text-xs">文献库功能：导入 PDF → 元数据补全 → 阅读 → 引用（F5 起）</p>
            </div>
        )
    }

    // 反向引用：扫笔记 cites 字段（文献 ID 匹配）
    const citedBy = notes.filter((n) => n.cites?.includes(entry.id))

    const handleDelete = () => {
        if (confirm(`确定要删除文献「${entry.title}」吗？\n将同时删除 PDF 文件与向量索引。`)) {
            void remove(entry.id)
        }
    }

    const fields: { label: string; value: string }[] = [
        { label: '作者', value: entry.authors.map((a) => `${a.given} ${a.family}`).join(', ') },
        { label: '年份', value: entry.year ? String(entry.year) : '—' },
        { label: '期刊/会议', value: entry.venue || '—' },
        { label: '卷/期/页码', value: [entry.volume, entry.issue, entry.pages].filter(Boolean).join(' / ') || '—' },
        { label: 'DOI', value: entry.doi || '—' },
        { label: 'arXiv', value: entry.arxivId || '—' },
    ]

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            {/* 标题区 */}
            <div className="border-b px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-lg font-semibold leading-snug">{entry.title}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {entry.authors.map((a) => `${a.given} ${a.family}`).join(', ') || '作者未知'}
                            {entry.year ? `（${entry.year}）` : ''}
                        </p>
                    </div>
                    <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                            entry.status === '已读'
                                ? 'bg-green-100 text-green-700'
                                : entry.status === '在读'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-gray-100 text-gray-600'
                        }`}
                    >
                        {entry.status}
                    </span>
                </div>
            </div>

            {/* 元数据 */}
            <div className="px-6 py-4">
                <h2 className="mb-2 text-sm font-medium text-muted-foreground">元数据</h2>
                <dl className="space-y-1.5 text-sm">
                    {fields.map((f) => (
                        <div key={f.label} className="flex gap-3">
                            <dt className="w-20 shrink-0 text-muted-foreground">{f.label}</dt>
                            <dd className="min-w-0 break-all">{f.value}</dd>
                        </div>
                    ))}
                    <div className="flex gap-3">
                        <dt className="w-20 shrink-0 text-muted-foreground">PDF 路径</dt>
                        <dd className="min-w-0 break-all text-xs text-muted-foreground">{entry.pdfPath}</dd>
                    </div>
                </dl>
            </div>

            {/* 反向引用 */}
            <div className="px-6 pb-4">
                <h2 className="mb-2 text-sm font-medium text-muted-foreground">被笔记引用（{citedBy.length}）</h2>
                {citedBy.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        暂无笔记引用此文献（引用系统 F6 上线后可一键插入引用徽章）
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {citedBy.map((n) => (
                            <li key={n.id} className="flex items-center gap-2 text-sm">
                                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                {n.title}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* 操作区 */}
            <div className="mt-auto border-t px-6 py-4">
                <button
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                    <Trash2 className="h-4 w-4" />
                    删除文献（PDF + 索引 + 元数据）
                </button>
            </div>
        </div>
    )
}
