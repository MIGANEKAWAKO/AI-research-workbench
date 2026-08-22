import { Node, mergeAttributes } from '@tiptap/core'
import type { MarkdownNodeSpec } from 'tiptap-markdown'

/**
 * Callout 提示框节点（UI 重构 T2，对齐设计稿 callout）：
 * 蓝底圆角提示块（ⓘ 图标 + 内容），用于强调核心问题/要点。
 *
 * Markdown 序列化（D4 决策：自定义 serializer，round-trip 无损）：
 * - serialize：输出 fenced 容器 `:::callout ... :::`（内容用 renderContent 保持 markdown）
 * - parse.setup：给 markdown-it 注册 block rule，识别 `:::callout` 容器 → <div.data-type=callout>
 * - parseHTML：<div data-type="callout"> → Callout 节点（内容取 .callout-bd）
 */

const calloutMarkdownSpec: MarkdownNodeSpec = {
    serialize(state, node) {
        state.write(':::callout\n')
        state.renderContent(node)
        state.write('\n:::')
        state.ensureNewLine()
    },
    parse: {
        setup(markdownit) {
            // fenced 容器规则（参考 markdown-it-container）：`:::callout` ... `:::`
            markdownit.block.ruler.before('fence', 'callout_container', (state, startLine, endLine, silent) => {
                const start = state.bMarks[startLine] + state.tShift[startLine]
                const max = state.eMarks[startLine]
                const line = state.src.slice(start, max).trim()
                if (!/^:{3,}\s*callout\s*$/.test(line)) return false
                if (silent) return true

                let bodyEnd = endLine
                let nextLine = endLine
                let pos = startLine + 1
                // 找结束标记 `:::`（独立一行）
                while (pos < endLine) {
                    const s = state.bMarks[pos] + state.tShift[pos]
                    const e = state.eMarks[pos]
                    const l = state.src.slice(s, e).trim()
                    if (/^:{3,}\s*$/.test(l)) {
                        bodyEnd = pos
                        nextLine = pos + 1
                        break
                    }
                    pos++
                }

                // 打开 div
                const open = state.push('callout_open', 'div', 1)
                open.attrs = [
                    ['data-type', 'callout'],
                    ['class', 'callout'],
                ]
                open.block = true

                // 渲染中间内容（markdown-it 递归 tokenize）
                state.md.block.tokenize(state, startLine + 1, bodyEnd)

                // 关闭 div
                const close = state.push('callout_close', 'div', -1)
                close.attrs = [
                    ['data-type', 'callout'],
                    ['class', 'callout'],
                ]
                close.block = true

                state.line = nextLine
                return true
            })
        },
    },
}

export const Callout = Node.create({
    name: 'callout',
    group: 'block',
    content: 'block+',
    defining: true,

    parseHTML() {
        return [
            {
                tag: 'div[data-type="callout"]',
                contentElement: 'div.callout-bd',
            },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'div',
            mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'callout' }),
            // ⓘ 提示图标
            [
                'span',
                { class: 'callout-ic' },
                [
                    'svg',
                    { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none' },
                    [
                        'circle',
                        { cx: '12', cy: '12', r: '9', stroke: 'currentColor', 'stroke-width': '1.8' },
                    ],
                    [
                        'path',
                        { d: 'M12 8v5M12 16.5v.5', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' },
                    ],
                ],
            ],
            // 内容槽
            ['div', { class: 'callout-bd' }, 0],
        ]
    },

    addStorage() {
        return { markdown: calloutMarkdownSpec }
    },

    addCommands() {
        return {
            setCallout:
                () =>
                ({ chain }) => {
                    return chain().toggleWrap(this.name).run()
                },
        }
    },
})

// 给 commands 增类型（setCallout）
declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        callout: {
            /** 在当前光标处插入/包裹 callout 提示框 */
            setCallout: () => ReturnType
        }
    }
}

export default Callout
