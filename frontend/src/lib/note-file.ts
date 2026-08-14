import matter from 'gray-matter'
import type { Note } from '@/types'

/**
 * 笔记文件（vault/笔记/xxx.md）与内存 Note 的序列化/反序列化（F2）。
 *
 * 文件格式（PRD 5.4）：YAML frontmatter（title/collection/tags/cites）+ Markdown 正文
 * ```
 * ---
 * title: 多模态RAG综述
 * collection: 论文笔记
 * tags: [rag, survey]
 * cites: []
 * ---
 * # 正文（Markdown）
 * ```
 *
 * 本文件只含纯函数：不依赖 store / adapter / 编辑器，可独立测试。
 * collection 在 frontmatter 中存名字符串（人类可读、Obsidian 兼容），
 * 内存中的数字 id 映射由 useDataStore 负责。
 */

/** 解析结果：文件里的全部业务字段（collection 以名字形式返回，由调用方映射 id） */
export interface ParsedNoteFile {
    title: string
    content: string
    tags: string[]
    cites: string[]
    collectionName?: string
}

/** 把任意 frontmatter 字段值规整为字符串数组（容错：单字符串/缺省/非数组） */
const toStrArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
    if (typeof value === 'string' && value.trim()) return [value]
    return []
}

/** Note → 文件文本（frontmatter + Markdown 正文）。无 frontmatter 字段时输出纯正文。 */
export function serializeNote(note: Note, collectionName?: string): string {
    const frontmatter: Record<string, unknown> = {}
    if (note.title) frontmatter.title = note.title
    if (collectionName) frontmatter.collection = collectionName
    if (note.tags?.length) frontmatter.tags = note.tags
    if (note.cites?.length) frontmatter.cites = note.cites

    const content = note.content ?? ''
    // 没有元数据时直接写正文，避免生成空的 --- 包裹
    if (Object.keys(frontmatter).length === 0) return content
    return matter.stringify(content, frontmatter)
}

/**
 * 文件文本 → 解析结果。容错设计：
 * - 无 frontmatter 的旧文件（F1 遗留）：title 回退文件名（去 .md 后缀）
 * - 缺字段：给默认值，不抛错
 */
export function parseNoteFile(raw: string, fileName: string): ParsedNoteFile {
    const { data, content } = matter(raw)

    const title = typeof data.title === 'string' && data.title.trim()
        ? data.title.trim()
        : fileName.replace(/\.md$/, '')

    return {
        title,
        content: content ?? '',
        tags: toStrArray(data.tags),
        cites: toStrArray(data.cites),
        collectionName: typeof data.collection === 'string' && data.collection.trim()
            ? data.collection.trim()
            : undefined,
    }
}
