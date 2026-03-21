"""
Pipeline 엔진 — 조립식 파이프라인 실행기

StageConfig로 스테이지 순서·조건·파라미터를 선언적으로 정의하고,
Pipeline이 이를 순서대로 실행한다.

설계 원칙:
- 표준 라이브러리만 사용 (PyYAML 의존 금지)
- skip_if: 키 존재 체크만 지원 (eval() 사용 금지)
- EventBus 연동으로 스테이지 완료 이벤트 발행
- validate()로 dry-run 검증 지원

YAML 지원:
- Python 3.11+: tomllib 활용 불가 (TOML ≠ YAML)
- PyYAML 의존 금지 → JSON fallback 제공
- 간단한 YAML 파서 내장 (기본 키-값, 리스트 수준만 지원)
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from xpipe.stage import Stage
from xpipe.events import EventBus, PipelineEvent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 데이터 클래스
# ---------------------------------------------------------------------------

@dataclass
class StageConfig:
    """스테이지 실행 설정

    Attributes:
        name: 스테이지 이름 (등록된 스테이지 이름과 매칭)
        config: 스테이지에 전달할 설정 dict
        skip_if: 스킵 조건 키 이름. context에 해당 키가 truthy면 스킵.
                 "!" 접두사로 부정 가능 (예: "!has_text" → has_text가 falsy면 스킵)
        skip_on_error: True면 에러 시 다음 스테이지로 계속 진행
        module: 커스텀 스테이지 모듈 경로 (동적 로드용)
    """
    name: str
    config: dict[str, Any] = field(default_factory=dict)
    skip_if: Optional[str] = None
    skip_on_error: bool = False
    module: Optional[str] = None


@dataclass
class PipelineDefinition:
    """파이프라인 정의

    Attributes:
        name: 파이프라인 이름 (예: "aims-insurance", "minimal")
        stages: 실행할 스테이지 설정 목록 (순서대로 실행)
        webhooks: 이벤트 유형별 웹훅 URL 매핑
            예: {"stage_complete": "https://example.com/hook"}
    """
    name: str
    stages: list[StageConfig] = field(default_factory=list)
    webhooks: dict[str, str] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# 스킵 조건 평가
# ---------------------------------------------------------------------------

def _evaluate_skip_condition(skip_if: str, context: dict[str, Any]) -> bool:
    """skip_if 조건 평가

    간단한 키 존재/truthy 체크만 지원. eval() 사용 금지.

    지원 형식:
    - "has_text" → context.get("has_text")가 truthy면 True
    - "!has_text" → context.get("has_text")가 falsy면 True (부정)

    Args:
        skip_if: 조건 키 이름
        context: 파이프라인 컨텍스트

    Returns:
        True면 해당 스테이지를 스킵
    """
    if not skip_if:
        return False

    # 부정 조건
    if skip_if.startswith("!"):
        key = skip_if[1:]
        return not context.get(key)

    return bool(context.get(skip_if))


# ---------------------------------------------------------------------------
# Pipeline 엔진
# ---------------------------------------------------------------------------

class Pipeline:
    """조립식 파이프라인 엔진

    PipelineDefinition에 따라 스테이지를 순서대로 실행한다.
    각 스테이지는 register_stage()로 사전 등록되어야 한다.

    사용 예:
        definition = PipelineDefinition(
            name="my-pipeline",
            stages=[StageConfig(name="ingest"), StageConfig(name="extract")],
        )
        pipeline = Pipeline(definition)
        pipeline.register_stage("ingest", IngestStage)
        pipeline.register_stage("extract", ExtractStage)
        result = await pipeline.run({"file_path": "/tmp/doc.pdf"})
    """

    def __init__(
        self,
        definition: PipelineDefinition,
        event_bus: Optional[EventBus] = None,
    ) -> None:
        self.definition = definition
        self.event_bus = event_bus
        # name → Stage 클래스 매핑
        self._stage_registry: dict[str, type[Stage]] = {}

    def register_stage(self, name: str, stage_class: type[Stage]) -> None:
        """스테이지 클래스 등록

        Args:
            name: 스테이지 이름 (StageConfig.name과 매칭)
            stage_class: Stage ABC 구현 클래스
        """
        self._stage_registry[name] = stage_class

    async def run(self, context: dict[str, Any]) -> dict[str, Any]:
        """모든 스테이지를 순서대로 실행

        Args:
            context: 초기 컨텍스트

        Returns:
            모든 스테이지 실행 후의 최종 컨텍스트

        Raises:
            ValueError: 등록되지 않은 스테이지가 정의에 포함된 경우
            RuntimeError: 스테이지 실행 중 에러 (skip_on_error=False일 때)
        """
        # 실행 메타데이터 초기화
        context.setdefault("_pipeline", {})
        context["_pipeline"]["name"] = self.definition.name
        context["_pipeline"]["stages_executed"] = []
        context["_pipeline"]["stages_skipped"] = []
        context["_pipeline"]["errors"] = []

        for stage_config in self.definition.stages:
            stage_name = stage_config.name

            # 스테이지 클래스 조회
            stage_class = self._stage_registry.get(stage_name)
            if stage_class is None:
                raise ValueError(
                    f"스테이지 '{stage_name}'이 등록되지 않았습니다. "
                    f"등록된 스테이지: {list(self._stage_registry.keys())}"
                )

            # 스테이지 인스턴스 생성
            stage = stage_class()

            # 1. skip_if 평가 (정의 수준)
            if _evaluate_skip_condition(stage_config.skip_if or "", context):
                context["_pipeline"]["stages_skipped"].append(stage_name)
                logger.info(
                    "[%s] 스테이지 '%s' 스킵 (skip_if: %s)",
                    self.definition.name, stage_name, stage_config.skip_if,
                )
                continue

            # 2. should_skip 평가 (스테이지 수준)
            if stage.should_skip(context):
                context["_pipeline"]["stages_skipped"].append(stage_name)
                logger.info(
                    "[%s] 스테이지 '%s' 스킵 (should_skip)",
                    self.definition.name, stage_name,
                )
                continue

            # 3. 스테이지 실행
            try:
                # stage_start 이벤트 발행
                if self.event_bus is not None:
                    start_event = PipelineEvent(
                        event_type="stage_start",
                        document_id=context.get("document_id", ""),
                        stage=stage_name,
                        payload={"pipeline": self.definition.name},
                    )
                    await self.event_bus.emit(start_event)

                # config를 context에 주입
                context["_stage_config"] = stage_config.config
                context = await stage.execute(context)
                context["_pipeline"]["stages_executed"].append(stage_name)

                # 4. 이벤트 발행 (stage_data 포함 — xPipeWeb R1 지원)
                if self.event_bus is not None:
                    stage_data = context.get("stage_data", {}).get(stage_name, {})
                    event = PipelineEvent(
                        event_type="stage_complete",
                        document_id=context.get("document_id", ""),
                        stage=stage_name,
                        payload={
                            "pipeline": self.definition.name,
                            "stage_data": stage_data,
                            "duration_ms": stage_data.get("duration_ms", 0),
                        },
                    )
                    await self.event_bus.emit(event)

            except Exception as exc:
                error_info = {
                    "stage": stage_name,
                    "error": str(exc),
                    "error_type": type(exc).__name__,
                }
                context["_pipeline"]["errors"].append(error_info)

                if stage_config.skip_on_error:
                    logger.warning(
                        "[%s] 스테이지 '%s' 에러 (계속 진행): %s",
                        self.definition.name, stage_name, exc,
                    )
                    continue
                else:
                    logger.error(
                        "[%s] 스테이지 '%s' 에러 (중단): %s",
                        self.definition.name, stage_name, exc,
                    )
                    # 에러 이벤트 발행
                    if self.event_bus is not None:
                        event = PipelineEvent(
                            event_type="error",
                            document_id=context.get("document_id", ""),
                            stage=stage_name,
                            payload={"error": str(exc)},
                        )
                        await self.event_bus.emit(event)
                    raise RuntimeError(
                        f"파이프라인 '{self.definition.name}' 스테이지 "
                        f"'{stage_name}' 실행 실패: {exc}"
                    ) from exc

        # _stage_config 정리
        context.pop("_stage_config", None)

        return context

    def validate(self) -> list[str]:
        """dry-run: 정의 유효성 검증

        파이프라인을 실행하지 않고 정의만 검증한다.
        등록되지 않은 스테이지, 유효하지 않은 skip_if 형식 등을 체크.

        Returns:
            오류 메시지 목록. 빈 리스트면 유효.
        """
        errors: list[str] = []

        if not self.definition.name:
            errors.append("파이프라인 이름이 비어있습니다")

        if not self.definition.stages:
            errors.append("스테이지가 정의되지 않았습니다")

        seen_names: set[str] = set()
        for i, stage_config in enumerate(self.definition.stages):
            # 이름 검증
            if not stage_config.name:
                errors.append(f"스테이지 [{i}]: 이름이 비어있습니다")
                continue

            # 중복 이름 체크
            if stage_config.name in seen_names:
                errors.append(f"스테이지 '{stage_config.name}': 이름이 중복됩니다")
            seen_names.add(stage_config.name)

            # 등록 여부 체크
            if stage_config.name not in self._stage_registry:
                errors.append(
                    f"스테이지 '{stage_config.name}': 등록되지 않았습니다"
                )

            # skip_if 형식 체크 (비어있거나, 알파벳/밑줄/느낌표만 허용)
            if stage_config.skip_if is not None:
                clean = stage_config.skip_if.lstrip("!")
                if not clean:
                    errors.append(
                        f"스테이지 '{stage_config.name}': "
                        f"skip_if 조건이 비어있습니다"
                    )
                elif not clean.replace("_", "").isalnum():
                    errors.append(
                        f"스테이지 '{stage_config.name}': "
                        f"skip_if '{stage_config.skip_if}'에 유효하지 않은 문자가 포함되어 있습니다"
                    )

        return errors

    # --- 팩토리 메서드 ---

    @staticmethod
    def from_dict(data: dict[str, Any]) -> Pipeline:
        """dict에서 Pipeline 생성

        Args:
            data: 파이프라인 정의 dict
                {"name": "...", "stages": [...], "webhooks": {...}}

        Returns:
            Pipeline 인스턴스 (스테이지 미등록 상태)
        """
        stages = []
        for stage_data in data.get("stages", []):
            stages.append(StageConfig(
                name=stage_data["name"],
                config=stage_data.get("config", {}),
                skip_if=stage_data.get("skip_if"),
                skip_on_error=stage_data.get("skip_on_error", False),
                module=stage_data.get("module"),
            ))

        definition = PipelineDefinition(
            name=data.get("name", "unnamed"),
            stages=stages,
            webhooks=data.get("webhooks", {}),
        )
        return Pipeline(definition)

    @staticmethod
    def from_json(path: str) -> Pipeline:
        """JSON 파일에서 Pipeline 생성

        Args:
            path: JSON 파일 경로

        Returns:
            Pipeline 인스턴스

        Raises:
            FileNotFoundError: 파일 없음
            json.JSONDecodeError: JSON 파싱 실패
        """
        filepath = Path(path)
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)
        return Pipeline.from_dict(data)

    @staticmethod
    def from_yaml(path: str) -> Pipeline:
        """YAML 파일에서 Pipeline 생성

        간단한 내장 YAML 파서를 사용한다 (PyYAML 의존 금지).
        지원 범위: 기본 키-값, 리스트, 중첩 dict (파이프라인 정의에 충분한 수준).

        Args:
            path: YAML 파일 경로

        Returns:
            Pipeline 인스턴스

        Raises:
            FileNotFoundError: 파일 없음
            ValueError: YAML 파싱 실패
        """
        filepath = Path(path)
        text = filepath.read_text(encoding="utf-8")
        data = _parse_simple_yaml(text)
        return Pipeline.from_dict(data)


# ---------------------------------------------------------------------------
# 간단한 YAML 파서 (표준 라이브러리만 사용)
# ---------------------------------------------------------------------------

def _parse_simple_yaml(text: str) -> dict[str, Any]:
    """간단한 YAML 파서

    파이프라인 정의에 필요한 수준만 지원:
    - 키: 값 (문자열, 숫자, bool, null)
    - 리스트 (- 항목)
    - 중첩 dict (인덴트 기반)
    - 주석 (#)

    제한사항:
    - 멀티라인 문자열 미지원
    - 앵커/참조 미지원
    - 복잡한 YAML 기능 미지원

    Args:
        text: YAML 텍스트

    Returns:
        파싱된 dict
    """
    lines = text.splitlines()
    # 빈 줄, 주석 줄 제거
    cleaned: list[tuple[int, int, str]] = []  # (line_no, indent, content)
    for i, line in enumerate(lines):
        stripped = line.rstrip()
        if not stripped or stripped.lstrip().startswith("#"):
            continue
        # 인덴트 계산 (스페이스 기준)
        indent = len(stripped) - len(stripped.lstrip())
        content = stripped.lstrip()
        # 인라인 주석 제거 (따옴표 밖의 #)
        comment_pos = _find_comment_pos(content)
        if comment_pos >= 0:
            content = content[:comment_pos].rstrip()
        if content:
            cleaned.append((i, indent, content))

    result, _ = _parse_yaml_block(cleaned, 0, 0)
    return result if isinstance(result, dict) else {}


def _find_comment_pos(s: str) -> int:
    """문자열에서 따옴표 밖의 # 위치를 찾는다"""
    in_single = False
    in_double = False
    for i, c in enumerate(s):
        if c == "'" and not in_double:
            in_single = not in_single
        elif c == '"' and not in_single:
            in_double = not in_double
        elif c == "#" and not in_single and not in_double:
            # # 앞에 공백이 있거나 시작인 경우만 주석
            if i == 0 or s[i - 1] == " ":
                return i
    return -1


def _parse_yaml_value(s: str) -> Any:
    """YAML 스칼라 값 파싱"""
    if not s:
        return None

    # 따옴표 문자열
    if (s.startswith('"') and s.endswith('"')) or \
       (s.startswith("'") and s.endswith("'")):
        return s[1:-1]

    # null
    if s in ("null", "~", "None"):
        return None

    # bool
    if s in ("true", "True", "yes", "Yes"):
        return True
    if s in ("false", "False", "no", "No"):
        return False

    # 숫자
    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        pass

    return s


def _parse_yaml_block(
    lines: list[tuple[int, int, str]],
    start: int,
    expected_indent: int,
) -> tuple[Any, int]:
    """YAML 블록 파싱 (재귀)

    Returns:
        (파싱된 값, 다음 줄 인덱스)
    """
    if start >= len(lines):
        return {}, start

    _, first_indent, first_content = lines[start]

    # 리스트 항목인 경우
    if first_content.startswith("- ") or first_content == "-":
        result_list: list[Any] = []
        idx = start
        while idx < len(lines):
            _, indent, content = lines[idx]
            if indent < expected_indent:
                break
            if indent == expected_indent and not content.startswith("- "):
                break
            if indent == expected_indent and (content.startswith("- ") or content == "-"):
                item_content = content[2:] if content.startswith("- ") else ""
                if not item_content or item_content == "":
                    # 중첩 dict
                    if idx + 1 < len(lines) and lines[idx + 1][1] > indent:
                        sub, idx = _parse_yaml_block(lines, idx + 1, lines[idx + 1][1])
                        result_list.append(sub)
                        continue
                    else:
                        result_list.append(None)
                        idx += 1
                        continue
                elif ":" in item_content:
                    # 인라인 dict (- name: value)
                    item_dict: dict[str, Any] = {}
                    # 이 줄의 키:값
                    key, _, val = item_content.partition(":")
                    key = key.strip()
                    val = val.strip()
                    if val:
                        item_dict[key] = _parse_yaml_value(val)
                    else:
                        # 다음 줄에 값이 있을 수 있음
                        if idx + 1 < len(lines) and lines[idx + 1][1] > indent:
                            sub, next_idx = _parse_yaml_block(
                                lines, idx + 1, lines[idx + 1][1]
                            )
                            item_dict[key] = sub
                            # 같은 인덴트의 후속 키도 처리
                            idx = next_idx
                            while idx < len(lines):
                                _, ni, nc = lines[idx]
                                if ni <= expected_indent:
                                    break
                                if ni == expected_indent + 2 and ":" in nc:
                                    k2, _, v2 = nc.partition(":")
                                    k2 = k2.strip()
                                    v2 = v2.strip()
                                    if v2:
                                        item_dict[k2] = _parse_yaml_value(v2)
                                    else:
                                        if idx + 1 < len(lines) and lines[idx + 1][1] > ni:
                                            sub2, idx = _parse_yaml_block(
                                                lines, idx + 1, lines[idx + 1][1]
                                            )
                                            item_dict[k2] = sub2
                                            continue
                                        else:
                                            item_dict[k2] = None
                                    idx += 1
                                else:
                                    break
                            result_list.append(item_dict)
                            continue
                        else:
                            item_dict[key] = None

                    # 같은 리스트 항목의 후속 키-값
                    idx += 1
                    while idx < len(lines):
                        _, ni, nc = lines[idx]
                        if ni <= expected_indent:
                            break
                        if ":" in nc:
                            k2, _, v2 = nc.partition(":")
                            k2 = k2.strip()
                            v2 = v2.strip()
                            if v2:
                                item_dict[k2] = _parse_yaml_value(v2)
                            else:
                                if idx + 1 < len(lines) and lines[idx + 1][1] > ni:
                                    sub2, idx = _parse_yaml_block(
                                        lines, idx + 1, lines[idx + 1][1]
                                    )
                                    item_dict[k2] = sub2
                                    continue
                                else:
                                    item_dict[k2] = None
                            idx += 1
                        else:
                            break
                    result_list.append(item_dict)
                    continue
                else:
                    result_list.append(_parse_yaml_value(item_content))
                    idx += 1
                    continue
            else:
                # 인덴트가 더 깊은 경우 — 이전 항목에 속함
                idx += 1
                continue
        return result_list, idx

    # dict인 경우
    result_dict: dict[str, Any] = {}
    idx = start
    while idx < len(lines):
        _, indent, content = lines[idx]
        if indent < expected_indent:
            break
        if indent > expected_indent:
            idx += 1
            continue

        if ":" not in content:
            idx += 1
            continue

        key, _, val = content.partition(":")
        key = key.strip()
        val = val.strip()

        if val:
            # 인라인 값
            result_dict[key] = _parse_yaml_value(val)
            idx += 1
        else:
            # 다음 줄에 블록 값
            if idx + 1 < len(lines) and lines[idx + 1][1] > indent:
                sub, idx = _parse_yaml_block(lines, idx + 1, lines[idx + 1][1])
                result_dict[key] = sub
            else:
                result_dict[key] = None
                idx += 1

    return result_dict, idx
