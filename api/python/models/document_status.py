from pydantic import BaseModel
from typing import Optional, Dict, Any

class DocumentStatus(BaseModel):
    id: str
    overall_status: str
    upload_status: str
    meta_status: str
    ocr_status: str
    embed_status: str
    progress_percentage: int
    stages: Dict[str, Any]
    created_at: Optional[str] = None
    last_updated: Optional[str] = None
