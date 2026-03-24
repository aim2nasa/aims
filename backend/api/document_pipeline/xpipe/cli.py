"""
xPipe CLI — 패키지 상태 확인, 테스트 실행, 버전 조회

사용법:
    python -m xpipe status    → 패키지 정보 + ABC 정의 상태 출력
    python -m xpipe test      → 내장 테스트 실행 (pytest 호출)
    python -m xpipe version   → 버전 출력

xpipe 패키지 독립성 유지: 표준 라이브러리만 사용.
"""
from __future__ import annotations

import argparse
import importlib
import inspect
import os
import subprocess
import sys
from pathlib import Path


def _get_version() -> str:
    """pyproject.toml에서 버전을 읽는다."""
    pyproject_path = Path(__file__).parent / "pyproject.toml"
    if not pyproject_path.exists():
        return "unknown"

    # 표준 라이브러리만 사용하여 TOML 파싱 (정규식 불필요한 간단한 파싱)
    try:
        import tomllib  # Python 3.11+
    except ModuleNotFoundError:
        # Python 3.10 fallback: 간단한 문자열 파싱
        text = pyproject_path.read_text(encoding="utf-8")
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("version"):
                # version = "0.1.0"
                parts = stripped.split("=", 1)
                if len(parts) == 2:
                    return parts[1].strip().strip('"').strip("'")
        return "unknown"

    with open(pyproject_path, "rb") as f:
        data = tomllib.load(f)
    return data.get("project", {}).get("version", "unknown")


def _cmd_version(_args: argparse.Namespace) -> int:
    """버전 출력"""
    print(f"xpipe {_get_version()}")
    return 0


def _cmd_status(_args: argparse.Namespace) -> int:
    """패키지 정보 + ABC 정의 상태 출력"""
    version = _get_version()
    print(f"xpipe v{version}")
    print()

    # ABC 목록
    from xpipe.adapter import DomainAdapter
    from xpipe.store import DocumentStore
    from xpipe.queue import JobQueue
    from xpipe.providers import LLMProvider, OCRProvider, EmbeddingProvider

    abcs = [
        ("DomainAdapter", DomainAdapter),
        ("DocumentStore", DocumentStore),
        ("JobQueue", JobQueue),
        ("LLMProvider", LLMProvider),
        ("OCRProvider", OCRProvider),
        ("EmbeddingProvider", EmbeddingProvider),
    ]

    print("=== ABC 정의 ===")
    for name, cls in abcs:
        abstract_methods = []
        optional_methods = []
        for method_name, method in inspect.getmembers(cls, predicate=inspect.isfunction):
            if method_name.startswith("_"):
                continue
            if getattr(method, "__isabstractmethod__", False):
                abstract_methods.append(method_name)
            else:
                optional_methods.append(method_name)

        print(f"\n  {name}:")
        print(f"    abstract 메서드 ({len(abstract_methods)}개):")
        for m in sorted(abstract_methods):
            print(f"      - {m}")
        if optional_methods:
            print(f"    선택적 메서드 ({len(optional_methods)}개):")
            for m in sorted(optional_methods):
                print(f"      - {m}")

    # 등록된 어댑터 탐색 (플러그인 방식 — xpipe 독립성 유지)
    print("\n=== 등록된 어댑터 ===")
    adapter_module = os.environ.get("XPIPE_ADAPTER_MODULE", "")
    adapter_class = os.environ.get("XPIPE_ADAPTER_CLASS", "")
    if adapter_module and adapter_class:
        try:
            mod = importlib.import_module(adapter_module)
            adapter_cls = getattr(mod, adapter_class)
            adapter = adapter_cls()
            print(f"  - {adapter_class} ({adapter_module})")
            print(f"    DomainAdapter 구현: {'OK' if isinstance(adapter, DomainAdapter) else 'FAIL'}")
        except (ImportError, AttributeError):
            print(f"  어댑터 로드 실패: {adapter_module}.{adapter_class}")
    else:
        print("  (XPIPE_ADAPTER_MODULE / XPIPE_ADAPTER_CLASS 환경변수가 설정되지 않았습니다)")

    return 0


