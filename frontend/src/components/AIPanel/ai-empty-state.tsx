import './ai-empty-state.scss'

/**
 * AI 面板空状态（设计稿 id="aiEmpty"）：
 * 对话气泡插画（后置灰气泡三点 + 主渐变蓝气泡星星 + 琥珀点缀）+
 * 「开始和 知微 聊聊」标题 + 副文案。
 * 展示条件：新建对话且尚未发送任何消息（messages.length === 0），
 * 由 AIPanel 在消息区渲染；发送后消息流正常显示，空状态自动消失。
 */
export const AiEmptyState = () => {
    return (
        <div className="ai-empty">
            <svg className="ai-empty-hero" viewBox="0 0 160 150" xmlns="http://www.w3.org/2000/svg" fill="none">
                <defs>
                    <linearGradient id="aiBubbleG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.95" />
                        <stop offset="100%" stopColor="var(--blue-2)" stopOpacity="0.80" />
                    </linearGradient>
                </defs>
                {/* 底部柔光 */}
                <ellipse cx="80" cy="126" rx="62" ry="13" fill="var(--blue)" opacity="0.16" />
                {/* back bubble（后置灰气泡 + 三点） */}
                <rect x="30" y="38" width="56" height="38" rx="13" style={{ fill: 'var(--surface)', stroke: 'var(--border)', strokeWidth: 1.2 }} />
                <circle cx="46" cy="57" r="3" style={{ fill: 'var(--text-3)', opacity: 0.6 }} />
                <circle cx="62" cy="57" r="3" style={{ fill: 'var(--text-3)', opacity: 0.6 }} />
                <circle cx="78" cy="57" r="3" style={{ fill: 'var(--text-3)', opacity: 0.6 }} />
                {/* main bubble（渐变蓝主气泡） */}
                <rect x="60" y="60" width="64" height="44" rx="14" fill="url(#aiBubbleG)" style={{ stroke: 'var(--blue)', strokeWidth: 1.2 }} />
                {/* sparkle inside main bubble（气泡内白色星星） */}
                <path d="M92 73 l2.4 6.6 6.6 2.4 -6.6 2.4 -2.4 6.6 -2.4 -6.6 -6.6 -2.4 6.6 -2.4 z" fill="#fff" opacity="0.95" />
                {/* accent sparkle（琥珀点缀星） */}
                <path d="M122 40 l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6 z" fill="var(--amber)" />
                <circle cx="38" cy="28" r="2" style={{ fill: 'var(--blue)', opacity: 0.5 }} />
            </svg>
            <div className="ai-empty-title">开始和 知微 聊聊</div>
            <div className="ai-empty-sub">选中文献或笔记后，我可以帮你总结、对比、解释，并生成可引用的结论。</div>
        </div>
    )
}
