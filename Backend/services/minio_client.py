# services/minio_client.py
import io
import logging
from datetime import timedelta
from typing import Optional

import urllib3
from minio import Minio
from minio.error import S3Error

from apps.api.core.config import settings

logger = logging.getLogger(__name__)


class MinioService:
    """MinIO document storage for regulation source documents."""

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        secure: bool = False,
    ) -> None:
        # Fast-fail http client: 1 retry, 3 s connect timeout
        _http = urllib3.PoolManager(
            timeout=urllib3.Timeout(connect=3.0, read=30.0),
            retries=urllib3.Retry(total=1, backoff_factor=0),
        )
        self._client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
            http_client=_http,
        )
        self._bucket = bucket

    def ensure_bucket(self) -> None:
        try:
            if not self._client.bucket_exists(self._bucket):
                self._client.make_bucket(self._bucket)
                logger.info("Created MinIO bucket: %s", self._bucket)
        except S3Error as exc:
            logger.error("MinIO bucket error: %s", exc)
            raise

    def upload_document(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        self._client.put_object(
            bucket_name=self._bucket,
            object_name=key,
            data=io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
        logger.debug("Uploaded %s to MinIO bucket %s", key, self._bucket)

    def get_document_url(self, key: str, expires_hours: int = 1) -> str:
        return self._client.presigned_get_object(
            bucket_name=self._bucket,
            object_name=key,
            expires=timedelta(hours=expires_hours),
        )

    def is_reachable(self) -> bool:
        try:
            self._client.list_buckets()
            return True
        except Exception:
            return False


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_minio: Optional[MinioService] = None


def get_minio_service() -> MinioService:
    global _minio
    if _minio is None:
        _minio = MinioService(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            bucket=settings.MINIO_BUCKET,
        )
    return _minio
