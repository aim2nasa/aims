"""
AR 파서 공통 인터페이스 및 타입 정의

모든 파서(OpenAI, pdfplumber, Upstage)는 이 인터페이스를 따릅니다.

⚠️ 스키마 통일 (이슈 #58): 계약 필드 키는 영문으로 통일합니다.
프론트엔드 `InsuranceContract` 인터페이스와 동일한 키를 사용하여,
백엔드 → 프론트 사이에 키 변환 레이어가 필요하지 않도록 합니다.
"""

import logging
import re
from typing import Dict, List, Optional, TypedDict, Union

logger = logging.getLogger(__name__)


def _strip_ws(key: str) -> str:
    """헤더 키의 모든 공백(스페이스·탭·개행)을 제거하여 정규화.

    이슈 #62: Upstage Document AI 는 HTML 테이블 헤더를 '계약 상태', '가입금액 (만원)',
    '보험 기간', '납입 기간' 처럼 공백 포함 형태로 반환한다. pdfplumber 는 줄바꿈이
    섞인 '납입\\n기간' 형태로 반환한다. 모든 변형을 공백 제거 기반으로 매칭한다.
    """
    if not isinstance(key, str):
        return ""
    return re.sub(r"\s+", "", key)


class ContractInfo(TypedDict, total=False):
    """계약 정보 타입 (영문 키 통일 — 이슈 #58)"""
    seq: int
    contract_number: str
    product_name: str
    contractor_name: str
    insured_name: str
    contract_date: str  # "YYYY-MM-DD"
    status: str
    coverage_amount: Union[int, float]  # 만원 단위
    insurance_period: str
    premium_payment_period: str
    monthly_premium: int  # 원 단위
    insurance_company: str


class ParseResult(TypedDict, total=False):
    """파싱 결과 타입 (영문 키 통일 — 이슈 #58)"""
    total_monthly_premium: Optional[int]
    contracts: List[ContractInfo]
    lapsed_contracts: List[ContractInfo]
    error: Optional[str]
    raw_output: Optional[str]


# 필드 이름 매핑 (PDF/HTML 표의 한글 헤더 → 영문 표준 키)
# 파싱 단계에서 한글 테이블 헤더를 영문 키로 정규화할 때 사용합니다.
FIELD_MAPPINGS = {
    "seq": ["순번"],
    "contract_number": ["증권번호"],
    "product_name": ["보험상품", "상품명"],
    "contractor_name": ["계약자"],
    "insured_name": ["피보험자"],
    "contract_date": ["계약일"],
    "status": ["계약상태", "상태"],
    "coverage_amount": ["가입금액(만원)", "가입금액", "가입금액\n(만원)"],
    "insurance_period": ["보험기간", "보험\n기간"],
    "premium_payment_period": ["납입기간", "납입\n기간"],
    "monthly_premium": ["보험료(원)", "보험료", "보험료 (원)", "보험료\n(원)"],
}


def normalize_contract(contract: Dict) -> Optional[Dict]:
    """
    계약 정보를 표준 형식(영문 키)으로 정규화

    이슈 #62: 헤더 키 매칭을 whitespace-insensitive 로 수행하여
    '계약 상태', '가입금액 (만원)', '보험\\n기간' 등 변형을 모두 동일하게 처리한다.

    Args:
        contract: 원본 계약 정보 딕셔너리 (한글 헤더 또는 영문 키 혼재 가능)

    Returns:
        정규화된 계약 정보(영문 키) 또는 None (유효하지 않은 경우)
    """
    if not contract:
        return None

    # 입력 dict 를 공백 제거 키 기준으로 색인
    stripped_index: Dict[str, object] = {}
    for raw_key, raw_val in contract.items():
        if not isinstance(raw_key, str):
            continue
        stripped_index.setdefault(_strip_ws(raw_key), raw_val)

    result: Dict = {}

    for std_key, variants in FIELD_MAPPINGS.items():
        # 영문 표준 키 자체도 후보로 포함 (이미 영문으로 들어온 경우 지원)
        candidates = [std_key, *variants]
        for variant in candidates:
            lookup = _strip_ws(variant)
            if lookup in stripped_index:
                val = stripped_index[lookup]

                # 타입 변환
                if std_key == "seq":
                    try:
                        val = int(str(val).strip())
                    except (ValueError, TypeError):
                        val = 0
                elif std_key == "coverage_amount":
                    try:
                        val = float(str(val).replace(",", "").replace(" ", "").strip())
                    except (ValueError, TypeError):
                        val = 0
                elif std_key == "monthly_premium":
                    try:
                        val = int(str(val).replace(",", "").replace(" ", "").strip())
                    except (ValueError, TypeError):
                        val = 0
                elif isinstance(val, str):
                    val = val.replace("\n", " ").strip()

                result[std_key] = val
                break

    # 최소 필수 필드 확인 (증권번호는 필수)
    if not result.get("contract_number"):
        return None

    return result


def create_error_result(error_message: str, raw_output: str = "") -> Dict:
    """
    에러 결과 생성

    Args:
        error_message: 에러 메시지
        raw_output: 원본 출력 (디버깅용)

    Returns:
        에러 결과 딕셔너리
    """
    return {
        "error": error_message,
        "raw_output": raw_output
    }


def create_success_result(
    total_premium: Optional[int],
    contracts: List[Dict],
    lapsed_contracts: Optional[List[Dict]] = None
) -> Dict:
    """
    성공 결과 생성 (이슈 #58: 영문 키 통일)

    Args:
        total_premium: 총 월보험료
        contracts: 보유계약 현황 리스트 (영문 키)
        lapsed_contracts: 부활가능 실효계약 리스트 (영문 키)

    Returns:
        성공 결과 딕셔너리
    """
    return {
        "total_monthly_premium": total_premium,
        "contracts": contracts,
        "lapsed_contracts": lapsed_contracts or [],
    }
