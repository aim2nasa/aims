"""
DomainAdapter 계약 테스트 — 모든 어댑터 구현체가 통과해야 하는 테스트

Phase 1: ABC 인터페이스 준수 + 반환 타입 검증
Phase 2+: InsuranceAdapter 실제 로직 검증 추가

실행: cd backend/api/document_pipeline && python -m pytest tests/test_adapter_contract.py -v
"""
import asyncio
import inspect
from typing import get_type_hints

import pytest

from xpipe.adapter import (
    DomainAdapter,
    Category,
    ClassificationConfig,
    Detection,
    HookResult,
    StageHookAction,
)
from xpipe.store import DocumentStore
from xpipe.job_queue import JobQueue
from insurance.adapter import InsuranceDomainAdapter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def insurance_adapter() -> InsuranceDomainAdapter:
    """InsuranceDomainAdapter 인스턴스"""
    return InsuranceDomainAdapter()


@pytest.fixture
def sample_detection() -> Detection:
    """테스트용 Detection 객체"""
    return Detection(
        doc_type="annual_report",
        confidence=0.95,
        metadata={"page_count": 10},
    )


@pytest.fixture
def sample_doc() -> dict:
    """테스트용 문서 데이터"""
    return {
        "_id": "test_doc_001",
        "ownerId": "test_user_001",
        "upload": {"originalName": "test.pdf"},
        "meta": {"mime": "application/pdf", "full_text": "테스트 텍스트"},
        "status": "processing",
    }


# ---------------------------------------------------------------------------
# 1. ABC 완전성 테스트 — abstract 메서드가 모두 구현되었는지 검증
# ---------------------------------------------------------------------------

class TestABCCompleteness:
    """DomainAdapter ABC의 모든 abstract 메서드가 구현체에 존재하는지 검증"""

    def test_insurance_adapter_is_concrete(self):
        """InsuranceDomainAdapter가 인스턴스화 가능한지 (모든 abstract 구현 확인)"""
        adapter = InsuranceDomainAdapter()
        assert isinstance(adapter, DomainAdapter)

    def test_all_abstract_methods_implemented(self):
        """DomainAdapter의 모든 abstract 메서드가 InsuranceDomainAdapter에 구현되었는지"""
        abstract_methods = set()
        for name, method in inspect.getmembers(DomainAdapter, predicate=inspect.isfunction):
            if getattr(method, "__isabstractmethod__", False):
                abstract_methods.add(name)

        # abstract 메서드가 최소 6개 (현재 설계 기준)
        assert len(abstract_methods) >= 6, (
            f"DomainAdapter abstract 메서드 수가 예상보다 적습니다: {abstract_methods}"
        )

        # InsuranceDomainAdapter에 모두 구현되었는지
        for method_name in abstract_methods:
            assert hasattr(InsuranceDomainAdapter, method_name), (
                f"InsuranceDomainAdapter에 {method_name}이 구현되지 않았습니다."
            )
            method = getattr(InsuranceDomainAdapter, method_name)
            assert not getattr(method, "__isabstractmethod__", False), (
                f"InsuranceDomainAdapter.{method_name}이 여전히 abstract입니다."
            )

    def test_abstract_method_names(self):
        """DomainAdapter의 abstract 메서드 목록이 설계 문서와 일치하는지"""
        expected_methods = {
            "get_classification_config",
            "detect_special_documents",
            "resolve_entity",
            "extract_domain_metadata",
            "generate_display_name",
            "on_stage_complete",
        }

        abstract_methods = set()
        for name, method in inspect.getmembers(DomainAdapter, predicate=inspect.isfunction):
            if getattr(method, "__isabstractmethod__", False):
                abstract_methods.add(name)

        assert abstract_methods == expected_methods, (
            f"abstract 메서드 불일치.\n"
            f"  예상: {expected_methods}\n"
            f"  실제: {abstract_methods}\n"
            f"  누락: {expected_methods - abstract_methods}\n"
            f"  초과: {abstract_methods - expected_methods}"
        )

    def test_all_methods_are_async(self):
        """DomainAdapter의 모든 abstract 메서드가 async인지"""
        for name, method in inspect.getmembers(DomainAdapter, predicate=inspect.isfunction):
            if getattr(method, "__isabstractmethod__", False):
                assert asyncio.iscoroutinefunction(method), (
                    f"DomainAdapter.{name}이 async가 아닙니다."
                )

    def test_document_store_is_abstract(self):
        """DocumentStore가 인스턴스화 불가능한 ABC인지"""
        with pytest.raises(TypeError):
            DocumentStore()  # type: ignore[abstract]

    def test_job_queue_is_abstract(self):
        """JobQueue가 인스턴스화 불가능한 ABC인지"""
        with pytest.raises(TypeError):
            JobQueue()  # type: ignore[abstract]


