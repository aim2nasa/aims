"""
InsuranceDomainAdapter.detect_special_documents() 테스트

Phase 2-2: AR/CRS 패턴 매칭 로직이 어댑터로 이동됨.
기존 test_ar_crs_detection.py (26개)와 동일한 패턴을 어댑터 경로로 검증.

실행: cd backend/api/document_pipeline && python -m pytest tests/test_insurance_adapter_detect.py -v
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from insurance.adapter import (
    InsuranceDomainAdapter,
    _detect_ar_pattern,
    _detect_crs_pattern,
)
from xpipe.adapter import Detection


# ========================================
# Fixtures
# ========================================

@pytest.fixture
def adapter():
    return InsuranceDomainAdapter()


@pytest.fixture
def ar_text_sample():
    """AR (Annual Review Report) 샘플 텍스트"""
    return (
        "MetLife\n"
        "홍길동 고객님을 위한\n"
        "Annual Review Report\n"
        "\n"
        "보유계약 현황\n"
        "메트라이프생명 보험계약 현황\n"
        "\n"
        "계약번호   상품명           계약일      보험기간\n"
        "12345678   종합보장보험     2020.01.15  2020.01~2050.01\n"
        "\n"
        "발행(기준)일: 2026년 1월 15일\n"
    )


@pytest.fixture
def crs_text_sample():
    """CRS (Customer Review Service) 샘플 텍스트"""
    return (
        "메트라이프\n"
        "김철수 고객님을 위한\n"
        "Customer Review Service\n"
        "\n"
        "변액 적립금 현황\n"
        "투자수익률 및 펀드 배분 현황\n"
        "\n"
        "계약번호: 98765432\n"
        "계약자: 김철수\n"
        "메트라이프 변액종합보험\n"
        "발행(기준)일: 2026년 2월 10일\n"
    )


# ========================================
# 순수 함수 테스트: _detect_ar_pattern
# ========================================

class TestDetectARPattern:
    """AR 패턴 매칭 순수 함수 테스트"""

    def test_required_plus_optional_keywords(self, ar_text_sample):
        """필수('Annual Review Report') + 선택('보유계약 현황') → AR 감지"""
        result = _detect_ar_pattern(ar_text_sample)
        assert result is not None
        assert result.doc_type == "annual_report"
        assert result.confidence == 1.0

    def test_required_only_no_optional(self):
        """필수 키워드만 있고 선택 키워드 없으면 → None"""
        text = "This is an Annual Review Report for testing only."
        result = _detect_ar_pattern(text)
        assert result is None

    def test_optional_only_no_required(self):
        """선택 키워드만 있고 필수 키워드 없으면 → None"""
        text = "보유계약 현황\n메트라이프생명\n고객님을 위한 보험 안내"
        result = _detect_ar_pattern(text)
        assert result is None

    def test_whitespace_normalization(self):
        """공백이 여러 개여도 정규화하여 매칭"""
        text = (
            "홍길동 고객님을 위한\n"
            "Annual   Review   Report\n"
            "보유계약   현황\n"
        )
        result = _detect_ar_pattern(text)
        assert result is not None

    def test_metlife_as_optional_keyword(self):
        """'MetLife'만으로도 선택 키워드 충족"""
        text = "MetLife\nSomething\nAnnual Review Report\n"
        result = _detect_ar_pattern(text)
        assert result is not None

    def test_metlife_korean_as_optional(self):
        """'메트라이프' 한글도 선택 키워드 충족"""
        text = "메트라이프\n고객정보\nAnnual Review Report\n"
        result = _detect_ar_pattern(text)
        assert result is not None

    def test_empty_text(self):
        """빈 텍스트 → None"""
        result = _detect_ar_pattern("")
        assert result is None

    def test_customer_name_extraction(self):
        """'홍길동 고객님을 위한' → '홍길동' 추출"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황"
        result = _detect_ar_pattern(text)
        assert result is not None
        assert result.metadata["customer_name"] == "홍길동"

    def test_customer_name_too_short(self):
        """1자 이름 → 추출 안됨"""
        text = "MetLife\n김 고객님을 위한\nAnnual Review Report\n보유계약 현황"
        result = _detect_ar_pattern(text)
        assert result is not None
        assert result.metadata["customer_name"] is None

    def test_customer_name_without_gokaeknim(self):
        """'고객님을 위한' 패턴 없이 이름 줄이 있으면 → 공백 기준 첫 단어"""
        text = "MetLife\n이순신 장군의\nAnnual Review Report\n보유계약 현황"
        result = _detect_ar_pattern(text)
        assert result is not None
        assert result.metadata["customer_name"] == "이순신"

    def test_issue_date_standard_format(self):
        """'발행(기준)일: 2026년 1월 15일' → '2026-01-15'"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황\n발행(기준)일: 2026년 1월 15일"
        result = _detect_ar_pattern(text)
        assert result is not None
        assert result.metadata["issue_date"] == "2026-01-15"

    def test_issue_date_zfill(self):
        """월/일이 1자리인 경우 0 패딩"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황\n발행일: 2026년 2월 3일"
        result = _detect_ar_pattern(text)
        assert result is not None
        assert result.metadata["issue_date"] == "2026-02-03"

    def test_issue_date_fallback_pattern(self):
        """'발행일' 없이 일반 날짜 패턴 → 대체 추출"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황\n2025년 12월 25일 기준"
        result = _detect_ar_pattern(text)
        assert result is not None
        assert result.metadata["issue_date"] == "2025-12-25"

    def test_issue_date_not_found(self):
        """날짜 패턴 없으면 None"""
        text = "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n보유계약 현황"
        result = _detect_ar_pattern(text)
        assert result is not None
        assert result.metadata["issue_date"] is None


# ========================================
# 순수 함수 테스트: _detect_crs_pattern
# ========================================

class TestDetectCRSPattern:
    """CRS 패턴 매칭 순수 함수 테스트"""

    def test_crs_pattern_match(self, crs_text_sample):
        """필수('Customer Review Service') + 선택('변액') → CRS 감지"""
        result = _detect_crs_pattern(crs_text_sample)
        assert result is not None
        assert result.doc_type == "customer_review"

    def test_crs_required_only(self):
        """필수 키워드만, 선택 키워드 없음 → None"""
        text = "This is a Customer Review Service document for testing."
        result = _detect_crs_pattern(text)
        assert result is None

    def test_crs_customer_name_extraction(self, crs_text_sample):
        """CRS 고객명 추출: 'Customer' 위 줄에서"""
        result = _detect_crs_pattern(crs_text_sample)
        assert result is not None
        assert result.metadata["customer_name"] == "김철수"

    def test_crs_product_name_extraction(self, crs_text_sample):
        """CRS 상품명 추출: '발행' 위 줄에서"""
        result = _detect_crs_pattern(crs_text_sample)
        assert result is not None
        assert result.metadata["product_name"] == "메트라이프 변액종합보험"

    def test_crs_issue_date_extraction(self, crs_text_sample):
        """CRS 발행일 추출"""
        result = _detect_crs_pattern(crs_text_sample)
        assert result is not None
        assert result.metadata["issue_date"] == "2026-02-10"

    def test_empty_text(self):
        """빈 텍스트 → None"""
        result = _detect_crs_pattern("")
        assert result is None

    def test_crs_contractor_fallback(self):
        """'고객님을 위한' 없어도 '계약자' 필드에서 이름 추출

        단, Customer 위 줄에서 2글자 이상 이름이 추출되면 그것이 우선.
        fallback은 Customer 위 줄에서 추출 실패할 때만 동작.
        """
        # Customer 위 줄이 1글자 → fallback으로 '계약자' 필드 사용
        text = (
            "M\n"
            "Customer Review Service\n"
            "변액 적립금\n"
            "계약자: 박영희\n"
            "상품명\n"
            "발행일: 2026년 3월 1일\n"
        )
        result = _detect_crs_pattern(text)
        assert result is not None
        assert result.metadata["customer_name"] == "박영희"


# ========================================
# 통합 테스트: detect_special_documents()
# ========================================

class TestDetectSpecialDocuments:
    """InsuranceDomainAdapter.detect_special_documents() 통합 테스트"""

    async def test_ar_detected(self, adapter, ar_text_sample):
        """AR 텍스트 → Detection(doc_type='annual_report') 반환"""
        detections = await adapter.detect_special_documents(
            text=ar_text_sample,
            mime_type="application/pdf",
        )
        assert len(detections) == 1
        assert detections[0].doc_type == "annual_report"
        assert detections[0].metadata["customer_name"] == "홍길동"

    async def test_crs_detected(self, adapter, crs_text_sample):
        """CRS 텍스트 → Detection(doc_type='customer_review') 반환"""
        detections = await adapter.detect_special_documents(
            text=crs_text_sample,
            mime_type="application/pdf",
        )
        assert len(detections) == 1
        assert detections[0].doc_type == "customer_review"
        assert detections[0].metadata["customer_name"] == "김철수"

    async def test_non_pdf_returns_empty(self, adapter, ar_text_sample):
        """PDF가 아니면 빈 리스트"""
        detections = await adapter.detect_special_documents(
            text=ar_text_sample,
            mime_type="image/jpeg",
        )
        assert detections == []

    async def test_empty_text_returns_empty(self, adapter):
        """빈 텍스트 → 빈 리스트"""
        detections = await adapter.detect_special_documents(
            text="",
            mime_type="application/pdf",
        )
        assert detections == []

    async def test_whitespace_only_returns_empty(self, adapter):
        """공백만 있는 텍스트 → 빈 리스트"""
        detections = await adapter.detect_special_documents(
            text="   \n  \t  ",
            mime_type="application/pdf",
        )
        assert detections == []

    async def test_normal_text_returns_empty(self, adapter):
        """AR/CRS 아닌 일반 텍스트 → 빈 리스트"""
        detections = await adapter.detect_special_documents(
            text="이것은 일반 보험 문서입니다.",
            mime_type="application/pdf",
        )
        assert detections == []

    async def test_ar_takes_priority_over_crs(self, adapter):
        """AR + CRS 키워드가 모두 있으면 AR만 반환 (상호 배타)"""
        text = (
            "MetLife\n"
            "홍길동 고객님을 위한\n"
            "Annual Review Report\n"
            "보유계약 현황\n"
            "Customer Review Service\n"
            "변액\n"
        )
        detections = await adapter.detect_special_documents(
            text=text,
            mime_type="application/pdf",
        )
        assert len(detections) == 1
        assert detections[0].doc_type == "annual_report"


# ========================================
# generate_display_name() 테스트
# ========================================

class TestGenerateDisplayName:
    """InsuranceDomainAdapter.generate_display_name() 테스트"""

    async def test_ar_display_name(self, adapter):
        """AR: {고객명}_AR_{발행일}.pdf"""
        detection = Detection(
            doc_type="annual_report",
            confidence=1.0,
            metadata={"customer_name": "홍길동", "issue_date": "2026-01-15"},
        )
        result = await adapter.generate_display_name({}, detection)
        assert result == "홍길동_AR_2026-01-15.pdf"

    async def test_crs_display_name_with_product(self, adapter):
        """CRS: {고객명}_CRS_{상품명}_{발행일}.pdf"""
        detection = Detection(
            doc_type="customer_review",
            confidence=1.0,
            metadata={
                "customer_name": "김철수",
                "product_name": "메트라이프 변액종합보험",
                "issue_date": "2026-02-10",
            },
        )
        result = await adapter.generate_display_name({}, detection)
        assert result == "김철수_CRS_메트라이프 변액종합보험_2026-02-10.pdf"

    async def test_crs_display_name_without_product(self, adapter):
        """CRS 상품명 없음: {고객명}_CRS_{발행일}.pdf"""
        detection = Detection(
            doc_type="customer_review",
            confidence=1.0,
            metadata={
                "customer_name": "김철수",
                "product_name": None,
                "issue_date": "2026-02-10",
            },
        )
        result = await adapter.generate_display_name({}, detection)
        assert result == "김철수_CRS_2026-02-10.pdf"

    async def test_no_detection_returns_empty(self, adapter):
        """detection=None → 빈 문자열"""
        result = await adapter.generate_display_name({}, None)
        assert result == ""

    async def test_missing_name_returns_empty(self, adapter):
        """고객명 없으면 빈 문자열"""
        detection = Detection(
            doc_type="annual_report",
            confidence=1.0,
            metadata={"customer_name": None, "issue_date": "2026-01-15"},
        )
        result = await adapter.generate_display_name({}, detection)
        assert result == ""

    async def test_crs_product_name_sanitized(self, adapter):
        """CRS 상품명의 불가 문자 제거"""
        detection = Detection(
            doc_type="customer_review",
            confidence=1.0,
            metadata={
                "customer_name": "홍길동",
                "product_name": 'MetLife "변액" 보험',
                "issue_date": "2026-01-01",
            },
        )
        result = await adapter.generate_display_name({}, detection)
        assert result == "홍길동_CRS_MetLife 변액 보험_2026-01-01.pdf"

    async def test_unknown_doc_type_returns_empty(self, adapter):
        """알 수 없는 doc_type → 빈 문자열"""
        detection = Detection(
            doc_type="unknown_type",
            confidence=1.0,
            metadata={"customer_name": "홍길동"},
        )
        result = await adapter.generate_display_name({}, detection)
        assert result == ""


# ========================================
# resolve_entity() 테스트
# ========================================

class TestResolveEntity:
    """InsuranceDomainAdapter.resolve_entity() 테스트"""

    async def test_no_customer_name(self, adapter):
        """고객명 없으면 matched=False"""
        detection = Detection(
            doc_type="annual_report",
            confidence=1.0,
            metadata={"customer_name": None},
        )
        result = await adapter.resolve_entity(detection, "user_123")
        assert result["matched"] is False

    async def test_no_owner_id(self, adapter):
        """owner_id 없으면 matched=False"""
        detection = Detection(
            doc_type="annual_report",
            confidence=1.0,
            metadata={"customer_name": "홍길동"},
        )
        result = await adapter.resolve_entity(detection, "")
        assert result["matched"] is False

    async def test_exact_match_found(self, adapter):
        """정확히 일치하는 고객 발견"""
        detection = Detection(
            doc_type="annual_report",
            confidence=1.0,
            metadata={"customer_name": "홍길동"},
        )

        with patch("services.internal_api.resolve_customer_by_name", new_callable=AsyncMock, return_value="cust_001"):
            result = await adapter.resolve_entity(detection, "user_123")

        assert result["matched"] is True
        assert result["customer_id"] == "cust_001"
        assert result["customer_name"] == "홍길동"

    async def test_no_exact_match(self, adapter):
        """이름이 유사하지만 정확히 일치하지 않으면 matched=False"""
        detection = Detection(
            doc_type="annual_report",
            confidence=1.0,
            metadata={"customer_name": "홍길동"},
        )

        with patch("services.internal_api.resolve_customer_by_name", new_callable=AsyncMock, return_value=None):
            result = await adapter.resolve_entity(detection, "user_123")

        assert result["matched"] is False
        assert result["reason"] == "no_exact_match"

    async def test_api_error_handled(self, adapter):
        """API 에러 시 matched=False (resolve_customer_by_name이 None 반환)"""
        detection = Detection(
            doc_type="annual_report",
            confidence=1.0,
            metadata={"customer_name": "홍길동"},
        )

        # resolve_customer_by_name은 API 에러 시 내부에서 None 반환
        with patch("services.internal_api.resolve_customer_by_name", new_callable=AsyncMock, return_value=None):
            result = await adapter.resolve_entity(detection, "user_123")

        assert result["matched"] is False
        assert result["reason"] == "no_exact_match"

    async def test_network_exception_handled(self, adapter):
        """네트워크 예외 시 matched=False"""
        detection = Detection(
            doc_type="annual_report",
            confidence=1.0,
            metadata={"customer_name": "홍길동"},
        )

        # resolve_customer_by_name이 예외를 던지는 경우
        with patch("services.internal_api.resolve_customer_by_name", new_callable=AsyncMock, side_effect=Exception("Connection refused")):
            result = await adapter.resolve_entity(detection, "user_123")

        assert result["matched"] is False
        assert "exception" in result["reason"]
