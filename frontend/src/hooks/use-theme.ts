import { useCallback, useEffect, useState } from 'react'

/**
 * 主题管理（UI 重构 Step 1，决策：默认浅色 + localStorage 持久化）。
 *
 * - 浅色为默认（用户拍板，与设计稿默认深色不同）
 * - 主题挂在 <html class="dark">，与 Tailwind dark: variant / shadcn CSS 变量同源
 * - 模块加载时立即应用一次存储值（早于 React 渲染，避免首屏闪烁）
 * - 监听 storage 事件：多标签页间同步切换
 */
const THEME_KEY = 'zhiwei-theme'

export type Theme = 'light' | 'dark'

function readStoredTheme(): Theme {
    try {
        return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
    } catch {
        return 'light'
    }
}

function applyTheme(theme: Theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark')
}

// 模块副作用：脚本加载即应用（在 React 渲染前，避免闪白/闪黑）
applyTheme(readStoredTheme())

export function useTheme() {
    const [theme, setThemeState] = useState<Theme>(readStoredTheme)

    // 主题变化 → DOM class + localStorage 持久化
    useEffect(() => {
        applyTheme(theme)
        try {
            localStorage.setItem(THEME_KEY, theme)
        } catch {
            // 隐私模式等场景写入失败可忽略（内存态仍生效）
        }
    }, [theme])

    // 多标签页同步：其他标签切换主题时跟随
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === THEME_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
                setThemeState(e.newValue)
            }
        }
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    const setTheme = useCallback((t: Theme) => setThemeState(t), [])
    const toggleTheme = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), [])

    return { theme, setTheme, toggleTheme }
}
