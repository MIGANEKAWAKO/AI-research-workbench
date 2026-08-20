import Home from "@/pages/home"
import { Toaster } from "@/components/ui/sonner"

const App = () => {
    return <>
        <Home />
        {/* UI 重构：全局 Toast（sonner，顶部居中，主题随 use-theme） */}
        <Toaster position="top-center" richColors closeButton />
    </>
}

export default App
