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

const Home = () => {
    const isAiPanelOpen = useNoteStore((state) => state.isAiPanelOpen);

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