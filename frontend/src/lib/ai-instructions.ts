import type { AiAskType } from '@/store/useNoteStore'

/**
 * F7 划词提问指令模板（M2 A2 起 AIPanel 与阅读器翻译浮层共用，单一来源）。
 * 走对话模式发送（前端拼指令，无后端 taskType 模板）：
 * - taskType 为空 → 对话模式（B7 RAG 注入；docId 非空时单篇限定）
 * - 结尾不加冒号：消费时动态拼出处信息（文献标题 + 页码）
 */
export const ASK_INSTRUCTIONS: Record<AiAskType, string> = {
    explain: '请用中文解释以下论文片段，说明其核心含义与研究背景',
    translate: '请将以下论文片段翻译成中文',
    summarize: '请用要点总结以下论文片段的核心内容',
}
