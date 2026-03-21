"""
LegalDomainAdapter — 법률 도메인 PoC 어댑터

xPipe 이식성 검증: 코어 코드 수정 없이 새 도메인 어댑터만 구현하여 동작시킴.
법률 도메인 지식은 PoC 수준으로 간략하게 구현.

검증 목표:
- DomainAdapter ABC의 모든 abstract 메서드 구현
- 계약 테스트(assert_adapter_contract) 통과
- 외부 테스트 셋(sample_legal.json)으로 TestRunner 검증 통과
"""
from __future__ import annotations

import re
from typing import Any, Optional

from xpipe.adapter import (
    DomainAdapter,
    Category,
    ClassificationConfig,
    Detection,
    HookResult,
)


# ---------------------------------------------------------------------------
# 법률 문서 분류 체계
# ---------------------------------------------------------------------------

LEGAL_CATEGORIES = [
    Category(code="judgment", name="판결문", parent="litigation"),
    Category(code="contract", name="계약서", parent="contract"),
    Category(code="complaint", name="소장", parent="litigation"),
    Category(code="answer", name="답변서", parent="litigation"),
    Category(code="brief", name="준비서면", parent="litigation"),
    Category(code="certified_mail", name="내용증명", parent="notice"),
    Category(code="legal_opinion", name="법률의견서", parent="advisory"),
    Category(code="power_of_attorney", name="위임장", parent="delegation"),
    Category(code="legal_etc", name="기타법률문서", parent="etc"),
]

VALID_LEGAL_TYPES = sorted(
    {cat.code for cat in LEGAL_CATEGORIES}
)

LEGAL_CLASSIFICATION_PROMPT = """법률 문서를 아래 유형 중 하나로 분류하세요.

[유형]
- judgment: 판결문 (법원 판결, 결정, 명령)
- contract: 계약서 (매매계약, 임대차계약, 용역계약 등)
- complaint: 소장 (민사/형사 소장)
- answer: 답변서 (소장에 대한 답변)
- brief: 준비서면 (소송 준비서면, 의견서)
- certified_mail: 내용증명 (우편 내용증명)
- legal_opinion: 법률의견서 (법률 자문 의견)
- power_of_attorney: 위임장 (소송위임장, 일반위임장)
- legal_etc: 기타법률문서

[본문]
{text}

JSON:
{{"type":"judgment","confidence":0.85,"title":"요약제목","summary":"3줄 요약"}}
"""


# ---------------------------------------------------------------------------
# 감지 키워드
# ---------------------------------------------------------------------------

# 판결문 감지: 필수 + 선택 키워드 조합
_JUDGMENT_REQUIRED = ["판결"]
_JUDGMENT_OPTIONAL = ["원고", "피고", "주문", "법원", "사건"]

# 계약서 감지: 필수 + 선택 키워드 조합
_CONTRACT_REQUIRED = ["계약서"]
_CONTRACT_OPTIONAL = ["갑", "을", "계약기간", "계약금", "계약 체결"]


# ---------------------------------------------------------------------------
# LegalDomainAdapter
# ---------------------------------------------------------------------------

