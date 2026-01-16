"""
AR 파서 팩토리

설정에 따라 적절한 파서를 선택하여 반환합니다.

지원 파서:
- openai: OpenAI Chat Completions API (기본값)
- pdfplumber: pdfplumber 라이브러리 (로컬, 무료, 빠름)
- upstage: Upstage Document AI API

설정 방법:
- aims_api의 /api/settings/ai-models에서 annualReport.parser 값 변경
- 예: {"annualReport": {"model": "gpt-4.1", "parser": "pdfplumber"}}
"""

import logging
from typing import Callable, Dict, Optional

from config import get_annual_report_parser

logger = logging.getLogger(__name__)

# 파서 타입 상수
PARSER_OPENAI = "openai"
PARSER_PDFPLUMBER = "pdfplumber"
PARSER_PDFPLUMBER_TABLE = "pdfplumber_table"  # 일반화된 테이블 추출 파서 (100% 정확도)
PARSER_UPSTAGE = "upstage"

# 유효한 파서 타입 목록
VALID_PARSERS = [PARSER_OPENAI, PARSER_PDFPLUMBER, PARSER_PDFPLUMBER_TABLE, PARSER_UPSTAGE]


def get_parser() -> Callable[[str, Optional[str], Optional[int]], Dict]:
    """
    설정에 따라 파서 함수 반환

    Returns:
        parse_annual_report 함수 (선택된 파서의 것)

    Example:
        >>> parse_fn = get_parser()
        >>> result = parse_fn(pdf_path, customer_name, end_page)
    """
    parser_type = get_annual_report_parser()

    if parser_type not in VALID_PARSERS:
        logger.warning(
            f"⚠️ 알 수 없는 파서 타입: {parser_type}, "
            f"기본값(openai) 사용"
        )
        parser_type = PARSER_OPENAI

    logger.info(f"🔧 AR 파서 선택: {parser_type}")

    if parser_type == PARSER_PDFPLUMBER:
        from services.parser_pdfplumber import parse_annual_report
        return parse_annual_report

    elif parser_type == PARSER_PDFPLUMBER_TABLE:
        from services.parser_pdfplumber_table import parse_annual_report
        return parse_annual_report

    elif parser_type == PARSER_UPSTAGE:
        from services.parser_upstage import parse_annual_report
        return parse_annual_report

    else:  # PARSER_OPENAI (default)
        from services.parser import parse_annual_report
        return parse_annual_report


def get_parser_info() -> Dict[str, str]:
    """
    현재 파서 정보 반환

    Returns:
        {
            "current": "openai",
            "available": ["openai", "pdfplumber", "upstage"]
        }
    """
    return {
        "current": get_annual_report_parser(),
        "available": VALID_PARSERS
    }
