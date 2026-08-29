''' RAG检索注入：对话模式下，把知识库检索结果拼进 System Prompt '''

from __future__ import annotations
from . import kb

# 单篇问答：强制注入第 1 页 chunk（摘要/引言所在页）。
# 意图型 query（"摘要部分讲了什么"）与摘要正文的向量相似度排名不稳定，
# 纯 top-k 常漏摘要——首页确定性注入绕过该问题。
FIRST_PAGE_INJECT = 1

def build_rag_context(query: str, doc_id: str | None =None, top_k: int = 5):
    # ① 调 kb.retrieve 检索（同步函数，路由里用 to_thread 调它）
    # ② 把每个结果块格式化成 "[来源: 标题, 第N页] 内容" 一行
    # ③ 拼成一个带标题的整段文本返回

    if top_k is None:
        top_k = 10 if doc_id else 5   # 单篇问答上下文集中，更多 chunk 提高摘要命中

    try:
        docs = kb.retrieve(query, doc_id, top_k)
    except Exception:
        return ""            # 降级：任何失败返回空串

    # 单篇模式：合并首页 chunks（内容去重，防止与相似度结果重复）
    if doc_id and docs:
        docs = _merge_page_chunks(docs, kb.get_document_chunks(doc_id), FIRST_PAGE_INJECT)
    
    if not docs:
        return ""            # 没检索到也返回空串
    parts = [_format_chunk(doc) for doc in docs]
    return "\n".join(["【知识库检索结果】", *parts, "回答请基于以上内容，并注明来源（标题+页码）。"])

def _merge_page_chunks(primary, all_docs, max_page):
    """把 all_docs 中 page<=max_page 的 chunk 追加到 primary（按前 80 字符去重）。"""
    seen = {d.page_content[:80] for d in primary}
    merged = list(primary)
    for d in all_docs:
        if (d.metadata.get("page") or 0) <= max_page:
            key = d.page_content[:80]
            if key not in seen:
                seen.add(key)
                merged.append(d)
    return merged

def _format_chunk(doc) -> str:
    # 单个块的格式化

    if doc.metadata.get("docType") == "paper":
        return f'[来源：{doc.metadata["title"]}，第{doc.metadata["page"]}页] {doc.page_content}'
    else:
        return f'[来源：{doc.metadata["title"]}] {doc.page_content}'
