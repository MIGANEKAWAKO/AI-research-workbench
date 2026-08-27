import { BookOpen, FileText } from 'lucide-react'

/** 空状态「最近」列表条目（笔记/文献混合，kind 决定图标与配色） */
export interface RecentItem {
    kind: 'note' | 'lit'
    id: string
    ts: number
    title: string
    coll: string
    info: string
}

/**
 * 最近打开网格（设计稿 es-recent-grid / es-recent-item）：
 * 图标格（笔记=文件 / 文献=书本蓝底）→ 名称 → 集合 · 信息 两段式。
 */
export const RecentGrid = ({
    items,
    onOpen,
}: {
    items: RecentItem[]
    onOpen: (item: RecentItem) => void
}) => {
    if (items.length === 0) {
        return (
            <div className="rounded-[11px] border border-dashed border-border bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground/70">
                暂无内容，从左侧列表选择，或先新建一条
            </div>
        )
    }

    return (
        <div className="es-recent-grid">
            {items.map((it) => (
                <button
                    key={`${it.kind}-${it.id}`}
                    type="button"
                    className={`es-recent-item ${it.kind === 'lit' ? 'lit' : ''}`}
                    onClick={() => onOpen(it)}
                    title={it.title}
                >
                    <div className="es-recent-ico">
                        {it.kind === 'lit' ? (
                            <BookOpen className="size-4" strokeWidth={1.8} />
                        ) : (
                            <FileText className="size-4" strokeWidth={1.8} />
                        )}
                    </div>
                    <div className="es-recent-meta">
                        <div className="es-recent-name">{it.title}</div>
                        <div className="es-recent-info">
                            <span className="es-coll">{it.coll}</span>
                            <span className="dot"></span>
                            <span>{it.info}</span>
                        </div>
                    </div>
                </button>
            ))}
        </div>
    )
}
