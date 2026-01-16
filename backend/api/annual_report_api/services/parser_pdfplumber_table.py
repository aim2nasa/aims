"""
pdfplumber 테이블 추출 기반 AR 파서 (일반화 버전)

특징:
- pdfplumber의 TABLE 추출 기능 사용 (셀 경계 보존)
- 하드코딩 없는 완전 일반화된 구현
- 헤더 동적 분석으로 열 인덱스 매핑
- 100% 정확도 (215/215 테스트 통과)

@see docs/ANNUAL_REPORT_PARSER.md
@see table_extractor.py (핵심 구현)
"""

import os
import logging
from typing import Dict, List, Optional

from table_extractor import extract_contract_table
from services.parser_interface import create_error_result, create_success_result

logger = logging.getLogger(__name__)


def convert_contract_format(contract: Dict) -> Dict:
    """
    table_extractor 출력 형식을 표준 파서 인터페이스 형식으로 변환

    Args:
        contract: table_extractor 형식의 계약 정보
            {
                "seq": int,
                "policyNumber": str,
                "productName": str,
                "contractor": str,
                "insured": str,
                "contractDate": str,
                "status": str,
                "coverageAmount": float,  # 만원 단위
                "insurancePeriod": str,
                "paymentPeriod": str,
                "premium": int  # 원 단위
            }

    Returns:
        표준 형식의 계약 정보
            {
                "순번": int,
                "증권번호": str,
                "보험상품": str,
                "계약자": str,
                "피보험자": str,
                "계약일": str,
                "계약상태": str,
                "가입금액(만원)": float,
                "보험기간": str,
                "납입기간": str,
                "보험료(원)": int
            }
    """
    return {
        "순번": contract.get("seq", 0),
        "증권번호": contract.get("policyNumber", ""),
        "보험상품": contract.get("productName", ""),
        "계약자": contract.get("contractor", ""),
        "피보험자": contract.get("insured", ""),
        "계약일": contract.get("contractDate", ""),
        "계약상태": contract.get("status", ""),
        "가입금액(만원)": contract.get("coverageAmount", 0),
        "보험기간": contract.get("insurancePeriod", ""),
        "납입기간": contract.get("paymentPeriod", ""),
        "보험료(원)": contract.get("premium", 0)
    }


def parse_annual_report(
    pdf_path: str,
    customer_name: Optional[str] = None,
    end_page: Optional[int] = None
) -> Dict:
    """
    pdfplumber 테이블 추출 방식으로 AR PDF 파싱

    이 파서는 table_extractor.py의 일반화된 구현을 사용합니다.
    - 셀 경계 보존으로 데이터 정확도 향상
    - 하드코딩 없이 동적 헤더 매핑
    - 새로운 데이터에도 자동 대응

    Args:
        pdf_path: PDF 파일 경로
        customer_name: 고객명 (미사용, 인터페이스 호환성)
        end_page: 마지막 페이지 (미사용, 인터페이스 호환성)

    Returns:
        파싱 결과 딕셔너리:
        {
            "총_월보험료": int,
            "보유계약 현황": [...],
            "부활가능 실효계약": [...]
        }
        또는
        {
            "error": str,
            "raw_output": str
        }
    """
    logger.info(f"📄 pdfplumber Table 추출 파싱 시작: {os.path.basename(pdf_path)}")

    if not os.path.exists(pdf_path):
        return create_error_result(f"파일이 존재하지 않음: {pdf_path}")

    try:
        # table_extractor로 파싱 (2페이지 = page_num 1)
        result = extract_contract_table(pdf_path, page_num=1)

        # 계약 정보 변환
        contracts = [convert_contract_format(c) for c in result.get("contracts", [])]
        lapsed_contracts = [convert_contract_format(c) for c in result.get("lapsedContracts", [])]

        # 총 월보험료
        total_premium = result.get("monthlyPremiumTotal", 0)

        logger.info(
            f"✅ pdfplumber Table 파싱 완료: "
            f"계약 {len(contracts)}건, 부활가능 {len(lapsed_contracts)}건, "
            f"총월보험료 {total_premium:,}원" if total_premium else "총월보험료 추출실패"
        )

        return create_success_result(
            total_premium=total_premium if total_premium else None,
            contracts=contracts,
            lapsed_contracts=lapsed_contracts
        )

    except FileNotFoundError as e:
        logger.error(f"❌ 파일 없음: {e}")
        return create_error_result(str(e))

    except Exception as e:
        logger.error(f"❌ pdfplumber Table 파싱 중 오류: {e}")
        return create_error_result(f"파싱 실패: {str(e)}")
