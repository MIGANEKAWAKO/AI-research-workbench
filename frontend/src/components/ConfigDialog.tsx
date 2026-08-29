import { useState } from 'react'
import { Check, KeyRound, Loader2, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { saveConfig, testConnections, type TestResults } from '@/services/config'

/**
 * AI 服务配置对话框（P6 验收补缺：P1 只有首次向导，配置残留/更换 key 时
 * 无入口——手动选 vault 后无法配 API key）。表单与 SetupWizard 第 2-3 步同源
 * （同一 saveConfig/testConnections 通道），样式对齐。
 * 打开时留空 = 不修改已保存项（saveConfig 空值不写入）。
 */
export const ConfigDialog = ({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) => {
    const [deepseekKey, setDeepseekKey] = useState('')
    const [siliconflowKey, setSiliconflowKey] = useState('')
    const [deepseekBaseUrl, setDeepseekBaseUrl] = useState('')
    const [siliconflowBaseUrl, setSiliconflowBaseUrl] = useState('')
    const [testing, setTesting] = useState(false)
    const [testResults, setTestResults] = useState<TestResults | null>(null)
    const [saving, setSaving] = useState(false)

    const close = () => {
        if (saving || testing) return
        onOpenChange(false)
        // 下次打开清空表单（避免残留上次输入）
        setDeepseekKey('')
        setSiliconflowKey('')
        setDeepseekBaseUrl('')
        setSiliconflowBaseUrl('')
        setTestResults(null)
    }

    const handleTest = async () => {
        setTesting(true)
        setTestResults(null)
        try {
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

    const handleSave = async () => {
        if (saving) return
        setSaving(true)
        try {
            await saveConfig({
                ...(deepseekKey.trim() ? { deepseekApiKey: deepseekKey.trim() } : {}),
                ...(siliconflowKey.trim() ? { siliconflowApiKey: siliconflowKey.trim() } : {}),
                ...(deepseekBaseUrl.trim() ? { deepseekBaseUrl: deepseekBaseUrl.trim() } : {}),
                ...(siliconflowBaseUrl.trim() ? { siliconflowBaseUrl: siliconflowBaseUrl.trim() } : {}),
            })
            toast.success('AI 服务配置已保存')
            close()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : '保存配置失败')
        } finally {
            setSaving(false)
        }
    }

    const testRow = (
        label: string,
        result: TestResults['deepseek'] | undefined
    ) => (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
            {result === undefined ? (
                <span className="text-muted-foreground/50">—</span>
            ) : result.ok === null ? (
                <span className="text-muted-foreground/60">未配置</span>
            ) : result.ok ? (
                <span className="flex items-center gap-1 text-success">
                    <Check className="size-3" /> 连接正常
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
        <Dialog open={open} onOpenChange={(o) => (o ? undefined : close())}>
            <DialogContent className="w-[480px] max-w-full rounded-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="size-4 text-primary" />
                        AI 服务配置
                    </DialogTitle>
                </DialogHeader>

                <p className="text-xs leading-relaxed text-muted-foreground">
                    留空的项保持原配置不变。DeepSeek 用于对话/翻译/总结；SiliconFlow
                    用于向量索引与检索（未配置时文献无法建索引，问答无内容）。
                </p>

                <div className="flex flex-col gap-3">
                    <div>
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground/70">
                            DeepSeek API Key（对话/翻译/总结）
                        </label>
                        <Input
                            type="password"
                            value={deepseekKey}
                            onChange={(e) => setDeepseekKey(e.target.value)}
                            placeholder="sk-…（留空不修改）"
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
                            SiliconFlow API Key（向量检索）
                        </label>
                        <Input
                            type="password"
                            value={siliconflowKey}
                            onChange={(e) => setSiliconflowKey(e.target.value)}
                            placeholder="sk-…（留空不修改）"
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

                    <div className="flex flex-col gap-1.5">
                        {testRow('DeepSeek', testResults?.deepseek)}
                        {testRow('SiliconFlow', testResults?.siliconflow)}
                    </div>
                    <Button variant="outline" onClick={handleTest} disabled={testing} className="self-start">
                        {testing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                        {testing ? '测试中…' : testResults ? '重新测试' : '测试连接'}
                    </Button>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <Button variant="ghost" onClick={close} className="text-muted-foreground">
                        取消
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        保存配置
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