class LegalDomainAdapter(DomainAdapter):
    """법률 문서 처리 어댑터 — xPipe 이식성 PoC"""

    async def get_classification_config(self) -> ClassificationConfig:
        """법률 문서 분류 체계 + 프롬프트 반환"""
        return ClassificationConfig(
            categories=list(LEGAL_CATEGORIES),
            prompt_template=LEGAL_CLASSIFICATION_PROMPT,
            valid_types=VALID_LEGAL_TYPES,
            extra={
                "domain": "legal",
                "version": "poc-1.0",
            },
        )

    async def detect_special_documents(
        self,
        text: str,
        mime_type: str,
        filename: str = "",
    ) -> list[Detection]:
        """판결문/계약서 자동 감지

        키워드 기반 감지 — PoC 수준의 간략한 구현.
        """
        detections: list[Detection] = []

        if not text or not text.strip():
            return detections

        normalized = re.sub(r'\s+', ' ', text)

        # 판결문 감지
        judgment = _detect_judgment(normalized, text)
        if judgment is not None:
            detections.append(judgment)
            return detections  # 판결문이면 계약서 감지 스킵

        # 계약서 감지
        contract = _detect_contract(normalized, text)
        if contract is not None:
            detections.append(contract)

        return detections

    async def resolve_entity(
        self,
        detection: Detection,
        owner_id: str,
    ) -> dict[str, Any]:
        """당사자명 추출 — 판결문/계약서에서 원고/피고 또는 갑/을 추출

        PoC: 외부 DB 검색 없이 텍스트에서 추출된 메타데이터만 반환.
        """
        metadata = detection.metadata

        if detection.doc_type == "judgment":
            plaintiff = metadata.get("plaintiff")
            defendant = metadata.get("defendant")
            if plaintiff or defendant:
                return {
                    "matched": True,
                    "plaintiff": plaintiff,
                    "defendant": defendant,
                    "source": "text_extraction",
                }
            return {"matched": False, "reason": "no_party_names_found"}

        if detection.doc_type == "contract":
            party_a = metadata.get("party_a")
            party_b = metadata.get("party_b")
            if party_a or party_b:
                return {
                    "matched": True,
                    "party_a": party_a,
                    "party_b": party_b,
                    "source": "text_extraction",
                }
            return {"matched": False, "reason": "no_party_names_found"}

        return {"matched": False, "reason": "unsupported_doc_type"}

    async def extract_domain_metadata(
        self,
        text: str,
        filename: str,
    ) -> dict[str, Any]:
        """법률 메타데이터 추출 — 사건번호, 법원명, 판결일자"""
        metadata: dict[str, Any] = {}

        if not text:
            return metadata

        normalized = re.sub(r'\s+', ' ', text)

        # 사건번호: 2024가합12345, 2024나56789 등
        case_number_match = re.search(
            r'(\d{4})\s*(가합|나|다|라|마|카합|가단|나단)\s*(\d+)',
            normalized,
        )
        if case_number_match:
            year, type_code, number = case_number_match.groups()
            metadata["case_number"] = f"{year}{type_code}{number}"

        # 법원명: XX지방법원, XX고등법원, 대법원
        court_match = re.search(
            r'(서울|부산|대구|인천|광주|대전|울산|수원|춘천|청주|전주|창원|제주|의정부)'
            r'[^\s]*?(지방|고등|가정|행정)\s*법원',
            normalized,
        )
        if court_match:
            region = court_match.group(1)
            court_type = court_match.group(2) or "지방"
            metadata["court_name"] = f"{region}{court_type}법원"
        elif "대법원" in normalized:
            metadata["court_name"] = "대법원"

        # 판결일자: YYYY. M. D. 또는 YYYY년 M월 D일
        date_match = re.search(
            r'(\d{4})\s*[.년]\s*(\d{1,2})\s*[.월]\s*(\d{1,2})\s*[.일]',
            normalized,
        )
        if date_match:
            year, month, day = date_match.groups()
            metadata["judgment_date"] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

        return metadata

    async def generate_display_name(
        self,
        doc: dict[str, Any],
        detection: Optional[Detection] = None,
    ) -> str:
        """법률 문서 표시명 생성

        판결문: "{사건번호}_{원고}v{피고}.pdf"
        계약서: "계약서_{갑}_{을}_{날짜}.pdf"
        """
        if detection is None:
            return ""

        meta = detection.metadata

        if detection.doc_type == "judgment":
            case_number = meta.get("case_number", "")
            plaintiff = meta.get("plaintiff", "")
            defendant = meta.get("defendant", "")

            if case_number and plaintiff and defendant:
                return f"{case_number}_{plaintiff}v{defendant}.pdf"
            if case_number:
                return f"{case_number}_판결문.pdf"
            return ""

        if detection.doc_type == "contract":
            party_a = meta.get("party_a", "")
            party_b = meta.get("party_b", "")
            contract_date = meta.get("contract_date", "")

            if party_a and party_b and contract_date:
                return f"계약서_{party_a}_{party_b}_{contract_date}.pdf"
            if party_a and party_b:
                return f"계약서_{party_a}_{party_b}.pdf"
            return ""

        return ""

    async def on_stage_complete(
        self,
        stage: str,
        doc: dict[str, Any],
        context: dict[str, Any],
    ) -> list[HookResult]:
        """단계 완료 후크 — PoC: 빈 리스트 반환 (최소 구현)"""
        return []


