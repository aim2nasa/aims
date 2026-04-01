"""
xPipe Provider 추상화 테스트

- ABC 완전성 (인스턴스화 불가, 필수 메서드 정의)
- ProviderRegistry 등록/조회/폴백
- CostTracker 기록/요약/필터링
- 폴백 체인 동작 (1순위 실패 → 2순위 자동 전환)
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

from xpipe.providers import EmbeddingProvider, LLMProvider, OCRProvider
from xpipe.provider_registry import ProviderRegistry
from xpipe.cost_tracker import CostTracker, UsageRecord


# ===========================================================================
# 테스트용 구현체 (Stub)
# ===========================================================================


class StubLLM(LLMProvider):
    """테스트용 LLM Provider"""

    def __init__(self, name: str = "stub-llm", fail: bool = False):
        self._name = name
        self._fail = fail

    async def complete(self, system_prompt: str, user_prompt: str, **kwargs: Any) -> dict[str, Any]:
        if self._fail:
            raise RuntimeError(f"{self._name} 호출 실패")
        return {
            "content": f"응답: {user_prompt[:20]}",
            "usage": {"input_tokens": 100, "output_tokens": 50},
            "model": "stub-model",
        }

    def get_name(self) -> str:
        return self._name

    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        return (input_tokens * 0.00001) + (output_tokens * 0.00003)


class StubOCR(OCRProvider):
    """테스트용 OCR Provider"""

    def __init__(self, name: str = "stub-ocr", fail: bool = False):
        self._name = name
        self._fail = fail

    async def process(self, file_path: str, **kwargs: Any) -> dict[str, Any]:
        if self._fail:
            raise RuntimeError(f"{self._name} 처리 실패")
        return {
            "text": f"OCR 결과: {file_path}",
            "pages": 1,
            "confidence": 0.95,
        }

    def get_name(self) -> str:
        return self._name


class StubEmbedding(EmbeddingProvider):
    """테스트용 Embedding Provider"""

    def __init__(self, name: str = "stub-embed", dimensions: int = 1536, fail: bool = False):
        self._name = name
        self._dimensions = dimensions
        self._fail = fail

    async def embed(self, texts: list[str], **kwargs: Any) -> list[list[float]]:
        if self._fail:
            raise RuntimeError(f"{self._name} 임베딩 실패")
        return [[0.1] * self._dimensions for _ in texts]

    def get_name(self) -> str:
        return self._name

    def get_dimensions(self) -> int:
        return self._dimensions


# ===========================================================================
# ABC 완전성 테스트
# ===========================================================================


class TestABCCompleteness:
    """ABC가 직접 인스턴스화 불가하고, 필수 메서드가 정의되어 있는지 검증"""

    def test_llm_provider_cannot_instantiate(self):
        """LLMProvider는 직접 인스턴스화 불가"""
        with pytest.raises(TypeError):
            LLMProvider()  # type: ignore[abstract]

    def test_ocr_provider_cannot_instantiate(self):
        """OCRProvider는 직접 인스턴스화 불가"""
        with pytest.raises(TypeError):
            OCRProvider()  # type: ignore[abstract]

    def test_embedding_provider_cannot_instantiate(self):
        """EmbeddingProvider는 직접 인스턴스화 불가"""
        with pytest.raises(TypeError):
            EmbeddingProvider()  # type: ignore[abstract]

    def test_llm_provider_abstract_methods(self):
        """LLMProvider 필수 abstract 메서드 목록 확인"""
        abstract_methods = LLMProvider.__abstractmethods__
        assert "complete" in abstract_methods
        assert "get_name" in abstract_methods
        assert "estimate_cost" in abstract_methods

    def test_ocr_provider_abstract_methods(self):
        """OCRProvider 필수 abstract 메서드 목록 확인"""
        abstract_methods = OCRProvider.__abstractmethods__
        assert "process" in abstract_methods
        assert "get_name" in abstract_methods

    def test_embedding_provider_abstract_methods(self):
        """EmbeddingProvider 필수 abstract 메서드 목록 확인"""
        abstract_methods = EmbeddingProvider.__abstractmethods__
        assert "embed" in abstract_methods
        assert "get_name" in abstract_methods
        assert "get_dimensions" in abstract_methods


class TestStubProviders:
    """Stub 구현체가 ABC 계약을 충족하는지 검증"""

    def test_stub_llm_is_llm_provider(self):
        """StubLLM은 LLMProvider의 인스턴스"""
        stub = StubLLM()
        assert isinstance(stub, LLMProvider)

    def test_stub_ocr_is_ocr_provider(self):
        """StubOCR은 OCRProvider의 인스턴스"""
        stub = StubOCR()
        assert isinstance(stub, OCRProvider)

    def test_stub_embedding_is_embedding_provider(self):
        """StubEmbedding은 EmbeddingProvider의 인스턴스"""
        stub = StubEmbedding()
        assert isinstance(stub, EmbeddingProvider)

    @pytest.mark.asyncio
    async def test_stub_llm_complete(self):
        """StubLLM.complete() 호출"""
        stub = StubLLM()
        result = await stub.complete("시스템", "사용자 입력")
        assert "content" in result
        assert "usage" in result
        assert result["usage"]["input_tokens"] == 100

    @pytest.mark.asyncio
    async def test_stub_ocr_process(self):
        """StubOCR.process() 호출"""
        stub = StubOCR()
        result = await stub.process("/tmp/test.pdf")
        assert "text" in result
        assert result["pages"] == 1

    @pytest.mark.asyncio
    async def test_stub_embedding_embed(self):
        """StubEmbedding.embed() 호출"""
        stub = StubEmbedding(dimensions=3)
        result = await stub.embed(["텍스트1", "텍스트2"])
        assert len(result) == 2
        assert len(result[0]) == 3

    def test_stub_llm_name(self):
        """StubLLM.get_name() 반환"""
        assert StubLLM("my-llm").get_name() == "my-llm"

    def test_stub_llm_estimate_cost(self):
        """StubLLM.estimate_cost() 계산"""
        stub = StubLLM()
        cost = stub.estimate_cost(1000, 500)
        assert cost > 0

    def test_stub_embedding_dimensions(self):
        """StubEmbedding.get_dimensions() 반환"""
        assert StubEmbedding(dimensions=768).get_dimensions() == 768


# ===========================================================================
# ProviderRegistry 테스트
# ===========================================================================


class TestProviderRegistryBasic:
    """ProviderRegistry 기본 등록/조회"""

    def test_register_and_get(self):
        """등록 후 조회"""
        registry = ProviderRegistry()
        llm = StubLLM("test-llm")
        registry.register("llm", llm)
        assert registry.get("llm") is llm

    def test_get_unregistered_role_raises(self):
        """미등록 role 조회 시 KeyError"""
        registry = ProviderRegistry()
        with pytest.raises(KeyError, match="llm"):
            registry.get("llm")

    def test_register_multiple_roles(self):
        """여러 role 등록"""
        registry = ProviderRegistry()
        llm = StubLLM()
        ocr = StubOCR()
        embed = StubEmbedding()
        registry.register("llm", llm)
        registry.register("ocr", ocr)
        registry.register("embedding", embed)

        assert registry.get("llm") is llm
        assert registry.get("ocr") is ocr
        assert registry.get("embedding") is embed

    def test_list_roles(self):
        """등록된 role 목록"""
        registry = ProviderRegistry()
        registry.register("llm", StubLLM())
        registry.register("ocr", StubOCR())
        roles = registry.list_roles()
        assert "llm" in roles
        assert "ocr" in roles

    def test_list_roles_empty(self):
        """빈 registry → 빈 목록"""
        registry = ProviderRegistry()
        assert registry.list_roles() == []


class TestProviderRegistryPriority:
    """ProviderRegistry priority 기반 정렬"""

    def test_higher_priority_first(self):
        """높은 priority의 Provider가 우선"""
        registry = ProviderRegistry()
        low = StubLLM("low")
        high = StubLLM("high")
        registry.register("llm", low, priority=1)
        registry.register("llm", high, priority=10)
        assert registry.get("llm") is high

    def test_default_priority_zero(self):
        """기본 priority는 0"""
        registry = ProviderRegistry()
        first = StubLLM("first")
        second = StubLLM("second")
        registry.register("llm", first)
        registry.register("llm", second, priority=1)
        assert registry.get("llm") is second

    def test_same_priority_order(self):
        """같은 priority면 나중에 등록된 것이 뒤에"""
        registry = ProviderRegistry()
        a = StubLLM("a")
        b = StubLLM("b")
        registry.register("llm", a, priority=5)
        registry.register("llm", b, priority=5)
        chain = registry.get_fallback("llm")
        assert len(chain) == 2


class TestProviderRegistryFallback:
    """ProviderRegistry 폴백 체인"""

    def test_get_fallback_chain(self):
        """폴백 체인이 priority 내림차순"""
        registry = ProviderRegistry()
        primary = StubLLM("primary")
        fallback = StubLLM("fallback")
        registry.register("llm", fallback, priority=1)
        registry.register("llm", primary, priority=10)

        chain = registry.get_fallback("llm")
        assert len(chain) == 2
        assert chain[0] is primary
        assert chain[1] is fallback

    def test_get_fallback_empty(self):
        """미등록 role의 폴백 → 빈 리스트"""
        registry = ProviderRegistry()
        assert registry.get_fallback("nonexistent") == []

    @pytest.mark.asyncio
    async def test_call_with_fallback_success(self):
        """1순위 성공 → 바로 반환"""
        registry = ProviderRegistry()
        registry.register("llm", StubLLM("primary"), priority=10)
        registry.register("llm", StubLLM("fallback"), priority=1)

        result = await registry.call_with_fallback(
            "llm", "complete",
            system_prompt="sys", user_prompt="hello",
        )
        assert "content" in result

    @pytest.mark.asyncio
    async def test_call_with_fallback_primary_fails(self):
        """1순위 실패 → 2순위로 전환"""
        registry = ProviderRegistry()
        registry.register("llm", StubLLM("primary", fail=True), priority=10)
        registry.register("llm", StubLLM("fallback", fail=False), priority=1)

        result = await registry.call_with_fallback(
            "llm", "complete",
            system_prompt="sys", user_prompt="hello",
        )
        assert "content" in result

    @pytest.mark.asyncio
    async def test_call_with_fallback_all_fail(self):
        """모든 Provider 실패 → RuntimeError"""
        registry = ProviderRegistry()
        registry.register("llm", StubLLM("a", fail=True), priority=10)
        registry.register("llm", StubLLM("b", fail=True), priority=1)

        with pytest.raises(RuntimeError, match="모든 Provider가.*실패"):
            await registry.call_with_fallback(
                "llm", "complete",
                system_prompt="sys", user_prompt="hello",
            )

    @pytest.mark.asyncio
    async def test_call_with_fallback_no_provider(self):
        """Provider 미등록 → KeyError"""
        registry = ProviderRegistry()
        with pytest.raises(KeyError):
            await registry.call_with_fallback("llm", "complete")


class TestProviderRegistryListProviders:
    """ProviderRegistry.list_providers() 상세 정보"""

    def test_list_providers_info(self):
        """Provider 상세 정보 반환"""
        registry = ProviderRegistry()
        registry.register("llm", StubLLM("openai"), priority=10)
        registry.register("llm", StubLLM("anthropic"), priority=5)

        info = registry.list_providers("llm")
        assert len(info) == 2
        assert info[0]["name"] == "openai"
        assert info[0]["priority"] == 10
        assert info[0]["type"] == "StubLLM"
        assert info[1]["name"] == "anthropic"
        assert info[1]["priority"] == 5

    def test_list_providers_empty_role(self):
        """미등록 role → 빈 리스트"""
        registry = ProviderRegistry()
        assert registry.list_providers("llm") == []


# ===========================================================================
# CostTracker 테스트
# ===========================================================================


def _make_record(
    provider: str = "openai",
    operation: str = "classify",
    input_tokens: int = 500,
    output_tokens: int = 100,
    cost: float = 0.001,
    timestamp: str = "2026-03-19T12:00:00",
) -> UsageRecord:
    """테스트용 UsageRecord 생성 헬퍼"""
    return UsageRecord(
        provider=provider,
        operation=operation,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        estimated_cost=cost,
        timestamp=timestamp,
    )


class TestUsageRecord:
    """UsageRecord 데이터 클래스"""

    def test_create_record(self):
        """UsageRecord 생성 및 필드 접근"""
        r = _make_record()
        assert r.provider == "openai"
        assert r.operation == "classify"
        assert r.input_tokens == 500
        assert r.output_tokens == 100
        assert r.estimated_cost == 0.001
        assert r.timestamp == "2026-03-19T12:00:00"


class TestCostTrackerRecord:
    """CostTracker 기록 추가/조회"""

    def test_record_and_get_all(self):
        """기록 추가 후 전체 조회"""
        tracker = CostTracker()
        r1 = _make_record(provider="openai")
        r2 = _make_record(provider="anthropic")
        tracker.record(r1)
        tracker.record(r2)
        all_records = tracker.get_all_records()
        assert len(all_records) == 2

    def test_get_all_defensive_copy(self):
        """get_all_records()는 방어적 복사"""
        tracker = CostTracker()
        tracker.record(_make_record())
        records = tracker.get_all_records()
        records.clear()
        assert len(tracker.get_all_records()) == 1

    def test_get_by_provider(self):
        """Provider별 필터링"""
        tracker = CostTracker()
        tracker.record(_make_record(provider="openai"))
        tracker.record(_make_record(provider="anthropic"))
        tracker.record(_make_record(provider="openai"))

        openai_records = tracker.get_by_provider("openai")
        assert len(openai_records) == 2
        assert all(r.provider == "openai" for r in openai_records)

    def test_get_by_provider_empty(self):
        """존재하지 않는 Provider → 빈 리스트"""
        tracker = CostTracker()
        tracker.record(_make_record(provider="openai"))
        assert tracker.get_by_provider("nonexistent") == []

    def test_get_by_operation(self):
        """작업별 필터링"""
        tracker = CostTracker()
        tracker.record(_make_record(operation="classify"))
        tracker.record(_make_record(operation="summarize"))
        tracker.record(_make_record(operation="classify"))

        classify_records = tracker.get_by_operation("classify")
        assert len(classify_records) == 2

    def test_clear(self):
        """전체 초기화"""
        tracker = CostTracker()
        tracker.record(_make_record())
        tracker.record(_make_record())
        tracker.clear()
        assert len(tracker.get_all_records()) == 0


class TestCostTrackerSummary:
    """CostTracker 요약 통계"""

    def test_summary_all(self):
        """전체 기간 요약"""
        tracker = CostTracker()
        tracker.record(_make_record(provider="openai", operation="classify", cost=0.001, input_tokens=500, output_tokens=100))
        tracker.record(_make_record(provider="openai", operation="summarize", cost=0.002, input_tokens=800, output_tokens=200))
        tracker.record(_make_record(provider="upstage", operation="ocr", cost=0.005, input_tokens=0, output_tokens=0))

        summary = tracker.get_summary("all")
        assert summary["total_records"] == 3
        assert summary["total_cost"] == pytest.approx(0.008, abs=0.0001)
        assert summary["total_input_tokens"] == 1300
        assert summary["total_output_tokens"] == 300
        assert summary["period"] == "all"

        # Provider별 집계
        assert "openai" in summary["by_provider"]
        assert summary["by_provider"]["openai"]["count"] == 2
        assert "upstage" in summary["by_provider"]

        # 작업별 집계
        assert "classify" in summary["by_operation"]
        assert "summarize" in summary["by_operation"]
        assert "ocr" in summary["by_operation"]

    def test_summary_empty(self):
        """빈 tracker → 전체 0"""
        tracker = CostTracker()
        summary = tracker.get_summary("all")
        assert summary["total_records"] == 0
        assert summary["total_cost"] == 0.0
        assert summary["total_input_tokens"] == 0
        assert summary["total_output_tokens"] == 0
        assert summary["by_provider"] == {}
        assert summary["by_operation"] == {}

    def test_summary_by_day(self):
        """day 필터 — 타임스탬프 기반"""
        tracker = CostTracker()
        # 오늘과 다른 날짜
        tracker.record(_make_record(timestamp="2020-01-01T12:00:00"))
        tracker.record(_make_record(timestamp="2020-01-01T13:00:00"))

        summary = tracker.get_summary("day")
        # 오늘 날짜가 2020-01-01이 아니므로 0건이어야 함
        assert summary["total_records"] == 0

    def test_summary_unknown_period(self):
        """알 수 없는 period → 전체 반환"""
        tracker = CostTracker()
        tracker.record(_make_record())
        summary = tracker.get_summary("unknown_period")
        assert summary["total_records"] == 1

    def test_summary_provider_aggregation(self):
        """Provider별 집계 정확성"""
        tracker = CostTracker()
        tracker.record(_make_record(provider="a", cost=0.01, input_tokens=100, output_tokens=50))
        tracker.record(_make_record(provider="a", cost=0.02, input_tokens=200, output_tokens=100))
        tracker.record(_make_record(provider="b", cost=0.03, input_tokens=300, output_tokens=150))

        summary = tracker.get_summary()
        a_stats = summary["by_provider"]["a"]
        assert a_stats["count"] == 2
        assert a_stats["cost"] == pytest.approx(0.03)
        assert a_stats["input_tokens"] == 300
        assert a_stats["output_tokens"] == 150

        b_stats = summary["by_provider"]["b"]
        assert b_stats["count"] == 1


# ===========================================================================
# UpstageOCRProvider 테스트
# ===========================================================================


class TestUpstageOCRProvider:
    """UpstageOCRProvider 구현체 테스트"""

    def test_is_ocr_provider(self):
        """OCRProvider ABC를 올바르게 구현"""
        from xpipe.providers_builtin import UpstageOCRProvider
        provider = UpstageOCRProvider()
        assert isinstance(provider, OCRProvider)

    def test_get_name(self):
        """이름은 'upstage'"""
        from xpipe.providers_builtin import UpstageOCRProvider
        assert UpstageOCRProvider().get_name() == "upstage"

    def test_api_key_from_constructor(self):
        """생성자로 전달한 키가 우선"""
        from xpipe.providers_builtin import UpstageOCRProvider
        p = UpstageOCRProvider(api_key="test-key-123")
        assert p.api_key == "test-key-123"

    def test_no_env_fallback(self, monkeypatch):
        """생성자 키가 없으면 환경변수 참조 없이 빈 문자열"""
        from xpipe.providers_builtin import UpstageOCRProvider
        monkeypatch.setenv("UPSTAGE_API_KEY", "env-key-456")
        p = UpstageOCRProvider()
        # 환경변수 fallback이 없으므로 빈 문자열
        assert p.api_key == ""

    def test_api_key_empty_raises(self):
        """API 키 없으면 RuntimeError"""
        from xpipe.providers_builtin import UpstageOCRProvider
        p = UpstageOCRProvider(api_key="")
        with pytest.raises(RuntimeError, match="API 키가 설정되지 않았습니다"):
            asyncio.get_event_loop().run_until_complete(p.process("/dummy.png"))

    def test_set_api_key(self):
        """런타임 키 변경"""
        from xpipe.providers_builtin import UpstageOCRProvider
        p = UpstageOCRProvider()
        p.set_api_key("new-key")
        assert p.api_key == "new-key"

    def test_registry_integration(self):
        """ProviderRegistry에 등록 + 조회"""
        from xpipe.providers_builtin import UpstageOCRProvider
        registry = ProviderRegistry()
        provider = UpstageOCRProvider(api_key="test")
        registry.register("ocr", provider, priority=10)
        assert registry.get("ocr") is provider
        assert registry.get("ocr").get_name() == "upstage"


# ===========================================================================
# ExtractStage OCR 연동 테스트
# ===========================================================================


class TestExtractStageOCR:
    """ExtractStage에서 이미지 파일 OCR 처리 테스트"""

    def test_image_stub_mode_no_ocr_call(self):
        """시뮬레이션 모드에서는 OCR 호출하지 않고 안내 메시지 반환"""
        from xpipe.stages.extract import ExtractStage
        stage = ExtractStage()
        context = {
            "file_path": "/dummy/test.png",
            "filename": "test.png",
            "mime_type": "image/png",
            "mode": "stub",
            "models": {"ocr": "upstage"},
        }
        result = asyncio.get_event_loop().run_until_complete(stage.execute(context))
        text = result.get("extracted_text", "")
        assert "시뮬레이션 모드" in text
        assert "OCR" in text

    def test_image_real_mode_with_registry(self):
        """실제 실행 모드 + Registry에 StubOCR 등록 → OCR 결과 반환"""
        from xpipe.stages.extract import ExtractStage
        registry = ProviderRegistry()
        registry.register("ocr", StubOCR("test-ocr"), priority=10)

        stage = ExtractStage()
        context = {
            "file_path": "/dummy/test.jpg",
            "filename": "test.jpg",
            "mime_type": "image/jpeg",
            "mode": "real",
            "models": {"ocr": "upstage"},
            "_provider_registry": registry,
        }
        result = asyncio.get_event_loop().run_until_complete(stage.execute(context))
        text = result.get("extracted_text", "")
        assert "OCR 결과" in text
        # stage_data에 실제 사용된 provider 이름이 기록되어야 함
        ocr_model = result.get("stage_data", {}).get("extract", {}).get("output", {}).get("ocr_model")
        assert ocr_model == "test-ocr"

    def test_image_real_mode_no_registry_no_key(self):
        """실제 실행 모드 + Registry 없음 + API 키 없음 → RuntimeError"""
        from xpipe.stages.extract import ExtractStage
        import os
        old = os.environ.pop("UPSTAGE_API_KEY", None)
        try:
            stage = ExtractStage()
            context = {
                "file_path": "/dummy/test.jpg",
                "filename": "test.jpg",
                "mime_type": "image/jpeg",
                "mode": "real",
                "models": {"ocr": "upstage"},
                "_api_keys": {"upstage": ""},
            }
            with pytest.raises(RuntimeError, match="UPSTAGE_API_KEY"):
                asyncio.get_event_loop().run_until_complete(stage.execute(context))
        finally:
            if old is not None:
                os.environ["UPSTAGE_API_KEY"] = old

    def test_image_real_mode_fallback_chain(self):
        """1순위 실패 → 2순위 자동 전환"""
        from xpipe.stages.extract import ExtractStage
        registry = ProviderRegistry()
        registry.register("ocr", StubOCR("fail-ocr", fail=True), priority=10)
        registry.register("ocr", StubOCR("backup-ocr"), priority=5)

        stage = ExtractStage()
        context = {
            "file_path": "/dummy/test.png",
            "filename": "test.png",
            "mime_type": "image/png",
            "mode": "real",
            "models": {"ocr": "upstage"},
            "_provider_registry": registry,
        }
        result = asyncio.get_event_loop().run_until_complete(stage.execute(context))
        text = result.get("extracted_text", "")
        assert "OCR 결과" in text  # backup-ocr가 성공

    def test_pdf_scan_ocr_fallback_no_key(self):
        """스캔 PDF(텍스트 0) + API 키 없음 → OCR 폴백 시 RuntimeError"""
        from xpipe.stages.extract import ExtractStage
        import tempfile, os
        stage = ExtractStage()
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"%PDF-1.4 dummy")
            tmp = f.name
        try:
            context = {
                "file_path": tmp,
                "filename": "test.pdf",
                "mime_type": "application/pdf",
                "mode": "real",
                "models": {"ocr": "upstage"},
                "_api_keys": {"upstage": ""},
            }
            result = asyncio.get_event_loop().run_until_complete(stage.execute(context))
            assert result.get("text_extraction_failed") is True
        finally:
            os.unlink(tmp)
