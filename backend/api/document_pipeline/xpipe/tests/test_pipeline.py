"""
xPipe Pipeline 테스트

Pipeline 엔진의 생성, 실행, 스킵 조건, 에러 처리, 프리셋, YAML/JSON 로드,
Golden File 테스트를 검증한다.
"""
from __future__ import annotations

import asyncio
import json
import os
import tempfile
from pathlib import Path
from typing import Any

import pytest

from xpipe.stage import Stage
from xpipe.pipeline import (
    Pipeline,
    PipelineDefinition,
    StageConfig,
    _evaluate_skip_condition,
)
from xpipe.pipeline_presets import (
    AIMS_INSURANCE_PRESET,
    MINIMAL_PRESET,
    PRESETS,
    get_preset,
    list_presets,
)
from xpipe.events import EventBus, PipelineEvent
from xpipe.stages import (
    IngestStage,
    ConvertStage,
    ExtractStage,
    ClassifyStage,
    DetectSpecialStage,
    EmbedStage,
    CompleteStage,
)


# ---------------------------------------------------------------------------
# 테스트 헬퍼
# ---------------------------------------------------------------------------

def _run(coro):
    """비동기 코루틴을 동기로 실행"""
    return asyncio.get_event_loop().run_until_complete(coro)


class _CounterStage(Stage):
    """테스트용 카운터 스테이지"""

    _name: str = "counter"

    def get_name(self) -> str:
        return self._name

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        context.setdefault("execution_order", [])
        context["execution_order"].append(self.get_name())
        context.setdefault("count", 0)
        context["count"] += 1
        return context


class _ErrorStage(Stage):
    """테스트용 에러 스테이지"""

    def get_name(self) -> str:
        return "error_stage"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError("의도된 에러")


class _ConditionalSkipStage(Stage):
    """should_skip() 테스트용 스테이지"""

    def get_name(self) -> str:
        return "conditional"

    def should_skip(self, context: dict[str, Any]) -> bool:
        return bool(context.get("skip_me"))

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        context["conditional_executed"] = True
        return context


class _ConfigAwareStage(Stage):
    """스테이지 설정 접근 테스트용"""

    def get_name(self) -> str:
        return "config_aware"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        config = context.get("_stage_config", {})
        context["received_config"] = config
        return context


def _make_counter(name: str) -> type[Stage]:
    """지정된 이름의 카운터 스테이지 클래스를 동적 생성"""
    return type(f"Counter_{name}", (_CounterStage,), {"_name": name})


def _register_builtin_stages(pipeline: Pipeline) -> None:
    """내장 스테이지를 모두 등록"""
    pipeline.register_stage("ingest", IngestStage)
    pipeline.register_stage("convert", ConvertStage)
    pipeline.register_stage("extract", ExtractStage)
    pipeline.register_stage("classify", ClassifyStage)
    pipeline.register_stage("detect_special", DetectSpecialStage)
    pipeline.register_stage("embed", EmbedStage)
    pipeline.register_stage("complete", CompleteStage)


# ---------------------------------------------------------------------------
# Pipeline 생성/실행 기본 테스트
# ---------------------------------------------------------------------------

