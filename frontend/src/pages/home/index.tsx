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
import { useEffect } from 'react';

const Home = () => {
    const isAiPanelOpen = useNoteStore((state) => state.isAiPanelOpen);
    const activeNoteId = useNoteStore((state) => state.activeNoteId);
    const view = useNoteStore((state) => state.view);
    const readerId = useLiteratureStore((state) => state.readerId);
    const entries = useLiteratureStore((state) => state.entries);
    const uploadOpen = useLiteratureStore((state) => state.uploadOpen);

    // 文献模式中间面板：上传页（打开中 或 列表为空）→ 阅读器 → 详情/空态
    const showUpload = uploadOpen || entries.length === 0;

    // F1：应用启动时从 vault 加载笔记（扫描 vault/笔记/*.md）
    useEffect(() => {
        useDataStore.getState().loadAll()
    }, [])

    // F4：进入文献模式时加载文献列表（后端 literature.json）
    useEffect(() => {
        if (view === 'library') {
            useLiteratureStore.getState().load()
        }
    }, [view])

    // F3：30s 轻量轮询兜底——感知 Obsidian/VS Code 等外部对 vault 文件的修改。
    // 传入 activeNoteId：正在编辑的笔记保留内存值（refreshFromDisk 内部跳过），
    // 防止未保存输入被磁盘旧版覆盖。activeNoteId 变化时重建定时器（无副作用）。
    useEffect(() => {
        const timer = setInterval(() => {
            useDataStore.getState().refreshFromDisk(activeNoteId)
        }, 30_000)
        return () => clearInterval(timer)
    }, [activeNoteId])

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
                                <main className="flex-1 flex flex-col min-w-0 bg-background relative">
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

                            {isAiPanelOpen && (
                                <>
                                    <ResizableHandle withHandle /> {/* 拖拽柄 */}
                                    <ResizablePanel
                                        defaultSize={240}
                                        minSize={120}
                                        maxSize={360}
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
        </>
    )
}

export default Home
