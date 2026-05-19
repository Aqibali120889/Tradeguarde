# services/qdrant_client.py
import logging
import uuid
from typing import Any, Dict, List, Optional

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from apps.api.core.config import settings

logger = logging.getLogger(__name__)

VECTOR_SIZE = 768  # google text-embedding-004 output dims


class QdrantService:
    """
    Manages regulation embeddings in Qdrant.
    Caller is responsible for generating embeddings via GeminiClient.embed().
    """

    def __init__(self, url: str, collection: str) -> None:
        self._client = AsyncQdrantClient(url=url)
        self._collection = collection

    async def ensure_collection(self) -> None:
        existing = await self._client.get_collections()
        names = [c.name for c in existing.collections]
        if self._collection not in names:
            await self._client.create_collection(
                collection_name=self._collection,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )
            logger.info("Created Qdrant collection: %s", self._collection)

    async def upsert_regulation(
        self,
        reg_id: str,
        embedding: List[float],
        metadata: Dict[str, Any],
    ) -> str:
        """Upsert a regulation vector. Returns the deterministic point ID."""
        point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, reg_id))
        await self._client.upsert(
            collection_name=self._collection,
            points=[
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={**metadata, "regulation_id": reg_id},
                )
            ],
        )
        logger.debug("Upserted regulation %s (point %s)", reg_id, point_id)
        return point_id

    async def search_similar(
        self,
        query_embedding: List[float],
        limit: int = 5,
        score_threshold: float = 0.6,
    ) -> List[Dict[str, Any]]:
        """Return top-k similar regulation payloads."""
        results = await self._client.search(
            collection_name=self._collection,
            query_vector=query_embedding,
            limit=limit,
            score_threshold=score_threshold,
        )
        return [{**hit.payload, "_score": hit.score} for hit in results]

    async def close(self) -> None:
        await self._client.close()


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_qdrant: Optional[QdrantService] = None


def get_qdrant_service() -> QdrantService:
    global _qdrant
    if _qdrant is None:
        _qdrant = QdrantService(
            url=settings.QDRANT_URL,
            collection=settings.QDRANT_COLLECTION,
        )
    return _qdrant
