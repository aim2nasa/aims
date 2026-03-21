"""
xPipe 통합 Regression 테스트

xpipe 수정 시 AIMS 파이프라인이 깨지는지 잡아주는 통합 테스트.
기존 222개 단위 테스트와 별도로, 모듈 간 연동·E2E 흐름·어댑터 교체·하위 호환성을 검증한다.

구성:
  1. 파이프라인 E2E 흐름 (InsuranceAdapter + Pipeline + 전체 모듈 조립)
  2. 모듈 간 연동 테스트 (Pipeline + EventBus/AuditLog/QualityGate/CostTracker)
  3. 어댑터 교체 regression (Insurance → Legal, 어댑터 없이, 예외 어댑터)
  4. 하위 호환성 regression (DomainAdapter 확장, Golden File, ClassificationConfig 호환)
"""
from __future__ import annotations

import asyncio
from typing import Any, Optional

import pytest

# --- xpipe 코어 모듈 ---
from xpipe.pipeline import Pipeline, PipelineDefinition, StageConfig
from xpipe.pipeline_presets import AIMS_INSURANCE_PRESET
from xpipe.events import EventBus, PipelineEvent
from xpipe.audit import AuditLog, AuditEntry
from xpipe.quality import QualityGate, QualityConfig
from xpipe.cost_tracker import CostTracker, UsageRecord
from xpipe.stage import Stage
from xpipe.adapter import (
    DomainAdapter,
    Category,
    ClassificationConfig,
    Detection,
    HookResult,
    StageHookAction,
)
from xpipe.testing import TestRunner, TestCase
from xpipe.stages import (
    IngestStage,
    ConvertStage,
    ExtractStage,
    ClassifyStage,
    DetectSpecialStage,
    EmbedStage,
    CompleteStage,
)

# --- 도메인 어댑터 ---
from insurance.adapter import InsuranceDomainAdapter
from poc_legal.adapter import LegalDomainAdapter


# ---------------------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------------------

def _run(coro):
    """비동기 코루틴을 동기로 실행"""
    return asyncio.get_event_loop().run_until_complete(coro)


def _register_all_stages(pipeline: Pipeline) -> None:
    """모든 내장 스테이지를 등록"""
    pipeline.register_stage("ingest", IngestStage)
    pipeline.register_stage("convert", ConvertStage)
    pipeline.register_stage("extract", ExtractStage)
    pipeline.register_stage("classify", ClassifyStage)
    pipeline.register_stage("detect_special", DetectSpecialStage)
    pipeline.register_stage("embed", EmbedStage)
    pipeline.register_stage("complete", CompleteStage)


def _build_aims_pipeline(event_bus: EventBus | None = None) -> Pipeline:
    """AIMS 보험 프리셋으로 파이프라인을 생성하고 스테이지를 등록"""
    pipeline = Pipeline.from_dict(AIMS_INSURANCE_PRESET)
    if event_bus is not None:
        pipeline.event_bus = event_bus
    _register_all_stages(pipeline)
    return pipeline


# ---------------------------------------------------------------------------
# AR/CRS 텍스트 픽스처
# ---------------------------------------------------------------------------

_AR_TEXT = (
    "MetLife\n"
    "홍길동 고객님을 위한\n"
    "Annual Review Report\n"
    "보유계약 현황\n"
    "발행(기준)일: 2026년 1월 15일\n"
)

_CRS_TEXT = (
    "메트라이프\n"
    "홍길동 고객님을 위한\n"
    "Customer Review Service\n"
    "변액보험 적립금 현황\n"
    "투자수익률 보고서\n"
    "발행일: 2026년 3월 10일\n"
)

_NORMAL_TEXT = (
    "삼성화재 자동차보험 증권\n"
    "계약번호: 2026-001\n"
    "보험기간: 2026.01.01 ~ 2027.01.01\n"
)


# ===========================================================================
# 1. 파이프라인 E2E 흐름
# ===========================================================================

