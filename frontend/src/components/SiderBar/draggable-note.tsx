import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

export const DraggableNote = ({ id, children }: { id: number; children: React.ReactNode }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `note-${id}`,
        data: { noteId: id } // 携带笔记 ID 数据
    })

    const style = {
        // transform 会处理位置偏移，让笔记跟着鼠标走
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
    }

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            {children}
        </div>
    )
}