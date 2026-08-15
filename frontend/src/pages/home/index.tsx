import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import Editor from '@/pages/editor'
import AIPanel from '@/components/AIPanel'
import SideBar from '@/components/SiderBar/index';
import { SidebarProvider } from '@/components/ui/sidebar';
import { useNoteStore } from "@/store/useNoteStore";
import { useDataStore } from "@/store/useDataStore";
import { useEffect } from 'react';

const Home = () => {
    const isAiPanelOpen = useNoteStore((state) => state.isAiPanelOpen);
    const activeNoteId = useNoteStore((state) => state.activeNoteId);

    // F1：应用启动时从 vault 加载笔记（扫描 vault/笔记/*.md）
    useEffect(() => {
        useDataStore.getState().loadAll()
    }, [])

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
            <SidebarProvider>
                <div className="flex h-screen w-full bg-white overflow-hidden text-gray-900">
                    {/* 左侧：笔记列表 (固定宽度) */}
                    <aside className="w-64 border-r border-gray-100 bg-gray-50/50 shrink-0">
                        <SideBar />
                    </aside>

                    <ResizablePanelGroup className="flex-1">
                        {/* 编辑器面板 */}
                        <ResizablePanel defaultSize={70} minSize={30}>
                            <main className="flex-1 flex flex-col min-w-0 bg-white relative">
                                <Editor />
                            </main>
                        </ResizablePanel>

                        {isAiPanelOpen && (
                            <>
                                <ResizableHandle withHandle /> {/* 拖拽柄 */}
                                <ResizablePanel 
                                    defaultSize={240} 
                                    minSize={120} 
                                    maxSize={320}
                                    className="transition-all duration-300 ease-in-out"
                                >
                                    <AIPanel />
                                </ResizablePanel>
                            </>
                        )}
                    </ResizablePanelGroup>
                </div>
            </SidebarProvider>
        </>
    )
}

export default Home