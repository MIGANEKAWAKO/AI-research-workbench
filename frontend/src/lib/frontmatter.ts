import yaml from 'js-yaml'

/**
 * frontmatter 解析/生成（替换 gray-matter，修复浏览器 Buffer 兼容问题）。
 *
 * 背景（F2 bugfix）：gray-matter 的 lib/utils.js toBuffer 直接使用全局
 * `Buffer.from`，浏览器没有全局 Buffer → 非空内容 serializeNote 抛
 * ReferenceError（空内容因 matter('') 短路侥幸可用，所以此前文件只有
 * frontmatter 没有正文）。而 js-yaml 对 buffer 的引用经 Vite/esbuild
 * 预构建已安全 stub（NodeBuffer 为 undefined，binary 类型自动降级），
 * 浏览器可用。
 *
 * 格式约定（与 gray-matter 输出兼容，Obsidian 可直接打开）：
 * ```
 * ---
 * title: xxx
 * tags:
 *   - rag
 * ---
 * 正文
 * ```
 */

const DELIMITER = '---'

/**
 * 生成 frontmatter + 正文文本。
 * - 无元数据时输出纯正文（避免生成空的 --- 包裹，与旧行为一致）
 * - 正文尾部保证一个换行（POSIX 惯例，gray-matter 同行为）
 */
export function stringifyFrontmatter(content: string, data: Record<string, unknown>): string {
    if (Object.keys(data).length === 0) return content

    const yamlText = yaml.dump(data).trimEnd()
    const header = `${DELIMITER}\n${yamlText}\n${DELIMITER}\n`
    return header + content + (content.endsWith('\n') ? '' : '\n')
}

/**
 * 解析 frontmatter + 正文。
 * - 不以 --- 开头 / 分隔符不完整 → 视为无 frontmatter（content 原样）
 * - YAML 解析失败 → data 为空对象（容错：外部工具写坏的文件不阻断加载）
 */
export function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
    if (!raw.startsWith(DELIMITER)) return { data: {}, content: raw }

    // 匹配：--- 换行 (frontmatter块) 换行 --- 换行（close 后的换行随块吃掉，与 gray-matter 一致）
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
    if (!match) return { data: {}, content: raw }

    let data: Record<string, unknown> = {}
    try {
        const parsed = yaml.load(match[1])
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            data = parsed as Record<string, unknown>
        }
    } catch {
        // YAML 语法错误：保留正文，元数据丢弃
    }

    return { data, content: raw.slice(match[0].length) }
}
