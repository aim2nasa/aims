"""
Common Response Models
"""
from typing import Any, Optional

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    result: str = "error"
    code: str
    message: str
    details: Optional[Any] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
