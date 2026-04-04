"""
AR 파서 공통 인터페이스 및 타입 정의

모든 파서(OpenAI, pdfplumber, Upstage)는 이 인터페이스를 따릅니다.
"""

import logging
from typing import Dict, List, Optional, TypedDict, Union

logger = logging.getLogger(__name__)


class ContractInfo(TypedDict, total=False):
    """계약 정보 타입"""
    순번: int
    증권번호: str
    보험상품: str
    계약자: str
    피보험자: str
    계약일: str  # "YYYY-MM-DD"
    계약상태: str
    가입금액_만원: Union[int, float]  # "가입금액(만원)"
    보험기간: str
    납입기간: str
    보험료_원: int  # "보험료(원)"


class ParseResult(TypedDict, total=False):
    """파싱 결과 타입"""
    총_월보험료: Optional[int]
    보유계약_현황: List[ContractInfo]  # "보유계약 현황"
    부활가능_실효계약: List[ContractInfo]  # "부활가능 실효계약"
    error: Optional[str]
    raw_output: Optional[str]


# 필드 이름 매핑 (다양한 표현 → 표준 필드명)
FIELD_MAPPINGS = {
    "순번": ["순번"],
    "증권번호": ["증권번호"],
    "보험상품": ["보험상품", "상품명"],
    "계약자": ["계약자"],
    "피보험자": ["피보험자"],
    "계약일": ["계약일"],
    "계약상태": ["계약상태", "상태"],
    "가입금액(만원)": ["가입금액(만원)", "가입금액", "가입금액\n(만원)"],
    "보험기간": ["보험기간", "보험\n기간"],
    "납입기간": ["납입기간", "납입\n기간"],
    "보험료(원)": ["보험료(원)", "보험료", "보험료 (원)", "보험료\n(원)"]
}


def normalize_contract(contract: Dict) -> Optional[Dict]:
    """
    계약 정보를 표준 형식으로 정규화

    Args:
        contract: 원본 계약 정보 딕셔너리

    Returns:
        정규화된 계약 정보 또는 None (유효하지 않은 경우)
    """
    if not contract:
        return None

    result = {}

    for std_key, variants in FIELD_MAPPINGS.items():
        for variant in variants:
            if variant in contract:
                val = contract[variant]

                # 타입 변환
                if std_key == "순번":
                    try:
                        val = int(str(val).strip())
                    except (ValueError, TypeError):
                        val = 0
                elif std_key == "가입금액(만원)":
                    try:
                        # 쉼표, 공백 제거 후 실수 변환 (소수점 있을 수 있음)
                        val = float(str(val).replace(",", "").replace(" ", "").strip())
                    except (ValueError, TypeError):
                        val = 0
                elif std_key == "보험료(원)":
                    try:
                        # 쉼표, 공백 제거 후 정수 변환
                        val = int(str(val).replace(",", "").replace(" ", "").strip())
                    except (ValueError, TypeError):
                        val = 0
                elif isinstance(val, str):
                    # 줄바꿈 제거
                    val = val.replace("\n", " ").strip()

                result[std_key] = val
                break

    # 최소 필수 필드 확인 (증권번호는 필수)
    if "증권번호" not in result or not result.get("증권번호"):
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
    성공 결과 생성

    Args:
        total_premium: 총 월보험료
        contracts: 보유계약 현황 리스트
        lapsed_contracts: 부활가능 실효계약 리스트

    Returns:
        성공 결과 딕셔너리
    """
    return {
        "총_월보험료": total_premium,
        "보유계약 현황": contracts,
        "부활가능 실효계약": lapsed_contracts or []
    }
