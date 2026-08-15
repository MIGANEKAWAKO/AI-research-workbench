import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useLiteratureStore } from '@/store/useLiteratureStore'
import { useNoteStore } from '@/store/useNoteStore'
import { formatReference } from '@/lib/citation'

/**
 * 笔记尾参考文献列表（F6）：扫描编辑器文档里的 cite 节点，按出现顺序去重编号，
 * 实时渲染（订阅 editor 的 update 事件）。点击条目 → 切文献模式 + 选中该文献。
 * 完整 GB/T 7714 / APA / IEEE 格式化由后端 B8 提供（用户亲手实现），此处简化格式。
 */
export function CitationList({ editor }: { editor: Editor | null }) {
    const [citeIds, setCiteIds] = useState<string[]>([])
    const entries = useLiteratureStore((s) => s.entries)
    const setActive = useLiteratureStore((s) => s.setActive)
    const setView = useNoteStore((s) => s.setView)

    useEffect(() => {
        if (!editor) return

        // 遍历文档树收集 cite 节点 id（去重保序）
        const collect = () => {
            const ids: string[] = []
            editor.state.doc.descendants((node) => {
                const id = node.attrs?.id
                if (node.type.name === 'cite' && typeof id === 'string' && id && !ids.includes(id)) {
                    ids.push(id)
                }
            })
            setCiteIds(ids)
        }

        collect()
        editor.on('update', collect)
        return () => {
            editor.off('update', collect)
        }
    }, [editor])

    if (citeIds.length === 0) return null

    const jumpTo = (id: string) => {
        setView('library')
        setActive(id)
    }

    return (
        <div className="mx-auto w-full max-w-[648px] shrink-0 border-t border-gray-200 px-6 py-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">参考文献</h3>
            <ol className="list-none space-y-1.5">
                {citeIds.map((id, i) => {
                    const entry = entries.find((e) => e.id === id)
                    return (
                        <li key={id} className="flex gap-2 text-sm">
                            <span className="shrink-0 text-muted-foreground">[{i + 1}]</span>
                            <button
                                onClick={() => jumpTo(id)}
                                className="text-left text-muted-foreground transition-colors hover:text-purple-600 hover:underline"
                                title={entry ? '点击查看文献详情' : '文献不存在或已删除'}
                            >
                                {entry ? formatReference(entry) : `未知文献（${id}）`}
                            </button>
                        </li>
                    )
                })}
            </ol>
        </div>
    )
}
