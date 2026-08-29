"""知识库核心：Chroma 持久化 + SiliconFlow embedding + 中文分块 + 增删查。

同步实现（langchain embedding/Chroma 仅同步 API）；async 路由调用时用
anyio.to_thread 包一层，避免阻塞事件循环（由调用方决定调度方式）。

数据流：文本/PDF → split_pages（页内分块，块带 page 元数据）
      → upsert_document（幂等：先删旧块再 add）→ .kb/chroma_db 持久化
      → retrieve（相似度检索，where 支持单篇限定）
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from chromadb.config import Settings as ChromaSettings

from .caching import TTLCache
from .config import settings
from .vault import chroma_dir

logger = logging.getLogger("kb")

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
COLLECTION_NAME = "literature"

# 分隔符含中文标点：英文默认分隔符会把中文句子切碎，块边界落在句号处
SPLIT_SEPARATORS = ["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""]

# X1 缓存参数：embedding 确定性（同 query 同向量），TTL 长且无需事件失效；
# 检索结果依赖知识库内容，TTL 短 + upsert/delete 时显式失效双保险
EMBEDDING_CACHE_CAPACITY = 512
EMBEDDING_CACHE_TTL_SECONDS = 86400  # 24h
RETRIEVE_CACHE_CAPACITY = 128
RETRIEVE_CACHE_TTL_SECONDS = 60


class CachedEmbeddings(OpenAIEmbeddings):
    """embed_query 结果缓存：重复 query 不重打 SiliconFlow API（确定性，无需失效）。"""

    def __init__(self, cache: TTLCache, **kwargs):
        super().__init__(**kwargs)
        self._cache = cache

    def embed_query(self, text: str) -> list[float]:
        cached = self._cache.get(text)
        if cached is not None:
            return cached
        vector = super().embed_query(text)
        self._cache.set(text, vector, ttl_seconds=EMBEDDING_CACHE_TTL_SECONDS)
        return vector


def _get_embeddings() -> OpenAIEmbeddings:
    if not settings.siliconflow_api_key:
        raise RuntimeError("未配置 SILICONFLOW_API_KEY，无法初始化知识库（见 .env）")
    return CachedEmbeddings(
        _embedding_cache,
        model=settings.embedding_model,
        api_key=settings.siliconflow_api_key,
        base_url=settings.siliconflow_base_url,
    )


_embedding_cache = TTLCache(capacity=EMBEDDING_CACHE_CAPACITY)
_retrieve_cache = TTLCache(capacity=RETRIEVE_CACHE_CAPACITY)


def invalidate_retrieve_cache() -> None:
    """检索结果缓存失效：知识库内容变化（upsert/delete）后调用。

    挂在这里覆盖所有写库路径（indexer 扫描、文献导入/删除都经此两函数），
    避免大改库后短暂返回脏结果（短 TTL 只是兜底）。
    """
    _retrieve_cache.clear()


_collection: Chroma | None = None


def get_collection() -> Chroma:
    """懒加载单例：首次调用才建立 Chroma 持久化连接 + embedding 客户端。

    索引损坏（HNSW 文件损坏）时 Chroma 构造会抛异常——这是 P3 自愈的检测点，
    indexer.scan_and_index 用它探测库健康。
    """
    global _collection
    if _collection is None:
        # P6 隐私约定：禁用 chroma 匿名遥测（本地优先产品，数据不出本机）
        _collection = Chroma(
            collection_name=COLLECTION_NAME,
            embedding_function=_get_embeddings(),
            persist_directory=str(chroma_dir()),
            client_settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _collection


def heal_collection() -> None:
    """索引自愈：删除整个 chroma_db 并清空单例（.kb 可重建，删库无损）。

    调用方（indexer）随后应 force 全量重扫重建索引；
    若删库后仍无法构造，说明是 embedding 配置问题而非索引损坏，交由上层报错。
    """
    global _collection
    _collection = None
    shutil.rmtree(chroma_dir(), ignore_errors=True)
    logger.warning("chroma 索引已删除，等待全量重建: %s", chroma_dir())


def count_chunks() -> int:
    """chroma 集合真实 chunk 数；不可用（未配置 key/索引损坏）返回 -1。

    P6：index_state 只是记账（删库自愈后可能"有账无库"），
    kb/status 的 chunks 应优先用真实值，避免假象。
    """
    try:
        return get_collection()._collection.count()
    except Exception:
        return -1


def get_document_chunks(doc_id: str) -> list[Document]:
    """按 docId 取该文档的全部 chunk（结构感知检索用：章节标签文本匹配）。

    与 retrieve 的差异：不做相似度排序，全量返回——供 rag 按
    "摘要/引言/方法/实验/结论"等章节关键词做文本匹配注入，
    绕过"意图型 query 向量命中不稳定"的问题（单篇问答摘要提问实测）。
    """
    got = get_collection()._collection.get(
        where={"docId": doc_id}, include=["documents", "metadatas"]
    )
    return [
        Document(page_content=t, metadata=m)
        for t, m in zip(got.get("documents") or [], got.get("metadatas") or [])
    ]


def extract_pdf_pages(pdf_path: str | Path) -> list[str]:
    """pypdf 逐页抽取文本，保留页边界（块元数据 page 依赖它）。"""
    reader = PdfReader(str(pdf_path))
    return [page.extract_text() or "" for page in reader.pages]


def split_pages(pages: list[str]) -> list[Document]:
    """每页独立分块，块不跨页，metadata.page = 页号（从 1 起）。

    P6 优化：分块后做列表感知合并——splitter 的 \n 分隔会把无序/有序列表
    从中间切断（标题行+前几项一个 chunk、其余项下一个 chunk），检索命中
    标题 chunk 时模型看不到完整列表（实测：5 种编排模式被切成两块）。
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=SPLIT_SEPARATORS,
    )
    docs: list[Document] = []
    for page_no, page_text in enumerate(pages, start=1):
        for chunk in splitter.split_text(page_text):
            if chunk.strip():
                docs.append(Document(page_content=chunk, metadata={"page": page_no}))
    return _merge_list_chunks(docs)