class TestPipelineBasic:
    """Pipeline 기본 동작 테스트"""

    def test_create_pipeline(self):
        """PipelineDefinition으로 Pipeline 생성"""
        definition = PipelineDefinition(
            name="test",
            stages=[StageConfig(name="counter")],
        )
        pipeline = Pipeline(definition)
        assert pipeline.definition.name == "test"
        assert len(pipeline.definition.stages) == 1

    def test_run_single_stage(self):
        """단일 스테이지 실행"""
        definition = PipelineDefinition(
            name="test",
            stages=[StageConfig(name="counter")],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("counter", _CounterStage)

        result = _run(pipeline.run({}))
        assert result["count"] == 1
        assert result["_pipeline"]["stages_executed"] == ["counter"]

    def test_run_multiple_stages(self):
        """여러 스테이지 순서대로 실행"""
        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="a"),
                StageConfig(name="b"),
                StageConfig(name="c"),
            ],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("a", _make_counter("a"))
        pipeline.register_stage("b", _make_counter("b"))
        pipeline.register_stage("c", _make_counter("c"))

        result = _run(pipeline.run({}))
        assert result["count"] == 3
        assert result["execution_order"] == ["a", "b", "c"]
        assert result["_pipeline"]["stages_executed"] == ["a", "b", "c"]

    def test_context_passes_between_stages(self):
        """컨텍스트가 스테이지 간에 전달됨"""
        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="a"),
                StageConfig(name="b"),
            ],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("a", _make_counter("a"))
        pipeline.register_stage("b", _make_counter("b"))

        result = _run(pipeline.run({"initial": "value"}))
        assert result["initial"] == "value"
        assert result["count"] == 2

    def test_unregistered_stage_raises(self):
        """등록되지 않은 스테이지 실행 시 ValueError"""
        definition = PipelineDefinition(
            name="test",
            stages=[StageConfig(name="unknown")],
        )
        pipeline = Pipeline(definition)

        with pytest.raises(ValueError, match="등록되지 않았습니다"):
            _run(pipeline.run({}))

    def test_pipeline_metadata(self):
        """실행 후 _pipeline 메타데이터 확인"""
        definition = PipelineDefinition(
            name="my-pipeline",
            stages=[StageConfig(name="counter")],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("counter", _CounterStage)

        result = _run(pipeline.run({}))
        assert result["_pipeline"]["name"] == "my-pipeline"
        assert "stages_executed" in result["_pipeline"]
        assert "stages_skipped" in result["_pipeline"]
        assert "errors" in result["_pipeline"]


# ---------------------------------------------------------------------------
# skip_if 조건 테스트
# ---------------------------------------------------------------------------

class TestSkipCondition:
    """skip_if 조건 평가 테스트"""

    def test_skip_if_truthy(self):
        """context에 키가 truthy면 스킵"""
        assert _evaluate_skip_condition("has_text", {"has_text": True}) is True
        assert _evaluate_skip_condition("has_text", {"has_text": "yes"}) is True
        assert _evaluate_skip_condition("has_text", {"has_text": 1}) is True

    def test_skip_if_falsy(self):
        """context에 키가 falsy면 스킵하지 않음"""
        assert _evaluate_skip_condition("has_text", {"has_text": False}) is False
        assert _evaluate_skip_condition("has_text", {"has_text": ""}) is False
        assert _evaluate_skip_condition("has_text", {"has_text": 0}) is False

    def test_skip_if_missing_key(self):
        """context에 키가 없으면 스킵하지 않음"""
        assert _evaluate_skip_condition("has_text", {}) is False

    def test_skip_if_negation(self):
        """! 접두사로 부정 조건"""
        assert _evaluate_skip_condition("!has_text", {"has_text": True}) is False
        assert _evaluate_skip_condition("!has_text", {"has_text": False}) is True
        assert _evaluate_skip_condition("!has_text", {}) is True

    def test_skip_if_empty_string(self):
        """빈 문자열은 스킵하지 않음"""
        assert _evaluate_skip_condition("", {"key": True}) is False

    def test_pipeline_skip_if(self):
        """파이프라인에서 skip_if 동작 검증"""
        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="a"),
                StageConfig(name="b", skip_if="skip_b"),
                StageConfig(name="c"),
            ],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("a", _make_counter("a"))
        pipeline.register_stage("b", _make_counter("b"))
        pipeline.register_stage("c", _make_counter("c"))

        result = _run(pipeline.run({"skip_b": True}))
        assert result["execution_order"] == ["a", "c"]
        assert result["_pipeline"]["stages_skipped"] == ["b"]
        assert result["count"] == 2


# ---------------------------------------------------------------------------
# skip_on_error 테스트
# ---------------------------------------------------------------------------

class TestSkipOnError:
    """skip_on_error 테스트"""

    def test_error_stops_pipeline(self):
        """skip_on_error=False일 때 에러가 파이프라인 중단"""
        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="error_stage", skip_on_error=False),
                StageConfig(name="counter"),
            ],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("error_stage", _ErrorStage)
        pipeline.register_stage("counter", _CounterStage)

        with pytest.raises(RuntimeError, match="실행 실패"):
            _run(pipeline.run({}))

    def test_skip_on_error_continues(self):
        """skip_on_error=True일 때 에러가 발생해도 다음 스테이지로 진행"""
        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="error_stage", skip_on_error=True),
                StageConfig(name="counter"),
            ],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("error_stage", _ErrorStage)
        pipeline.register_stage("counter", _CounterStage)

        result = _run(pipeline.run({}))
        assert result["count"] == 1
        assert len(result["_pipeline"]["errors"]) == 1
        assert result["_pipeline"]["errors"][0]["stage"] == "error_stage"

    def test_error_info_recorded(self):
        """에러 정보가 _pipeline.errors에 기록됨"""
        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="error_stage", skip_on_error=True),
            ],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("error_stage", _ErrorStage)

        result = _run(pipeline.run({}))
        error = result["_pipeline"]["errors"][0]
        assert error["stage"] == "error_stage"
        assert "의도된 에러" in error["error"]
        assert error["error_type"] == "RuntimeError"


