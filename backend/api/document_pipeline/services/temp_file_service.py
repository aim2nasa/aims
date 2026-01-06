"""
Temp File Service
임시 파일 저장/읽기/삭제 관리
"""
import os
import uuid
import logging
import aiofiles
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class TempFileService:
    """임시 파일 관리 서비스"""

    @classmethod
    def _ensure_temp_dir(cls) -> Path:
        """임시 디렉토리 존재 확인 및 생성"""
        temp_path = Path(settings.UPLOAD_QUEUE_TEMP_PATH)
        temp_path.mkdir(parents=True, exist_ok=True)
        return temp_path

    @classmethod
    def _generate_temp_filename(cls, original_name: str) -> str:
        """고유한 임시 파일명 생성"""
        ext = os.path.splitext(original_name)[1] if original_name else ""
        unique_id = uuid.uuid4().hex[:16]
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return f"temp_{timestamp}_{unique_id}{ext}"

    @classmethod
    async def save(cls, content: bytes, original_name: str) -> str:
        """
        임시 파일 저장

        Args:
            content: 파일 내용 (bytes)
            original_name: 원본 파일명

        Returns:
            임시 파일 경로
        """
        temp_dir = cls._ensure_temp_dir()
        temp_filename = cls._generate_temp_filename(original_name)
        temp_path = temp_dir / temp_filename

        async with aiofiles.open(temp_path, "wb") as f:
            await f.write(content)

        logger.debug(f"Saved temp file: {temp_path}")
        return str(temp_path)

    @classmethod
    async def read(cls, temp_path: str) -> bytes:
        """
        임시 파일 읽기

        Args:
            temp_path: 임시 파일 경로

        Returns:
            파일 내용 (bytes)

        Raises:
            FileNotFoundError: 파일이 존재하지 않을 때
        """
        if not os.path.exists(temp_path):
            raise FileNotFoundError(f"Temp file not found: {temp_path}")

        async with aiofiles.open(temp_path, "rb") as f:
            content = await f.read()

        return content

    @classmethod
    async def delete(cls, temp_path: str) -> bool:
        """
        임시 파일 삭제

        Args:
            temp_path: 임시 파일 경로

        Returns:
            삭제 성공 여부
        """
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
                logger.debug(f"Deleted temp file: {temp_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete temp file {temp_path}: {e}")
            return False

    @classmethod
    async def cleanup_old(cls, hours: int = 24) -> int:
        """
        오래된 임시 파일 정리

        Args:
            hours: 삭제 기준 시간 (기본 24시간)

        Returns:
            삭제된 파일 수
        """
        temp_dir = Path(settings.UPLOAD_QUEUE_TEMP_PATH)
        if not temp_dir.exists():
            return 0

        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        deleted_count = 0

        try:
            for temp_file in temp_dir.glob("temp_*"):
                if temp_file.is_file():
                    file_mtime = datetime.fromtimestamp(temp_file.stat().st_mtime)
                    if file_mtime < cutoff_time:
                        try:
                            temp_file.unlink()
                            deleted_count += 1
                            logger.debug(f"Cleaned up old temp file: {temp_file}")
                        except Exception as e:
                            logger.warning(f"Failed to delete old temp file {temp_file}: {e}")

            if deleted_count > 0:
                logger.info(f"Cleaned up {deleted_count} old temp files")

        except Exception as e:
            logger.error(f"Error during temp file cleanup: {e}")

        return deleted_count

    @classmethod
    def get_file_size(cls, temp_path: str) -> Optional[int]:
        """
        임시 파일 크기 조회

        Args:
            temp_path: 임시 파일 경로

        Returns:
            파일 크기 (bytes) 또는 None
        """
        try:
            if os.path.exists(temp_path):
                return os.path.getsize(temp_path)
            return None
        except Exception:
            return None
