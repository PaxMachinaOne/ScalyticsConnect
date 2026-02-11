# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
"""
Content Vector Module
Handles text chunking, embedding generation, and vector database operations.
"""
import json
import asyncio
import os
from typing import Dict, List, Optional, Any

from sentence_transformers import SentenceTransformer
import lancedb
from langchain.text_splitter import RecursiveCharacterTextSplitter
from lancedb.pydantic import pydantic_to_schema
from pydantic import BaseModel as PydanticBaseModel
from typing import List as PyList
import numpy as np

from .. import config as app_config
from .. import models
from ..utils import setup_logger, FileLock

logger = setup_logger(__name__, level=app_config.settings.LOG_LEVEL)

# Worker-local storage for the singleton instance
_worker_local_instance = None

class LanceDbRowSchema(PydanticBaseModel):
    vector: PyList[float]
    chat_id: str
    source: str
    chunk_index: int
    text_content: str
    is_from_uploaded_doc: Optional[bool] = None
    original_document_id: Optional[str] = None

class ContentVector:
    def is_healthy(self) -> bool:
        """Checks if the essential resources like the DB connection and table handle are still valid."""
        return self.db_connection is not None and self.db_table is not None

    def __init__(self, settings: app_config.Settings, model_id_or_path_override: Optional[str] = None):
        self.settings = settings
        self.model_id_or_path = model_id_or_path_override or self.settings.DEFAULT_EMBEDDING_MODEL_ID_OR_PATH
        self.vector_db_uri = self.settings.LANCEDB_BASE_URI
        self.table_name = self.settings.LANCEDB_DEFAULT_TABLE_NAME
        
        self.lock_dir = os.path.join(self.vector_db_uri, '.locks')
        os.makedirs(self.lock_dir, mode=0o755, exist_ok=True)
        self.write_lock_path = os.path.join(self.lock_dir, f'{self.table_name}.write.lock')

        self.model: Optional[SentenceTransformer] = None
        self.embedding_dim: Optional[int] = None
        self.db_connection: Optional[lancedb.DBConnection] = None
        self.db_table: Optional[lancedb.table.Table] = None
        
        self.processing_lock = asyncio.Lock()

    async def initialize_resources(self) -> bool:
        """Initializes the service by loading the model and connecting to/creating the LanceDB table."""
        try:
            if not self.model_id_or_path:
                raise ValueError("Cannot initialize: model_id_or_path is not configured.")
            
            self.model = SentenceTransformer(self.model_id_or_path, device='cpu')
            self.embedding_dim = self.model.get_sentence_embedding_dimension()
            if not self.embedding_dim:
                self.embedding_dim = len(self.model.encode("test"))

            self.db_connection = lancedb.connect(self.vector_db_uri)
            table_names = self.db_connection.table_names()
            
            if self.table_name in table_names:
                try:
                    self.db_table = self.db_connection.open_table(self.table_name)
                    
                    # Validate that the table handle is actually valid
                    if self.db_table is None:
                        error_msg = f"Table '{self.table_name}' exists but open_table() returned None. This indicates a LanceDB API issue or corrupted table."
                        logger.error(f"[PID:{os.getpid()}] {error_msg}")
                        raise RuntimeError(f"LanceDB open_table() returned None for existing table '{self.table_name}'")
                        
                except Exception as e_open:
                    error_msg = f"Failed to open existing table '{self.table_name}': {e_open}"
                    logger.error(f"[PID:{os.getpid()}] {error_msg}")
                    raise RuntimeError(f"Cannot open existing table '{self.table_name}': {e_open}")
            else:
                try:
                    schema = pydantic_to_schema(LanceDbRowSchema)
                    self.db_table = self.db_connection.create_table(self.table_name, schema=schema)
                except Exception as e_create:
                    error_msg = f"Failed to create table '{self.table_name}': {e_create}"
                    logger.error(f"[PID:{os.getpid()}] {error_msg}")
                    raise RuntimeError(f"Cannot create table '{self.table_name}': {e_create}")

            if self.db_table is None:
                error_msg = f"Table handle is None after initialization for '{self.table_name}'. This should not happen."
                logger.error(f"[PID:{os.getpid()}] FATAL ERROR: {error_msg}")
                raise RuntimeError(error_msg)

            return True
        except Exception as e:
            error_msg = f"FATAL: Failed to initialize ContentVector resources. Error: {e}"
            logger.error(f"[PID:{os.getpid()}] {error_msg}", exc_info=True)
            return False

    async def chunk_text(self, text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
        if not text:
            return []
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size, chunk_overlap=chunk_overlap, length_function=len, is_separator_regex=False
        )
        return text_splitter.split_text(text)

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        if not self.model:
            raise RuntimeError("Embedding model is not loaded.")
        if not texts:
            return []
        
        async with self.processing_lock:
            loop = asyncio.get_event_loop()
            embeddings_np = await loop.run_in_executor(None, lambda: self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False))
            return [e.tolist() for e in embeddings_np]

    async def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Alias for generate_embeddings for semantic clarity in calling code."""
        return await self.generate_embeddings(texts)

    async def add_documents(self, group_id: str, documents: List[models.GenericDocumentItem]) -> Dict[str, Any]:
        if self.db_table is None:
            raise RuntimeError("LanceDB table is not available.")
        if not documents:
            return {"success": True, "message": "No documents to add."}

        all_chunks_to_embed = []
        chunk_metadata_map = []

        # 1. Chunk all documents first
        for doc_item in documents:
            if not doc_item.text_content:
                continue
            
            chunks = await self.chunk_text(doc_item.text_content)
            if not chunks:
                continue

            metadata_to_store = doc_item.metadata.copy()
            metadata_to_store['_doc_id'] = doc_item.id
            
            for i, chunk_text in enumerate(chunks):
                all_chunks_to_embed.append(chunk_text)
                chunk_metadata_map.append({
                    "metadata": metadata_to_store,
                    "chunk_index": i,
                    "text_content": chunk_text
                })

        if not all_chunks_to_embed:
            return {"success": True, "message": "Documents had no content to process."}

        # 2. Generate embeddings for all chunks in a single batch
        all_embeddings = await self.generate_embeddings_batch(all_chunks_to_embed)

        # 3. Prepare data for LanceDB insertion
        docs_to_add_to_lancedb = []
        for i, emb in enumerate(all_embeddings):
            if not isinstance(emb, list) or not self.embedding_dim or len(emb) != self.embedding_dim:
                continue
            
            meta_info = chunk_metadata_map[i]
            metadata_to_store = meta_info["metadata"]
            source_json_str = json.dumps(metadata_to_store)

            docs_to_add_to_lancedb.append(LanceDbRowSchema(
                vector=emb,
                chat_id=group_id,
                source=source_json_str,
                chunk_index=meta_info["chunk_index"],
                text_content=meta_info["text_content"],
                is_from_uploaded_doc=metadata_to_store.get("is_from_uploaded_doc", False),
                original_document_id=str(metadata_to_store.get("original_document_id")) if metadata_to_store.get("original_document_id") is not None else None,
            ).model_dump())

        # 4. Add all prepared documents to LanceDB in one transaction
        if docs_to_add_to_lancedb:
            loop = asyncio.get_event_loop()
            with FileLock(self.write_lock_path):
                await loop.run_in_executor(None, lambda: self.db_table.add(docs_to_add_to_lancedb))
        
        return {"success": True, "message": f"{len(documents)} documents processed, {len(docs_to_add_to_lancedb)} chunks added."}

    async def search_vectors_batch(
        self, query_vectors: List[List[float]], limit: int = 5, group_id: Optional[str] = None
    ) -> List[List[models.VectorSearchResultItem]]:
        """Performs multiple vector searches concurrently."""
        if not query_vectors:
            return []
        
        search_tasks = [
            self.search_vectors(query_vector=vec, limit=limit, group_id=group_id)
            for vec in query_vectors
        ]
        
        batch_results = await asyncio.gather(*search_tasks, return_exceptions=True)
        
        final_results = []
        for result in batch_results:
            if isinstance(result, Exception):
                logger.error(f"Error during batch vector search: {result}", exc_info=result)
                final_results.append([]) # Append empty list for failed searches
            else:
                final_results.append(result)
        
        return final_results

    async def search_vectors(
        self, query_vector: Optional[List[float]] = None, limit: int = 5, group_id: Optional[str] = None,
        fts_query: Optional[str] = None, metadata_filter: Optional[Dict[str, Any]] = None
    ) -> List[models.VectorSearchResultItem]:
        if self.db_table is None:
            logger.error(f"[PID:{os.getpid()}] search_vectors: FAILED because db_table is None.")
            raise RuntimeError("LanceDB table is not available.")

        if not query_vector and not (fts_query and fts_query.strip()) and not metadata_filter:
            return []

        search_query_builder = self.db_table.search(query_vector if query_vector else fts_query)

        where_conditions = []
        if group_id:
            where_conditions.append(f"chat_id = '{group_id}'")
        
        if metadata_filter:
            for key, value in metadata_filter.items():
                if isinstance(value, str):
                    escaped_value = value.replace("'", "''")
                    where_conditions.append(f"json_extract(source, '$.{key}') = '{escaped_value}'")

        if where_conditions:
            final_where_clause = " AND ".join(where_conditions)
            search_query_builder = search_query_builder.where(final_where_clause)
        
        search_query_builder = search_query_builder.limit(limit)

        loop = asyncio.get_event_loop()
        results_lancedb = await loop.run_in_executor(None, lambda: search_query_builder.to_list())
        
        mapped_results: List[models.VectorSearchResultItem] = []
        for r in results_lancedb:
            try:
                parsed_metadata = json.loads(r.get('source', '{}'))
            except json.JSONDecodeError:
                parsed_metadata = {"error": "Failed to decode source JSON"}
            
            doc_id = parsed_metadata.pop('_doc_id', None)
            
            # Convert LanceDB distance to similarity score
            # For cosine distance: similarity = 1 - distance, clamped to [0,1]
            raw_distance = r.get('_distance', 1.0)
            similarity_score = 1.0 - raw_distance
            similarity_score = max(0.0, min(1.0, similarity_score))  # Clamp to [0,1]

            mapped_results.append(models.VectorSearchResultItem(
                id=doc_id, text_content=r.get('text_content',''), metadata=parsed_metadata, distance=raw_distance, similarity=similarity_score
            ))
        return mapped_results

    async def delete_vectors_by_group_id(self, group_id: str) -> Dict[str, Any]:
        if self.db_table is None:
            raise RuntimeError("LanceDB table is not available.")
        
        loop = asyncio.get_event_loop()
        try:
            with FileLock(self.write_lock_path):
                await loop.run_in_executor(None, lambda: self.db_table.delete(f"chat_id = '{str(group_id)}'"))
            return {"success": True, "message": f"Vectors for group ID {group_id} deleted."}
        except Exception as e:
            logger.error(f"Error deleting vectors for group ID {group_id}: {e}", exc_info=True)
            return {"success": False, "message": f"Error deleting vectors: {str(e)}"}

async def get_content_vector() -> ContentVector:
    """
    Accessor for the worker-local singleton instance of the ContentVector service.
    Initializes the service on the first call and, crucially, repairs it if it
    becomes corrupted by an external process like LangGraph's serialization.
    """
    global _worker_local_instance
    
    # Step 1: Initialize on first call
    if _worker_local_instance is None:
        _worker_local_instance = ContentVector(settings=app_config.settings)
        initialized_ok = await _worker_local_instance.initialize_resources()
        if not initialized_ok:
            _worker_local_instance = None 
            raise RuntimeError("Failed to initialize ContentVector service during first call.")
    
    # Step 2: Perform a health check on EVERY call to detect and repair corruption.
    is_healthy = _worker_local_instance.is_healthy()
    
    if not is_healthy:
        logger.warning(f"[PID:{os.getpid()}] get_content_vector: CORRUPTION DETECTED. The ContentVector singleton was found in an unhealthy state. Attempting to repair by re-establishing connection...")
        
        # Try to re-establish connection without affecting existing data
        try:
            _worker_local_instance.db_connection = lancedb.connect(_worker_local_instance.vector_db_uri)
            table_names = _worker_local_instance.db_connection.table_names()
            
            if _worker_local_instance.table_name in table_names:
                _worker_local_instance.db_table = _worker_local_instance.db_connection.open_table(_worker_local_instance.table_name)
                
                if _worker_local_instance.db_table is None:
                    raise RuntimeError(f"Cannot open existing table '{_worker_local_instance.table_name}' during repair")
                logger.info(f"[PID:{os.getpid()}] Successfully reconnected to existing table '{_worker_local_instance.table_name}'")
            else:
                # Table doesn't exist, create new one (this should be rare during repair)
                schema = pydantic_to_schema(LanceDbRowSchema)
                _worker_local_instance.db_table = _worker_local_instance.db_connection.create_table(_worker_local_instance.table_name, schema=schema)
                logger.info(f"[PID:{os.getpid()}] Created new table '{_worker_local_instance.table_name}' during repair")
                
            logger.info(f"[PID:{os.getpid()}] get_content_vector: Repair successful. ContentVector is now healthy.")
        except Exception as e_repair:
            logger.error(f"[PID:{os.getpid()}] Failed to repair ContentVector corruption: {e_repair}")
            raise RuntimeError(f"Failed to repair corrupted ContentVector service: {e_repair}")

    return _worker_local_instance