# ---------------------------------------------------------------------------
# 2. 반환 타입 테스트 — 각 메서드의 반환값이 올바른 타입인지 검증
# ---------------------------------------------------------------------------

class TestReturnTypes:
    """InsuranceDomainAdapter의 반환 타입이 계약에 맞는지 검증"""

    @pytest.mark.asyncio
    async def test_get_classification_config_returns_config(self, insurance_adapter):
        """get_classification_config() → ClassificationConfig"""
        result = await insurance_adapter.get_classification_config()
        assert isinstance(result, ClassificationConfig)
        assert isinstance(result.categories, list)
        assert isinstance(result.prompt_template, str)
        assert isinstance(result.valid_types, list)
        assert isinstance(result.extra, dict)

    @pytest.mark.asyncio
    async def test_detect_special_documents_returns_list(self, insurance_adapter):
        """detect_special_documents() → list[Detection]"""
        result = await insurance_adapter.detect_special_documents(
            text="테스트 문서 내용",
            mime_type="application/pdf",
            filename="test.pdf",
        )
        assert isinstance(result, list)
        for item in result:
            assert isinstance(item, Detection)

    @pytest.mark.asyncio
    async def test_resolve_entity_returns_dict(self, insurance_adapter, sample_detection):
        """resolve_entity() → dict"""
        result = await insurance_adapter.resolve_entity(
            detection=sample_detection,
            owner_id="test_user",
        )
        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_extract_domain_metadata_returns_dict(self, insurance_adapter):
        """extract_domain_metadata() → dict"""
        result = await insurance_adapter.extract_domain_metadata(
            text="테스트 문서 내용",
            filename="test.pdf",
        )
        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_generate_display_name_returns_str(self, insurance_adapter, sample_doc):
        """generate_display_name() → str"""
        result = await insurance_adapter.generate_display_name(
            doc=sample_doc,
            detection=None,
        )
        assert isinstance(result, str)

    @pytest.mark.asyncio
    async def test_generate_display_name_with_detection(self, insurance_adapter, sample_doc, sample_detection):
        """generate_display_name(detection=...) → str"""
        result = await insurance_adapter.generate_display_name(
            doc=sample_doc,
            detection=sample_detection,
        )
        assert isinstance(result, str)

    @pytest.mark.asyncio
    async def test_on_stage_complete_returns_list(self, insurance_adapter, sample_doc):
        """on_stage_complete() → list[HookResult]"""
        result = await insurance_adapter.on_stage_complete(
            stage="classify",
            doc=sample_doc,
            context={"document_type": "general"},
        )
        assert isinstance(result, list)
        for item in result:
            assert isinstance(item, HookResult)


# ---------------------------------------------------------------------------
# 3. 기본 구현 (no-op) 테스트 — 오버라이드 선택적 메서드
# ---------------------------------------------------------------------------

class TestDefaultImplementations:
    """DomainAdapter의 선택적 메서드(기본 구현) 동작 검증"""

    @pytest.mark.asyncio
    async def test_validate_document_default(self, insurance_adapter):
        """validate_document() 기본 구현: 항상 (True, '') 반환"""
        is_valid, reason = await insurance_adapter.validate_document(
            filename="test.pdf",
            mime_type="application/pdf",
            file_size=1024,
        )
        assert is_valid is True
        assert reason == ""

    @pytest.mark.asyncio
    async def test_on_before_ai_call_default(self, insurance_adapter):
        """on_before_ai_call() 기본 구현: params를 그대로 반환"""
        params = {"model": "gpt-4", "temperature": 0.1}
        result = await insurance_adapter.on_before_ai_call(
            call_type="classify",
            params=params,
        )
        assert result == params


