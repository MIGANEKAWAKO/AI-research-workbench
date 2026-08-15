import { useMemo, useState } from 'react'
import { FileText, Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { ImportSheet } from './import-sheet'

const STATUS_FILTERS = ['全部', '未读', '在读', '已读'] as const

/**
 * 文献列表（F4，渲染在侧边栏文献模式下）：
 * 搜索（标题/作者）+ 状态过滤 + 导入入口 + 选中高亮
 */
export const LiteratureList = () => {
    const entries = useLiteratureStore((s) => s.entries)
    const loading = useLiteratureStore((s) => s.loading)
    const activeId = useLiteratureStore((s) => s.activeId)
    const setActive = useLiteratureStore((s) => s.setActive)

    const [keyword, setKeyword] = useState('')
    const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('全部')
    const [importOpen, setImportOpen] = useState(false)

    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase()
        return entries.filter((e) => {
            if (statusFilter !== '全部' && e.status !== statusFilter) return false
            if (!kw) return true
            const authorText = e.authors.map((a) => `${a.given} ${a.family}`).join(' ')
            return (
                e.title.toLowerCase().includes(kw) ||
                authorText.toLowerCase().includes(kw)
            )
        })
    }, [entries, keyword, statusFilter])

    return (
        <div className="flex h-full flex-col">
            {/* 搜索 + 导入 */}
            <div className="space-y-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="搜索文献（标题/作者）"
                        className="h-8 pl-8"
                    />
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                        {STATUS_FILTERS.map((s) => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                                    statusFilter === s
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'text-muted-foreground hover:bg-sidebar-accent'
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setImportOpen(true)}
                        className="flex items-center gap-1 rounded-md bg-purple-600 px-2 py-1 text-xs text-white transition-colors hover:bg-purple-700"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        导入
                    </button>
                </div>
            </div>

            {/* 列表 */}
            <div className="mt-2 flex-1 space-y-1 overflow-y-auto pb-4">
                {loading && entries.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">加载中…</div>
                )}
                {!loading && filtered.length === 0 && (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                        {entries.length === 0 ? '暂无文献，点击右上角"导入"' : '未找到匹配的文献'}
                    </div>
                )}
                {filtered.map((e) => (
                    <button
                        key={e.id}
                        onClick={() => setActive(activeId === e.id ? null : e.id)}
                        className={`flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                            activeId === e.id
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'hover:bg-sidebar-accent/60'
                        }`}
                    >
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{e.title || '未命名文献'}</span>
                        </span>
                        <span className="flex items-center gap-2 pl-5 text-xs text-muted-foreground">
                            <span className="truncate">
                                {e.authors.map((a) => `${a.given} ${a.family}`).join(', ') || '作者未知'}
                                {e.year ? `（${e.year}）` : ''}
                            </span>
                            <span
                                className={`shrink-0 rounded px-1 py-px text-[10px] ${
                                    e.status === '已读'
                                        ? 'bg-green-100 text-green-700'
                                        : e.status === '在读'
                                          ? 'bg-amber-100 text-amber-700'
                                          : 'bg-gray-100 text-gray-500'
                                }`}
                            >
                                {e.status}
                            </span>
                        </span>
                    </button>
                ))}
            </div>

            <ImportSheet open={importOpen} onOpenChange={setImportOpen} />
        </div>
    )
}
