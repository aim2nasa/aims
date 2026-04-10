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

import logging
import os
from typing import Dict, Optional

from services.parser_interface import create_error_result, create_success_result
from table_extractor import extract_contract_table

logger = logging.getLogger(__name__)


def convert_contract_format(contract: Dict) -> Dict:
    """
    table_extractor 출력 형식을 표준 파서 인터페이스 형식(영문 키)으로 변환

    이슈 #58: 프론트엔드 `InsuranceContract` 인터페이스와 동일한 영문 키로 통일.

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
        표준 형식의 계약 정보 (영문 키)
    """
    return {
        "seq": contract.get("seq", 0),
        "contract_number": contract.get("policyNumber", ""),
        "product_name": contract.get("productName", ""),
        "contractor_name": contract.get("contractor", ""),
        "insured_name": contract.get("insured", ""),
        "contract_date": contract.get("contractDate", ""),
        "status": contract.get("status", ""),
        "coverage_amount": contract.get("coverageAmount", 0),
        "insurance_period": contract.get("insurancePeriod", ""),
        "premium_payment_period": contract.get("paymentPeriod", ""),
        "monthly_premium": contract.get("premium", 0),
    }


def parse_annual_report(
    pdf_path: str,
    customer_name: Optional[str] = None,
    end_page: Optional[int] = None,
    has_cover: bool = True
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
        has_cover: 표지 유무. True면 본문 시작 페이지=2(idx 1), False면 본문 시작 페이지=1(idx 0)

    Returns:
        파싱 결과 딕셔너리 (영문 키):
        {
            "total_monthly_premium": int,
            "contracts": [...],
            "lapsed_contracts": [...]
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
        # table_extractor로 파싱: 표지 있으면 본문은 2페이지(idx 1), 없으면 1페이지(idx 0)
        page_num = 1 if has_cover else 0
        result = extract_contract_table(pdf_path, page_num=page_num)

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
