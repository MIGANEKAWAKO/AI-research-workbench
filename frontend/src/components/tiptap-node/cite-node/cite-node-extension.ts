import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type { MarkdownNodeSpec } from 'tiptap-markdown'
import { CiteNodeView } from './cite-node'

/**
 * Cite 内联引用节点（F6）：渲染"作者+年份"徽章，点击跳文献详情。
 *
 * Markdown 序列化（关键）：tiptap-markdown@0.9 虽无 extendMarkdown，但支持让
 * 节点扩展在 addStorage() 里返回 { markdown: MarkdownNodeSpec } —— 序列化器会
 * 优先用它的 serialize（见其 dist 源码 MarkdownSerializer.nodes）。所以：
 *   serialize：节点 → [[cite:id]]（wiki-link 语法，源文件可读，PRD 4.5）
 *   parse.setup：给 markdown-it 注册 inline rule，把 [[cite:id]] → <span data-cite>
 *   parseHTML：<span data-cite> → Cite 节点
 * round-trip 无损（F5 划词转笔记写入的 [[cite:id]] 可直接被解析成徽章）。
 *
 * 设计取舍：引用是 node 不是 mark —— mark 修饰文本，引用徽章是独立语义单元、
 * 原子不可编辑、要携带 id 属性，故用 inline + atom node。
 */

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        cite: {
            /** 在当前光标处插入一条引用（文献 ID） */
            setCite: (id: string) => ReturnType
        }
    }
}

/** 类型注解：提供上下文推断（serialize/setup 参数类型由 MarkdownNodeSpec 推导） */
const citeMarkdownSpec: MarkdownNodeSpec = {
    serialize(state, node) {
        state.write(`[[cite:${node.attrs.id}]]`)
    },
    parse: {
        setup(markdownit) {
            // 在 emphasis 规则之前注册，匹配 [[cite:id]]（id 不含 "]"）
            markdownit.inline.ruler.before('emphasis', 'cite', (state, silent) => {
                const src = state.src
                const pos = state.pos
                const match = /^\[\[cite:([^\]]+)\]\]/.exec(src.slice(pos))
                if (!match) return false

                if (!silent) {
                    // 生成 <span data-cite="id"></span>（原子节点，空内容）
                    const open = state.push('cite_open', 'span', 1)
                    open.attrSet('data-cite', match[1])
                    state.push('cite_close', 'span', -1)
                }

                state.pos = pos + match[0].length
                return true
            })
        },
    },
}

export const Cite = Node.create({
    name: 'cite',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-cite'),
                renderHTML: (attributes) => ({ 'data-cite': attributes.id }),
            },
        }
    },

    parseHTML() {
        return [{ tag: 'span[data-cite]' }]
    },

    renderHTML({ node, HTMLAttributes }) {
        return ['span', { 'data-cite': node.attrs.id, ...HTMLAttributes }]
    },

    addNodeView() {
        return ReactNodeViewRenderer(CiteNodeView)
    },

    addStorage() {
        return { markdown: citeMarkdownSpec }
    },

    addCommands() {
        return {
            setCite:
                (id) =>
                ({ commands }) => {
                    return commands.insertContent({ type: this.name, attrs: { id } })
                },
        }
    },
})

export default Cite