def _cmd_quality(args: argparse.Namespace) -> int:
    """품질 게이트 정보 및 GT 측정"""
    from xpipe.quality import QualityConfig, QualityGate, is_enabled

    subcommand = getattr(args, "quality_command", None)

    if subcommand == "check":
        # GT 파일 경로가 지정된 경우 측정 실행
        gt_path = getattr(args, "gt_path", None)
        if not gt_path:
            print("GT 파일 경로를 지정하세요: python -m xpipe quality check <GT_PATH>")
            return 1

        from xpipe.quality_runner import GroundTruthRunner

        runner = GroundTruthRunner()
        try:
            report = runner.measure_accuracy(gt_path)
        except FileNotFoundError:
            print(f"GT 파일을 찾을 수 없습니다: {gt_path}")
            return 1
        except Exception as e:
            print(f"GT 측정 실패: {e}")
            return 1

        print("=== Ground Truth 측정 결과 ===")
        print(f"  전체: {report.total}건")
        print(f"  정확: {report.correct}건")
        print(f"  오류: {report.incorrect}건")
        print(f"  스킵: {report.skipped}건")
        print(f"  정확도: {report.accuracy:.1%}")

        if report.mismatches:
            print(f"\n  불일치 ({len(report.mismatches)}건):")
            for m in report.mismatches[:10]:  # 최대 10건 표시
                print(f"    {m['file_id']}: {m['expected']} → {m['actual']}")
            if len(report.mismatches) > 10:
                print(f"    ... 외 {len(report.mismatches) - 10}건")

        return 0

    # 기본: 품질 게이트 설정 표시
    config = QualityConfig()
    enabled = is_enabled()

    print("=== Quality Gate 설정 ===")
    print(f"  상태: {'활성화' if enabled else '비활성화'} (XPIPE_QUALITY_GATE)")
    print(f"  최소 confidence: {config.min_confidence}")
    print(f"  최소 텍스트 길이: {config.min_text_length}자")
    print(f"  최대 깨진 문자 비율: {config.max_broken_char_ratio:.0%}")
    print(f"  종합 통과 임계치: {config.overall_threshold}")
    print()
    print("  플래그 종류:")
    print("    LOW_CONFIDENCE  -- 분류 신뢰도가 임계치 미만")
    print("    SHORT_TEXT      -- 텍스트가 너무 짧음")
    print("    BROKEN_TEXT     -- 깨진 문자 비율이 너무 높음")
    print("    UNCLASSIFIED    -- 미분류(general/unknown/빈값)")
    print()
    print("  사용법:")
    print("    python -m xpipe quality          → 설정 표시 (현재 화면)")
    print("    python -m xpipe quality check <GT_PATH>  → GT 측정")

    return 0


def _cmd_providers(_args: argparse.Namespace) -> int:
    """등록된 Provider ABC 정보 출력"""
    from xpipe.providers import LLMProvider, OCRProvider, EmbeddingProvider

    provider_abcs = [
        ("LLMProvider", LLMProvider),
        ("OCRProvider", OCRProvider),
        ("EmbeddingProvider", EmbeddingProvider),
    ]

    print("=== AI Provider ABC ===")
    for name, cls in provider_abcs:
        abstract_methods = sorted(cls.__abstractmethods__)
        print(f"\n  {name}:")
        print(f"    abstract 메서드 ({len(abstract_methods)}개):")
        for m in abstract_methods:
            print(f"      - {m}")

    # ProviderRegistry 사용 예시
    print("\n=== Provider Registry 사용법 ===")
    print("  from xpipe import ProviderRegistry, LLMProvider")
    print()
    print("  registry = ProviderRegistry()")
    print('  registry.register("llm", my_llm_provider, priority=10)')
    print('  registry.register("llm", fallback_provider, priority=1)')
    print()
    print('  provider = registry.get("llm")  # 최우선 Provider')
    print('  result = await registry.call_with_fallback("llm", "complete", ...)')

    # CostTracker 사용 예시
    print("\n=== Cost Tracker 사용법 ===")
    print("  from xpipe import CostTracker, UsageRecord")
    print()
    print("  tracker = CostTracker()")
    print("  tracker.record(UsageRecord(...))")
    print('  summary = tracker.get_summary("day")')

    return 0


def _cmd_events(_args: argparse.Namespace) -> int:
    """이벤트/웹훅 시스템 정보 출력"""
    from xpipe.events import EventBus, PipelineEvent, WebhookConfig

    config = WebhookConfig()

    print("=== EventBus 시스템 ===")
    print()
    print("  핵심 클래스:")
    print("    PipelineEvent  -- 파이프라인 이벤트 (event_type, document_id, stage, payload)")
    print("    EventBus       -- 이벤트 발행 + 웹훅 디스패치")
    print("    WebhookConfig  -- 웹훅 전송 설정")
    print()
    print("  기본 설정:")
    print(f"    최대 재시도: {config.max_retries}회")
    print(f"    재시도 간격: {config.retry_delay_seconds}초")
    print(f"    타임아웃: {config.timeout_seconds}초")
    print()
    print("  이벤트 유형:")
    print("    document_processed  -- 문서 처리 완료")
    print("    stage_complete      -- 단계 완료")
    print("    error               -- 오류 발생")
    print()
    print("  사용법:")
    print("    from xpipe import EventBus, PipelineEvent")
    print()
    print("    bus = EventBus()")
    print('    bus.register_webhook("document_processed", "https://example.com/hook")')
    print()
    print("    event = PipelineEvent(")
    print('        event_type="document_processed",')
    print('        document_id="abc123",')
    print('        stage="classification",')
    print('        payload={"category": "policy"},')
    print("    )")
    print("    await bus.emit(event)")
    print()
    print("  Dead Letter Queue:")
    print("    bus.get_dead_letter_queue()    -- 실패 이벤트 조회")
    print("    bus.clear_dead_letter_queue()  -- DLQ 비우기")

    return 0