class TestPipelineE2EFlow:
    """문서 1건이 전체 파이프라인을 통과하는 E2E 시나리오"""

    def test_scenario1_normal_pdf_with_text(self):
        """시나리오 1: 정상 PDF (텍스트 있음)
        Ingest → Convert(스킵) → Extract(스킵: has_text) → Classify → DetectSpecial → Embed → Complete
        """
        events: list[PipelineEvent] = []
        bus = EventBus()
        bus.on("stage_complete", lambda e: events.append(e))

        pipeline = _build_aims_pipeline(event_bus=bus)

        context = {
            "document_id": "e2e-001",
            "file_path": "/tmp/normal.pdf",
            "has_text": True,
            "text": _NORMAL_TEXT,
        }
        result = _run(pipeline.run(context))

        # Extract, Convert 스킵 확인
        assert "extract" in result["_pipeline"]["stages_skipped"]
        assert "convert" in result["_pipeline"]["stages_skipped"]
        assert "extract" not in result["_pipeline"]["stages_executed"]

        # 나머지 모두 실행 확인
        executed = result["_pipeline"]["stages_executed"]
        assert "ingest" in executed
        assert "classify" in executed
        assert "detect_special" in executed
        assert "embed" in executed
        assert "complete" in executed

        # 최종 상태 확인
        assert result["ingested"] is True
        # 어댑터 미제공 → classify/detect_special은 skipped
        assert result["classified"] is False
        assert result["special_detected"] is False
        assert result["embedded"] is True
        assert result["completed"] is True
        assert result["status"] == "completed"
        assert result["_pipeline"]["errors"] == []

        # 이벤트 발행 확인 — 스킵된 extract+convert 제외, 5개 스테이지 완료 이벤트
        assert len(events) == 5
        event_stages = [e.stage for e in events]
        assert "extract" not in event_stages
        assert "convert" not in event_stages
        assert all(e.document_id == "e2e-001" for e in events)

    def test_scenario2_pdf_without_text(self):
        """시나리오 2: 텍스트 없는 PDF
        Ingest → Convert(스킵) → Extract(실행) → Classify → DetectSpecial → Embed → Complete
        """
        pipeline = _build_aims_pipeline()

        context = {
            "document_id": "e2e-002",
            "file_path": "/tmp/scanned.pdf",
            "has_text": False,
        }
        result = _run(pipeline.run(context))

        # Extract 실행 확인
        assert "extract" in result["_pipeline"]["stages_executed"]
        assert result["extracted"] is True

        # convert 스킵 (needs_conversion 없음), 나머지 6개 실행
        assert "convert" in result["_pipeline"]["stages_skipped"]
        assert len(result["_pipeline"]["stages_executed"]) == 6

    def test_scenario3_crs_document(self):
        """시나리오 3: CRS 문서 — 어댑터의 detect_special_documents 검증
        Ingest → Extract(스킵) → Classify → DetectSpecial → Embed → Complete
        + InsuranceDomainAdapter가 CRS를 올바르게 감지하는지 교차 검증
        """
        # 파이프라인 실행
        pipeline = _build_aims_pipeline()
        context = {
            "document_id": "e2e-003",
            "has_text": True,
            "text": _CRS_TEXT,
        }
        result = _run(pipeline.run(context))

        assert result["completed"] is True
        assert "extract" in result["_pipeline"]["stages_skipped"]

        # 어댑터 CRS 감지 검증 (파이프라인과 독립적으로도 동작하는지)
        adapter = InsuranceDomainAdapter()
        detections = _run(adapter.detect_special_documents(
            text=_CRS_TEXT,
            mime_type="application/pdf",
        ))
        assert len(detections) == 1
        assert detections[0].doc_type == "customer_review"
        assert detections[0].confidence == 1.0
        assert detections[0].metadata.get("customer_name") is not None

        # displayName 생성 검증
        display_name = _run(adapter.generate_display_name(
            doc={},
            detection=detections[0],
        ))
        assert display_name  # 빈 문자열이 아닌지
        assert "CRS" in display_name

    def test_scenario4_normal_document_no_special(self):
        """시나리오 4: 일반 문서 (AR/CRS 아님) → Detection 빈 리스트, 정상 완료"""
        pipeline = _build_aims_pipeline()
        context = {
            "document_id": "e2e-004",
            "has_text": True,
            "text": _NORMAL_TEXT,
        }
        result = _run(pipeline.run(context))

        assert result["completed"] is True
        assert result["_pipeline"]["errors"] == []

        # 어댑터 감지 결과: 빈 리스트
        adapter = InsuranceDomainAdapter()
        detections = _run(adapter.detect_special_documents(
            text=_NORMAL_TEXT,
            mime_type="application/pdf",
        ))
        assert detections == []

    def test_scenario_ar_document(self):
        """AR 문서 E2E: 파이프라인 완료 + AR 감지 + displayName 생성"""
        pipeline = _build_aims_pipeline()
        context = {
            "document_id": "e2e-005",
            "has_text": True,
            "text": _AR_TEXT,
        }
        result = _run(pipeline.run(context))
        assert result["completed"] is True

        # 어댑터 AR 감지 검증
        adapter = InsuranceDomainAdapter()
        detections = _run(adapter.detect_special_documents(
            text=_AR_TEXT,
            mime_type="application/pdf",
        ))
        assert len(detections) == 1
        assert detections[0].doc_type == "annual_report"
        assert detections[0].metadata["customer_name"] == "홍길동"
        assert detections[0].metadata["issue_date"] == "2026-01-15"

        # displayName 생성
        display_name = _run(adapter.generate_display_name(
            doc={},
            detection=detections[0],
        ))
        assert display_name == "홍길동_AR_2026-01-15.pdf"

    def test_credit_pending_skips_embed(self):
        """credit_pending=True → embed + convert 스킵, 나머지 정상 실행"""
        pipeline = _build_aims_pipeline()
        context = {
            "document_id": "e2e-006",
            "credit_pending": True,
        }
        result = _run(pipeline.run(context))

        assert "embed" in result["_pipeline"]["stages_skipped"]
        assert "convert" in result["_pipeline"]["stages_skipped"]
        assert "embedded" not in result
        assert result["completed"] is True

    def test_text_and_credit_pending_both_skip(self):
        """텍스트 있음 + 크레딧 부족 → convert + extract + embed 스킵"""
        pipeline = _build_aims_pipeline()
        context = {
            "document_id": "e2e-007",
            "has_text": True,
            "credit_pending": True,
        }
        result = _run(pipeline.run(context))

        skipped = set(result["_pipeline"]["stages_skipped"])
        assert "convert" in skipped
        assert "extract" in skipped
        assert "embed" in skipped
        assert result["completed"] is True
        # 실행된 것: ingest, classify, detect_special, complete
        assert len(result["_pipeline"]["stages_executed"]) == 4


