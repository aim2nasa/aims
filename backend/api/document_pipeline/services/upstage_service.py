"""
Upstage OCR Service
"""
import httpx
import logging
from typing import Dict, Any, Optional, List

from config import get_settings

logger = logging.getLogger(__name__)


class UpstageService:
    def __init__(self):
        self.settings = get_settings()
        self.api_url = "https://api.upstage.ai/v1/document-digitization"

    async def process_ocr(self, file_content: bytes, filename: str) -> Dict[str, Any]:
        """
        Process OCR using Upstage API.

        Returns normalized response:
        {
            "error": bool,
            "status": int,
            "userMessage": str,
            "confidence": float | None,
            "full_text": str | None,
            "num_pages": int | None,
            "pages": list
        }
        """
        if not self.settings.UPSTAGE_API_KEY:
            return {
                "error": True,
                "status": 500,
                "userMessage": "Upstage API 키가 설정되지 않았습니다.",
                "confidence": None,
                "full_text": None,
                "num_pages": None,
                "pages": []
            }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    self.api_url,
                    headers={
                        "Authorization": f"Bearer {self.settings.UPSTAGE_API_KEY}"
                    },
                    files={
                        "document": (filename, file_content)
                    },
                    data={
                        "model": "ocr"
                    }
                )

                if response.status_code != 200:
                    error_msg = self._parse_error_message(response)
                    return {
                        "error": True,
                        "status": response.status_code,
                        "userMessage": error_msg,
                        "confidence": None,
                        "full_text": None,
                        "num_pages": None,
                        "pages": []
                    }

                data = response.json()
                return self._normalize_response(data)

        except httpx.TimeoutException:
            return {
                "error": True,
                "status": 504,
                "userMessage": "OCR 처리 시간 초과",
                "confidence": None,
                "full_text": None,
                "num_pages": None,
                "pages": []
            }
        except Exception as e:
            logger.error(f"Upstage OCR error: {e}")
            return {
                "error": True,
                "status": 500,
                "userMessage": f"OCR 처리 실패: {str(e)}",
                "confidence": None,
                "full_text": None,
                "num_pages": None,
                "pages": []
            }

    def _normalize_response(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize Upstage API response"""
        return {
            "error": False,
            "status": 200,
            "userMessage": "OCR 성공",
            "confidence": data.get("confidence"),
            "full_text": data.get("text"),
            "num_pages": data.get("numBilledPages"),
            "pages": data.get("pages", data.get("metadata", {}).get("pages", []))
        }

    def _parse_error_message(self, response: httpx.Response) -> str:
        """Parse error message from API response"""
        try:
            data = response.json()
            if "error" in data and "message" in data["error"]:
                return data["error"]["message"]
            return f"OCR 처리 실패 (HTTP {response.status_code})"
        except:
            return f"OCR 처리 실패 (HTTP {response.status_code})"
