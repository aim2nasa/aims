"""
Upstage OCR Service
"""
import asyncio
import os
import httpx
import logging
from typing import Dict, Any, Optional, List

from config import get_settings

# 대용량 PDF 분할 OCR 임계값 (30MB)
LARGE_PDF_THRESHOLD = 30 * 1024 * 1024
# 분할 단위 (페이지 수)
DEFAULT_CHUNK_SIZE = 10

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

    async def process_ocr_large(self, file_path: str) -> Dict[str, Any]:
        """
        대용량 PDF 분할 OCR 진입점.
        - PDF이고 30MB 초과 → 청크 분할 OCR
        - 그 외 → 기존 process_ocr 호출
        """
        try:
            file_size = os.path.getsize(file_path)
            is_pdf = file_path.lower().endswith('.pdf')

            if is_pdf and file_size > LARGE_PDF_THRESHOLD:
                logger.info(
                    f"[LargeOCR] 대용량 PDF 감지: {os.path.basename(file_path)} "
                    f"({file_size / 1024 / 1024:.1f}MB) → 분할 OCR 시작"
                )
                return await self._process_ocr_chunked(file_path)
            else:
                # 임계값 미만이거나 PDF가 아닌 경우 기존 경로
                with open(file_path, "rb") as f:
                    content = f.read()
                filename = os.path.basename(file_path)
                return await self.process_ocr(content, filename)
        except Exception as e:
            logger.error(f"[LargeOCR] process_ocr_large 실패: {e}", exc_info=True)
            return {
                "error": True,
                "status": 500,
                "userMessage": f"대용량 OCR 처리 실패: {str(e)}",
                "confidence": None,
                "full_text": None,
                "num_pages": None,
                "pages": []
            }

    async def _process_ocr_chunked(self, file_path: str, chunk_size: int = DEFAULT_CHUNK_SIZE) -> Dict[str, Any]:
        """
        PyMuPDF로 PDF를 chunk_size 페이지씩 분할하여 OCR 처리.
        - 각 청크 결과의 텍스트를 순서대로 합침
        - confidence는 가중 평균 (페이지 수 기준)
        - 청크 실패 시 즉시 에러 반환
        """
        import fitz  # PyMuPDF

        try:
            with fitz.open(file_path) as src_doc:
                total_pages = len(src_doc)
        except Exception as e:
            logger.error(f"[ChunkedOCR] PDF 열기 실패: {e}")
            return {
                "error": True,
                "status": 500,
                "userMessage": f"PDF 파일을 열 수 없습니다: {str(e)}",
                "confidence": None,
                "full_text": None,
                "num_pages": None,
                "pages": []
            }

        if total_pages == 0:
            return {
                "error": True,
                "status": 400,
                "userMessage": "PDF 페이지가 0개입니다.",
                "confidence": None,
                "full_text": None,
                "num_pages": 0,
                "pages": []
            }

        # 청크 범위 계산
        chunks = []
        for start in range(0, total_pages, chunk_size):
            end = min(start + chunk_size, total_pages)
            chunks.append((start, end))

        logger.info(
            f"[ChunkedOCR] 총 {total_pages}페이지 → {len(chunks)}개 청크 "
            f"(각 {chunk_size}페이지)"
        )

        all_texts = []
        total_num_pages = 0
        confidence_sum = 0.0
        confidence_page_count = 0
        filename = os.path.basename(file_path)

        for idx, (start, end) in enumerate(chunks):
            chunk_label = f"청크 {idx + 1}/{len(chunks)} (p{start + 1}-{end})"

            try:
                # 각 청크마다 별도 Document 생성 (select는 원본을 변경하므로)
                with fitz.open(file_path) as chunk_doc:
                    page_range = list(range(start, end))
                    chunk_doc.select(page_range)
                    chunk_bytes = chunk_doc.tobytes()

                chunk_filename = f"{os.path.splitext(filename)[0]}_chunk{idx + 1}.pdf"
                logger.info(f"[ChunkedOCR] {chunk_label} OCR 요청 ({len(chunk_bytes) / 1024:.0f}KB)")

                # OCR 호출
                result = await self.process_ocr(chunk_bytes, chunk_filename)

                if result.get("error"):
                    logger.error(f"[ChunkedOCR] {chunk_label} 실패: {result.get('userMessage')}")
                    return {
                        "error": True,
                        "status": result.get("status", 500),
                        "userMessage": f"분할 OCR {chunk_label} 실패: {result.get('userMessage', '')}",
                        "confidence": None,
                        "full_text": None,
                        "num_pages": None,
                        "pages": []
                    }

                # 결과 수집
                chunk_text = result.get("full_text") or ""
                all_texts.append(chunk_text)

                chunk_pages = result.get("num_pages") or (end - start)
                total_num_pages += chunk_pages

                chunk_conf = result.get("confidence")
                if chunk_conf is not None:
                    confidence_sum += chunk_conf * chunk_pages
                    confidence_page_count += chunk_pages

                logger.info(
                    f"[ChunkedOCR] {chunk_label} 완료 "
                    f"(텍스트 {len(chunk_text)}자, confidence={chunk_conf})"
                )

            except Exception as e:
                logger.error(f"[ChunkedOCR] {chunk_label} 예외: {e}", exc_info=True)
                return {
                    "error": True,
                    "status": 500,
                    "userMessage": f"분할 OCR {chunk_label} 처리 중 오류: {str(e)}",
                    "confidence": None,
                    "full_text": None,
                    "num_pages": None,
                    "pages": []
                }

            # 마지막 청크가 아니면 rate limit 대기
            if idx < len(chunks) - 1:
                logger.info("[ChunkedOCR] Rate limit 대기 (1초)")
                await asyncio.sleep(1)

        # 결과 합산
        merged_text = "\n".join(all_texts)
        avg_confidence = (confidence_sum / confidence_page_count) if confidence_page_count > 0 else None

        logger.info(
            f"[ChunkedOCR] 분할 OCR 완료: {total_num_pages}페이지, "
            f"텍스트 {len(merged_text)}자, confidence={avg_confidence}"
        )

        return {
            "error": False,
            "status": 200,
            "userMessage": "OCR 성공 (분할 처리)",
            "confidence": avg_confidence,
            "full_text": merged_text,
            "num_pages": total_num_pages,
            "pages": []
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
