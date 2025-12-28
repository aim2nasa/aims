"""
Document Metadata Extraction Service
"""
import os
import hashlib
import mimetypes
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
import aiofiles

logger = logging.getLogger(__name__)

# Optional imports for enhanced functionality
try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False
    logger.warning("PyMuPDF not available. PDF text extraction will be limited.")


class MetaService:
    """Extract metadata from documents using class methods"""

    @classmethod
    async def extract_metadata(
        cls,
        file_path: Optional[str] = None,
        file_content: Optional[bytes] = None,
        filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract metadata from a file.

        Args:
            file_path: Path to the file on disk
            file_content: Binary content of the file
            filename: Original filename (used when file_content is provided)

        Returns:
            Metadata dictionary
        """
        try:
            if file_path:
                path = Path(file_path)
                if not path.exists():
                    return cls._error_response("FILE_NOT_FOUND", f"File not found: {file_path}")

                content = await cls._read_file(file_path)
                name = path.name
                stat = path.stat()
                size = stat.st_size
                created_at = datetime.fromtimestamp(stat.st_ctime).isoformat()
            elif file_content and filename:
                content = file_content
                name = filename
                size = len(file_content)
                created_at = datetime.utcnow().isoformat()
            else:
                return cls._error_response("NO_INPUT", "No file path or content provided")

            # Basic metadata
            extension = Path(name).suffix.lower()
            mime_type, _ = mimetypes.guess_type(name)
            if not mime_type:
                mime_type = "application/octet-stream"

            # Compute file hash
            file_hash = hashlib.sha256(content).hexdigest()

            result = {
                "status": "OK",
                "filename": name,
                "extension": extension,
                "mime_type": mime_type,
                "file_size": size,
                "created_at": created_at,
                "file_hash": file_hash,
                "extracted_text": None,
                "num_pages": None,
                "pdf_text_ratio": None,
                "exif": None,
                "error": False
            }

            # Extract text based on file type
            if mime_type == "application/pdf":
                pdf_info = await cls._extract_pdf_info(content)
                result.update(pdf_info)
            elif mime_type.startswith("text/"):
                result["extracted_text"] = content.decode("utf-8", errors="ignore")

            return result

        except Exception as e:
            logger.error(f"Metadata extraction error: {e}")
            return cls._error_response("EXTRACTION_ERROR", str(e))

    @classmethod
    async def _read_file(cls, file_path: str) -> bytes:
        """Read file content"""
        async with aiofiles.open(file_path, 'rb') as f:
            return await f.read()

    @classmethod
    async def _extract_pdf_info(cls, content: bytes) -> Dict[str, Any]:
        """Extract PDF-specific information"""
        result = {
            "num_pages": None,
            "extracted_text": None,
            "pdf_text_ratio": None
        }

        if not HAS_PYMUPDF:
            return result

        try:
            doc = fitz.open(stream=content, filetype="pdf")
            result["num_pages"] = len(doc)

            # Extract text from all pages
            text_parts = []
            for page in doc:
                text_parts.append(page.get_text())

            full_text = "\n".join(text_parts)
            result["extracted_text"] = full_text

            # Calculate text ratio (characters per page)
            if result["num_pages"] > 0:
                result["pdf_text_ratio"] = len(full_text) / result["num_pages"]

            doc.close()

        except Exception as e:
            logger.error(f"PDF extraction error: {e}")
            result["error"] = str(e)

        return result

    @classmethod
    def _error_response(cls, error_code: str, message: str) -> Dict[str, Any]:
        """Generate error response"""
        return {
            "status": 500,
            "error": True,
            "code": error_code,
            "message": message,
            "filename": None,
            "extension": None,
            "mime_type": None,
            "file_size": None,
            "created_at": None,
            "file_hash": None,
            "extracted_text": None,
            "num_pages": None,
            "pdf_text_ratio": None,
            "exif": None
        }
