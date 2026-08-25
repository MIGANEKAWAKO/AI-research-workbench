/**
 * 配置 API 封装（M2 P1 首次启动向导）。
 * 状态接口只返回"是否已配置"（脱敏），key 明文不经过 GET。
 */

const BASE_URL = 'http://localhost:3001'

export interface ConfigStatus {
    configured: boolean
    vaultConfigured: boolean
    deepseekConfigured: boolean
    siliconflowConfigured: boolean
}

export interface TestResult {
    ok: boolean | null // null = 未配置（跳过）
    error?: string
}

export interface TestResults {
    deepseek: TestResult
    siliconflow: TestResult
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init)
    if (!response.ok) {
        let detail = `请求失败（${response.status}）`
        try {
            const data = await response.json()
            if (typeof data?.detail === 'string') detail = data.detail
        } catch {
            // 响应体不是 JSON 时保留默认信息
        }
        throw new Error(detail)
    }
    return response.json() as Promise<T>
}

export const getConfigStatus = async (): Promise<ConfigStatus> => {
    return request<ConfigStatus>(`${BASE_URL}/api/config`)
}

/** 写入配置（vault 路径 / API key / 请求地址；空字符串不写入） */
export const saveConfig = async (patch: {
    vaultPath?: string
    deepseekApiKey?: string
    siliconflowApiKey?: string
    deepseekBaseUrl?: string
    siliconflowBaseUrl?: string
}): Promise<ConfigStatus> => {
    return request<ConfigStatus>(`${BASE_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    })
}

/**
 * 连通性测试：携带"待保存"的 key/baseUrl（向导表单未保存时测表单值），
 * 未携带则后端用已保存的配置；未配置返回 ok=null。
 */
export const testConnections = async (options?: {
    deepseekApiKey?: string
    siliconflowApiKey?: string
    deepseekBaseUrl?: string
    siliconflowBaseUrl?: string
}): Promise<TestResults> => {
    return request<TestResults>(`${BASE_URL}/api/config/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options ?? {}),
    })
}
