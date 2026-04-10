"""
AR 파서 팩토리

설정에 따라 적절한 파서를 선택하여 반환합니다.

지원 파서:
- pdfplumber: pdfplumber 라이브러리 (로컬, 무료, 빠름)
- pdfplumber_table: 일반화된 테이블 추출 파서 (100% 정확도)
- upstage: Upstage Document AI API (이미지 PDF 강제 라우팅)
- openai: (deprecated) 명시적으로 설정된 경우에만 사용

설정 방법:
- aims_api의 /api/settings/ai-models에서 annualReport.parser 값 변경
- 예: {"annualReport": {"model": "gpt-4.1", "parser": "pdfplumber"}}

이미지 PDF 자동 라우팅 (Phase 4-B):
- pdf_path 인자가 주어지면 is_image_pdf() 판정을 먼저 수행
- 이미지 PDF로 판정되면 설정값과 무관하게 PARSER_UPSTAGE를 강제 선택
- 텍스트 레이어가 없는 AR PDF는 pdfplumber 계열 파서로는 처리 불가하기 때문
"""

import logging
from typing import Callable, Dict, Optional

from config import get_annual_report_parser
from services.pdf_type_detector import is_image_pdf

logger = logging.getLogger(__name__)

# 파서 타입 상수
PARSER_OPENAI = "openai"  # deprecated (명시 설정 시에만 사용)
PARSER_PDFPLUMBER = "pdfplumber"
PARSER_PDFPLUMBER_TABLE = "pdfplumber_table"  # 일반화된 테이블 추출 파서 (100% 정확도)
PARSER_UPSTAGE = "upstage"

# 유효한 파서 타입 목록
VALID_PARSERS = [PARSER_OPENAI, PARSER_PDFPLUMBER, PARSER_PDFPLUMBER_TABLE, PARSER_UPSTAGE]

# 이미지 PDF는 무조건 Upstage로 라우팅될 때 제외할 텍스트 계열 파서
_TEXT_BASED_PARSERS = {PARSER_PDFPLUMBER, PARSER_PDFPLUMBER_TABLE, PARSER_OPENAI}


def _resolve_parser_fn(parser_type: str) -> Callable[..., Dict]:
    """파서 타입 문자열 → 실제 parse_annual_report 함수."""
    if parser_type == PARSER_PDFPLUMBER:
        from services.parser_pdfplumber import parse_annual_report
        return parse_annual_report

    if parser_type == PARSER_PDFPLUMBER_TABLE:
        from services.parser_pdfplumber_table import parse_annual_report
        return parse_annual_report

    if parser_type == PARSER_UPSTAGE:
        from services.parser_upstage import parse_annual_report
        return parse_annual_report

    # PARSER_OPENAI (deprecated, 명시 설정된 경우에만)
    from services.parser import parse_annual_report
    return parse_annual_report


def get_parser(pdf_path: Optional[str] = None) -> Callable[..., Dict]:
    """
    설정 + PDF 타입에 따라 파서 함수 반환

    Args:
        pdf_path: PDF 파일 경로 (선택)
            - 주어지면 is_image_pdf() 판정을 먼저 수행
            - 이미지 PDF로 판정되면 설정값과 무관하게 Upstage 강제 라우팅
            - 주어지지 않으면 기존 동작 (설정 파서만 사용)

    Returns:
        parse_annual_report 함수 (선택된 파서의 것)

    Example:
        >>> parse_fn = get_parser(pdf_path)  # 이미지 PDF면 자동으로 upstage
        >>> result = parse_fn(pdf_path, customer_name, end_page)
    """
    configured = get_annual_report_parser()

    if configured not in VALID_PARSERS:
        logger.warning(
            f"⚠️ 알 수 없는 파서 타입: {configured}, "
            f"기본값(pdfplumber) 사용"
        )
        configured = PARSER_PDFPLUMBER

    # 🔑 Phase 4-B: 이미지 PDF는 Upstage 강제 라우팅
    if pdf_path is not None and configured in _TEXT_BASED_PARSERS:
        try:
            if is_image_pdf(pdf_path):
                logger.info(
                    f"🔧 AR 파서 선택: {configured} → {PARSER_UPSTAGE} "
                    f"(이미지 PDF 자동 라우팅)"
                )
                return _resolve_parser_fn(PARSER_UPSTAGE)
        except FileNotFoundError:
            # 파일이 없으면 판정 불가 → 기존 설정대로 진행 (호출부가 파일 존재 검증을 다시 함)
            logger.warning(
                f"⚠️ PDF 파일 없음, 이미지 PDF 판정 스킵: {pdf_path}"
            )
        except Exception as e:
            # 판정 중 예기치 못한 오류 → 팩토리 자체는 크래시하지 않고 설정값으로 fallback
            # (본질 해결: pdf_type_detector에서 이미 WARN 로깅 + 0 반환으로 방어되지만 이중 안전장치)
            logger.warning(
                f"⚠️ 이미지 PDF 판정 실패, 설정 파서로 fallback: "
                f"{type(e).__name__}: {e}"
            )

    logger.info(f"🔧 AR 파서 선택: {configured}")
    return _resolve_parser_fn(configured)


def get_parser_info() -> Dict[str, str]:
    """
    현재 파서 정보 반환

    Returns:
        {
            "current": "pdfplumber",
            "available": ["openai", "pdfplumber", "pdfplumber_table", "upstage"]
        }
    """
    return {
        "current": get_annual_report_parser(),
        "available": VALID_PARSERS
    }
