import { useMemo } from 'react'
import { toast } from 'sonner'
import { FilePlus, Search, Sparkles, Upload } from 'lucide-react'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { useNoteStore } from '@/store/useNoteStore'
import { RecentGrid, type RecentItem } from './recent-grid'
import './empty-state.scss'

/**
 * 文献工作台空状态（未选中任何文献）——静态设计稿 view-lit-empty 移植：
 * HERO ILLUSTRATION (literature / research motif)（中央文档 + 放大镜 +
 * 书签 + 左右倾斜背景卡）→ 标题区 → 快捷操作（导入文献 / 新建文献条目 /
 * 智能检索 / 问问 AI）→ 最近导入的文献。
 *
 * 快捷操作接线（对应静态稿 JS）：
 *   import → 打开上传页
 *   new-lit（新建文献条目）/ search（智能检索）→ 功能开发中，toast 提示
 *   ai     → 打开 AI 面板
 * 最近导入 = 后端 entries（已按 importedAt 倒序），点击选中并打开详情；
 * 「查看全部」聚焦左侧文献搜索框。
 */
export const LiteratureEmptyState = () => {
    const entries = useLiteratureStore((s) => s.entries)
    const collections = useLiteratureStore((s) => s.collections)
    const setActive = useLiteratureStore((s) => s.setActive)
    const openUpload = useLiteratureStore((s) => s.openUpload)
    const toggleAiPanel = useNoteStore((s) => s.toggleAiPanel)

    const recent = useMemo<RecentItem[]>(
        () =>
            entries.slice(0, 6).map((e) => ({
                kind: 'lit',
                id: e.id,
                ts: new Date(e.importedAt).getTime() || 0,
                title: e.title || '未命名文献',
                coll: collections.find((c) => e.collectionIds?.includes(c.id))?.name ?? '未分类',
                info: e.year !== null && e.year !== undefined ? `PDF · ${e.year}` : 'PDF',
            })),
        [entries, collections]
    )

    const handleSearch = () => {
        const input = document.querySelector<HTMLInputElement>('input[placeholder="搜索文献…"]')
        if (input) {
            input.focus()
        } else {
            toast.info('展开左侧栏，在检索框输入关键词检索文献库')
        }
    }

    return (
        <div className="es-stage">
            <div className="es-stage-inner">
                {/* HERO ILLUSTRATION (literature / research motif)：文档卡 + 放大镜 + 书签 + 粒子 */}
                <svg className="es-hero float" viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" fill="none">
                    <defs>
                        <linearGradient id="lesCardG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.95" />
                            <stop offset="100%" stopColor="var(--blue-2)" stopOpacity="0.78" />
                        </linearGradient>
                        <linearGradient id="lesCardShine" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="white" stopOpacity="0.20" />
                            <stop offset="100%" stopColor="white" stopOpacity="0" />
                        </linearGradient>
                        <filter id="lesGlow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="6" />
                        </filter>
                    </defs>

                    {/* soft blue glow underneath central card */}
                    <ellipse cx="168" cy="120" rx="92" ry="22" fill="var(--blue)" opacity="0.20" filter="url(#lesGlow)" />

                    {/* subtle dotted connection lines */}
                    <g style={{ color: 'var(--blue)' }} stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.55">
                        <path d="M 80 92 Q 112 62 150 80" strokeDasharray="1.5,4" />
                        <path d="M 196 80 Q 238 102 248 132" strokeDasharray="1.5,4" />
                        <path d="M 192 132 Q 150 154 80 132" strokeDasharray="1.5,4" />
                    </g>

                    {/* background card 1 (left, blue tint, tilted) */}
                    <g transform="translate(18 56) rotate(-6 50 40)">
                        <rect width="100" height="92" rx="10" style={{ fill: 'var(--surface)', stroke: 'var(--border)', strokeWidth: 1 }} />
                        <rect x="11" y="16" width="60" height="3.5" rx="1.75" style={{ fill: 'var(--blue)', opacity: 0.75 }} />
                        <rect x="11" y="30" width="78" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="40" width="66" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="50" width="74" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="60" width="40" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="72" width="34" height="10" rx="5" style={{ fill: 'var(--blue-soft)', stroke: 'var(--blue)', strokeWidth: 0.6, strokeOpacity: 0.6 }} />
                    </g>

                    {/* central document + magnifying glass */}
                    <g transform="translate(104 26)">
                        <rect x="2" y="6" width="116" height="146" rx="12" fill="black" opacity="0.18" />
                        <rect width="116" height="146" rx="12" fill="url(#lesCardG)" style={{ stroke: 'var(--blue)', strokeWidth: 1.5 }} />
                        <rect width="116" height="64" rx="12" fill="url(#lesCardShine)" />
                        <rect x="14" y="18" width="64" height="4.5" rx="2.25" fill="white" opacity="0.95" />
                        <rect x="14" y="32" width="40" height="2.5" rx="1.25" fill="white" opacity="0.65" />
                        <line x1="14" y1="44" x2="102" y2="44" stroke="white" strokeOpacity="0.25" />
                        <rect x="14" y="54" width="90" height="2.5" rx="1.25" fill="white" opacity="0.65" />
                        <rect x="14" y="64" width="76" height="2.5" rx="1.25" fill="white" opacity="0.65" />
                        <rect x="14" y="74" width="86" height="2.5" rx="1.25" fill="white" opacity="0.65" />
                        <rect x="14" y="86" width="50" height="16" rx="4" fill="white" opacity="0.30" />
                        {/* bookmark ribbon */}
                        <rect x="80" y="0" width="14" height="34" rx="3" fill="var(--amber)" />
                        <path d="M80 34 l7 8 7 -8 z" fill="var(--amber)" />
                        {/* magnifying glass */}
                        <circle cx="92" cy="120" r="20" fill="white" opacity="0.16" stroke="white" strokeWidth="3" />
                        <line x1="106" y1="134" x2="120" y2="148" stroke="white" strokeWidth="4" strokeLinecap="round" />
                        <path d="M86 114 l12 12 M98 114 l-12 12" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
                    </g>

                    {/* background card 2 (right, amber tint, tilted) */}
                    <g transform="translate(214 64) rotate(5 50 40)">
                        <rect width="98" height="92" rx="10" style={{ fill: 'var(--surface)', stroke: 'var(--amber)', strokeWidth: 1, strokeOpacity: 0.45 }} />
                        <rect x="11" y="16" width="50" height="3.5" rx="1.75" style={{ fill: 'var(--amber)', opacity: 0.85 }} />
                        <rect x="11" y="30" width="78" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="40" width="58" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="50" width="68" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="72" width="28" height="10" rx="5" style={{ fill: 'var(--amber-soft)', stroke: 'var(--amber)', strokeWidth: 0.6, strokeOpacity: 0.5 }} />
                    </g>

                    {/* floating particles */}
                    <g>
                        <circle cx="42" cy="32" r="2" style={{ fill: 'var(--blue)', opacity: 0.55 }} />
                        <circle cx="290" cy="44" r="2.5" style={{ fill: 'var(--amber)', opacity: 0.6 }} />
                        <circle cx="290" cy="44" r="6" style={{ stroke: 'var(--amber)', strokeWidth: 1, fill: 'none', opacity: 0.20 }} />
                        <circle cx="58" cy="172" r="2" style={{ fill: 'var(--green)', opacity: 0.55 }} />
                        <circle cx="268" cy="180" r="2" style={{ fill: 'var(--blue)', opacity: 0.55 }} />
                        <circle cx="160" cy="18" r="1.4" style={{ fill: 'var(--text-3)', opacity: 0.6 }} />
                    </g>
                </svg>

                {/* HEADLINE */}
                <div className="es-headline">
                    <div className="es-eyebrow">
                        <span className="es-pulse"></span>
                        知微 · 文献库
                    </div>
                    <h1 className="es-title">
                        选择一篇文献精读，或<span className="accent">从一次导入</span>开始
                    </h1>
                    <p className="es-sub">
                        在 知微 的文献库中，PDF、题录与笔记彼此关联。AI 全文总结、智能引用与跨文献对比，都会在你选中文献之后随时可用。
                    </p>
                </div>

                {/* QUICK ACTIONS */}
                <div className="es-actions">
                    <button type="button" className="es-card primary" onClick={openUpload}>
                        <span className="es-card-kbd">PDF</span>
                        <div className="es-card-icon">
                            <Upload className="size-5" strokeWidth={1.8} />
                        </div>
                        <div>
                            <div className="es-card-title">导入文献</div>
                            <div className="es-card-desc">拖入 PDF / BibTeX / 网页，自动解析题录。</div>
                        </div>
                        <svg className="es-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        className="es-card accent-green"
                        onClick={() => toast.info('功能开发中，敬请期待')}
                    >
                        <div className="es-card-icon">
                            <FilePlus className="size-5" strokeWidth={1.8} />
                        </div>
                        <div>
                            <div className="es-card-title">新建文献条目</div>
                            <div className="es-card-desc">手动录入题录、作者与元数据。</div>
                        </div>
                        <svg className="es-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        className="es-card accent-amber"
                        onClick={() => toast.info('功能开发中，敬请期待')}
                    >
                        <div className="es-card-icon">
                            <Search className="size-5" strokeWidth={1.8} />
                        </div>
                        <div>
                            <div className="es-card-title">智能检索</div>
                            <div className="es-card-desc">在文献库内全文检索关键词。</div>
                        </div>
                        <svg className="es-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    <button type="button" className="es-card accent-purple" onClick={toggleAiPanel}>
                        <div className="es-card-icon">
                            <Sparkles className="size-5" strokeWidth={1.6} />
                        </div>
                        <div>
                            <div className="es-card-title">问问 AI</div>
                            <div className="es-card-desc">跨文献对比、总结与引用。</div>
                        </div>
                        <svg className="es-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>

                {/* RECENT LITERATURE */}
                <div className="es-recent">
                    <div className="es-recent-head">
                        <span className="es-recent-title">最近导入的文献</span>
                        <button type="button" className="es-recent-link" onClick={handleSearch}>
                            查看全部
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                    <RecentGrid items={recent} onOpen={(item) => setActive(item.id)} />
                </div>
            </div>
        </div>
    )
}
