"""
xpipe 테스트용 공통 픽스처

insurance 패키지에 의존하지 않는 MockInsuranceAdapter를 제공한다.
xpipe 코어 테스트에서는 이 MockAdapter를 사용하여 insurance 직접 의존을 피한다.
"""
from __future__ import annotations

import re
from typing import Any, Optional

import pytest

from xpipe.adapter import (
    DomainAdapter,
    Category,
    ClassificationConfig,
    Detection,
    HookResult,
    StageHookAction,
)


# ---------------------------------------------------------------------------
# Mock 분류 체계 (InsuranceDomainAdapter의 핵심 동작만 재현)
# ---------------------------------------------------------------------------

_MOCK_CATEGORIES = [
    Category(code="policy", name="보험증권", parent="insurance"),
    Category(code="coverage_analysis", name="보장분석", parent="insurance"),
    Category(code="application", name="청약서/가입신청서", parent="insurance"),
    Category(code="plan_design", name="설계서/제안서", parent="insurance"),
    Category(code="insurance_etc", name="기타보험", parent="insurance"),
    Category(code="diagnosis", name="진단서/소견서", parent="claim"),
    Category(code="medical_receipt", name="진료비영수증", parent="claim"),
    Category(code="claim_form", name="보험금청구서", parent="claim"),
    Category(code="consent_delegation", name="동의서/위임장", parent="claim"),
    Category(code="id_card", name="신분증", parent="identity"),
    Category(code="family_cert", name="가족관계증명서", parent="identity"),
    Category(code="personal_docs", name="개인서류", parent="identity"),
    Category(code="health_checkup", name="건강검진결과", parent="medical"),
    Category(code="asset_document", name="자산서류", parent="asset"),
    Category(code="inheritance_gift", name="상속/증여", parent="asset"),
    Category(code="bank_account", name="통장사본", parent="asset"),
    Category(code="corp_basic", name="법인기본서류", parent="corporate"),
    Category(code="hr_document", name="인사서류", parent="corporate"),
    Category(code="corp_tax", name="법인세무", parent="corporate"),
    Category(code="corp_asset", name="법인자산", parent="corporate"),
    Category(code="legal_document", name="법률문서", parent="corporate"),
    Category(code="general", name="일반", parent="etc"),
    Category(code="unclassifiable", name="분류불가", parent="etc"),
]

_MOCK_VALID_TYPES = sorted({c.code for c in _MOCK_CATEGORIES})

_MOCK_SYSTEM_ONLY_TYPES = {"annual_report", "customer_review", "unspecified"}


