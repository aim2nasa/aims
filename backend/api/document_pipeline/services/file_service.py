"""
File Storage Service
"""
import os
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple
import aiofiles
import mimetypes

from config import get_settings


class FileService:
    """File storage service with class methods"""

    @classmethod
    def _generate_filename(cls, original_name: str) -> str:
        """Generate unique filename with timestamp prefix"""
        timestamp = datetime.now().strftime("%y%m%d%H%M%S")
        random_suffix = hashlib.md5(
            f"{original_name}{datetime.now().isoformat()}".encode()
        ).hexdigest()[:8]
        ext = Path(original_name).suffix
        return f"{timestamp}_{random_suffix}{ext}"

    @classmethod
    def _get_user_path(cls, user_id: str) -> Path:
        """Get user-specific storage path"""
        settings = get_settings()
        base_path = Path(settings.FILE_BASE_PATH)
        now = datetime.now()
        return base_path / "users" / user_id / str(now.year) / f"{now.month:02d}"

    @classmethod
    async def save_file(
        cls,
        content: bytes,
        original_name: str,
        user_id: str,
        source_path: Optional[str] = None
    ) -> Tuple[str, str]:
        """
        Save file and return (saved_name, dest_path)
        """
        saved_name = cls._generate_filename(original_name)
        user_path = cls._get_user_path(user_id)

        # Create directory if not exists
        os.makedirs(user_path, exist_ok=True)

        dest_path = user_path / saved_name

        async with aiofiles.open(dest_path, 'wb') as f:
            await f.write(content)

        return saved_name, str(dest_path)

    @classmethod
    async def read_file(cls, file_path: str) -> bytes:
        """Read file content as bytes"""
        async with aiofiles.open(file_path, 'rb') as f:
            return await f.read()

    @classmethod
    async def read_file_as_text(cls, file_path: str, encoding: str = "utf-8") -> str:
        """Read file content as text"""
        try:
            async with aiofiles.open(file_path, 'r', encoding=encoding) as f:
                return await f.read()
        except UnicodeDecodeError:
            # Try with latin-1 as fallback
            async with aiofiles.open(file_path, 'r', encoding='latin-1') as f:
                return await f.read()

    @classmethod
    def get_file_info(cls, file_path: str) -> dict:
        """Get file metadata"""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        stat = path.stat()
        mime_type, _ = mimetypes.guess_type(str(path))

        return {
            "filename": path.name,
            "extension": path.suffix,
            "mime": mime_type or "application/octet-stream",
            "size_bytes": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
        }

    @classmethod
    def compute_hash(cls, content: bytes) -> str:
        """Compute SHA-256 hash of content"""
        return hashlib.sha256(content).hexdigest()