def _merge_list_chunks(chunks: list[Document]) -> list[Document]:
    """列表感知合并：chunk 以列表项开头（- / * / 数字. 等）时并入前一 chunk。

    切分点落在列表中间时，后续 chunk 以列表项开头——与前一 chunk 合并
    保证"标题行 + 完整列表项"落在同一块。列表项通常较短，合并后略超
    CHUNK_SIZE 可接受（完整性优先）。
    """
    if len(chunks) < 2:
        return chunks
    merged: list[Document] = []
    for chunk in chunks:
        stripped = chunk.page_content.lstrip()
        if merged and stripped.startswith(("- ", "* ", "+ ", "1. ", "2. ")):
            merged[-1].page_content += "\n" + chunk.page_content
        else:
            merged.append(chunk)
    return merged


def upsert_document(

    doc_type: str,
    doc_id: str,
    title: str,
    pages: list[str] | None = None,
    text: str | None = None,
) -> int:
    """写入文档向量（幂等：先删旧块再插），返回新增块数。

    doc_type: note | paper；pages 为逐页文本（paper），text 为纯文本（note）。
    """
    if doc_type not in ("note", "paper"):
        raise ValueError(f"doc_type 只能是 note/paper，收到 {doc_type!r}")
    invalidate_retrieve_cache()
    if pages is None:
        pages = [text or ""]
    chunks = split_pages(pages)
    if not chunks:
        return 0
    for chunk in chunks:
        chunk.metadata.update(
            {"docType": doc_type, "docId": doc_id, "title": title}
        )
    collection = get_collection()
    collection.delete(where={"docId": doc_id})
    collection.add_documents(chunks)
    return len(chunks)


def delete_document(doc_id: str) -> None:
    invalidate_retrieve_cache()
    get_collection().delete(where={"docId": doc_id})


def retrieve(query: str, doc_id: str | None = None, top_k: int = 5) -> list[Document]:
    """相似度检索；doc_id 指定时按单篇限定（where 过滤），默认全局检索。

    X1：结果缓存（短 TTL 60s + upsert/delete 显式失效双保险）；
    返回缓存内的 Document 引用，调用方只读（rag / local_tools 均只读）。
    """
    cache_key = f"retrieve:{query}|{doc_id or ''}|{top_k}"
    cached = _retrieve_cache.get(cache_key)
    if cached is not None:
        return cached
    filter_dict = {"docId": doc_id} if doc_id else None
    docs = get_collection().similarity_search(query, k=top_k, filter=filter_dict)
    _retrieve_cache.set(cache_key, docs, ttl_seconds=RETRIEVE_CACHE_TTL_SECONDS)
    return docs


if __name__ == "__main__":  # CLI：python -m app.kb <upsert|query|delete> ...
    import sys

    def usage() -> None:
        print("用法:")
        print("  python -m app.kb upsert <doc_type> <doc_id> <title> <文本>")
        print("  python -m app.kb query <查询词> [doc_id]")
        print("  python -m app.kb delete <doc_id>")

    args = sys.argv[1:]
    if not args or args[0] not in ("upsert", "query", "delete"):
        usage()
        sys.exit(1)

    try:
        if args[0] == "upsert":
            if len(args) < 5:
                usage()
                sys.exit(1)
            count = upsert_document(args[1], args[2], args[3], text=args[4])
            print(f"已写入 {count} 块（doc_id={args[2]}）")
        elif args[0] == "query":
            if len(args) < 2:
                usage()
                sys.exit(1)
            doc_id = args[2] if len(args) > 2 else None
            results = retrieve(args[1], doc_id=doc_id)
            for i, doc in enumerate(results, start=1):
                print(f"[{i}] page={doc.metadata.get('page')} "
                      f"docId={doc.metadata.get('docId')}: {doc.page_content[:80]}...")
        elif args[0] == "delete":
            delete_document(args[1])
            print(f"已删除 doc_id={args[1]}")
    except Exception as exc:  # 网络/key 错误在 CLI 直接展示
        print(f"失败: {exc!r}")
        sys.exit(1)