# ---------------------------------------------------------------------------
# 4. 데이터 클래스 테스트 — Category, Detection, ClassificationConfig 등
# ---------------------------------------------------------------------------

class TestDataClasses:
    """데이터 클래스가 올바르게 정의되었는지 검증"""

    def test_category_creation(self):
        """Category 생성 (parent 있음/없음)"""
        root = Category(code="insurance", name="보험")
        assert root.code == "insurance"
        assert root.name == "보험"
        assert root.parent is None

        child = Category(code="health", name="건강보험", parent="insurance")
        assert child.parent == "insurance"

    def test_category_is_frozen(self):
        """Category는 불변(frozen)"""
        cat = Category(code="test", name="테스트")
        with pytest.raises(AttributeError):
            cat.code = "changed"  # type: ignore[misc]

    def test_detection_creation(self):
        """Detection 생성"""
        det = Detection(
            doc_type="annual_report",
            confidence=0.95,
            metadata={"source": "pdf_text"},
        )
        assert det.doc_type == "annual_report"
        assert det.confidence == 0.95
        assert det.metadata["source"] == "pdf_text"

    def test_detection_default_metadata(self):
        """Detection 기본 metadata는 빈 dict"""
        det = Detection(doc_type="test", confidence=0.5)
        assert det.metadata == {}

    def test_classification_config_creation(self):
        """ClassificationConfig 생성"""
        config = ClassificationConfig(
            categories=[
                Category("health", "건강보험", "insurance"),
                Category("life", "생명보험", "insurance"),
            ],
            prompt_template="문서를 분류하세요: {text}",
            valid_types=["health", "life", "general"],
            extra={"version": "M6"},
        )
        assert len(config.categories) == 2
        assert "{text}" in config.prompt_template
        assert "health" in config.valid_types
        assert config.extra["version"] == "M6"

    def test_classification_config_defaults(self):
        """ClassificationConfig 기본값"""
        config = ClassificationConfig(
            categories=[],
            prompt_template="",
        )
        assert config.valid_types == []
        assert config.extra == {}

    def test_hook_result_creation(self):
        """HookResult 생성"""
        result = HookResult(
            action=StageHookAction.NOTIFY,
            payload={"channel": "sse", "event": "ar_detected"},
        )
        assert result.action == StageHookAction.NOTIFY
        assert result.payload["channel"] == "sse"

    def test_hook_result_default_payload(self):
        """HookResult 기본 payload는 빈 dict"""
        result = HookResult(action=StageHookAction.NOOP)
        assert result.payload == {}

    def test_stage_hook_action_values(self):
        """StageHookAction 열거형 값"""
        assert StageHookAction.NOTIFY.value == "notify"
        assert StageHookAction.UPDATE_STATUS.value == "update_status"
        assert StageHookAction.TRIGGER_PROCESS.value == "trigger_process"
        assert StageHookAction.SKIP_REMAINING.value == "skip_remaining"
        assert StageHookAction.NOOP.value == "noop"


# ---------------------------------------------------------------------------
# 5. Storage ABC 계약 테스트 — abstract 메서드 목록 검증
# ---------------------------------------------------------------------------