def _cmd_audit(_args: argparse.Namespace) -> int:
    """감사 로그 시스템 정보 출력"""
    from xpipe.audit import AuditLog, AuditEntry

    print("=== Audit Log 시스템 ===")
    print()
    print("  핵심 클래스:")
    print("    AuditEntry  -- 감사 로그 엔트리 (document_id, stage, action, actor, checksum)")
    print("    AuditLog    -- 변경 불가 감사 로그 관리")
    print()
    print("  특징:")
    print("    - SHA-256 체크섬으로 무결성 보장")
    print("    - Append-only (수정/삭제 불가)")
    print("    - 인메모리 구현 (영구 저장소는 향후 확장)")
    print()
    print("  조회 메서드:")
    print("    get_by_document(doc_id)    -- 문서별 조회")
    print("    get_by_stage(stage)        -- 단계별 조회")
    print("    get_by_actor(actor)        -- 액터별 조회")
    print("    get_by_period(start, end)  -- 기간별 조회")
    print()
    print("  무결성 검증:")
    print("    verify_integrity(entry)    -- 단건 체크섬 검증")
    print("    verify_all()               -- 전체 로그 검증")
    print()
    print("  사용법:")
    print("    from xpipe import AuditLog, AuditEntry")
    print()
    print("    audit = AuditLog()")
    print("    entry = audit.record(AuditEntry(")
    print('        document_id="abc123",')
    print('        stage="classification",')
    print('        action="classified",')
    print('        actor="openai/gpt-4o",')
    print('        details={"confidence": 0.95},')
    print("    ))")
    print("    assert audit.verify_integrity(entry)")

    return 0


def _cmd_pipeline(args: argparse.Namespace) -> int:
    """파이프라인 정의 검증 및 프리셋 정보"""
    subcommand = getattr(args, "pipeline_command", None)

    if subcommand == "validate":
        # YAML/JSON 정의 파일 검증
        filepath = getattr(args, "definition_path", None)
        if not filepath:
            print("정의 파일 경로를 지정하세요: python -m xpipe pipeline validate <PATH>")
            return 1

        from xpipe.pipeline import Pipeline
        from xpipe.stages import (
            IngestStage, ExtractStage, ClassifyStage,
            DetectSpecialStage, EmbedStage, CompleteStage,
        )

        try:
            if filepath.endswith(".json"):
                pipeline = Pipeline.from_json(filepath)
            else:
                pipeline = Pipeline.from_yaml(filepath)
        except FileNotFoundError:
            print(f"파일을 찾을 수 없습니다: {filepath}")
            return 1
        except Exception as e:
            print(f"파싱 실패: {e}")
            return 1

        # 내장 스테이지 등록 (검증용)
        pipeline.register_stage("ingest", IngestStage)
        pipeline.register_stage("extract", ExtractStage)
        pipeline.register_stage("classify", ClassifyStage)
        pipeline.register_stage("detect_special", DetectSpecialStage)
        pipeline.register_stage("embed", EmbedStage)
        pipeline.register_stage("complete", CompleteStage)

        errors = pipeline.validate()

        if errors:
            print(f"검증 실패 ({len(errors)}건):")
            for err in errors:
                print(f"  - {err}")
            return 1

        print(f"검증 통과: {pipeline.definition.name}")
        print(f"  스테이지: {len(pipeline.definition.stages)}개")
        for sc in pipeline.definition.stages:
            skip_info = f" (skip_if: {sc.skip_if})" if sc.skip_if else ""
            error_info = " [skip_on_error]" if sc.skip_on_error else ""
            print(f"    - {sc.name}{skip_info}{error_info}")
        return 0

    if subcommand == "presets":
        from xpipe.pipeline_presets import list_presets as _list_presets

        presets = _list_presets()
        print("=== 내장 프리셋 ===")
        for p in presets:
            print(f"\n  {p['name']} ({p['stage_count']}개 스테이지):")
            for stage_name in p["stages"]:
                print(f"    - {stage_name}")
        return 0

    # 기본: pipeline 도움말
    print("사용법:")
    print("  python -m xpipe pipeline validate <YAML|JSON>  → 정의 검증")
    print("  python -m xpipe pipeline presets                → 내장 프리셋 목록")
    return 0


