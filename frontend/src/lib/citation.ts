import type { LiteratureEntry } from '@/types'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * 引用系统（F6）的格式化纯函数。
 *
 * 职责边界：只做「元数据 → 展示字符串」的纯转换，不依赖 store/编辑器，可独立测试。
 * 完整 GB/T 7714 / APA / IEEE 格式化是后端 B8 的纯函数（用户亲手实现），
 * 这里只提供前端「徽章」与「参考文献列表」所需的简化展示格式。
 */

/**
 * 从文档树收集 cite 节点 id（去重保序）。
 * 用途：编辑器保存时把文档里的引用同步到 note.cites（→ frontmatter cites，
 * B8 导出与反向引用依赖它）；与 CitationList 的扫描逻辑同源。
 */
export function collectCiteIds(doc: ProseMirrorNode): string[] {
    const ids: string[] = []
    doc.descendants((node) => {
        const id = node.attrs?.id
        if (node.type.name === 'cite' && typeof id === 'string' && id && !ids.includes(id)) {
            ids.push(id)
        }
    })
    return ids
}

/** 作者姓氏列表（family，缺 family 时退回 given），空值过滤 */
export function authorFamilies(entry: LiteratureEntry): string[] {
    return entry.authors
        .map((a) => (a.family || a.given).trim())
        .filter(Boolean)
}

/**
 * 徽章文本：作者 + 年份（学术惯例）。
 * 1 人 "Smith 2017"；2 人 "Smith & Jones 2017"；3+ 人 "Smith et al. 2017"；
 * 无作者 "佚名"；无年份只作者。
 */
export function formatAuthorYear(entry: LiteratureEntry): string {
    const families = authorFamilies(entry)
    const authorPart =
        families.length === 0
            ? '佚名'
            : families.length === 1
              ? families[0]
              : families.length === 2
                ? `${families[0]} & ${families[1]}`
                : `${families[0]} et al.`
    return entry.year ? `${authorPart} ${entry.year}` : authorPart
}

/**
 * 参考文献列表条目（简化格式）：作者. 标题. 年份. 期刊.
 * 例：Smith, John, Jones, Alice. Attention Is All You Need. 2017. NeurIPS.
 */
export function formatReference(entry: LiteratureEntry): string {
    const authors =
        entry.authors
            .map((a) => [a.family, a.given].filter(Boolean).join(', ').trim())
            .join('; ') || '佚名'
    const parts: (string | null)[] = [
        authors,
        entry.title || '无标题',
        entry.year ? String(entry.year) : null,
        entry.venue || null,
    ]
    return parts.filter((p): p is string => !!p).join('. ') + '.'
}
