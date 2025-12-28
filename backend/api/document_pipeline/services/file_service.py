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
    def __init__(self):
        self.settings = get_settings()
        self.base_path = Path(self.settings.FILE_BASE_PATH)

    def _generate_filename(self, original_name: str) -> str:
        """Generate unique filename with timestamp prefix"""
        timestamp = datetime.now().strftime("%y%m%d%H%M%S")
        random_suffix = hashlib.md5(
            f"{original_name}{datetime.now().isoformat()}".encode()
        ).hexdigest()[:8]
        ext = Path(original_name).suffix
        return f"{timestamp}_{random_suffix}{ext}"

    def _get_user_path(self, user_id: str) -> Path:
        """Get user-specific storage path"""
        now = datetime.now()
        return self.base_path / "users" / user_id / str(now.year) / f"{now.month:02d}"

    async def save_file(
        self,
        file_content: bytes,
        original_name: str,
        user_id: str,
        source_path: Optional[str] = None
    ) -> Tuple[str, str, str]:
        """
        Save file and return (saved_name, dest_path, source_path)
        """
        saved_name = self._generate_filename(original_name)
        user_path = self._get_user_path(user_id)

        # Create directory if not exists
        os.makedirs(user_path, exist_ok=True)

        dest_path = user_path / saved_name

        async with aiofiles.open(dest_path, 'wb') as f:
            await f.write(file_content)

        return saved_name, str(dest_path), source_path or ""

    async def read_file(self, file_path: str) -> bytes:
        """Read file content"""
        async with aiofiles.open(file_path, 'rb') as f:
            return await f.read()

    def get_file_info(self, file_path: str) -> dict:
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

    def compute_hash(self, content: bytes) -> str:
        """Compute SHA-256 hash of content"""
        return hashlib.sha256(content).hexdigest()
