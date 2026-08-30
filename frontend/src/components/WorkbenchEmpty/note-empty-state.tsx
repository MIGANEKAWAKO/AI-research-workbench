import { useMemo } from 'react'
import { toast } from 'sonner'
import { LayoutTemplate, PenLine, Sparkles, Upload } from 'lucide-react'
import { useDataStore } from '@/store/useDataStore'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { useNoteStore } from '@/store/useNoteStore'
import { RecentGrid, type RecentItem } from './recent-grid'
import './empty-state.scss'

/**
 * 笔记工作台空状态（未选中任何笔记）——静态设计稿 view-empty 移植：
 * HERO ILLUSTRATION（三张悬浮卡片 + 连线 + 粒子）→ 标题区 →
 * 快捷操作（新建空白笔记 / 从模板开始 / 导入文献 / 问问 AI）→ 最近打开。
 *
 * 快捷操作接线（对应静态稿 JS）：
 *   new-note → 与侧边栏「新建笔记」同逻辑（saveNote + setActiveNote）
 *   template → toast 占位（模板库未实现）
 *   import   → 切到文献模式并打开上传页（静态稿路由到 upload）
 *   ai       → 打开 AI 面板
 * 最近打开为真实数据：仅笔记（按 updatedAt 倒序）——不混入文献，
 * 否则切换到文献 tab 加载文献列表后，笔记空状态会随 store 变化混入文献条目。
 */
