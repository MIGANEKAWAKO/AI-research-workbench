// 笔记与集合的数据结构（内存存储 / 文件系统 StorageAdapter 共用）
// F2：笔记文件 = Markdown + YAML frontmatter（title/collection/tags/cites），见 PRD 5.4
export interface Note {
    id?: number
    title: string
    content: string      // F2 起为 Markdown 文本（此前为 TipTap 的 HTML 内容）
    collectionId?: number
    tags?: string[]      // 对应 frontmatter tags（F2 起读写，编辑 UI 后续）
    cites?: string[]     // 对应 frontmatter cites（引用文献 ID 列表，F6 引用系统使用）
    createdAt: number
    updatedAt: number
}

export interface Collection {
    id?: number
    name: string
    createdAt: number
}
