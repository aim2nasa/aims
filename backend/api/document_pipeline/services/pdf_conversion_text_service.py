"""
PDF Conversion Text Extraction Service

직접 파서가 없는 문서 형식(HWP, DOC, PPT, ODT 등)을
PDF 변환 큐를 통해 순차적으로 변환 후 텍스트 추출.

변환 큐(PdfConversionQueueService)에 작업을 등록하고
PdfConversionWorker가 처리할 때까지 poll-wait.
"""
import logging
import os
from typing import Optional

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# xPipe가 정본(Single Source of Truth) — re-export만 수행
from xpipe.stages.convert import CONVERTIBLE_MIMES, is_convertible_mime  # noqa: F401


async def convert_and_extract_text(
    file_path: str,
    timeout: float = 180.0,
) -> Optional[str]:
    """
    PDF 변환 큐를 통해 파일 변환 후 텍스트 추출.

    PdfConversionWorker가 순차 처리하므로 동시 요청으로 인한
    타임아웃이 발생하지 않음.

    Args:
        file_path: 원본 파일 경로
        timeout: 변환 대기 타임아웃 (초, 큐 대기 + 변환 시간 포함)

    Returns:
        추출된 텍스트 또는 None (변환/추출 실패 시)
    """
    if not os.path.exists(file_path):
        logger.error(f"[PDF변환텍스트] 파일 없음: {file_path}")
        return None

    filename = os.path.basename(file_path)

    try:
        from services.pdf_conversion_queue_service import PdfConversionQueueService

        logger.info(f"[PDF변환텍스트] 큐 등록: {filename}")

        # 1. 변환 큐에 등록
        queue_id = await PdfConversionQueueService.enqueue(
            job_type="text_extraction",
            input_path=file_path,
            original_name=filename,
            caller="document_pipeline",
        )

        # 2. 결과 대기 (Worker가 처리할 때까지 poll-wait)
        job = await PdfConversionQueueService.wait_for_result(
            queue_id, timeout=timeout
        )

        if not job:
            logger.error(f"[PDF변환텍스트] 큐 대기 타임아웃: {filename}")
            return None

        if job["status"] == "completed":
            result = job.get("result", {})
            text = result.get("extracted_text")
            if text and text.strip():
                logger.info(
                    f"[PDF변환텍스트] 텍스트 추출 성공: {filename} "
                    f"({len(text)} chars)"
                )
                return text
            else:
                logger.warning(f"[PDF변환텍스트] 텍스트 없음 (스캔 문서?): {filename}")
                return None
        else:
            logger.error(
                f"[PDF변환텍스트] 변환 실패: {filename} - "
                f"{job.get('error_message', 'unknown')}"
            )
            return None

    except Exception as e:
        logger.error(f"[PDF변환텍스트] 예외: {filename} - {e}")
        return None
