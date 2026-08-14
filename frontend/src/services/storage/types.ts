/**
 * 接口设计
 * 
 */

// 类型
export interface FsEntry { // 文献列表数据格式
    name: string // 文件名
    isDir: boolean // 是否为目录
    path: string // 文件路径，为vault文件夹内的相对路径
}

// 方法
export interface StorageAdapter {
    list(path: string) : Promise<FsEntry[]> // 获取文献列表
    read(path: string) : Promise<string> // 读取笔记文件
    write(path: string, content: string) : Promise<void> // 保存笔记文件
    mkdir(path: string) : Promise<void> // 创建笔记保存目录
    delete(path: string) : Promise<void> // 删除笔记文件
    exists(path: string) : Promise<boolean> // 检查笔记文件是否存在
}