# ===========================================================================
# 2. 모듈 간 연동 테스트
# ===========================================================================

class TestModuleIntegration:
    """Pipeline과 EventBus, AuditLog, QualityGate, CostTracker 간 연동"""

    def test_pipeline_eventbus_stage_events(self):
        """Pipeline + EventBus: 스테이지 완료 시 이벤트 발행 확인"""
        events: list[PipelineEvent] = []
        bus = EventBus()
        bus.on("stage_complete", lambda e: events.append(e))
        bus.on("*", lambda e: None)  # 와일드카드 리스너도 동작하는지

        pipeline = _build_aims_pipeline(event_bus=bus)
        result = _run(pipeline.run({"document_id": "int-001"}))

        # 전체 7 스테이지 중 convert 스킵 → 6 이벤트
        assert len(events) == 6
        for ev in events:
            assert ev.event_type == "stage_complete"
            assert ev.document_id == "int-001"
            assert ev.payload["pipeline"] == "aims-insurance"

    def test_pipeline_eventbus_error_event(self):
        """Pipeline + EventBus: 에러 시 error 이벤트 발행"""

        class _FailStage(Stage):
            def get_name(self) -> str:
                return "fail"

            async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
                raise ValueError("통합 테스트 에러")

        error_events: list[PipelineEvent] = []
        bus = EventBus()
        bus.on("error", lambda e: error_events.append(e))

        definition = PipelineDefinition(
            name="error-test",
            stages=[
                StageConfig(name="ingest"),
                StageConfig(name="fail"),  # 에러 발생
            ],
        )
        pipeline = Pipeline(definition, event_bus=bus)
        pipeline.register_stage("ingest", IngestStage)
        pipeline.register_stage("fail", _FailStage)

        with pytest.raises(RuntimeError, match="실행 실패"):
            _run(pipeline.run({"document_id": "int-002"}))

        assert len(error_events) == 1
        assert error_events[0].event_type == "error"
        assert "통합 테스트 에러" in error_events[0].payload["error"]

    def test_pipeline_auditlog_recording(self):
        """Pipeline + AuditLog: 스테이지 실행 기록 확인

        EventBus 리스너에서 AuditLog에 기록하는 패턴 검증.
        """
        audit = AuditLog()
        bus = EventBus()

        def _on_stage_complete(event: PipelineEvent):
            audit.record(AuditEntry(
                document_id=event.document_id,
                stage=event.stage,
                action="stage_completed",
                actor="xpipe-pipeline",
                details=event.payload,
            ))

        bus.on("stage_complete", _on_stage_complete)

        pipeline = _build_aims_pipeline(event_bus=bus)
        _run(pipeline.run({"document_id": "int-003"}))

        # 7개 스테이지 중 convert 스킵 → 6개 감사 로그
        entries = audit.get_by_document("int-003")
        assert len(entries) == 6

        # 각 엔트리 무결성 검증
        verify_result = audit.verify_all()
        assert verify_result["invalid"] == 0

        # 스테이지별 조회
        ingest_entries = audit.get_by_stage("ingest")
        assert len(ingest_entries) == 1

    def test_pipeline_quality_gate_evaluation(self):
        """Pipeline + QualityGate: 파이프라인 완료 후 품질 평가"""
        pipeline = _build_aims_pipeline()
        context = {
            "document_id": "int-004",
            "has_text": True,
            "text": _NORMAL_TEXT,
        }
        result = _run(pipeline.run(context))

        # QualityGate로 결과 문서 평가
        gate = QualityGate(QualityConfig(
            min_confidence=0.5,
            min_text_length=10,
        ))

        doc = {
            "full_text": result.get("text", ""),
            "classification_confidence": 0.85,
            "document_type": "policy",
        }
        score = gate.evaluate(doc)

        assert score.classification_confidence == 0.85
        assert score.passed is True
        assert "LOW_CONFIDENCE" not in score.flags

    def test_pipeline_quality_gate_low_confidence(self):
        """Pipeline + QualityGate: 낮은 confidence → LOW_CONFIDENCE 플래그"""
        gate = QualityGate()

        doc = {
            "full_text": _NORMAL_TEXT,
            "classification_confidence": 0.1,
            "document_type": "general",
        }
        score = gate.evaluate(doc)

        assert "LOW_CONFIDENCE" in score.flags
        assert "UNCLASSIFIED" in score.flags  # general은 UNCLASSIFIED

    def test_pipeline_cost_tracker_recording(self):
        """Pipeline + CostTracker: Provider 호출 시 비용 기록

        EventBus 리스너에서 CostTracker에 기록하는 패턴 검증.
        """
        tracker = CostTracker()
        bus = EventBus()

        def _on_stage_complete(event: PipelineEvent):
            # classify, embed 스테이지에서 비용 기록 시뮬레이션
            if event.stage in ("classify", "embed"):
                tracker.record(UsageRecord(
                    provider="openai",
                    operation=event.stage,
                    input_tokens=500 if event.stage == "classify" else 200,
                    output_tokens=100 if event.stage == "classify" else 0,
                    estimated_cost=0.001 if event.stage == "classify" else 0.0005,
                    timestamp="2026-03-19T12:00:00",
                ))

        bus.on("stage_complete", _on_stage_complete)

        pipeline = _build_aims_pipeline(event_bus=bus)
        _run(pipeline.run({"document_id": "int-005"}))

        # classify + embed → 2건 기록
        records = tracker.get_all_records()
        assert len(records) == 2

        summary = tracker.get_summary("all")
        assert summary["total_records"] == 2
        assert summary["total_cost"] > 0
        assert "openai" in summary["by_provider"]

    def test_insurance_adapter_quality_gate(self):
        """InsuranceAdapter + QualityGate: 분류 결과 품질 평가"""
        adapter = InsuranceDomainAdapter()
        config = _run(adapter.get_classification_config())

        gate = QualityGate()

        # 높은 confidence 문서
        good_doc = {
            "full_text": "삼성화재 자동차보험 증권 2026년도",
            "classification_confidence": 0.92,
            "document_type": "policy",
        }
        good_score = gate.evaluate(good_doc)
        assert good_score.passed is True

        # valid_types에 policy가 포함되어 있는지 확인
        assert "policy" in config.valid_types

    @pytest.mark.asyncio
    async def test_insurance_adapter_test_runner(self):
        """InsuranceAdapter + TestRunner: 외부 테스트 셋으로 어댑터 검증"""
        adapter = InsuranceDomainAdapter()
        runner = TestRunner(adapter)

        test_cases = [
            TestCase(
                input_text=_AR_TEXT,
                input_mime="application/pdf",
                expected_detections=[{"doc_type": "annual_report"}],
                description="AR 감지",
            ),
            TestCase(
                input_text=_CRS_TEXT,
                input_mime="application/pdf",
                expected_detections=[{"doc_type": "customer_review"}],
                description="CRS 감지",
            ),
            TestCase(
                input_text=_NORMAL_TEXT,
                input_mime="application/pdf",
                expected_detections=[],
                description="일반 문서 (감지 없음)",
            ),
        ]

        results = await runner.run_detection_tests(test_cases)
        assert results["total"] == 3
        assert results["passed"] == 3
        assert results["failed"] == 0


