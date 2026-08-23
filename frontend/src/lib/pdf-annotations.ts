import type { AnnotationSegment, PdfAnnotation } from '@/types'

/**
 * PDF 高亮锚定与渲染（M2 A1 核心算法）。
 *
 * 锚定模型：不存坐标快照（缩放/翻页即失效），存文本锚点 {itemIndex, charStart, charEnd}——
 * itemIndex 指向 pdf.js TextLayer.textDivs 数组（v6 中每个有文本的 textContent item
 * 渲染为一个 span，textDivs 与 item 按序一一对应）；charStart/charEnd 是相对该 span
 * 原始文本的字符区间。任何 scale/翻页导致 textLayer 重建后，都能按锚点重新注入。
 *
 * 渲染：在 textDiv 内把 [charStart, charEnd) 对应的文本段包裹为 <mark>（inline 背景色，
 * 随文档流定位，天然抗缩放）。同一 span 内多条高亮重叠时 mark 嵌套，内层点击优先
 * （click 事件 stopPropagation）。注入是"先解包再切包"的幂等操作：
 * annotations 变化时不必重建 textLayer，只重注入。
 */

const MARK_CLASS = 'pdf-annotation-highlight'

/** DOM 选区 → 锚定段列表（跨多个文本 span 的选区拆成多段，每段落一条）。 */
export function selectionToSegments(
    textLayer: { textDivs: HTMLElement[] },
    range: Range
): AnnotationSegment[] {
    const segments: AnnotationSegment[] = []
    const divs = textLayer.textDivs
    for (let i = 0; i < divs.length; i++) {
        const div = divs[i]
        // 快速排除：range 与整个 span 不相交则跳过（避免逐字符 comparePoint）
        if (!range.intersectsNode(div)) continue
        const hit = intersectDivWithRange(div, range)
        if (hit && hit.end > hit.start) {
            segments.push({
                itemIndex: i,
                charStart: hit.start,
                charEnd: hit.end,
                text: div.textContent?.slice(hit.start, hit.end) ?? '',
            })
        }
    }
    return segments
}

/** 按当前页高亮数据重建全部 mark（先解包旧的，再切包新的，幂等）。 */
export function applyHighlightsToPage(
    container: HTMLElement,
    textLayer: { textDivs: HTMLElement[] },
    annotations: PdfAnnotation[],
    onMarkClick: (annId: string, rect: DOMRect) => void
): void {
    clearHighlights(container)

    // 按 itemIndex 分组；同 span 内多条高亮按 charStart 升序注入（重叠时嵌套）
    const byItem = new Map<number, { annId: string; seg: AnnotationSegment }[]>()
    for (const ann of annotations) {
        for (const seg of ann.segments) {
            if (seg.charEnd <= seg.charStart) continue
            let list = byItem.get(seg.itemIndex)
            if (!list) {
                list = []
                byItem.set(seg.itemIndex, list)
            }
            list.push({ annId: ann.id, seg })
        }
    }

    for (const [itemIndex, entries] of byItem) {
        const div = textLayer.textDivs[itemIndex]
        if (!div) continue // 文本层被 pdf.js 截断（MAX_TEXT_DIVS）等情形：跳过该段
        entries.sort((a, b) => a.seg.charStart - b.seg.charStart)
        for (const { annId, seg } of entries) {
            wrapRange(div, seg.charStart, seg.charEnd, annId, onMarkClick)
        }
    }
}

/** 解包全部 mark：把 mark 内容还原为父级的文本节点（保持 textContent 不变）。 */
function clearHighlights(container: HTMLElement): void {
    for (const mark of Array.from(container.querySelectorAll(`.${MARK_CLASS}`))) {
        const parent = mark.parentNode
        if (!parent) continue
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
        parent.removeChild(mark)
    }
}

/**
 * 求 div 与 range 的相交字符区间（div 全局偏移坐标系）。
 * 注意：注入 mark 后 div 内文本被切分成多个 Text 节点（含嵌套 mark 内的），
 * 所以必须深度遍历全部 Text 节点、按 textContent 长度累计全局偏移再合并相交区间。
 */