# ---------------------------------------------------------------------------
# 커스텀 스테이지 삽입 테스트
# ---------------------------------------------------------------------------

class TestCustomStage:
    """커스텀 스테이지 삽입 테스트"""

    def test_custom_stage_in_pipeline(self):
        """커스텀 스테이지를 파이프라인에 삽입하여 실행"""
        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="ingest"),
                StageConfig(name="custom"),
                StageConfig(name="complete"),
            ],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("ingest", IngestStage)
        pipeline.register_stage("custom", _CounterStage)
        pipeline.register_stage("complete", CompleteStage)

        result = _run(pipeline.run({}))
        assert result["ingested"] is True
        assert result["count"] == 1
        assert result["completed"] is True

    def test_should_skip_in_pipeline(self):
        """스테이지의 should_skip()이 파이프라인에서 동작"""
        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="conditional"),
            ],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("conditional", _ConditionalSkipStage)

        # skip_me=True → 스킵
        result = _run(pipeline.run({"skip_me": True}))
        assert "conditional_executed" not in result
        assert result["_pipeline"]["stages_skipped"] == ["conditional"]

        # skip_me=False → 실행
        result = _run(pipeline.run({"skip_me": False}))
        assert result["conditional_executed"] is True

    def test_stage_config_passed(self):
        """스테이지 설정이 context._stage_config로 전달됨"""
        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="config_aware", config={"key": "value", "n": 42}),
            ],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("config_aware", _ConfigAwareStage)

        result = _run(pipeline.run({}))
        assert result["received_config"] == {"key": "value", "n": 42}


# ---------------------------------------------------------------------------
# EventBus 연동 테스트
# ---------------------------------------------------------------------------

class TestPipelineEvents:
    """EventBus 연동 테스트"""

    def test_stage_complete_event(self):
        """스테이지 완료 시 stage_complete 이벤트 발행"""
        events_received: list[PipelineEvent] = []
        bus = EventBus()
        bus.on("stage_complete", lambda e: events_received.append(e))

        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="a"),
                StageConfig(name="b"),
            ],
        )
        pipeline = Pipeline(definition, event_bus=bus)
        pipeline.register_stage("a", _make_counter("a"))
        pipeline.register_stage("b", _make_counter("b"))

        _run(pipeline.run({"document_id": "doc123"}))

        assert len(events_received) == 2
        assert events_received[0].stage == "a"
        assert events_received[1].stage == "b"
        assert events_received[0].document_id == "doc123"

    def test_stage_start_event(self):
        """스테이지 시작 시 stage_start 이벤트 발행"""
        events_received: list[PipelineEvent] = []
        bus = EventBus()
        bus.on("stage_start", lambda e: events_received.append(e))

        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="a"),
                StageConfig(name="b"),
            ],
        )
        pipeline = Pipeline(definition, event_bus=bus)
        pipeline.register_stage("a", _make_counter("a"))
        pipeline.register_stage("b", _make_counter("b"))

        _run(pipeline.run({"document_id": "doc-start"}))

        assert len(events_received) == 2
        assert events_received[0].event_type == "stage_start"
        assert events_received[0].stage == "a"
        assert events_received[1].event_type == "stage_start"
        assert events_received[1].stage == "b"
        assert events_received[0].document_id == "doc-start"
        assert events_received[0].payload["pipeline"] == "test"

    def test_stage_start_before_complete(self):
        """stage_start는 stage_complete보다 먼저 발행됨"""
        events_received: list[PipelineEvent] = []
        bus = EventBus()
        bus.on("stage_start", lambda e: events_received.append(e))
        bus.on("stage_complete", lambda e: events_received.append(e))

        definition = PipelineDefinition(
            name="test",
            stages=[StageConfig(name="a")],
        )
        pipeline = Pipeline(definition, event_bus=bus)
        pipeline.register_stage("a", _make_counter("a"))

        _run(pipeline.run({"document_id": "doc-order"}))

        assert len(events_received) == 2
        assert events_received[0].event_type == "stage_start"
        assert events_received[1].event_type == "stage_complete"

    def test_stage_start_not_emitted_for_skipped(self):
        """스킵된 스테이지는 stage_start 이벤트를 발행하지 않음"""
        events_received: list[PipelineEvent] = []
        bus = EventBus()
        bus.on("stage_start", lambda e: events_received.append(e))

        definition = PipelineDefinition(
            name="test",
            stages=[
                StageConfig(name="a"),
                StageConfig(name="b", skip_if="skip_b"),
                StageConfig(name="c"),
            ],
        )
        pipeline = Pipeline(definition, event_bus=bus)
        pipeline.register_stage("a", _make_counter("a"))
        pipeline.register_stage("b", _make_counter("b"))
        pipeline.register_stage("c", _make_counter("c"))

        _run(pipeline.run({"document_id": "doc-skip", "skip_b": True}))

        assert len(events_received) == 2
        stages = [e.stage for e in events_received]
        assert stages == ["a", "c"]

    def test_error_event_on_failure(self):
        """에러 시 error 이벤트 발행"""
        events_received: list[PipelineEvent] = []
        bus = EventBus()
        bus.on("error", lambda e: events_received.append(e))

        definition = PipelineDefinition(
            name="test",
            stages=[StageConfig(name="error_stage")],
        )
        pipeline = Pipeline(definition, event_bus=bus)
        pipeline.register_stage("error_stage", _ErrorStage)

        with pytest.raises(RuntimeError):
            _run(pipeline.run({}))

        assert len(events_received) == 1
        assert events_received[0].event_type == "error"
        assert "의도된 에러" in events_received[0].payload["error"]

    def test_no_events_without_bus(self):
        """EventBus 없이도 정상 실행"""
        definition = PipelineDefinition(
            name="test",
            stages=[StageConfig(name="counter")],
        )
        pipeline = Pipeline(definition)  # event_bus=None
        pipeline.register_stage("counter", _CounterStage)

        result = _run(pipeline.run({}))
        assert result["count"] == 1


