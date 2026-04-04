"""
LegalDomainAdapter 테스트 — xPipe 이식성 PoC 검증

검증 항목:
1. 계약 테스트 (assert_adapter_contract 헬퍼)
2. 판결문 감지
3. 계약서 감지
4. 표시명 생성
5. 메타데이터 추출

실행: cd backend/api/document_pipeline && python -m pytest poc_legal/test_legal_adapter.py -v
"""
import pytest
from poc_legal.adapter import LegalDomainAdapter
from tests.test_adapter_contract import assert_adapter_contract
from xpipe.adapter import (
    ClassificationConfig,
    Detection,
    DomainAdapter,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def adapter() -> LegalDomainAdapter:
    return LegalDomainAdapter()


@pytest.fixture
def judgment_text() -> str:
    """판결문 샘플 텍스트"""
    return (
        "서울중앙지방법원\n"
        "판    결\n"
        "사건 2024가합12345 손해배상(기)\n"
        "원고: 김민수\n"
        "피고: 이영희\n"
        "\n"
        "주문\n"
        "1. 피고는 원고에게 금 50,000,000원을 지급하라.\n"
        "2. 소송비용은 피고가 부담한다.\n"
        "\n"
        "판결일: 2024. 6. 15.\n"
    )


@pytest.fixture
def contract_text() -> str:
    """계약서 샘플 텍스트"""
    return (
        "용역 계약서\n"
        "\n"
        "갑: 주식회사 테스트\n"
        "을: 홍길동\n"
        "\n"
        "제1조 (계약기간)\n"
        "본 계약의 기간은 2024년 1월 1일부터 2024년 12월 31일까지로 한다.\n"
        "\n"
        "제2조 (용역 내용)\n"
        "을은 갑에게 소프트웨어 개발 용역을 제공한다.\n"
    )


@pytest.fixture
def sample_doc() -> dict:
    """테스트용 문서 데이터"""
    return {
        "_id": "legal_doc_001",
        "ownerId": "lawyer_001",
        "upload": {"originalName": "test.pdf"},
        "meta": {"mime": "application/pdf", "full_text": "테스트 텍스트"},
        "status": "processing",
    }


# ---------------------------------------------------------------------------
# 1. 계약 테스트 — DomainAdapter ABC 완전 구현 검증
# ---------------------------------------------------------------------------

class TestAdapterContract:
    """LegalDomainAdapter가 DomainAdapter 계약을 준수하는지 검증"""

    def test_contract_compliance(self):
        """assert_adapter_contract 헬퍼 통과"""
        assert_adapter_contract(LegalDomainAdapter)

    def test_is_domain_adapter(self, adapter):
        """DomainAdapter의 인스턴스인지 확인"""
        assert isinstance(adapter, DomainAdapter)


# ---------------------------------------------------------------------------
# 2. 분류 설정 테스트
# ---------------------------------------------------------------------------

class TestClassificationConfig:
    """get_classification_config() 반환값 검증"""

    @pytest.mark.asyncio
    async def test_returns_config(self, adapter):
        """ClassificationConfig 인스턴스 반환"""
        config = await adapter.get_classification_config()
        assert isinstance(config, ClassificationConfig)

    @pytest.mark.asyncio
    async def test_categories_not_empty(self, adapter):
        """카테고리가 비어있지 않은지"""
        config = await adapter.get_classification_config()
        assert len(config.categories) == 9

    @pytest.mark.asyncio
    async def test_valid_types_match_categories(self, adapter):
        """valid_types가 카테고리 코드와 일치"""
        config = await adapter.get_classification_config()
        category_codes = {cat.code for cat in config.categories}
        valid_types_set = set(config.valid_types)
        assert category_codes == valid_types_set

    @pytest.mark.asyncio
    async def test_prompt_has_placeholder(self, adapter):
        """프롬프트에 {text} 플레이스홀더가 있는지"""
        config = await adapter.get_classification_config()
        assert "{text}" in config.prompt_template


# ---------------------------------------------------------------------------
# 3. 판결문 감지 테스트
# ---------------------------------------------------------------------------

class TestJudgmentDetection:
    """판결문 감지 테스트"""

    @pytest.mark.asyncio
    async def test_detect_judgment(self, adapter, judgment_text):
        """판결문 키워드가 충분하면 감지"""
        detections = await adapter.detect_special_documents(
            text=judgment_text,
            mime_type="application/pdf",
        )
        assert len(detections) == 1
        assert detections[0].doc_type == "judgment"

    @pytest.mark.asyncio
    async def test_judgment_extracts_parties(self, adapter, judgment_text):
        """판결문에서 원고/피고 추출"""
        detections = await adapter.detect_special_documents(
            text=judgment_text,
            mime_type="application/pdf",
        )
        meta = detections[0].metadata
        assert meta["plaintiff"] == "김민수"
        assert meta["defendant"] == "이영희"

    @pytest.mark.asyncio
    async def test_judgment_extracts_case_number(self, adapter, judgment_text):
        """판결문에서 사건번호 추출"""
        detections = await adapter.detect_special_documents(
            text=judgment_text,
            mime_type="application/pdf",
        )
        assert detections[0].metadata["case_number"] == "2024가합12345"

    @pytest.mark.asyncio
    async def test_no_detection_without_optional_keywords(self, adapter):
        """필수 키워드만 있고 선택 키워드 부족하면 미감지"""
        text = "판결\n이 문서는 일반적인 내용입니다."
        detections = await adapter.detect_special_documents(
            text=text, mime_type="application/pdf",
        )
        assert len(detections) == 0

    @pytest.mark.asyncio
    async def test_no_detection_on_empty_text(self, adapter):
        """빈 텍스트면 미감지"""
        detections = await adapter.detect_special_documents(
            text="", mime_type="application/pdf",
        )
        assert len(detections) == 0


# ---------------------------------------------------------------------------
# 4. 계약서 감지 테스트
# ---------------------------------------------------------------------------

class TestContractDetection:
    """계약서 감지 테스트"""

    @pytest.mark.asyncio
    async def test_detect_contract(self, adapter, contract_text):
        """계약서 키워드가 충분하면 감지"""
        detections = await adapter.detect_special_documents(
            text=contract_text,
            mime_type="application/pdf",
        )
        assert len(detections) == 1
        assert detections[0].doc_type == "contract"

    @pytest.mark.asyncio
    async def test_contract_extracts_parties(self, adapter, contract_text):
        """계약서에서 갑/을 추출"""
        detections = await adapter.detect_special_documents(
            text=contract_text,
            mime_type="application/pdf",
        )
        meta = detections[0].metadata
        assert meta["party_a"] == "주식회사"
        assert meta["party_b"] == "홍길동"

    @pytest.mark.asyncio
    async def test_no_detection_without_optional(self, adapter):
        """필수만 있고 선택 키워드 없으면 미감지"""
        text = "용역 계약서\n일반적인 문서 내용입니다."
        detections = await adapter.detect_special_documents(
            text=text, mime_type="application/pdf",
        )
        assert len(detections) == 0

    @pytest.mark.asyncio
    async def test_judgment_takes_priority(self, adapter):
        """판결문과 계약서 키워드가 모두 있으면 판결문 우선"""
        text = (
            "판결\n원고: 김민수\n피고: 이영희\n"
            "계약서\n갑: 테스트\n을: 홍길동\n계약기간: 1년\n"
        )
        detections = await adapter.detect_special_documents(
            text=text, mime_type="application/pdf",
        )
        assert len(detections) == 1
        assert detections[0].doc_type == "judgment"


# ---------------------------------------------------------------------------
# 5. 표시명 생성 테스트
# ---------------------------------------------------------------------------

class TestDisplayName:
    """generate_display_name() 테스트"""

    @pytest.mark.asyncio
    async def test_judgment_display_name(self, adapter, sample_doc):
        """판결문 표시명: {사건번호}_{원고}v{피고}.pdf"""
        detection = Detection(
            doc_type="judgment",
            confidence=1.0,
            metadata={
                "case_number": "2024가합12345",
                "plaintiff": "김민수",
                "defendant": "이영희",
            },
        )
        name = await adapter.generate_display_name(sample_doc, detection)
        assert name == "2024가합12345_김민수v이영희.pdf"

    @pytest.mark.asyncio
    async def test_judgment_display_name_case_only(self, adapter, sample_doc):
        """당사자 없으면 사건번호만"""
        detection = Detection(
            doc_type="judgment",
            confidence=1.0,
            metadata={"case_number": "2024가합12345"},
        )
        name = await adapter.generate_display_name(sample_doc, detection)
        assert name == "2024가합12345_판결문.pdf"

    @pytest.mark.asyncio
    async def test_contract_display_name(self, adapter, sample_doc):
        """계약서 표시명: 계약서_{갑}_{을}_{날짜}.pdf"""
        detection = Detection(
            doc_type="contract",
            confidence=1.0,
            metadata={
                "party_a": "주식회사테스트",
                "party_b": "홍길동",
                "contract_date": "2024-01-01",
            },
        )
        name = await adapter.generate_display_name(sample_doc, detection)
        assert name == "계약서_주식회사테스트_홍길동_2024-01-01.pdf"

    @pytest.mark.asyncio
    async def test_contract_display_name_no_date(self, adapter, sample_doc):
        """날짜 없으면 갑_을만"""
        detection = Detection(
            doc_type="contract",
            confidence=1.0,
            metadata={"party_a": "갑회사", "party_b": "을회사"},
        )
        name = await adapter.generate_display_name(sample_doc, detection)
        assert name == "계약서_갑회사_을회사.pdf"

    @pytest.mark.asyncio
    async def test_no_detection_returns_empty(self, adapter, sample_doc):
        """detection이 None이면 빈 문자열"""
        name = await adapter.generate_display_name(sample_doc, None)
        assert name == ""


# ---------------------------------------------------------------------------
# 6. 메타데이터 추출 테스트
# ---------------------------------------------------------------------------

class TestMetadataExtraction:
    """extract_domain_metadata() 테스트"""

    @pytest.mark.asyncio
    async def test_extract_case_number(self, adapter):
        """사건번호 추출"""
        text = "사건 2024가합12345 손해배상"
        meta = await adapter.extract_domain_metadata(text, "test.pdf")
        assert meta["case_number"] == "2024가합12345"

    @pytest.mark.asyncio
    async def test_extract_court_name(self, adapter):
        """법원명 추출"""
        text = "서울중앙지방법원 판결"
        meta = await adapter.extract_domain_metadata(text, "test.pdf")
        assert meta["court_name"] == "서울지방법원"

    @pytest.mark.asyncio
    async def test_extract_supreme_court(self, adapter):
        """대법원 추출"""
        text = "대법원 2024다12345"
        meta = await adapter.extract_domain_metadata(text, "test.pdf")
        assert meta["court_name"] == "대법원"

    @pytest.mark.asyncio
    async def test_extract_judgment_date(self, adapter):
        """판결일자 추출"""
        text = "판결일: 2024. 6. 15."
        meta = await adapter.extract_domain_metadata(text, "test.pdf")
        assert meta["judgment_date"] == "2024-06-15"

    @pytest.mark.asyncio
    async def test_empty_text_returns_empty(self, adapter):
        """빈 텍스트면 빈 dict"""
        meta = await adapter.extract_domain_metadata("", "test.pdf")
        assert meta == {}


# ---------------------------------------------------------------------------
# 7. on_stage_complete 테스트
# ---------------------------------------------------------------------------

class TestOnStageComplete:
    """on_stage_complete() 테스트 — PoC: 항상 빈 리스트"""

    @pytest.mark.asyncio
    async def test_returns_empty_list(self, adapter, sample_doc):
        """어떤 단계든 빈 리스트 반환"""
        result = await adapter.on_stage_complete("upload", sample_doc, {})
        assert isinstance(result, list)
        assert len(result) == 0

    @pytest.mark.asyncio
    async def test_unknown_stage(self, adapter, sample_doc):
        """알 수 없는 단계도 빈 리스트"""
        result = await adapter.on_stage_complete("nonexistent", sample_doc, {})
        assert result == []


# ---------------------------------------------------------------------------
# 8. resolve_entity 테스트
# ---------------------------------------------------------------------------

class TestResolveEntity:
    """resolve_entity() 테스트"""

    @pytest.mark.asyncio
    async def test_judgment_entity(self, adapter):
        """판결문 당사자 연결"""
        detection = Detection(
            doc_type="judgment",
            confidence=1.0,
            metadata={"plaintiff": "김민수", "defendant": "이영희"},
        )
        result = await adapter.resolve_entity(detection, "owner_001")
        assert result["matched"] is True
        assert result["plaintiff"] == "김민수"
        assert result["defendant"] == "이영희"

    @pytest.mark.asyncio
    async def test_contract_entity(self, adapter):
        """계약서 당사자 연결"""
        detection = Detection(
            doc_type="contract",
            confidence=1.0,
            metadata={"party_a": "갑회사", "party_b": "을회사"},
        )
        result = await adapter.resolve_entity(detection, "owner_001")
        assert result["matched"] is True
        assert result["party_a"] == "갑회사"

    @pytest.mark.asyncio
    async def test_no_parties(self, adapter):
        """당사자 정보가 없으면 matched=False"""
        detection = Detection(
            doc_type="judgment",
            confidence=1.0,
            metadata={},
        )
        result = await adapter.resolve_entity(detection, "owner_001")
        assert result["matched"] is False

    @pytest.mark.asyncio
    async def test_unsupported_type(self, adapter):
        """지원하지 않는 doc_type"""
        detection = Detection(doc_type="unknown", confidence=0.5)
        result = await adapter.resolve_entity(detection, "owner_001")
        assert result["matched"] is False
        assert result["reason"] == "unsupported_doc_type"
