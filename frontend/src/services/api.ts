/**
 * 后端 API 地址解析（M2 P6：Tauri 壳 + 动态端口）。
 *
 * 浏览器开发态 → http://localhost:3001（沿用历史硬编码值，行为不变）
 * Tauri 桌面态   → http://127.0.0.1:{port}（Rust 壳探测空闲端口后经 backend_info 下发；
 *                  127.0.0.1 避免 localhost 的 IPv6 优先解析连不上 IPv4 监听）
 *
 * 所有 services 必须经 apiBase()/apiFetch() 取地址，禁止再出现硬编码。
 */

import { invoke } from '@tauri-apps/api/core'

/** Tauri 运行态检测（WebView 注入 __TAURI_INTERNALS__；浏览器无此对象） */
export const isTauri = (): boolean =>
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let cachedBase: string | null = null

/** 后端 base URL（首次解析后缓存；Tauri 壳端口在应用生命周期内不变） */
export async function apiBase(): Promise<string> {
    if (cachedBase) return cachedBase
    if (isTauri()) {
        const info = await invoke<{ port: number }>('backend_info')
        cachedBase = `http://127.0.0.1:${info.port}`
    } else {
        cachedBase = 'http://localhost:3001'
    }
    return cachedBase
}

/** fetch 封装：自动拼接后端地址 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${await apiBase()}${path}`, init)
}
