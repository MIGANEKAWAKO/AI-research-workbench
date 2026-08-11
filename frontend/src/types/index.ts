// 笔记与集合的数据结构（内存存储 / 后续文件系统 StorageAdapter 共用）
export interface Note {
    id?: number
    title: string
    content: string      // TipTap 的 HTML 内容
    collectionId?: number
    createdAt: number
    updatedAt: number
}

export interface Collection {
    id?: number
    name: string
    createdAt: number
}
