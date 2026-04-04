"""
Document Models
"""
from typing import List, Optional

from pydantic import BaseModel


class UploadRequest(BaseModel):
    userId: str
    customerId: Optional[str] = None
    source_path: Optional[str] = None


class UploadResponse(BaseModel):
    result: str
    original: Optional[str] = None
    sourcePath: Optional[str] = None
    saved_name: Optional[str] = None
    path: Optional[str] = None
    code: Optional[str] = None
    message: Optional[str] = None


class SummaryRequest(BaseModel):
    # n8n 호환: doc_id로 DB에서 조회하거나 full_text 직접 전달
    doc_id: Optional[str] = None
    full_text: Optional[str] = None
    user_id: Optional[str] = None
    document_id: Optional[str] = None  # legacy alias for doc_id


class SummaryResponse(BaseModel):
    summary: str
    length: int
    truncated: bool = False
    document_type: str = "general"
    confidence: float = 0.0


class MetaRequest(BaseModel):
    path: Optional[str] = None
    saved_name: Optional[str] = None
    original: Optional[str] = None
    owner_id: Optional[str] = None
    document_id: Optional[str] = None


class MetaResponse(BaseModel):
    filename: str
    extension: str
    mime: str
    size_bytes: int
    created_at: str
    status: str
    pdf_pages: Optional[int] = None
    extracted_text: Optional[str] = None
    summary: Optional[str] = None
    file_hash: Optional[str] = None
    pdf_text_ratio: Optional[float] = None
    length: Optional[int] = None
    truncated: Optional[bool] = None


class OCRRequest(BaseModel):
    pass  # File is sent as binary


class OCRResponse(BaseModel):
    status: int
    error: bool
    userMessage: str
    confidence: Optional[float] = None
    summary: Optional[str] = None
    document_type: str = "general"
    doc_confidence: float = 0.0
    full_text: Optional[str] = None
    num_pages: Optional[int] = None
    pages: List[dict] = []