def _cmd_demo(_args: argparse.Namespace) -> int:
    """xPipeWeb 데모 서버 시작"""
    try:
        from xpipe.console.web.server import run_server
        run_server()
    except ImportError as e:
        print(f"xPipeWeb 서버를 시작할 수 없습니다: {e}")
        print("FastAPI/uvicorn이 설치되어 있는지 확인하세요:")
        print("  pip install fastapi uvicorn python-multipart")
        return 1
    return 0


def _cmd_test(args: argparse.Namespace) -> int:
    """내장 테스트 실행 (pytest 호출)"""
    # xpipe 테스트 디렉토리
    xpipe_dir = Path(__file__).parent
    tests_dir = xpipe_dir / "tests"

    # pytest 인수 구성
    pytest_args = [sys.executable, "-m", "pytest"]

    # 테스트 경로 결정
    test_paths = []
    if tests_dir.exists():
        test_paths.append(str(tests_dir))

    # document_pipeline/tests의 xpipe 관련 테스트도 포함
    dp_tests_dir = xpipe_dir.parent / "tests"
    xpipe_test_files = [
        dp_tests_dir / "test_adapter_contract.py",
        dp_tests_dir / "test_xpipe_independence.py",
    ]
    for tf in xpipe_test_files:
        if tf.exists():
            test_paths.append(str(tf))

    if not test_paths:
        print("테스트 파일을 찾을 수 없습니다.")
        return 1

    pytest_args.extend(test_paths)
    pytest_args.append("-v")

    # 추가 인수 전달
    if hasattr(args, "extra") and args.extra:
        pytest_args.extend(args.extra)

    print(f"테스트 실행: {' '.join(pytest_args)}")
    print()

    result = subprocess.run(pytest_args, cwd=str(xpipe_dir.parent))
    return result.returncode


def main() -> None:
    """CLI 엔트리포인트"""
    parser = argparse.ArgumentParser(
        prog="xpipe",
        description="xPipe - Domain-agnostic document processing engine",
    )
    subparsers = parser.add_subparsers(dest="command", help="사용 가능한 명령")

    # version
    sub_version = subparsers.add_parser("version", help="버전 출력")
    sub_version.set_defaults(func=_cmd_version)

    # status
    sub_status = subparsers.add_parser("status", help="패키지 상태 확인")
    sub_status.set_defaults(func=_cmd_status)

    # demo
    sub_demo = subparsers.add_parser("demo", help="xPipeWeb 데모 서버 시작")
    sub_demo.set_defaults(func=_cmd_demo)

    # test
    sub_test = subparsers.add_parser("test", help="내장 테스트 실행")
    sub_test.set_defaults(func=_cmd_test)

    # providers
    sub_providers = subparsers.add_parser("providers", help="AI Provider ABC 정보")
    sub_providers.set_defaults(func=_cmd_providers)

    # events
    sub_events = subparsers.add_parser("events", help="이벤트/웹훅 시스템 정보")
    sub_events.set_defaults(func=_cmd_events)

    # audit
    sub_audit = subparsers.add_parser("audit", help="감사 로그 시스템 정보")
    sub_audit.set_defaults(func=_cmd_audit)

    # pipeline
    sub_pipeline = subparsers.add_parser("pipeline", help="파이프라인 정의 검증/프리셋")
    sub_pipeline.set_defaults(func=_cmd_pipeline, pipeline_command=None)
    pipeline_sub = sub_pipeline.add_subparsers(dest="pipeline_command")

    sub_pipeline_validate = pipeline_sub.add_parser("validate", help="정의 파일 검증")
    sub_pipeline_validate.add_argument("definition_path", help="YAML 또는 JSON 파일 경로")

    pipeline_sub.add_parser("presets", help="내장 프리셋 목록")

    # quality
    sub_quality = subparsers.add_parser("quality", help="품질 게이트 설정/측정")
    sub_quality.set_defaults(func=_cmd_quality, quality_command=None)
    quality_sub = sub_quality.add_subparsers(dest="quality_command")

    sub_quality_check = quality_sub.add_parser("check", help="Ground Truth 측정")
    sub_quality_check.add_argument("gt_path", help="GT JSON 파일 경로")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