function intersectDivWithRange(div: HTMLElement, range: Range): { start: number; end: number } | null {
    let globalStart = -1
    let globalEnd = -1
    walkTextNodes(div, (node, offset) => {
        const hit = intersectRangeWithNode(range, node)
        if (hit) {
            if (globalStart === -1) globalStart = offset + hit.start
            globalEnd = offset + hit.end
        }
    })
    return globalStart === -1 ? null : { start: globalStart, end: globalEnd }
}

/** 求 range 与单个 Text 节点的相交字符区间（局部偏移）。 */
function intersectRangeWithNode(range: Range, node: Text): { start: number; end: number } | null {
    const len = node.textContent?.length ?? 0
    let start = -1
    let end = -1
    // comparePoint(node, o) === 0 表示字符 [o, o+1) 在 range 内。
    // 线性扫描：选区通常很短，且只发生在 mouseup 瞬间一次，成本可接受。
    for (let o = 0; o <= len; o++) {
        const c = range.comparePoint(node, o)
        if (c === 0) {
            if (start === -1) start = o
            end = o + 1
        } else if (start !== -1) {
            break // 已越过 range 尾部
        }
    }
    return start === -1 ? null : { start, end }
}

/**
 * 在 div 的全局偏移坐标系中，把 [start, end) 对应的文本段包进新 mark。
 *
 * 必须"先收集、后处理"两阶段：walkTextNodes 遍历的是 childNodes 活集合，
 * 若在回调里直接 splitText/replaceChild（wrapTextNode），遍历会继续进入
 * 刚创建的 mark → 无限嵌套 → 栈溢出卡死（A1 验收踩坑，见 docs/面试问答.md ④Q25）。
 * 收集阶段不改 DOM，处理阶段逐个切包，互不干扰。
 */
function wrapRange(
    div: HTMLElement,
    start: number,
    end: number,
    annId: string,
    onMarkClick: (annId: string, rect: DOMRect) => void
): void {
    if (end <= start) return
    const targets: { node: Text; offset: number }[] = []
    walkTextNodes(div, (node, offset) => {
        const nodeLen = node.textContent?.length ?? 0
        const nodeStart = offset
        const nodeEnd = offset + nodeLen
        if (nodeEnd <= start || nodeStart >= end) return
        targets.push({ node, offset })
    })
    for (const { node, offset } of targets) {
        const nodeLen = node.textContent?.length ?? 0
        const ls = Math.max(start, offset) - offset
        const le = Math.min(end, offset + nodeLen) - offset
        wrapTextNode(node, ls, le, annId, onMarkClick)
    }
}

/** 把单个 Text 节点的 [start, end) 局部区间切出来包进 mark（splitText 语义见注释）。 */
function wrapTextNode(
    node: Text,
    start: number,
    end: number,
    annId: string,
    onMarkClick: (annId: string, rect: DOMRect) => void
): void {
    const len = node.textContent?.length ?? 0
    const s = Math.max(0, Math.min(start, len))
    const e = Math.max(s, Math.min(end, len))
    if (e <= s) return
    // splitText 顺序：先切尾部再切头部。
    //   node.splitText(e) → node=[0,e)，tail=[e,len)
    //   node.splitText(s) → node=[0,s)，mid=[s,e)
    // 最终兄弟顺序：node | mid | tail，mid 用 mark 替换后：node | mark | tail
    if (e < len) node.splitText(e)
    const mid = node.splitText(s)
    const mark = document.createElement('mark')
    mark.className = MARK_CLASS
    mark.dataset.annotationId = annId
    node.parentNode?.replaceChild(mark, mid)
    mark.appendChild(mid)
    mark.addEventListener('click', (ev) => {
        ev.stopPropagation() // 嵌套 mark 时只响应最内层
        onMarkClick(annId, mark.getBoundingClientRect())
    })
}

/** 深度遍历 root 内全部 Text 节点，回调携带该节点在 root 文本流中的全局偏移。 */
function walkTextNodes(root: Node, cb: (node: Text, offset: number) => void): void {
    let offset = 0
    const visit = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            cb(node as Text, offset)
            offset += node.textContent?.length ?? 0
        } else {
            for (const child of node.childNodes) visit(child)
        }
    }
    visit(root)
}
