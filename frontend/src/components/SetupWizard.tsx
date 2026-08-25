import { useState } from 'react'
import {
    Check,
    ChevronLeft,
    ChevronRight,
    FolderOpen,
    KeyRound,
    Loader2,
    RefreshCw,
    ShieldCheck,
    X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { saveConfig, testConnections, type TestResults } from '@/services/config'
import { cn } from '@/lib/utils'

/**
 * M2 P1：首次启动向导。
 * 三步：① vault 目录 ② API key 配置 ③ 连通性测试 → 完成（保存配置，进入应用）。
 * 开发期浏览器：vault 用文本输入（Tauri 版将支持系统目录选择器，位置已预留）。
 * key 可跳过（未配置时 AI 功能不可用，文献管理正常）；测试失败不阻断完成。
 */

const STEPS = ['选择数据目录', '配置 AI 服务', '连通性测试'] as const

export const SetupWizard = ({ onDone }: { onDone: () => void }) => {
    const [step, setStep] = useState(0)
    const [vaultPath, setVaultPath] = useState('')
    const [deepseekKey, setDeepseekKey] = useState('')
    const [siliconflowKey, setSiliconflowKey] = useState('')
    // P1 补充：模型服务请求地址（预填默认值，可自定义——未来切换服务商）
    const [deepseekBaseUrl, setDeepseekBaseUrl] = useState('https://api.deepseek.com')
    const [siliconflowBaseUrl, setSiliconflowBaseUrl] = useState('https://api.siliconflow.cn/v1')
    const [testing, setTesting] = useState(false)
    const [testResults, setTestResults] = useState<TestResults | null>(null)
    const [saving, setSaving] = useState(false)

    const canNext = step === 0 ? vaultPath.trim().length > 0 : true

    const handleTest = async () => {
        setTesting(true)
        setTestResults(null)
        try {
            // 携带表单中的 key/baseUrl：未保存也能测通（后端优先用传入值）
            const results = await testConnections({
                ...(deepseekKey.trim() ? { deepseekApiKey: deepseekKey.trim() } : {}),
                ...(siliconflowKey.trim() ? { siliconflowApiKey: siliconflowKey.trim() } : {}),
                ...(deepseekBaseUrl.trim() ? { deepseekBaseUrl: deepseekBaseUrl.trim() } : {}),
                ...(siliconflowBaseUrl.trim() ? { siliconflowBaseUrl: siliconflowBaseUrl.trim() } : {}),
            })
            setTestResults(results)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : '测试请求失败')
        } finally {
            setTesting(false)
        }
    }

    // 完成：保存全部配置（vault 必填、key 可选）→ 进入应用
    const handleFinish = async () => {
        if (saving) return
        setSaving(true)
        try {
            await saveConfig({
                vaultPath,
                ...(deepseekKey.trim() ? { deepseekApiKey: deepseekKey.trim() } : {}),
                ...(siliconflowKey.trim() ? { siliconflowApiKey: siliconflowKey.trim() } : {}),
                deepseekBaseUrl: deepseekBaseUrl.trim(),
                siliconflowBaseUrl: siliconflowBaseUrl.trim(),
            })
            toast.success('配置已保存')
            onDone()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : '保存配置失败')
        } finally {
            setSaving(false)
        }
    }

    const testRow = (
        label: string,
        result: TestResults['deepseek'] | undefined,
        sub: string
    ) => (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {label}
                <span className="ml-1.5 text-muted-foreground/60">{sub}</span>
            </span>
            {result === undefined ? (
                <span className="text-muted-foreground/50">—</span>
            ) : result.ok === null ? (
                <span className="flex items-center gap-1 text-muted-foreground/60">
                    <X className="size-3" />
                    未配置
                </span>
            ) : result.ok ? (
                <span className="flex items-center gap-1 text-success">
                    <Check className="size-3" />
                    连接正常
                </span>
            ) : (
                <span className="flex max-w-[55%] items-center gap-1 text-destructive" title={result.error}>
                    <X className="size-3 shrink-0" />
                    <span className="truncate">{result.error}</span>
                </span>
            )}
        </div>
    )

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/95">
            <div className="w-[480px] max-w-[92vw] rounded-2xl border border-border bg-card p-7 shadow-2xl">
                {/* 头部 */}
                <div className="mb-1 flex items-center gap-2.5">
                    <div className="grid size-9 place-items-center rounded-xl text-white" style={{ background: 'linear-gradient(135deg, var(--primary), #7AA8FF)' }}>
                        <ShieldCheck className="size-5" strokeWidth={1.8} />
                    </div>
                    <div>
                        <div className="text-[15px] font-bold">欢迎使用知微 · 科研工作台</div>
                        <div className="text-xs text-muted-foreground">首次使用，先完成 3 步基础配置</div>
                    </div>
                </div>

                {/* 步骤指示 */}
                <div className="mt-4 mb-5 flex items-center gap-1.5">
                    {STEPS.map((label, idx) => (
                        <div key={label} className="flex flex-1 flex-col gap-1">
                            <div
                                className={cn(
                                    'h-1 rounded-full transition-colors',
                                    idx <= step ? 'bg-primary' : 'bg-border'
                                )}
                            />
                            <span
                                className={cn(
                                    'text-[10.5px]',
                                    idx === step ? 'font-medium text-foreground' : 'text-muted-foreground/60'
                                )}
                            >
                                {label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* 步骤内容 */}
                {step === 0 && (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <FolderOpen className="size-4 text-primary" />
                            选择数据目录（vault）
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            所有笔记、PDF 与知识库数据都存放在这个文件夹中，推荐使用空目录或新建目录。
                            桌面版将支持系统目录选择器；浏览器开发版请手动输入路径。
                        </p>
                        <Input
                            value={vaultPath}
                            onChange={(e) => setVaultPath(e.target.value)}
                            placeholder="例如 D:\Research\my-vault"
                            className="font-mono text-xs"
                            autoFocus
                        />
                    </div>
                )}

                {step === 1 && (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <KeyRound className="size-4 text-primary" />
                            配置 AI 服务（可跳过）
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            未配置也可正常管理文献与笔记；配置后启用 AI 问答、划词翻译与研究任务。
                            请求地址已预填默认值，可改为其他兼容服务（未来将支持服务商选择）。
                        </p>
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-muted-foreground/70">
                                DeepSeek API Key（对话/翻译/总结）
                            </label>
                            <Input
                                type="password"
                                value={deepseekKey}
                                onChange={(e) => setDeepseekKey(e.target.value)}
                                placeholder="sk-…"
                                className="font-mono text-xs"
                            />
                            <label className="mt-1.5 mb-1 block text-[11px] font-medium text-muted-foreground/70">
                                DeepSeek 请求地址
                            </label>
                            <Input
                                value={deepseekBaseUrl}
                                onChange={(e) => setDeepseekBaseUrl(e.target.value)}
                                placeholder="https://api.deepseek.com"
                                className="font-mono text-xs"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-muted-foreground/70">
                                SiliconFlow API Key（向量检索，可选）
                            </label>
                            <Input
                                type="password"
                                value={siliconflowKey}
                                onChange={(e) => setSiliconflowKey(e.target.value)}
                                placeholder="sk-…（可稍后在 .env 中补充）"
                                className="font-mono text-xs"
                            />
                            <label className="mt-1.5 mb-1 block text-[11px] font-medium text-muted-foreground/70">
                                SiliconFlow 请求地址
                            </label>
                            <Input
                                value={siliconflowBaseUrl}
                                onChange={(e) => setSiliconflowBaseUrl(e.target.value)}
                                placeholder="https://api.siliconflow.cn/v1"
                                className="font-mono text-xs"
                            />
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <RefreshCw className="size-4 text-primary" />
                            连通性测试
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            测试已填写 key 的服务；未配置项会标记跳过，完成后仍可进入应用。
                        </p>
                        <div className="flex flex-col gap-1.5">
                            {testRow('DeepSeek', testResults?.deepseek, 'chat 模型 ping')}
                            {testRow('SiliconFlow', testResults?.siliconflow, 'embedding ping')}
                        </div>
                        <Button variant="outline" onClick={handleTest} disabled={testing} className="self-start">
                            {testing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                            {testing ? '测试中…' : testResults ? '重新测试' : '测试连接'}
                        </Button>
                    </div>
                )}

                {/* 底部操作 */}
                <div className="mt-6 flex items-center justify-between">
                    <Button
                        variant="ghost"
                        onClick={() => setStep((s) => Math.max(0, s - 1))}
                        disabled={step === 0 || saving}
                        className="text-muted-foreground"
                    >
                        <ChevronLeft className="size-4" />
                        上一步
                    </Button>
                    {step < STEPS.length - 1 ? (
                        <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                            下一步
                            <ChevronRight className="size-4" />
                        </Button>
                    ) : (
                        <Button onClick={handleFinish} disabled={saving}>
                            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                            {saving ? '保存中…' : '完成，进入工作台'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
