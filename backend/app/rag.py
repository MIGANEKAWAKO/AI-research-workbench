''' RAG检索注入：对话模式下，把知识库检索结果拼进 System Prompt '''

from __future__ import annotations
from . import kb

def build_rag_context(query: str, doc_id: str | None =None, top_k: int = 5):
    # ① 调 kb.retrieve 检索（同步函数，路由里用 to_thread 调它）
    # ② 把每个结果块格式化成 "[来源: 标题, 第N页] 内容" 一行
    # ③ 拼成一个带标题的整段文本返回

    try:
        docs = kb.retrieve(query, doc_id, top_k)
    except Exception:
        return ""            # 降级：任何失败返回空串
    
    if not docs:
        return ""            # 没检索到也返回空串
    parts = [_format_chunk(doc) for doc in docs]
    return "\n".join(["【知识库检索结果】", *parts, "回答请基于以上内容，并注明来源（标题+页码）。"])

def _format_chunk(doc) -> str:
    # 单个块的格式化

    if doc.metadata.get("docType") == "paper":
        return f'[来源：{doc.metadata["title"]}，第{doc.metadata["page"]}页] {doc.page_content}'
    else:
        return f'[来源：{doc.metadata["title"]}] {doc.page_content}'
