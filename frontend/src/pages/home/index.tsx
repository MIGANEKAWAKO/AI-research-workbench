import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable";
import Editor from '@/pages/editor'
import AIPanel from '@/components/AIPanel'
import SideBar from '@/components/SiderBar/index';
import TopBar from '@/components/TopBar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useNoteStore } from "@/store/useNoteStore";
import { useDataStore } from "@/store/useDataStore";
import { useLiteratureStore } from "@/store/useLiteratureStore";
import { LiteratureDetail } from "@/components/Literature/literature-detail";
import { PdfReader } from "@/components/Reader/pdf-reader";
import { UploadView } from "@/components/Literature/upload-view";
import { useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import { SetupWizard } from '@/components/SetupWizard';
import { getConfigStatus } from '@/services/config';
import { apiBase } from '@/services/api';

const Home = () => {
    const isAiPanelOpen = useNoteStore((state) => state.isAiPanelOpen);
    const toggleAiPanel = useNoteStore((state) => state.toggleAiPanel);
    const activeNoteId = useNoteStore((state) => state.activeNoteId);
    const view = useNoteStore((state) => state.view);
    const readerId = useLiteratureStore((state) => state.readerId);
    const entries = useLiteratureStore((state) => state.entries);
    const uploadOpen = useLiteratureStore((state) => state.uploadOpen);

    // M2 P1：首次启动向导——配置完成前不显示主界面
    const [checkingConfig, setCheckingConfig] = useState(true)
    const [setupDone, setSetupDone] = useState(true)

    // 文献模式中间面板：上传页（打开中 或 列表为空）→ 阅读器 → 详情/空态
    const showUpload = uploadOpen || entries.length === 0;

    useEffect(() => {
        void (async () => {
            try {
                const status = await getConfigStatus()
                setSetupDone(status.configured)
            } catch {
                // 后端不可用：不阻塞进入（主界面已有离线降级提示）
                setSetupDone(true)
            } finally {
                setCheckingConfig(false)
            }
        })()
    }, [])

    // F1：应用启动时从 vault 加载笔记（扫描 vault/笔记/*.md）
    // M2 P1：向导完成后重新加载（配置前 vault 是默认空目录）
    useEffect(() => {
        useDataStore.getState().loadAll()
    }, [setupDone])

    // F4：进入文献模式时加载文献列表 + 集合定义（后端 literature.json + 前端 .kb/literature-collections.json）
    useEffect(() => {
        if (view === 'library') {
            useLiteratureStore.getState().load()
            void useLiteratureStore.getState().loadCollections()
        }
    }, [view, setupDone])

    // F3 演进（M2 A5）：vault 变更感知——SSE 订阅为主（后端 watchdog 实时推送，
    // GET /api/events），EventSource 断线/不可用时降级 30s 轮询兜底；重连成功即停轮询。
    // 事件是"幂等刷新信号"（vault.changed 无 diff）：收到即全量刷新笔记 + 文献列表，
    // 丢失/重复无害（后端设计见 docs/模块说明.md A5）。
    // 传 activeNoteId：正在编辑的笔记保留内存值（refreshFromDisk 内部跳过），
    // 防止未保存输入被磁盘旧版覆盖；用 ref 读最新值，避免连接因 activeNoteId 变化重建。
    const activeNoteIdRef = useRef(activeNoteId)
    activeNoteIdRef.current = activeNoteId

    useEffect(() => {
        let es: EventSource | null = null
        let pollTimer: ReturnType<typeof setInterval> | null = null
        let sseOk = false
        let cancelled = false

        const refreshAll = () => {
            useDataStore.getState().refreshFromDisk(activeNoteIdRef.current)
            void useLiteratureStore.getState().load()
        }
        const stopPoll = () => {
            if (pollTimer) {
                clearInterval(pollTimer)
                pollTimer = null
            }
        }
        const startPoll = () => {
            if (pollTimer) return
            pollTimer = setInterval(refreshAll, 30_000)
        }

        // P6：EventSource 是同步构造，地址需先 await apiBase()（Tauri 动态端口）
        void (async () => {
            const base = await apiBase()
            if (cancelled) return
            es = new EventSource(`${base}/api/events`)
            es.onopen = () => {
                sseOk = true
                stopPoll()
            }
            // 断线/重连中（EventSource 内置自动重连）→ 轮询兜底
            es.onerror = () => {
                sseOk = false
                startPoll()
            }
            es.onmessage = (e) => {
                if (!sseOk) return
                try {
                    const data = JSON.parse(e.data) as { type?: string }
                    if (data.type === 'vault.changed') refreshAll()
                } catch {
                    // 非 JSON 帧忽略（心跳是注释帧，不会触发 onmessage，此处仅防御）
                }
            }
        })()

        return () => {
            cancelled = true
            es?.close()
            stopPoll()
        }
    }, [])

    // M2 P1：向导期间不渲染主界面（hooks 已全部在条件 return 之前执行，顺序稳定）
    if (checkingConfig) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background text-sm text-muted-foreground">
                正在启动…
            </div>
        )
    }

    if (!setupDone) {
        return <SetupWizard onDone={() => setSetupDone(true)} />
    }

    return (
        <>
            {/* 宽度变量定义在 Provider（shadcn Sidebar 的 gap 占位符读取这里）：
                展开 264px / 折叠 60px（设计稿） */}
            <SidebarProvider
                style={{ '--sidebar-width': '264px', '--sidebar-width-icon': '60px' } as React.CSSProperties}
            >
                {/* UI 重构 Step 2：外层容器 = 主题 token + 顶栏 + 内容区 */}
                <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
                    <TopBar />

                    <div className="flex min-h-0 flex-1">
                        {/* 左侧：shadcn Sidebar（gap 占位符控制文档流宽度，折叠时自动让位给右侧面板） */}
                        <SideBar />

                        <ResizablePanelGroup className="flex-1">
                            {/* 中间面板：笔记模式 → 编辑器；文献模式 → 阅读器（F5）或详情（F4） */}
                            <ResizablePanel defaultSize={70} minSize={30}>
                                {/* min-h-0：flex 子项默认 min-height:auto，内容会撑破容器
                                    （AI 面板消息区/编辑器滚动失效、输入区被挤到页面底部） */}
                                <main className="flex min-h-0 flex-1 flex-col min-w-0 bg-background relative">
                                    {view === 'library' ? (
                                        showUpload ? (
                                            <UploadView />
                                        ) : readerId ? (
                                            <PdfReader />
                                        ) : (
                                            <LiteratureDetail />
                                        )
                                    ) : (
                                        <Editor />
                                    )}
                                </main>
                            </ResizablePanel>

                            {/* AI 面板：size 参数均为百分比（相对面板组总宽），
                                修复原 defaultSize=240/minSize=120 非法值导致的挤压 */}
                            {isAiPanelOpen && (
                                <>
                                    <ResizableHandle withHandle /> {/* 拖拽柄 */}
                                    <ResizablePanel
                                        defaultSize={240}
                                        minSize={0}
                                        maxSize={500}
                                        className="transition-all duration-300 ease-in-out"
                                    >
                                        <AIPanel />
                                    </ResizablePanel>
                                </>
                            )}
                        </ResizablePanelGroup>
                    </div>
                </div>
            </SidebarProvider>

            {/* AI 唤醒按钮（全局，笔记/文献模式均显示；面板折叠时右下角悬浮） */}
            {!isAiPanelOpen && (
                <button
                    onClick={toggleAiPanel}
                    title="打开 AI 助手"
                    className="fixed right-[18px] bottom-[18px] z-[900] grid size-12 place-items-center rounded-full border border-border bg-card text-primary shadow-lg transition-colors hover:border-primary hover:bg-primary hover:text-white"
                >
                    <Bot className="size-5" />
                </button>
            )}
        </>
    )
}

export default Home
