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

// 文献元数据（对齐后端 B5 LiteratureEntry，见 docs/后端接口文档.md）
export interface LiteratureEntry {
    id: string          // 12 位 hex，后端生成（uuid 前缀）
    title: string
    authors: { given: string; family: string }[]
    year: number | null
    venue: string
    volume: string
    issue: string
    pages: string
    doi: string
    arxivId: string
    pdfPath: string     // vault 内相对路径
    status: string      // 未读 / 在读 / 已读
    collectionIds: string[]
    tags: string[]
    importedAt: string
}