export const NoteEmptyState = () => {
    const notes = useDataStore((s) => s.notes)
    const collections = useDataStore((s) => s.collections)
    const setActiveNote = useNoteStore((s) => s.setActiveNote)
    const setView = useNoteStore((s) => s.setView)
    const toggleAiPanel = useNoteStore((s) => s.toggleAiPanel)

    // 最近打开：仅笔记（按 updatedAt 倒序）
    const recent = useMemo<RecentItem[]>(
        () =>
            [...notes]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, 8)
                .map((n) => ({
                    kind: 'note',
                    id: String(n.id),
                    ts: n.updatedAt,
                    title: n.title || '无标题',
                    coll: collections.find((c) => c.id === n.collectionId)?.name ?? '未分类',
                    info: `${n.content.trim().length} 字`,
                })),
        [notes, collections]
    )

    const handleOpenRecent = (item: RecentItem) => {
        setActiveNote(Number(item.id))
    }

    const handleNewNote = () => {
        const id = useDataStore.getState().saveNote({ title: '新笔记', content: '' })
        setActiveNote(id)
    }

    const handleImport = () => {
        setView('library')
        useLiteratureStore.getState().openUpload()
    }

    const handleSeeAll = () => {
        const input = document.querySelector<HTMLInputElement>('input[placeholder="搜索笔记…"]')
        if (input) {
            input.focus()
        } else {
            toast.info('全部笔记可在左侧列表查看')
        }
    }

    return (
        <div className="es-stage">
            <div className="es-stage-inner">
                {/* HERO ILLUSTRATION（设计稿原图：中央激活卡片 + 左右倾斜背景卡 + 虚线连接 + 粒子） */}
                <svg className="es-hero float" viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" fill="none">
                    <defs>
                        <linearGradient id="esCardG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.95" />
                            <stop offset="100%" stopColor="var(--blue-2)" stopOpacity="0.78" />
                        </linearGradient>
                        <linearGradient id="esCardShine" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="white" stopOpacity="0.20" />
                            <stop offset="100%" stopColor="white" stopOpacity="0" />
                        </linearGradient>
                        <filter id="esGlow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="6" />
                        </filter>
                    </defs>

                    {/* soft blue glow underneath central card */}
                    <ellipse cx="170" cy="120" rx="90" ry="22" fill="var(--blue)" opacity="0.20" filter="url(#esGlow)" />

                    {/* subtle dotted connection lines */}
                    <g style={{ color: 'var(--blue)' }} stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.55">
                        <path d="M 80 90 Q 110 60 150 78" strokeDasharray="1.5,4" />
                        <path d="M 200 78 Q 240 100 250 130" strokeDasharray="1.5,4" />
                        <path d="M 195 130 Q 150 152 80 130" strokeDasharray="1.5,4" />
                    </g>

                    {/* background card 1 (left, blue tint, tilted) */}
                    <g transform="translate(20 56) rotate(-6 50 40)">
                        <rect width="100" height="92" rx="10" style={{ fill: 'var(--surface)', stroke: 'var(--border)', strokeWidth: 1 }} />
                        <rect x="11" y="16" width="60" height="3.5" rx="1.75" style={{ fill: 'var(--blue)', opacity: 0.75 }} />
                        <rect x="11" y="30" width="78" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="40" width="66" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="50" width="74" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="60" width="40" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        {/* tag chip */}
                        <rect x="11" y="72" width="34" height="10" rx="5" style={{ fill: 'var(--blue-soft)', stroke: 'var(--blue)', strokeWidth: 0.6, strokeOpacity: 0.6 }} />
                    </g>

                    {/* central active card */}
                    <g transform="translate(105 30)">
                        {/* shadow */}
                        <rect x="2" y="6" width="124" height="138" rx="12" fill="black" opacity="0.18" />
                        {/* card body */}
                        <rect width="124" height="138" rx="12" fill="url(#esCardG)" style={{ stroke: 'var(--blue)', strokeWidth: 1.5 }} />
                        {/* top shine */}
                        <rect width="124" height="62" rx="12" fill="url(#esCardShine)" />
                        {/* cover label area: title bar */}
                        <rect x="14" y="18" width="68" height="4.5" rx="2.25" fill="white" opacity="0.95" />
                        {/* author line */}
                        <rect x="14" y="32" width="42" height="2.5" rx="1.25" fill="white" opacity="0.65" />
                        {/* divider */}
                        <line x1="14" y1="44" x2="110" y2="44" stroke="white" strokeOpacity="0.25" />
                        {/* body lines */}
                        <rect x="14" y="54" width="96" height="2.5" rx="1.25" fill="white" opacity="0.65" />
                        <rect x="14" y="64" width="80" height="2.5" rx="1.25" fill="white" opacity="0.65" />
                        <rect x="14" y="74" width="92" height="2.5" rx="1.25" fill="white" opacity="0.65" />
                        {/* callout */}
                        <rect x="14" y="86" width="50" height="16" rx="4" fill="white" opacity="0.30" />
                        {/* bullets */}
                        <circle cx="18" cy="111" r="2" fill="white" opacity="0.85" />
                        <rect x="25" y="109" width="78" height="2.5" rx="1.25" fill="white" opacity="0.65" />
                        <circle cx="18" cy="121" r="2" fill="white" opacity="0.85" />
                        <rect x="25" y="119" width="62" height="2.5" rx="1.25" fill="white" opacity="0.65" />
                        {/* pin/glow node */}
                        <circle cx="62" cy="125" r="3" fill="white" />
                    </g>

                    {/* background card 2 (right, green tint, tilted) */}
                    <g transform="translate(212 64) rotate(5 50 40)">
                        <rect width="98" height="92" rx="10" style={{ fill: 'var(--surface)', stroke: 'var(--green)', strokeWidth: 1, strokeOpacity: 0.45 }} />
                        <rect x="11" y="16" width="50" height="3.5" rx="1.75" style={{ fill: 'var(--green)', opacity: 0.85 }} />
                        <rect x="11" y="30" width="78" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="40" width="58" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="50" width="68" height="2" rx="1" style={{ fill: 'var(--text-3)', opacity: 0.7 }} />
                        <rect x="11" y="72" width="28" height="10" rx="5" style={{ fill: 'var(--green-soft)', stroke: 'var(--green)', strokeWidth: 0.6, strokeOpacity: 0.5 }} />
                    </g>

                    {/* floating particles */}
                    <g>
                        <circle cx="40" cy="30" r="2" style={{ fill: 'var(--blue)', opacity: 0.55 }} />
                        <circle cx="290" cy="40" r="2.5" style={{ fill: 'var(--blue)', opacity: 0.55 }} />
                        <circle cx="290" cy="40" r="6" style={{ stroke: 'var(--blue)', strokeWidth: 1, fill: 'none', opacity: 0.20 }} />
                        <circle cx="60" cy="170" r="2" style={{ fill: 'var(--green)', opacity: 0.55 }} />
                        <circle cx="270" cy="178" r="2" style={{ fill: 'var(--amber)', opacity: 0.6 }} />
                        <circle cx="160" cy="20" r="1.4" style={{ fill: 'var(--text-3)', opacity: 0.6 }} />
                    </g>
                </svg>

                {/* HEADLINE */}
                <div className="es-headline">
                    <div className="es-eyebrow">
                        <span className="es-pulse"></span>
                        知微 · 知识工作台
                    </div>
                    <h1 className="es-title">
                        选择一篇笔记继续，或<span className="accent">从一张白纸</span>开始
                    </h1>
                    <p className="es-sub">
                        在 知微 中，笔记、文献与想法连成一张可以持续生长的网络。AI 问答、智能引用、双向链接都在你选中文档之后随时可用。
                    </p>
                </div>

                {/* QUICK ACTIONS */}
                <div className="es-actions">
                    <button type="button" className="es-card primary" onClick={handleNewNote}>
                        <span className="es-card-kbd">⌘ N</span>
                        <div className="es-card-icon">
                            <PenLine className="size-5" strokeWidth={1.8} />
                        </div>
                        <div>
                            <div className="es-card-title">新建空白笔记</div>
                            <div className="es-card-desc">从零开始，支持 Markdown 与 AI 续写。</div>
                        </div>
                        <svg className="es-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        className="es-card accent-green"
                        onClick={() => toast.info('模板库即将开放')}
                    >
                        <div className="es-card-icon">
                            <LayoutTemplate className="size-5" strokeWidth={1.8} />
                        </div>
                        <div>
                            <div className="es-card-title">从模板开始</div>
                            <div className="es-card-desc">论文、读书笔记、实验记录、选题 4 套。</div>
                        </div>
                        <svg className="es-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    <button type="button" className="es-card accent-amber" onClick={handleImport}>
                        <div className="es-card-icon">
                            <Upload className="size-5" strokeWidth={1.8} />
                        </div>
                        <div>
                            <div className="es-card-title">导入文献</div>
                            <div className="es-card-desc">拖入 PDF / BibTeX / 网页自动解析。</div>
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
                            <div className="es-card-desc">基于全库检索，引用到当前笔记。</div>
                        </div>
                        <svg className="es-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>

                {/* RECENT ACTIVITY */}
                <div className="es-recent">
                    <div className="es-recent-head">
                        <span className="es-recent-title">最近打开</span>
                        <button type="button" className="es-recent-link" onClick={handleSeeAll}>
                            查看全部
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                    <RecentGrid items={recent} onOpen={handleOpenRecent} />
                </div>
            </div>
        </div>
    )
}
