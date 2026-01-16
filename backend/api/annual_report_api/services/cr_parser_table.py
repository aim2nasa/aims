"""
Customer Review Service PDF Parser (테이블 기반 일반화 구현)

펀드 데이터 추출을 일반화된 테이블 추출기(cr_table_extractor)로 대체.
계약정보/납입원금은 기존 정규식 방식 유지 (잘 동작함).

주요 개선점:
- 펀드명 하드코딩 제거 → 헤더에서 동적 추출
- 구성비율 오류 수정 → "적립금 구성비율" vs "현재투입비율 구성비율" 구분
- 투입원금 추출 정확도 향상

@see cr_table_extractor.py
"""

import pdfplumber
import os
import logging
from typing import Dict

from system_logger import send_error_log

# 기존 cr_parser에서 계약정보/납입원금 추출 함수 재사용
from services.cr_parser import extract_contract_info, extract_premium_info

# 새로운 일반화 테이블 추출기
from cr_table_extractor import extract_cr_fund_table

logger = logging.getLogger(__name__)


def parse_customer_review_table(pdf_path: str, end_page: int = 4) -> Dict:
    """
    Customer Review Service PDF를 테이블 기반으로 파싱 (일반화 구현)

    기존 parse_customer_review()와 동일한 출력 형식 유지.

    Args:
        pdf_path: PDF 파일 경로
        end_page: 마지막 페이지 번호 (보통 4)

    Returns:
        dict: {
            "contract_info": {
                "policy_number": str,
                "contract_date": "YYYY-MM-DD",
                "insured_amount": int,
                "accumulated_amount": int,
                "investment_return_rate": float,
                "surrender_value": int,
                "surrender_rate": float
            },
            "premium_info": {
                "basic_premium": int,
                "additional_premium": int,
                "regular_additional": int,
                "withdrawal": int,
                "net_premium": int,
                "policy_loan": int
            },
            "fund_allocations": [
                {
                    "fund_name": str,
                    "basic_accumulated": int,
                    "additional_accumulated": int,
                    "allocation_ratio": float,
                    "additional_allocation_ratio": float,
                    "return_rate": float,
                    "additional_return_rate": float,
                    "invested_principal": int,
                    "additional_invested_principal": int
                }
            ],
            "total_accumulated_amount": int,
            "fund_count": int
        }

        파싱 실패 시:
        {
            "error": str
        }

    Raises:
        FileNotFoundError: PDF 파일이 존재하지 않을 때
    """
    logger.info(f"📄 Customer Review 테이블 기반 파싱 시작: {os.path.basename(pdf_path)}")

    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF 파일을 찾을 수 없습니다: {pdf_path}")

    try:
        # 1. 계약정보 및 납입원금 추출 (기존 정규식 방식)
        with pdfplumber.open(pdf_path) as pdf:
            full_text = ""
            if len(pdf.pages) > 1:
                full_text = pdf.pages[1].extract_text() or ""

            contract_info = extract_contract_info(full_text)
            premium_info = extract_premium_info(full_text)

            logger.info(
                f"📝 계약정보: 증권번호={contract_info['policy_number']}, "
                f"적립금={contract_info['accumulated_amount']:,}원"
            )
            logger.info(
                f"📝 납입원금: 기본={premium_info['basic_premium']:,}원, "
                f"순납입={premium_info['net_premium']:,}원"
            )

        # 2. 펀드 데이터 추출 (새로운 테이블 기반 방식)
        page_nums = list(range(1, min(end_page, 4)))  # 2~4페이지
        fund_result = extract_cr_fund_table(pdf_path, page_nums=page_nums)

        fund_allocations = fund_result["fund_allocations"]
        total_accumulated = fund_result["total_accumulated_amount"]
        fund_count = fund_result["fund_count"]

        logger.info(
            f"✅ Customer Review 파싱 성공: "
            f"펀드={fund_count}개, 총적립금={total_accumulated:,}원"
        )

        return {
            "contract_info": contract_info,
            "premium_info": premium_info,
            "fund_allocations": fund_allocations,
            "total_accumulated_amount": total_accumulated,
            "fund_count": fund_count
        }

    except Exception as e:
        logger.error(f"❌ Customer Review 테이블 기반 파싱 중 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"Customer Review 테이블 기반 파싱 중 오류: {e}", e)
        return {
            "error": f"파싱 실패: {str(e)}"
        }
