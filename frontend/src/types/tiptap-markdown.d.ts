/**
 * tiptap-markdown@0.9 的类型补充：该版本未对 @tiptap/core 的 Storage 做
 * module augmentation，导致 editor.storage.markdown 无类型。
 * 运行时结构：{ options, parser, serializer, getMarkdown() }（已核验 dist 源码）
 */
import type { MarkdownStorage } from 'tiptap-markdown'

declare module '@tiptap/core' {
    interface Storage {
        markdown: MarkdownStorage
    }
}
