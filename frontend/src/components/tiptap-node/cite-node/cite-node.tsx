import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { useNoteStore } from '@/store/useNoteStore'
import { formatAuthorYear } from '@/lib/citation'
import './cite-node.scss'

/**
 * Cite 节点的 React NodeView：渲染"作者+年份"徽章。
 * 点击 → 切到文献库视图 + 选中该文献（看完整元数据与反向引用）。
 * 文献元数据缺失时 fallback 显示 id 本身，保证引用不失效。
 */
export function CiteNodeView({ node }: NodeViewProps) {
    const id = node.attrs.id as string
    const entry = useLiteratureStore((s) => s.entries.find((e) => e.id === id))
    const setActive = useLiteratureStore((s) => s.setActive)
    const setView = useNoteStore((s) => s.setView)

    const label = entry ? formatAuthorYear(entry) : `cite:${id}`

    const handleClick = () => {
        setView('library')
        setActive(id)
    }

    return (
        <NodeViewWrapper as="span" className="cite-node" data-cite-id={id}>
            <button
                type="button"
                className="cite-badge"
                contentEditable={false}
                onClick={handleClick}
                title={entry?.title ?? `文献 ${id}`}
            >
                {label}
            </button>
        </NodeViewWrapper>
    )
}
