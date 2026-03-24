"""
xpipe 테스트용 공통 픽스처

도메인 무관 MockDomainAdapter를 제공한다.
xpipe 코어 테스트에서는 이 MockAdapter를 사용하여 특정 도메인 패키지에 의존하지 않는다.
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
# Mock 분류 체계 (도메인 무관 범용 카테고리)
# ---------------------------------------------------------------------------

_MOCK_CATEGORIES = [
    Category(code="type_a", name="Type A", parent="group_1"),
    Category(code="type_b", name="Type B", parent="group_1"),
    Category(code="type_c", name="Type C", parent="group_1"),
    Category(code="type_d", name="Type D", parent="group_1"),
    Category(code="type_e", name="Type E", parent="group_1"),
    Category(code="type_f", name="Type F", parent="group_2"),
    Category(code="type_g", name="Type G", parent="group_2"),
    Category(code="type_h", name="Type H", parent="group_2"),
    Category(code="type_i", name="Type I", parent="group_2"),
    Category(code="type_j", name="Type J", parent="group_3"),
    Category(code="type_k", name="Type K", parent="group_3"),
    Category(code="type_l", name="Type L", parent="group_3"),
    Category(code="type_m", name="Type M", parent="group_4"),
    Category(code="type_n", name="Type N", parent="group_5"),
    Category(code="type_o", name="Type O", parent="group_5"),
    Category(code="type_p", name="Type P", parent="group_5"),
    Category(code="type_q", name="Type Q", parent="group_6"),
    Category(code="type_r", name="Type R", parent="group_6"),
    Category(code="type_s", name="Type S", parent="group_6"),
    Category(code="type_t", name="Type T", parent="group_6"),
    Category(code="type_u", name="Type U", parent="group_6"),
    Category(code="general", name="General", parent="etc"),
    Category(code="unclassifiable", name="Unclassifiable", parent="etc"),
]

_MOCK_VALID_TYPES = sorted({c.code for c in _MOCK_CATEGORIES})

_MOCK_SYSTEM_ONLY_TYPES = {"special_report", "review_document", "unspecified"}


def _mock_detect_special_a(text: str) -> Optional[Detection]:
    """특수 문서 A 감지 (범용)

    필수 키워드: "SPECIAL_DOCUMENT"
    선택 키워드: "ENTITY_DATA", "STATISTICS", "OVERVIEW", "PROVIDER_A", "REPORT_SUMMARY"
    판단: 필수 1개 이상 + 선택 1개 이상
    """
    normalized = re.sub(r'\s+', ' ', text)
    required = ['SPECIAL_DOCUMENT']
    optional = ['ENTITY_DATA', 'STATISTICS', 'OVERVIEW', 'PROVIDER_A', 'REPORT_SUMMARY']

    matched_req = [kw for kw in required if kw in normalized]
    matched_opt = [kw for kw in optional if kw in normalized]

    if not (matched_req and matched_opt):
        return None

    # entity_name: "SPECIAL_DOCUMENT" 키워드 줄의 바로 위 줄에서 추출
    entity_name = None
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if 'SPECIAL_DOCUMENT' in line and i > 0:
            name_line = lines[i - 1].strip()
            # 첫 단어를 entity_name으로 사용
            space_idx = name_line.find(' ')
            name = name_line[:space_idx] if space_idx > 0 else name_line
            if len(name) >= 2:
                entity_name = name
            break

    # 날짜 추출
    issue_date = None
    date_m = re.search(r'(\d{4})-(\d{2})-(\d{2})', normalized)
    if date_m:
        issue_date = date_m.group(0)
    else:
        date_m2 = re.search(r'(\d{4})\.(\d{2})\.(\d{2})', normalized)
        if date_m2:
            y, m_, d = date_m2.groups()
            issue_date = f"{y}-{m_}-{d}"

    return Detection(
        doc_type="special_report",
        confidence=1.0,
        metadata={"entity_name": entity_name, "issue_date": issue_date},
    )


def _mock_detect_special_b(text: str) -> Optional[Detection]:
    """특수 문서 B 감지 (범용)

    필수: "REVIEW_DOCUMENT"
    선택: "METRICS_DATA", "ANALYSIS", "PORTFOLIO", "PERFORMANCE", "SUMMARY"
    판단: 필수 1개 이상 + 선택 1개 이상
    """
    normalized = re.sub(r'\s+', ' ', text)
    required = ['REVIEW_DOCUMENT']
    optional = ['METRICS_DATA', 'ANALYSIS', 'PORTFOLIO', 'PERFORMANCE', 'SUMMARY']

    matched_req = [kw for kw in required if kw in normalized]
    matched_opt = [kw for kw in optional if kw in normalized]

    if not (matched_req and matched_opt):
        return None

    # entity_name: "REVIEW_DOCUMENT" 키워드 줄의 바로 위 줄에서 추출
    entity_name = None
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if 'REVIEW_DOCUMENT' in line and i > 0:
            name_line = lines[i - 1].strip()
            space_idx = name_line.find(' ')
            name = name_line[:space_idx] if space_idx > 0 else name_line
            if len(name) >= 2:
                entity_name = name
            break

    # 날짜 추출
    issue_date = None
    date_m = re.search(r'(\d{4})-(\d{2})-(\d{2})', normalized)
    if date_m:
        issue_date = date_m.group(0)

    return Detection(
        doc_type="review_document",
        confidence=1.0,
        metadata={"entity_name": entity_name, "issue_date": issue_date},
    )


class MockDomainAdapter(DomainAdapter):
    """도메인 무관 MockAdapter

    xpipe 코어 테스트에서 특정 도메인 패키지에 의존하지 않기 위해 사용한다.
    get_classification_config, detect_special_documents, on_stage_complete 등의
    반환 구조가 DomainAdapter 계약을 준수한다.
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
        # PDF만 감지
        if mime_type != "application/pdf" or not text or not text.strip():
            return []

        results: list[Detection] = []
        special_a = _mock_detect_special_a(text)
        if special_a:
            results.append(special_a)
            # A이면 B는 시도하지 않음
            return results
        special_b = _mock_detect_special_b(text)
        if special_b:
            results.append(special_b)
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
        if detection and detection.doc_type == "special_report":
            name = detection.metadata.get("entity_name", "")
            date = detection.metadata.get("issue_date", "")
            return f"{name}_SPECIAL_{date}.pdf" if name else "SPECIAL.pdf"
        if detection and detection.doc_type == "review_document":
            name = detection.metadata.get("entity_name", "")
            date = detection.metadata.get("issue_date", "")
            return f"{name}_REVIEW_{date}.pdf" if name else "REVIEW.pdf"
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
def mock_domain_adapter():
    """MockDomainAdapter 인스턴스"""
    return MockDomainAdapter()
