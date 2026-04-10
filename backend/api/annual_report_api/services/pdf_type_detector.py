"""
PDF 타입 감지 (텍스트 레이어 vs 이미지 PDF)

Phase 3-C PoC에서 확인된 사실:
- 일부 AR PDF(특히 스캔/렌더링 출력)는 텍스트 레이어가 전혀 없음 (chars=0)
- pdfplumber 기반 파서는 이런 PDF에서 빈 문자열만 얻음
- Upstage Document AI 파서만 정상 처리 가능

이 모듈은 PDF의 전체 페이지 텍스트 합계를 측정하여
이미지 PDF 여부를 판정한다. parser_factory가 이 판정을 이용해
파서를 자동 라우팅한다.
"""

import logging
import os

import pdfplumber

logger = logging.getLogger(__name__)


def measure_total_text_length(pdf_path: str) -> int:
    """
    PDF 전체 페이지의 텍스트 문자 수 합계 반환.

    동작 원칙:
    - 파일이 존재하지 않으면 FileNotFoundError를 상위로 전파 (silent 0 금지)
    - 암호화/손상된 PDF는 WARN 로그 후 0 반환 (이미지 PDF로 간주)
    - 개별 페이지 추출 실패는 그 페이지만 0으로 처리하고 계속 진행
    - PII 보호: 로그에는 파일명(basename)과 길이만 기록, 본문 텍스트는 기록하지 않음

    Args:
        pdf_path: PDF 파일 경로

    Returns:
        전체 페이지의 텍스트 문자 수 합계 (None/빈 문자열은 0)

    Raises:
        FileNotFoundError: pdf_path가 존재하지 않을 때
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF 파일이 존재하지 않습니다: {pdf_path}")

    basename = os.path.basename(pdf_path)
    total = 0

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for idx, page in enumerate(pdf.pages, start=1):
                try:
                    text = page.extract_text() or ""
                    total += len(text.strip())
                except Exception as page_error:
                    # 개별 페이지 실패는 무시하고 계속 (전체 판정에는 영향 최소화)
                    logger.warning(
                        f"⚠️ PDF 페이지 텍스트 추출 실패 ({basename} p{idx}): {page_error}"
                    )
                    continue
    except FileNotFoundError:
        raise
    except Exception as e:
        # 암호화/손상된 PDF 등 — 이미지 PDF로 간주 (0 반환)
        logger.warning(
            f"⚠️ PDF 텍스트 측정 실패 ({basename}): {type(e).__name__}: {e}"
        )
        return 0

    return total


def is_image_pdf(pdf_path: str, threshold: int = 50) -> bool:
    """
    PDF가 이미지 PDF(텍스트 레이어 없음)인지 판정.

    전체 페이지 텍스트 합계가 threshold 미만이면 이미지 PDF로 판정.
    기본 threshold=50은 Phase 3-C PoC 결과 기반:
    - 텍스트 AR: 수천 ~ 수만 문자
    - 이미지 AR: 0 ~ 수 문자 (간혹 깨진 OCR 잔재)
    - 50자는 두 분포 사이의 안전한 경계값

    Args:
        pdf_path: PDF 파일 경로
        threshold: 이미지 PDF 판정 임계값 (기본 50자)

    Returns:
        True = 이미지 PDF (Upstage 강제 라우팅 필요)
        False = 텍스트 레이어 있는 PDF (일반 파서 사용 가능)

    Raises:
        FileNotFoundError: pdf_path가 존재하지 않을 때 (호출부에서 처리)
    """
    total = measure_total_text_length(pdf_path)
    result = total < threshold
    logger.info(
        f"🔎 PDF 타입 판정: {os.path.basename(pdf_path)} — 총 텍스트 {total}자, "
        f"threshold={threshold} → {'이미지 PDF' if result else '텍스트 PDF'}"
    )
    return result