class TestStorageABCContract:
    """DocumentStore, JobQueue ABC의 abstract 메서드 목록 검증"""

    def test_document_store_abstract_methods(self):
        """DocumentStore의 abstract 메서드 목록"""
        expected = {
            "get_document",
            "create_document",
            "update_document",
            "update_document_status",
            "delete_document",
            "find_pending_documents",
            "find_embedding_targets",
        }
        abstract_methods = set()
        for name, method in inspect.getmembers(DocumentStore, predicate=inspect.isfunction):
            if getattr(method, "__isabstractmethod__", False):
                abstract_methods.add(name)

        assert abstract_methods == expected, (
            f"DocumentStore abstract 메서드 불일치.\n"
            f"  예상: {expected}\n"
            f"  실제: {abstract_methods}"
        )

    def test_job_queue_abstract_methods(self):
        """JobQueue의 abstract 메서드 목록"""
        expected = {"enqueue", "dequeue", "ack"}
        abstract_methods = set()
        for name, method in inspect.getmembers(JobQueue, predicate=inspect.isfunction):
            if getattr(method, "__isabstractmethod__", False):
                abstract_methods.add(name)

        assert abstract_methods == expected, (
            f"JobQueue abstract 메서드 불일치.\n"
            f"  예상: {expected}\n"
            f"  실제: {abstract_methods}"
        )

    @pytest.mark.asyncio
    async def test_job_queue_claim_stale_default(self):
        """JobQueue.claim_stale()은 기본적으로 빈 리스트 반환"""
        class MinimalQueue(JobQueue):
            async def enqueue(self, job_data):
                return "test"
            async def dequeue(self, block_ms=5000):
                return None
            async def ack(self, job_id):
                return True

        queue = MinimalQueue()
        result = await queue.claim_stale()
        assert result == [], f"claim_stale() 기본값은 빈 리스트여야 합니다: {result}"

    @pytest.mark.asyncio
    async def test_document_store_insert_error_default(self):
        """DocumentStore.insert_error()는 기본적으로 빈 문자열 반환"""
        class MinimalStore(DocumentStore):
            async def get_document(self, doc_id):
                return None
            async def create_document(self, data):
                return "test"
            async def update_document(self, doc_id, updates):
                return True
            async def update_document_status(self, doc_id, status, overall_status, **extra):
                return True
            async def delete_document(self, doc_id):
                return True
            async def find_pending_documents(self, filter_type, **kwargs):
                return []
            async def find_embedding_targets(self):
                return []

        store = MinimalStore()
        result = await store.insert_error({"error": "test"})
        assert result == ""

    def test_document_store_all_methods_are_async(self):
        """DocumentStore의 모든 abstract 메서드가 async인지"""
        for name, method in inspect.getmembers(DocumentStore, predicate=inspect.isfunction):
            if getattr(method, "__isabstractmethod__", False):
                assert asyncio.iscoroutinefunction(method), (
                    f"DocumentStore.{name}이 async가 아닙니다."
                )

    def test_job_queue_all_methods_are_async(self):
        """JobQueue의 모든 abstract 메서드가 async인지"""
        for name, method in inspect.getmembers(JobQueue, predicate=inspect.isfunction):
            if getattr(method, "__isabstractmethod__", False):
                assert asyncio.iscoroutinefunction(method), (
                    f"JobQueue.{name}이 async가 아닙니다."
                )


# ---------------------------------------------------------------------------
# 6. 계약 준수 헬퍼 — 새로운 어댑터 구현 시 재사용 가능
# ---------------------------------------------------------------------------

def assert_adapter_contract(adapter_class: type) -> None:
    """주어진 어댑터 클래스가 DomainAdapter 계약을 준수하는지 검증

    Phase 4 PoC에서 새로운 도메인 어댑터를 검증할 때 재사용 가능.

    Usage:
        assert_adapter_contract(LegalDomainAdapter)
    """
    # 인스턴스화 가능한지
    assert issubclass(adapter_class, DomainAdapter), (
        f"{adapter_class.__name__}이 DomainAdapter를 상속하지 않습니다."
    )

    adapter = adapter_class()
    assert isinstance(adapter, DomainAdapter)

    # 모든 abstract 메서드 구현되었는지
    for name, method in inspect.getmembers(DomainAdapter, predicate=inspect.isfunction):
        if getattr(method, "__isabstractmethod__", False):
            impl = getattr(adapter_class, name, None)
            assert impl is not None, f"{adapter_class.__name__}.{name} 미구현"
            assert not getattr(impl, "__isabstractmethod__", False), (
                f"{adapter_class.__name__}.{name}이 여전히 abstract"
            )


class TestContractHelper:
    """계약 준수 헬퍼 함수 자체 검증"""

    def test_insurance_adapter_passes_contract(self):
        """InsuranceDomainAdapter가 계약 헬퍼를 통과하는지"""
        assert_adapter_contract(InsuranceDomainAdapter)