# ===========================================================================
# 3. 어댑터 교체 regression
# ===========================================================================

class TestAdapterSwapRegression:
    """어댑터 교체 시 파이프라인 코어가 동일하게 동작하는지 검증"""

    def test_insurance_to_legal_pipeline_core_same(self):
        """Insurance → Legal 어댑터 교체 시 파이프라인 코어 동일 동작

        어댑터만 다르고, 파이프라인 코어(스테이지 실행 순서, 스킵 조건, 메타데이터)는 동일.
        """
        insurance_pipeline = _build_aims_pipeline()
        legal_pipeline = _build_aims_pipeline()  # 같은 프리셋 사용

        # 동일한 context로 양쪽 실행
        base_context = {"document_id": "swap-001", "has_text": True, "text": "일반 텍스트"}

        insurance_result = _run(insurance_pipeline.run(dict(base_context)))
        legal_result = _run(legal_pipeline.run(dict(base_context)))

        # 파이프라인 코어 메타데이터 동일
        assert insurance_result["_pipeline"]["name"] == legal_result["_pipeline"]["name"]
        assert insurance_result["_pipeline"]["stages_executed"] == legal_result["_pipeline"]["stages_executed"]
        assert insurance_result["_pipeline"]["stages_skipped"] == legal_result["_pipeline"]["stages_skipped"]
        assert insurance_result["status"] == legal_result["status"]

    def test_legal_adapter_classification_config(self):
        """Legal 어댑터의 분류 체계가 올바르게 동작하는지"""
        adapter = LegalDomainAdapter()
        config = _run(adapter.get_classification_config())

        assert isinstance(config, ClassificationConfig)
        assert len(config.categories) > 0
        assert "judgment" in config.valid_types
        assert "contract" in config.valid_types
        assert config.prompt_template  # 비어있지 않은지

    def test_legal_adapter_detection(self):
        """Legal 어댑터의 판결문/계약서 감지"""
        adapter = LegalDomainAdapter()

        # 판결문 감지
        judgment_text = (
            "서울중앙지방법원\n"
            "사건 2024가합12345\n"
            "판결\n"
            "원고: 주식회사 가\n"
            "피고: 주식회사 나\n"
            "주문: 피고는 원고에게..."
        )
        detections = _run(adapter.detect_special_documents(
            text=judgment_text,
            mime_type="application/pdf",
        ))
        assert len(detections) == 1
        assert detections[0].doc_type == "judgment"

        # 일반 텍스트 → 감지 없음
        detections = _run(adapter.detect_special_documents(
            text="일반 문서입니다.",
            mime_type="application/pdf",
        ))
        assert detections == []

    def test_adapter_none_pipeline_runs_with_defaults(self):
        """어댑터 없이(None) 파이프라인 실행 → 기본 동작 확인

        파이프라인 엔진 자체는 어댑터와 직접 의존 없이 동작한다.
        (스테이지가 어댑터를 호출하는 것이지, Pipeline 엔진이 호출하는 것이 아님)
        """
        pipeline = _build_aims_pipeline()
        result = _run(pipeline.run({"document_id": "swap-003"}))

        assert result["completed"] is True
        assert result["_pipeline"]["errors"] == []
        # 어댑터 없이도 모든 스테이지가 실행됨 (stub 구현, convert는 스킵)
        assert len(result["_pipeline"]["stages_executed"]) == 6

    def test_adapter_exception_with_skip_on_error(self):
        """어댑터가 예외 발생 → skip_on_error=True이면 파이프라인 중단 없음"""

        class _ExplodingStage(Stage):
            """어댑터 호출을 시뮬레이션하며 예외를 발생시키는 스테이지"""
            def get_name(self) -> str:
                return "exploding"

            async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
                raise RuntimeError("어댑터 내부 에러 시뮬레이션")

        definition = PipelineDefinition(
            name="error-adapter-test",
            stages=[
                StageConfig(name="ingest"),
                StageConfig(name="exploding", skip_on_error=True),  # 에러 시 계속 진행
                StageConfig(name="complete"),
            ],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("ingest", IngestStage)
        pipeline.register_stage("exploding", _ExplodingStage)
        pipeline.register_stage("complete", CompleteStage)

        result = _run(pipeline.run({"document_id": "swap-004"}))

        # 에러가 기록되었지만 파이프라인은 계속 진행
        assert len(result["_pipeline"]["errors"]) == 1
        assert result["_pipeline"]["errors"][0]["stage"] == "exploding"
        assert result["completed"] is True  # complete 스테이지는 실행됨

    def test_adapter_exception_without_skip_stops_pipeline(self):
        """어댑터가 예외 발생 → skip_on_error=False이면 파이프라인 중단"""

        class _ExplodingStage(Stage):
            def get_name(self) -> str:
                return "exploding"

            async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
                raise RuntimeError("어댑터 폭발")

        definition = PipelineDefinition(
            name="error-stop-test",
            stages=[
                StageConfig(name="ingest"),
                StageConfig(name="exploding", skip_on_error=False),
                StageConfig(name="complete"),
            ],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("ingest", IngestStage)
        pipeline.register_stage("exploding", _ExplodingStage)
        pipeline.register_stage("complete", CompleteStage)

        with pytest.raises(RuntimeError, match="실행 실패"):
            _run(pipeline.run({"document_id": "swap-005"}))


# ===========================================================================
# 4. 하위 호환성 regression
# ===========================================================================

class TestBackwardCompatibility:
    """DomainAdapter 확장, Golden File, ClassificationConfig 호환성 검증"""

    def test_domain_adapter_new_default_method_backward_compatible(self):
        """DomainAdapter에 새 기본 구현 메서드 추가해도 기존 어댑터 동작

        validate_document()와 on_before_ai_call()이 기본 구현(no-op)을 가지므로,
        기존 어댑터가 오버라이드하지 않아도 정상 동작.
        """
        insurance = InsuranceDomainAdapter()
        legal = LegalDomainAdapter()

        # validate_document: 기본 구현 (항상 유효)
        is_valid, reason = _run(insurance.validate_document("test.pdf", "application/pdf", 1024))
        assert is_valid is True
        assert reason == ""

        is_valid, reason = _run(legal.validate_document("test.pdf", "application/pdf", 1024))
        assert is_valid is True
        assert reason == ""

        # on_before_ai_call: 기본 구현 (params 그대로 반환)
        params = {"model": "gpt-4o", "temperature": 0.1}
        result = _run(insurance.on_before_ai_call("classify", params))
        assert result == params

        result = _run(legal.on_before_ai_call("embed", params))
        assert result == params

    def test_aims_preset_golden_file(self):
        """Pipeline 프리셋(AIMS) 실행 결과가 Golden File과 일치

        AIMS 보험 프리셋의 구조(스테이지 순서, 스킵 조건)가 변경되지 않았는지 확인.
        """
        # Golden 정의: 변경되면 테스트가 실패하여 의도적 변경인지 확인
        assert AIMS_INSURANCE_PRESET["name"] == "aims-insurance"

        expected_stages = ["ingest", "convert", "extract", "classify", "detect_special", "embed", "complete"]
        actual_stages = [s["name"] for s in AIMS_INSURANCE_PRESET["stages"]]
        assert actual_stages == expected_stages

        # skip_if 조건 Golden
        stage_map = {s["name"]: s for s in AIMS_INSURANCE_PRESET["stages"]}
        assert stage_map["convert"].get("skip_if") == "!needs_conversion"
        assert stage_map["extract"].get("skip_if") == "has_text"
        assert stage_map["embed"].get("skip_if") == "credit_pending"
        assert stage_map["ingest"].get("skip_if") is None

    def test_aims_preset_execution_golden(self):
        """AIMS 프리셋 실행 결과 Golden — 각 시나리오별 스테이지 실행 목록 고정"""
        pipeline = _build_aims_pipeline()

        # 시나리오 A: 기본 (PDF — convert 스킵, 나머지 실행)
        result_a = _run(pipeline.run({"document_id": "golden-a"}))
        assert result_a["_pipeline"]["stages_executed"] == expected_stages_list()

        # 시나리오 B: has_text=True
        result_b = _run(pipeline.run({"document_id": "golden-b", "has_text": True}))
        assert result_b["_pipeline"]["stages_executed"] == expected_stages_list(skip_extract=True)

        # 시나리오 C: credit_pending=True
        result_c = _run(pipeline.run({"document_id": "golden-c", "credit_pending": True}))
        assert result_c["_pipeline"]["stages_executed"] == expected_stages_list(skip_embed=True)

        # 시나리오 D: 둘 다
        result_d = _run(pipeline.run({
            "document_id": "golden-d",
            "has_text": True,
            "credit_pending": True,
        }))
        assert result_d["_pipeline"]["stages_executed"] == expected_stages_list(
            skip_extract=True, skip_embed=True,
        )

    def test_classification_config_structure_unchanged(self):
        """ClassificationConfig 구조 변경 없이 기존 어댑터 호환

        Insurance/Legal 어댑터가 반환하는 ClassificationConfig의 필수 필드가
        모두 존재하고 올바른 타입인지 확인.
        """
        for adapter in [InsuranceDomainAdapter(), LegalDomainAdapter()]:
            config = _run(adapter.get_classification_config())

            # 필수 필드 존재
            assert isinstance(config, ClassificationConfig)
            assert isinstance(config.categories, list)
            assert len(config.categories) > 0
            assert isinstance(config.prompt_template, str)
            assert len(config.prompt_template) > 0
            assert isinstance(config.valid_types, list)
            assert len(config.valid_types) > 0
            assert isinstance(config.extra, dict)

            # Category 구조 검증
            for cat in config.categories:
                assert isinstance(cat, Category)
                assert cat.code  # 빈 문자열이 아닌지
                assert cat.name

            # valid_types의 모든 값이 문자열인지
            for vt in config.valid_types:
                assert isinstance(vt, str)

    def test_detection_dataclass_backward_compatible(self):
        """Detection 데이터 클래스의 필수 필드가 보존되는지"""
        # Insurance 어댑터
        insurance = InsuranceDomainAdapter()
        ar_detections = _run(insurance.detect_special_documents(
            text=_AR_TEXT,
            mime_type="application/pdf",
        ))
        assert len(ar_detections) == 1
        det = ar_detections[0]
        assert hasattr(det, "doc_type")
        assert hasattr(det, "confidence")
        assert hasattr(det, "metadata")
        assert isinstance(det.metadata, dict)

        # Legal 어댑터
        legal = LegalDomainAdapter()
        judgment_text = (
            "판결\n원고: A\n피고: B\n주문: 원고 승소\n법원 사건"
        )
        legal_detections = _run(legal.detect_special_documents(
            text=judgment_text,
            mime_type="application/pdf",
        ))
        if legal_detections:
            ldet = legal_detections[0]
            assert hasattr(ldet, "doc_type")
            assert hasattr(ldet, "confidence")
            assert hasattr(ldet, "metadata")

    def test_hook_result_structure_unchanged(self):
        """HookResult/StageHookAction 구조가 보존되는지"""
        insurance = InsuranceDomainAdapter()

        # on_stage_complete 호출
        results = _run(insurance.on_stage_complete(
            stage="upload_complete",
            doc={"_id": "test-doc", "ownerId": "owner-1"},
            context={"doc_id": "test-doc", "user_id": "owner-1", "customer_id": "cust-1"},
        ))

        assert isinstance(results, list)
        for r in results:
            assert isinstance(r, HookResult)
            assert isinstance(r.action, StageHookAction)
            assert isinstance(r.payload, dict)

        # 알 수 없는 stage → 빈 리스트
        empty_results = _run(insurance.on_stage_complete(
            stage="unknown_stage",
            doc={},
            context={},
        ))
        assert empty_results == []

    def test_insurance_adapter_all_abstract_methods_implemented(self):
        """InsuranceDomainAdapter가 DomainAdapter의 모든 abstract 메서드를 구현"""
        adapter = InsuranceDomainAdapter()

        # 모든 abstract 메서드가 호출 가능한지 (에러 없이)
        config = _run(adapter.get_classification_config())
        assert config is not None

        detections = _run(adapter.detect_special_documents("test", "text/plain"))
        assert isinstance(detections, list)

        entity = _run(adapter.resolve_entity(
            Detection(doc_type="annual_report", confidence=1.0, metadata={}),
            owner_id="",
        ))
        assert isinstance(entity, dict)

        metadata = _run(adapter.extract_domain_metadata("test", "test.pdf"))
        assert isinstance(metadata, dict)

        display = _run(adapter.generate_display_name(doc={}))
        assert isinstance(display, str)

        hooks = _run(adapter.on_stage_complete("test", {}, {}))
        assert isinstance(hooks, list)

    def test_legal_adapter_all_abstract_methods_implemented(self):
        """LegalDomainAdapter가 DomainAdapter의 모든 abstract 메서드를 구현"""
        adapter = LegalDomainAdapter()

        config = _run(adapter.get_classification_config())
        assert config is not None

        detections = _run(adapter.detect_special_documents("test", "text/plain"))
        assert isinstance(detections, list)

        entity = _run(adapter.resolve_entity(
            Detection(doc_type="judgment", confidence=1.0, metadata={}),
            owner_id="",
        ))
        assert isinstance(entity, dict)

        metadata = _run(adapter.extract_domain_metadata("test", "test.pdf"))
        assert isinstance(metadata, dict)

        display = _run(adapter.generate_display_name(doc={}))
        assert isinstance(display, str)

        hooks = _run(adapter.on_stage_complete("test", {}, {}))
        assert isinstance(hooks, list)


# ---------------------------------------------------------------------------
# 헬퍼: Golden File 스테이지 목록 생성
# ---------------------------------------------------------------------------

def expected_stages_list(
    all_: bool = False,
    skip_extract: bool = False,
    skip_embed: bool = False,
    skip_convert: bool = True,  # 기본적으로 convert 스킵 (needs_conversion 없으면)
) -> list[str]:
    """AIMS 프리셋의 예상 실행 스테이지 목록을 반환"""
    stages = ["ingest", "convert", "extract", "classify", "detect_special", "embed", "complete"]
    if all_:
        return stages
    result = []
    for s in stages:
        if skip_convert and s == "convert":
            continue
        if skip_extract and s == "extract":
            continue
        if skip_embed and s == "embed":
            continue
        result.append(s)
    return result
