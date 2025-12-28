"""
Common Response Models
"""
from pydantic import BaseModel
from typing import Optional, Any


class ErrorResponse(BaseModel):
    result: str = "error"
    code: str
    message: str
    details: Optional[Any] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