# ---------------------------------------------------------------------------
# 순수 함수: 판결문/계약서 패턴 매칭
# ---------------------------------------------------------------------------

def _detect_judgment(normalized_text: str, raw_text: str) -> Optional[Detection]:
    """판결문 패턴 매칭

    필수 키워드 1개 이상 + 선택 키워드 2개 이상이면 판결문으로 감지.

    Args:
        normalized_text: 공백 정규화된 텍스트
        raw_text: 원본 텍스트 (줄바꿈 보존)

    Returns:
        Detection 객체 또는 None
    """
    matched_required = [kw for kw in _JUDGMENT_REQUIRED if kw in normalized_text]
    matched_optional = [kw for kw in _JUDGMENT_OPTIONAL if kw in normalized_text]

    if not matched_required or len(matched_optional) < 2:
        return None

    metadata: dict[str, Any] = {
        "matched_required": matched_required,
        "matched_optional": matched_optional,
    }

    # 원고 추출: "원고 XXX" 또는 "원고: XXX"
    plaintiff_match = re.search(r'원고\s*[:：]?\s*([^\s,\n]+)', raw_text)
    if plaintiff_match:
        metadata["plaintiff"] = plaintiff_match.group(1).strip()

    # 피고 추출: "피고 XXX" 또는 "피고: XXX"
    defendant_match = re.search(r'피고\s*[:：]?\s*([^\s,\n]+)', raw_text)
    if defendant_match:
        metadata["defendant"] = defendant_match.group(1).strip()

    # 사건번호 추출
    case_match = re.search(
        r'(\d{4})\s*(가합|나|다|라|마|카합|가단|나단)\s*(\d+)',
        normalized_text,
    )
    if case_match:
        year, type_code, number = case_match.groups()
        metadata["case_number"] = f"{year}{type_code}{number}"

    return Detection(
        doc_type="judgment",
        confidence=1.0,
        metadata=metadata,
    )


def _detect_contract(normalized_text: str, raw_text: str) -> Optional[Detection]:
    """계약서 패턴 매칭

    필수 키워드 1개 이상 + 선택 키워드 1개 이상이면 계약서로 감지.

    Args:
        normalized_text: 공백 정규화된 텍스트
        raw_text: 원본 텍스트 (줄바꿈 보존)

    Returns:
        Detection 객체 또는 None
    """
    matched_required = [kw for kw in _CONTRACT_REQUIRED if kw in normalized_text]
    matched_optional = [kw for kw in _CONTRACT_OPTIONAL if kw in normalized_text]

    if not matched_required or not matched_optional:
        return None

    metadata: dict[str, Any] = {
        "matched_required": matched_required,
        "matched_optional": matched_optional,
    }

    # 갑(甲) 추출: "갑: XXX" 또는 '"갑"이라 한다'의 앞쪽에서 이름 추출
    party_a_match = re.search(r'갑\s*[:：]\s*([^\s,\n)]+)', raw_text)
    if party_a_match:
        metadata["party_a"] = party_a_match.group(1).strip()

    # 을(乙) 추출
    party_b_match = re.search(r'을\s*[:：]\s*([^\s,\n)]+)', raw_text)
    if party_b_match:
        metadata["party_b"] = party_b_match.group(1).strip()

    # 계약일자 추출
    date_match = re.search(
        r'(\d{4})\s*[.년]\s*(\d{1,2})\s*[.월]\s*(\d{1,2})\s*[.일]',
        normalized_text,
    )
    if date_match:
        year, month, day = date_match.groups()
        metadata["contract_date"] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

    return Detection(
        doc_type="contract",
        confidence=1.0,
        metadata=metadata,
    )