def _mock_detect_ar(text: str) -> Optional[Detection]:
    """AR 감지 (InsuranceDomainAdapter._detect_ar_pattern과 동일 로직)

    필수 키워드: "Annual Review Report"
    선택 키워드: "보유계약 현황", "MetLife", "고객님을 위한", "메트라이프생명", "메트라이프"
    AR 판단: 필수 1개 이상 + 선택 1개 이상
    """
    normalized = re.sub(r'\s+', ' ', text)
    required = ['Annual Review Report']
    optional = ['보유계약 현황', 'MetLife', '고객님을 위한', '메트라이프생명', '메트라이프']

    matched_req = [kw for kw in required if kw in normalized]
    matched_opt = [kw for kw in optional if kw in normalized]

    if not (matched_req and matched_opt):
        return None

    # 고객명: "Annual" 키워드 줄의 바로 위 줄에서 추출
    customer_name = None
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if 'Annual' in line and i > 0:
            name_line = lines[i - 1].strip()
            go_idx = name_line.find(' 고')
            if go_idx > 0:
                name = name_line[:go_idx]
            else:
                space_idx = name_line.find(' ')
                name = name_line[:space_idx] if space_idx > 0 else name_line
            if len(name) >= 2:
                customer_name = name
            break

    # 발행일 추출
    issue_date = None
    date_m = re.search(
        r'발행\s*(?:\(기준\))?\s*일[:\s]*(\d{4})년?\s*[\-.]?\s*(\d{1,2})월?\s*[\-.]?\s*(\d{1,2})일?',
        normalized,
    )
    if date_m:
        y, m_, d = date_m.groups()
        issue_date = f"{y}-{m_.zfill(2)}-{d.zfill(2)}"
    else:
        date_m2 = re.search(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', normalized)
        if date_m2:
            y, m_, d = date_m2.groups()
            issue_date = f"{y}-{m_.zfill(2)}-{d.zfill(2)}"

    return Detection(
        doc_type="annual_report",
        confidence=1.0,
        metadata={"customer_name": customer_name, "issue_date": issue_date},
    )


def _mock_detect_crs(text: str) -> Optional[Detection]:
    """CRS 감지

    필수: "Customer Review Service"
    선택: "메트라이프", "변액", "적립금", "투자수익률", "펀드", "해지환급금"
    CRS 판단: 필수 1개 이상 + 선택 1개 이상
    """
    normalized = re.sub(r'\s+', ' ', text)
    required = ['Customer Review Service']
    optional = ['메트라이프', '변액', '적립금', '투자수익률', '펀드', '해지환급금']

    matched_req = [kw for kw in required if kw in normalized]
    matched_opt = [kw for kw in optional if kw in normalized]

    if not (matched_req and matched_opt):
        return None

    # 고객명: "Customer" 키워드 줄의 바로 위 줄에서 추출
    customer_name = None
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if 'Customer Review Service' in line and i > 0:
            name_line = lines[i - 1].strip()
            go_idx = name_line.find(' 고')
            if go_idx > 0:
                name = name_line[:go_idx]
            else:
                space_idx = name_line.find(' ')
                name = name_line[:space_idx] if space_idx > 0 else name_line
            if len(name) >= 2:
                customer_name = name
            break

    # 발행일 추출
    issue_date = None
    date_m = re.search(
        r'발행\s*(?:\(기준\))?\s*일[:\s]*(\d{4})년?\s*[\-.]?\s*(\d{1,2})월?\s*[\-.]?\s*(\d{1,2})일?',
        normalized,
    )
    if date_m:
        y, m_, d = date_m.groups()
        issue_date = f"{y}-{m_.zfill(2)}-{d.zfill(2)}"

    return Detection(
        doc_type="customer_review",
        confidence=1.0,
        metadata={"customer_name": customer_name, "issue_date": issue_date},
    )


class MockInsuranceAdapter(DomainAdapter):
    """InsuranceDomainAdapter의 핵심 동작만 재현하는 Mock

    xpipe 코어 테스트에서 insurance 패키지에 직접 의존하지 않기 위해 사용한다.
    get_classification_config, detect_special_documents, on_stage_complete 등의
    반환 구조가 실제 InsuranceDomainAdapter와 동일하다.
    """

    async def get_classification_config(self) -> ClassificationConfig:
        return ClassificationConfig(
            categories=list(_MOCK_CATEGORIES),
            prompt_template="[Mock] 문서 분류 프롬프트",
            valid_types=list(_MOCK_VALID_TYPES),
            extra={
                "system_prompt": "[Mock] 시스템 프롬프트",
                "system_only_types": _MOCK_SYSTEM_ONLY_TYPES,
            },
        )

    async def detect_special_documents(
        self,
        text: str,
        mime_type: str,
        filename: str = "",
    ) -> list[Detection]:
        # 실제 어댑터와 동일: PDF만 감지
        if mime_type != "application/pdf" or not text or not text.strip():
            return []

        results: list[Detection] = []
        ar = _mock_detect_ar(text)
        if ar:
            results.append(ar)
            # AR이면 CRS는 시도하지 않음 (실제 로직과 동일)
            return results
        crs = _mock_detect_crs(text)
        if crs:
            results.append(crs)
        return results

    async def resolve_entity(
        self,
        detection: Detection,
        owner_id: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        return {"matched": False, "reason": "mock"}

    async def extract_domain_metadata(
        self,
        text: str,
        filename: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        return {}

    async def generate_display_name(
        self,
        doc: dict[str, Any],
        detection: Optional[Detection] = None,
        **kwargs: Any,
    ) -> str:
        if detection and detection.doc_type == "annual_report":
            name = detection.metadata.get("customer_name", "")
            date = detection.metadata.get("issue_date", "")
            return f"{name}_AR_{date}.pdf" if name else "AR.pdf"
        if detection and detection.doc_type == "customer_review":
            name = detection.metadata.get("customer_name", "")
            date = detection.metadata.get("issue_date", "")
            return f"{name}_CRS_{date}.pdf" if name else "CRS.pdf"
        return ""

    async def on_stage_complete(
        self,
        stage: str,
        doc: dict[str, Any],
        context: dict[str, Any],
    ) -> list[HookResult]:
        if stage == "upload_complete":
            return [
                HookResult(
                    action=StageHookAction.TRIGGER_PROCESS,
                    payload={
                        "process": "connect_document_to_customer",
                        "customer_id": context.get("customer_id", ""),
                        "doc_id": context.get("doc_id", ""),
                    },
                ),
                HookResult(
                    action=StageHookAction.NOTIFY,
                    payload={"progress": 20, "message": "업로드 완료"},
                ),
            ]
        if stage == "pre_embedding":
            if context.get("reprocessed_from_credit_pending"):
                return []
            credit = context.get("credit_check_result", {})
            if credit and not credit.get("allowed", True):
                return [
                    HookResult(
                        action=StageHookAction.UPDATE_STATUS,
                        payload={"fields": {"status": "credit_pending"}},
                    ),
                    HookResult(
                        action=StageHookAction.SKIP_REMAINING,
                        payload={"reason": "credit_insufficient"},
                    ),
                ]
        return []


@pytest.fixture
def mock_insurance_adapter():
    """MockInsuranceAdapter 인스턴스"""
    return MockInsuranceAdapter()
