import { useDroppable } from "@dnd-kit/core";

export const DroppableCollection = ({ id, children }: { id: number | 'inbox'; children: React.ReactNode }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `col-${id}`,
        data: { collectionId: id } // 接收目标集合 ID
    })

    return (
        <div 
            ref={setNodeRef} 
            className={`rounded-md transition-colors ${isOver ? 'bg-purple-100/50' : ''}`}
        >
            {children}
        </div>
    )
}