# ---------------------------------------------------------------------------
# Validate 테스트
# ---------------------------------------------------------------------------

class TestPipelineValidate:
    """Pipeline.validate() dry-run 테스트"""

    def test_valid_pipeline(self):
        """유효한 파이프라인은 빈 오류 목록"""
        definition = PipelineDefinition(
            name="test",
            stages=[StageConfig(name="counter")],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("counter", _CounterStage)

        errors = pipeline.validate()
        assert errors == []

    def test_empty_name(self):
        """빈 이름 검증"""
        definition = PipelineDefinition(name="", stages=[StageConfig(name="a")])
        pipeline = Pipeline(definition)
        pipeline.register_stage("a", _CounterStage)

        errors = pipeline.validate()
        assert any("이름이 비어있습니다" in e for e in errors)

    def test_no_stages(self):
        """스테이지 없음 검증"""
        definition = PipelineDefinition(name="test", stages=[])
        pipeline = Pipeline(definition)

        errors = pipeline.validate()
        assert any("스테이지가 정의되지 않았습니다" in e for e in errors)

    def test_unregistered_stage(self):
        """등록되지 않은 스테이지 검증"""
        definition = PipelineDefinition(
            name="test",
            stages=[StageConfig(name="unknown")],
        )
        pipeline = Pipeline(definition)

        errors = pipeline.validate()
        assert any("등록되지 않았습니다" in e for e in errors)

    def test_duplicate_stage_names(self):
        """중복 스테이지 이름 검증"""
        definition = PipelineDefinition(
            name="test",
            stages=[StageConfig(name="a"), StageConfig(name="a")],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("a", _CounterStage)

        errors = pipeline.validate()
        assert any("중복" in e for e in errors)

    def test_invalid_skip_if(self):
        """유효하지 않은 skip_if 형식 검증"""
        definition = PipelineDefinition(
            name="test",
            stages=[StageConfig(name="a", skip_if="!")],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("a", _CounterStage)

        errors = pipeline.validate()
        assert any("비어있습니다" in e for e in errors)


# ---------------------------------------------------------------------------
# JSON/YAML 로드 테스트
# ---------------------------------------------------------------------------

class TestPipelineFromDict:
    """Pipeline.from_dict() 테스트"""

    def test_from_dict_basic(self):
        """dict에서 Pipeline 생성"""
        data = {
            "name": "test",
            "stages": [
                {"name": "a", "config": {"key": "val"}},
                {"name": "b", "skip_if": "done"},
                {"name": "c", "skip_on_error": True},
            ],
        }
        pipeline = Pipeline.from_dict(data)

        assert pipeline.definition.name == "test"
        assert len(pipeline.definition.stages) == 3
        assert pipeline.definition.stages[0].config == {"key": "val"}
        assert pipeline.definition.stages[1].skip_if == "done"
        assert pipeline.definition.stages[2].skip_on_error is True

    def test_from_dict_minimal(self):
        """최소 dict에서 Pipeline 생성"""
        data = {"name": "min", "stages": [{"name": "a"}]}
        pipeline = Pipeline.from_dict(data)

        assert pipeline.definition.name == "min"
        assert pipeline.definition.stages[0].config == {}
        assert pipeline.definition.stages[0].skip_if is None
        assert pipeline.definition.stages[0].skip_on_error is False


class TestPipelineFromJSON:
    """Pipeline.from_json() 테스트"""

    def test_from_json_file(self, tmp_path):
        """JSON 파일에서 Pipeline 로드"""
        data = {
            "name": "json-test",
            "stages": [
                {"name": "ingest"},
                {"name": "extract", "skip_if": "has_text"},
                {"name": "complete"},
            ],
        }
        json_path = tmp_path / "pipeline.json"
        json_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

        pipeline = Pipeline.from_json(str(json_path))
        assert pipeline.definition.name == "json-test"
        assert len(pipeline.definition.stages) == 3
        assert pipeline.definition.stages[1].skip_if == "has_text"

    def test_from_json_file_not_found(self):
        """존재하지 않는 JSON 파일"""
        with pytest.raises(FileNotFoundError):
            Pipeline.from_json("/nonexistent/path.json")


class TestPipelineFromYAML:
    """Pipeline.from_yaml() 테스트"""

    def test_from_yaml_basic(self, tmp_path):
        """간단한 YAML 파일에서 Pipeline 로드"""
        yaml_content = """
name: yaml-test
stages:
  - name: ingest
    config:
      timeout: 30
  - name: extract
    skip_if: has_text
  - name: complete
"""
        yaml_path = tmp_path / "pipeline.yaml"
        yaml_path.write_text(yaml_content, encoding="utf-8")

        pipeline = Pipeline.from_yaml(str(yaml_path))
        assert pipeline.definition.name == "yaml-test"
        assert len(pipeline.definition.stages) == 3
        assert pipeline.definition.stages[0].name == "ingest"
        assert pipeline.definition.stages[1].skip_if == "has_text"

    def test_from_yaml_with_comments(self, tmp_path):
        """주석이 포함된 YAML"""
        yaml_content = """
# 파이프라인 정의
name: commented
stages:
  - name: ingest  # 파일 수신
  - name: complete
"""
        yaml_path = tmp_path / "pipeline.yaml"
        yaml_path.write_text(yaml_content, encoding="utf-8")

        pipeline = Pipeline.from_yaml(str(yaml_path))
        assert pipeline.definition.name == "commented"
        assert len(pipeline.definition.stages) == 2

    def test_from_yaml_file_not_found(self):
        """존재하지 않는 YAML 파일"""
        with pytest.raises(FileNotFoundError):
            Pipeline.from_yaml("/nonexistent/path.yaml")


# ---------------------------------------------------------------------------
# 프리셋 테스트
# ---------------------------------------------------------------------------

class TestPresets:
    """파이프라인 프리셋 테스트"""

    def test_aims_insurance_preset_structure(self):
        """AIMS 보험 프리셋 구조 검증"""
        assert AIMS_INSURANCE_PRESET["name"] == "aims-insurance"
        stage_names = [s["name"] for s in AIMS_INSURANCE_PRESET["stages"]]
        assert stage_names == [
            "ingest", "convert", "extract", "classify", "detect_special", "embed", "complete"
        ]

    def test_minimal_preset_structure(self):
        """최소 프리셋 구조 검증"""
        assert MINIMAL_PRESET["name"] == "minimal"
        stage_names = [s["name"] for s in MINIMAL_PRESET["stages"]]
        assert stage_names == ["ingest", "extract", "complete"]

    def test_get_preset(self):
        """get_preset()으로 프리셋 조회"""
        preset = get_preset("aims-insurance")
        assert preset["name"] == "aims-insurance"

    def test_get_preset_not_found(self):
        """없는 프리셋 조회 시 KeyError"""
        with pytest.raises(KeyError, match="찾을 수 없습니다"):
            get_preset("nonexistent")

    def test_list_presets(self):
        """list_presets()로 프리셋 목록 조회"""
        presets = list_presets()
        assert len(presets) >= 2
        names = [p["name"] for p in presets]
        assert "aims-insurance" in names
        assert "minimal" in names

    def test_preset_to_pipeline(self):
        """프리셋으로 Pipeline 생성 및 실행"""
        pipeline = Pipeline.from_dict(MINIMAL_PRESET)
        _register_builtin_stages(pipeline)

        result = _run(pipeline.run({"document_id": "test123"}))
        assert result["ingested"] is True
        assert result["completed"] is True

    def test_aims_preset_skip_conditions(self):
        """AIMS 프리셋의 skip_if 조건 검증"""
        pipeline = Pipeline.from_dict(AIMS_INSURANCE_PRESET)
        _register_builtin_stages(pipeline)

        # has_text=True → extract 스킵
        result = _run(pipeline.run({"has_text": True}))
        assert "extract" in result["_pipeline"]["stages_skipped"]

        # credit_pending=True → embed 스킵
        result = _run(pipeline.run({"credit_pending": True}))
        assert "embed" in result["_pipeline"]["stages_skipped"]

        # needs_conversion=True → convert 실행
        result = _run(pipeline.run({"needs_conversion": True}))
        assert "convert" in result["_pipeline"]["stages_executed"]

        # needs_conversion 없음 → convert 스킵 (skip_if: !needs_conversion)
        result = _run(pipeline.run({}))
        assert "convert" in result["_pipeline"]["stages_skipped"]


# ---------------------------------------------------------------------------
# Golden File 테스트 — AIMS 프리셋 실행 결과 비교
# ---------------------------------------------------------------------------

class TestGoldenFile:
    """Golden File 테스트 — AIMS 프리셋 실행 → 예상 결과 비교"""

    def test_aims_full_pipeline(self):
        """AIMS 전체 파이프라인 실행 결과 (PDF — convert 스킵)"""
        pipeline = Pipeline.from_dict(AIMS_INSURANCE_PRESET)
        _register_builtin_stages(pipeline)

        context = {"document_id": "golden-001", "file_path": "/tmp/test.pdf"}
        result = _run(pipeline.run(context))

        # convert는 needs_conversion=False이므로 스킵 (skip_if: !needs_conversion)
        assert result["_pipeline"]["name"] == "aims-insurance"
        assert result["_pipeline"]["stages_executed"] == [
            "ingest", "extract", "classify", "detect_special", "embed", "complete"
        ]
        assert "convert" in result["_pipeline"]["stages_skipped"]
        assert result["_pipeline"]["errors"] == []

        # 각 스테이지의 결과 플래그
        assert result["ingested"] is True
        assert result["extracted"] is True
        assert result["classified"] is True
        assert result["special_detected"] is True
        assert result["embedded"] is True
        assert result["completed"] is True
        assert result["status"] == "completed"

    def test_aims_full_pipeline_with_conversion(self):
        """AIMS 전체 파이프라인 실행 결과 (xlsx — convert 실행)"""
        pipeline = Pipeline.from_dict(AIMS_INSURANCE_PRESET)
        _register_builtin_stages(pipeline)

        context = {
            "document_id": "golden-001b",
            "file_path": "/tmp/test.xlsx",
            "needs_conversion": True,
        }
        result = _run(pipeline.run(context))

        # convert 실행됨
        assert result["_pipeline"]["name"] == "aims-insurance"
        assert "convert" in result["_pipeline"]["stages_executed"]
        assert result["_pipeline"]["stages_executed"] == [
            "ingest", "convert", "extract", "classify", "detect_special", "embed", "complete"
        ]
        assert result["converted"] is True
        assert result["completed"] is True

    def test_aims_with_existing_text(self):
        """이미 텍스트가 있는 문서 → extract + convert 스킵"""
        pipeline = Pipeline.from_dict(AIMS_INSURANCE_PRESET)
        _register_builtin_stages(pipeline)

        context = {
            "document_id": "golden-002",
            "has_text": True,
            "text": "기존 텍스트",
        }
        result = _run(pipeline.run(context))

        assert result["_pipeline"]["stages_executed"] == [
            "ingest", "classify", "detect_special", "embed", "complete"
        ]
        assert "extract" in result["_pipeline"]["stages_skipped"]
        assert "convert" in result["_pipeline"]["stages_skipped"]

    def test_aims_credit_pending(self):
        """크레딧 부족 → embed + convert 스킵"""
        pipeline = Pipeline.from_dict(AIMS_INSURANCE_PRESET)
        _register_builtin_stages(pipeline)

        context = {"document_id": "golden-003", "credit_pending": True}
        result = _run(pipeline.run(context))

        assert result["_pipeline"]["stages_executed"] == [
            "ingest", "extract", "classify", "detect_special", "complete"
        ]
        assert "embed" in result["_pipeline"]["stages_skipped"]
        assert "convert" in result["_pipeline"]["stages_skipped"]

    def test_aims_text_and_credit_pending(self):
        """텍스트 있음 + 크레딧 부족 → convert + extract + embed 스킵"""
        pipeline = Pipeline.from_dict(AIMS_INSURANCE_PRESET)
        _register_builtin_stages(pipeline)

        context = {
            "document_id": "golden-004",
            "has_text": True,
            "credit_pending": True,
        }
        result = _run(pipeline.run(context))

        assert result["_pipeline"]["stages_executed"] == [
            "ingest", "classify", "detect_special", "complete"
        ]
        skipped = set(result["_pipeline"]["stages_skipped"])
        assert "convert" in skipped
        assert "extract" in skipped
        assert "embed" in skipped

    def test_minimal_pipeline(self):
        """최소 파이프라인 실행 결과"""
        pipeline = Pipeline.from_dict(MINIMAL_PRESET)
        _register_builtin_stages(pipeline)

        context = {"document_id": "golden-005"}
        result = _run(pipeline.run(context))

        assert result["_pipeline"]["name"] == "minimal"
        assert result["_pipeline"]["stages_executed"] == [
            "ingest", "extract", "complete"
        ]
        assert result["ingested"] is True
        assert result["extracted"] is True
        assert result["completed"] is True


# ---------------------------------------------------------------------------
# 내장 스테이지 단위 테스트
# ---------------------------------------------------------------------------

class TestBuiltinStages:
    """내장 스테이지 개별 테스트"""

    def test_ingest_stage(self):
        result = _run(IngestStage().execute({}))
        assert result["ingested"] is True

    def test_convert_stage(self):
        result = _run(ConvertStage().execute({"file_path": "/tmp/test.xlsx", "mime_type": "application/vnd.ms-excel"}))
        assert result["converted"] is True
        assert result["mime_type"] == "application/pdf"

    def test_convert_should_skip(self):
        assert ConvertStage().should_skip({"needs_conversion": True}) is False
        assert ConvertStage().should_skip({"needs_conversion": False}) is True
        assert ConvertStage().should_skip({}) is True

    def test_extract_stage(self):
        result = _run(ExtractStage().execute({}))
        assert result["extracted"] is True

    def test_extract_should_skip(self):
        assert ExtractStage().should_skip({"has_text": True}) is True
        assert ExtractStage().should_skip({"has_text": False}) is False
        assert ExtractStage().should_skip({}) is False

    def test_classify_stage(self):
        result = _run(ClassifyStage().execute({}))
        assert result["classified"] is True

    def test_detect_special_stage(self):
        result = _run(DetectSpecialStage().execute({}))
        assert result["special_detected"] is True

    def test_embed_stage(self):
        result = _run(EmbedStage().execute({}))
        assert result["embedded"] is True

    def test_embed_should_skip(self):
        assert EmbedStage().should_skip({"credit_pending": True}) is True
        assert EmbedStage().should_skip({"credit_pending": False}) is False
        assert EmbedStage().should_skip({}) is False

    def test_complete_stage(self):
        result = _run(CompleteStage().execute({}))
        assert result["completed"] is True
        assert result["status"] == "completed"

    def test_stage_names(self):
        """각 스테이지의 get_name()이 올바른 이름 반환"""
        assert IngestStage().get_name() == "ingest"
        assert ConvertStage().get_name() == "convert"
        assert ExtractStage().get_name() == "extract"
        assert ClassifyStage().get_name() == "classify"
        assert DetectSpecialStage().get_name() == "detect_special"
        assert EmbedStage().get_name() == "embed"
        assert CompleteStage().get_name() == "complete"
