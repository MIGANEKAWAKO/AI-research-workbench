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

// ── M2 A1：PDF 高亮批注（数据落在 vault 的 .kb/annotations.json，经 /api/fs 原子读写）──

/**
 * 高亮锚定段：不存坐标快照（缩放/翻页即失效），存文本锚点——
 * itemIndex = pdf.js TextLayer.textDivs 数组索引（v6 中每个有文本的 textContent item
 * 渲染为一个 span，textDivs 与 item 严格按序一一对应）；charStart/charEnd 为相对
 * 该 span 文本节点的字符偏移。重建高亮时按锚点重新定位，与 scale 无关。
 */
export interface AnnotationSegment {
    itemIndex: number
    charStart: number
    charEnd: number
    /** 冗余保存被高亮的原文（批注浮层展示用，不参与定位） */
    text: string
}

/** 一次划选 = 一条批注；跨多行/多文本 item 时拆为多个 segment */
export interface PdfAnnotation {
    id: string
    docId: string // 文献 id（LiteratureEntry.id）
    pageNumber: number
    segments: AnnotationSegment[]
    note: string // 批注文本，可为空（纯高亮）
    createdAt: number
    updatedAt: number
}

// ── M2 C3：AI 会话（对话记忆，后端持久化于 .kb/conversations.json，接口见 PRD 10.2 C1）──

/** AI 会话：消息按会话隔离；/api/chat 与 research 带 conversation_id 注入历史（C2） */
export interface Conversation {
    id: string
    title: string
    createdAt: string
    updatedAt: string
}

/** 会话消息（后端持久形态：role 为 user/assistant，无前端 ai 别名） */
export interface ConversationMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    createdAt: string
}

// ── M2 文献集合（集合定义前端管理 .kb/literature-collections.json；归属存后端 collectionIds）──

/** 文献集合：id 由前端生成，与后端 literature.json 的 collectionIds 值对应 */
export interface LitCollection {
    id: string
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
    /** M2 A3：阅读进度——最后阅读页码（0 = 未开始；后端进度 API 持久化） */
    lastPage?: number
    /** M2 A3：最近一次进度更新时间（ISO 字符串，后端写入） */
    progressAt?: string
}
