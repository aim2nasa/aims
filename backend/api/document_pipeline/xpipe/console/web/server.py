"""
xPipeWeb v2 — xPipe 엔진 검증용 개발자 전용 웹 데모 서버

v2: "체험 도구" — 각 스테이지에서 무슨 데이터가 들어가고 나오는지 직접 본다.

FastAPI 기반. 포트 8200 (XPIPE_DEMO_PORT 환경 변수로 변경 가능).
외부 DB 의존 없이 인메모리로 동작.

실행:
    python -m xpipe.console.web.server
    # 또는
    python -m xpipe demo
"""
from __future__ import annotations

import asyncio
import importlib
import json
import logging
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Optional

import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel

# xpipe 코어 임포트
from xpipe.scheduler import InMemoryQueue, Job, JobStatus
from xpipe.pipeline import Pipeline, PipelineDefinition, StageConfig
# pipeline_presets는 더 이상 사용하지 않음 (스테이지 토글 방식으로 전환)
from xpipe.events import EventBus, PipelineEvent
from xpipe.audit import AuditLog, AuditEntry
from xpipe.cost_tracker import CostTracker, UsageRecord
from xpipe.quality import QualityGate, QualityConfig, QualityScore
from xpipe.stages import (
    IngestStage,
    ConvertStage,
    ExtractStage,
    ClassifyStage,
    DetectSpecialStage,
    EmbedStage,
    CompleteStage,
)
from xpipe.stages.convert import needs_conversion

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 환경변수 파일 로드 (API 키 등)
# ---------------------------------------------------------------------------
def _find_env_file() -> list[Path]:
    """상위 디렉토리를 올라가며 .env.shared와 .env를 탐색한다.

    Returns:
        발견된 환경변수 파일 경로 목록 (.env.shared 우선)
    """
    found: list[Path] = []
    current = Path(__file__).resolve().parent
    for _ in range(10):
        for name in (".env.shared", ".env"):
            env_path = current / name
            if env_path.exists() and env_path not in found:
                found.append(env_path)
        current = current.parent
    return found


def _load_env_files() -> None:
    """환경변수 파일들에서 API 키 등 로드. 먼저 로드된 값이 우선."""
    # XPIPE_ENV_FILE 환경변수가 있으면 그것만 사용
    env_file = os.environ.get("XPIPE_ENV_FILE", "")
    if env_file and Path(env_file).exists():
        candidates = [Path(env_file)]
    else:
        # 상위 디렉토리 탐색 (.env.shared, .env)
        candidates = _find_env_file()
    loaded = []
    for env_path in candidates:
        if env_path.exists():
            with open(env_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, value = line.partition("=")
                    key, value = key.strip(), value.strip()
                    if key and key not in os.environ:
                        os.environ[key] = value
            loaded.append(str(env_path))
    if loaded:
        print(f"[xPipeWeb] 환경변수 로드: {', '.join(loaded)}")
    else:
        print("[xPipeWeb] WARNING: .env 파일을 찾을 수 없습니다")

# ---------------------------------------------------------------------------
# 상수
# ---------------------------------------------------------------------------
WEB_DIR = Path(__file__).parent
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
MAX_CONCURRENCY = 2
VERSION = "0.3.1"

# 허용된 어댑터 모듈/클래스 화이트리스트 (보안: 임의 모듈 import 방지)
ALLOWED_ADAPTERS: dict[str, list[str]] = {
    "insurance.adapter": ["InsuranceDomainAdapter"],
}

# 환경변수 매핑 — 실행 진입점에서 주입. 코어 모듈은 특정 서비스를 모른다.
_env_key_map: dict[str, str] = {}


# ---------------------------------------------------------------------------
# ServerState — 모든 인메모리 상태를 캡슐화
# ---------------------------------------------------------------------------
class ServerState:
    """xPipeWeb 서버의 모든 인메모리 상태를 캡슐화한다.

    모듈 레벨 글로벌 변수를 제거하고, 단일 state 인스턴스로 관리.
    테스트에서 state를 교체/리셋하여 격리된 테스트가 가능하다.
    """

    def __init__(self) -> None:
        # .env 파일 로드 (API 키 등)
        _load_env_files()

        # 환경변수에서 API 키 1회 읽기 (이후 os.environ 직접 참조 금지)
        self.env_api_keys: dict[str, str] = {
            provider: os.environ.get(env_var, "")
            for provider, env_var in _env_key_map.items()
        }

        # 인메모리 문서 상태
        self.documents: dict[str, dict[str, Any]] = {}
        self.sse_events: list[dict[str, Any]] = []
        self.sse_event_id: int = 0
        self._queue_counter: int = 0

        # 인프라 모듈
        self.event_bus = EventBus()
        self.audit_log = AuditLog()
        self.cost_tracker = CostTracker()
        self.quality_gate = QualityGate()

        # 현재 설정
        _default_mode = "real" if self.env_api_keys.get("openai") else "stub"
        self.current_config: dict[str, Any] = {
            "adapter": "none",
            "quality_gate": True,
            "mode": _default_mode,
            "enabled_stages": ["ingest", "convert", "extract", "classify", "detect_special", "embed", "complete"],
            "models": {
                "llm": "gpt-4.1-mini",
                "ocr": "upstage",
                "embedding": "text-embedding-3-small",
            },
            "api_keys": {
                "openai": "",
                "upstage": "",
            },
            "storage_path": "",
            "adapter_module": "",
            "adapter_class": "",
        }

        # 임시 파일 디렉토리
        self.temp_dir: Optional[str] = None

        # SSE 클라이언트 큐
        self.sse_queues: list[asyncio.Queue] = []

        # FIFO 작업 큐 + 동시성 제어
        self.pipeline_queue = InMemoryQueue(maxsize=100)
        self._running_count: int = 0
        self._worker_task: Optional[asyncio.Task] = None
        self._running_tasks: set[asyncio.Task] = set()

        # LLM 모델 캐시
        self._cached_llm_models: list[str] | None = None

        # 어댑터 인스턴스 캐시 (동일 모듈:클래스일 때 재사용)
        self.cached_adapter: Any = None
        self.cached_adapter_key: str = ""  # "module:class"
        self._adapter_cache_lock: asyncio.Lock | None = None  # lifespan에서 초기화

    def resolve_api_key(self, provider: str) -> str:
        """API 키 해석: 설정 패널 값 우선, 없으면 환경변수에서 읽은 캐시 값 반환"""
        config_key = self.current_config.get("api_keys", {}).get(provider, "")
        return config_key or self.env_api_keys.get(provider, "")


# 모듈 레벨 싱글턴 인스턴스
state = ServerState()

# 하위 호환 alias (기존 코드에서 모듈 레벨 변수로 접근하는 경우 대비)
documents = state.documents
sse_events = state.sse_events
event_bus = state.event_bus
audit_log = state.audit_log
cost_tracker = state.cost_tracker
quality_gate = state.quality_gate
current_config = state.current_config
pipeline_queue = state.pipeline_queue


async def _queue_worker() -> None:
    """큐에서 작업을 FIFO로 꺼내 파이프라인 실행. 동시성 제어."""
    while True:
        if state._running_count < MAX_CONCURRENCY:
            job = await state.pipeline_queue.get(timeout=0.5)
            if job is None:
                continue
            state._running_count += 1
            task = asyncio.create_task(_execute_queued_job(job))
            state._running_tasks.add(task)
            task.add_done_callback(state._running_tasks.discard)
        else:
            await asyncio.sleep(0.05)


async def _execute_queued_job(job: Job) -> None:
    """큐에서 꺼낸 작업 실행 후 카운터 해제."""
    try:
        await _run_pipeline(job.job_id, job.file_path, job.filename)
    finally:
        state._running_count -= 1


# ---------------------------------------------------------------------------
# SSE 브릿지 (EventBus -> SSE)
# ---------------------------------------------------------------------------
def _on_pipeline_event(event: PipelineEvent) -> None:
    """EventBus 이벤트를 SSE 버퍼 + 클라이언트 큐에 전달"""
    state.sse_event_id += 1
    sse_data = {
        "id": state.sse_event_id,
        **event.to_dict(),
    }
    state.sse_events.append(sse_data)
    # 버퍼 최대 1000개 유지
    if len(state.sse_events) > 1000:
        state.sse_events.pop(0)
    # 연결된 SSE 클라이언트에 push
    for q in state.sse_queues:
        try:
            q.put_nowait(sse_data)
        except asyncio.QueueFull:
            pass


# 와일드카드 리스너 등록 — 모든 이벤트 수신
state.event_bus.on("*", _on_pipeline_event)


# ---------------------------------------------------------------------------
# 파이프라인 조립
# ---------------------------------------------------------------------------
# 전체 스테이지 정의 (순서 + skip_if 조건)
ALL_STAGES = [
    {"name": "ingest", "config": {}},
    {"name": "convert", "config": {}, "skip_if": "!needs_conversion"},
    {"name": "extract", "config": {}, "skip_if": "has_text"},
    {"name": "classify", "config": {}},
    {"name": "detect_special", "config": {}},
    {"name": "embed", "config": {}, "skip_if": "credit_pending"},
    {"name": "complete", "config": {}},
]

# 스테이지 클래스 매핑
STAGE_CLASSES = {
    "ingest": IngestStage,
    "convert": ConvertStage,
    "extract": ExtractStage,
    "classify": ClassifyStage,
    "detect_special": DetectSpecialStage,
    "embed": EmbedStage,
    "complete": CompleteStage,
}


def _build_pipeline(enabled_stages: list[str]) -> Pipeline:
    """활성 스테이지 목록으로 파이프라인 조립"""
    stages = [s for s in ALL_STAGES if s["name"] in enabled_stages]
    definition = {"name": "custom", "stages": stages}
    pipeline = Pipeline.from_dict(definition)
    pipeline.event_bus = state.event_bus
    for name, cls in STAGE_CLASSES.items():
        pipeline.register_stage(name, cls)
    return pipeline


async def _inject_adapter_config(context: dict) -> None:
    """어댑터가 설정되어 있으면, 어댑터의 config를 context에 주입.

    각 스테이지는 context에서 _classify_config, _detect_rules 등을 찾아 동작한다.
    이 함수가 어댑터 인스턴스를 생성하고, 스테이지가 필요로 하는 config를 주입한다.

    race condition 방지: state.current_config 대신 context 스냅샷에서 읽는다.
    """
    adapter_name = context.get("adapter_name", "none")
    if adapter_name == "none" or not adapter_name:
        return

    try:
        # 스냅샷에서 어댑터 모듈/클래스 경로를 가져옴 (race condition 방지)
        module_path = context.get("_adapter_module", "") or ""
        class_name = context.get("_adapter_class", "") or ""

        if not (module_path and class_name):
            logger.warning(
                "[Adapter] adapter_name=%s이지만 adapter_module/adapter_class가 "
                "설정되지 않아 어댑터를 로드할 수 없습니다", adapter_name
            )
            return

        # 화이트리스트 검증 (이중 방어: update_config에서도 검증)
        allowed_classes = ALLOWED_ADAPTERS.get(module_path)
        if allowed_classes is None or class_name not in allowed_classes:
            logger.warning(
                "[Adapter] 허용되지 않는 어댑터 모듈/클래스: %s.%s",
                module_path, class_name,
            )
            context["_adapter_status"] = {
                "connected": False,
                "name": adapter_name,
                "error": f"허용되지 않는 어댑터: {module_path}.{class_name}",
            }
            return

        # 어댑터 인스턴스 캐싱 (asyncio.Lock으로 이중 생성 방지)
        cache_key = f"{module_path}:{class_name}"
        lock = state._adapter_cache_lock or asyncio.Lock()
        async with lock:
            if state.cached_adapter_key == cache_key and state.cached_adapter is not None:
                adapter = state.cached_adapter
            else:
                mod = importlib.import_module(module_path)
                adapter_cls = getattr(mod, class_name)
                adapter = adapter_cls()
                state.cached_adapter = adapter
                state.cached_adapter_key = cache_key

        # 1. 분류 config 주입 → ClassifyStage가 사용
        classification_config = await adapter.get_classification_config()
        if classification_config:
            context["_classify_config"] = {
                "system_prompt": classification_config.extra.get("system_prompt", ""),
                "user_prompt": classification_config.prompt_template,
                "categories": [c.code for c in classification_config.categories],
                "valid_types": classification_config.valid_types,
            }

        # 2. 감지 규칙 주입 → DetectSpecialStage가 사용
        #    기존 _detect_rules 키워드 매칭 대신, 어댑터 인스턴스를 직접 주입
        context["_domain_adapter"] = adapter

        logger.info("[Adapter] %s 어댑터 연결 완료", adapter_name)
        context["_adapter_status"] = {"connected": True, "name": adapter_name}

    except ImportError:
        logger.warning("[Adapter] %s 어댑터 모듈을 찾을 수 없음", adapter_name)
        context["_adapter_status"] = {
            "connected": False,
            "name": adapter_name,
            "error": f"모듈을 찾을 수 없음: {adapter_name}",
        }
    except Exception as e:
        logger.error("[Adapter] %s 어댑터 초기화 실패: %s", adapter_name, e)
        context["_adapter_status"] = {
            "connected": False,
            "name": adapter_name,
            "error": f"초기화 실패: {e}",
        }


async def _run_pipeline(doc_id: str, file_path: str, filename: str) -> None:
    """파이프라인 실행 (백그라운드 태스크)"""
    doc = documents.get(doc_id)
    if not doc:
        return

    # 설정 스냅샷 (race condition 방지: 실행 중 설정 변경 영향 차단)
    config_snapshot = dict(current_config)

    # 스테이지 진행 추적 리스너
    stages_completed: list[str] = []

    def _track_stage_start(event: PipelineEvent) -> None:
        if event.document_id == doc_id and event.event_type == "stage_start":
            stage_name = event.stage
            doc["current_stage"] = stage_name
            doc["stages_detail"].setdefault(stage_name, {})
            doc["stages_detail"][stage_name]["status"] = "running"
            doc["stages_detail"][stage_name]["started_at"] = time.time()

    def _track_stage(event: PipelineEvent) -> None:
        if event.document_id == doc_id and event.event_type == "stage_complete":
            stage_name = event.stage
            stages_completed.append(stage_name)
            total_stages = len(config_snapshot.get("enabled_stages", []))
            progress = int(len(stages_completed) / total_stages * 100)
            doc["progress"] = progress
            doc["current_stage"] = stage_name

            doc["stages_detail"][stage_name] = {
                "status": "completed",
                "completed_at": time.time(),
                "duration_ms": event.payload.get("duration_ms", 0),
            }

            # 감사 로그 (스냅샷 사용)
            audit_log.record(AuditEntry(
                document_id=doc_id,
                stage=stage_name,
                action="stage_completed",
                actor=f"{config_snapshot['mode']}/{config_snapshot['adapter']}",
                details={"stages": config_snapshot.get("enabled_stages", [])},
            ))

    event_bus.on("stage_start", _track_stage_start)
    event_bus.on("stage_complete", _track_stage)

    try:
        # 취소 체크
        if doc.get("_cancelled"):
            return

        doc["status"] = "processing"
        doc["started_at"] = time.time()

        enabled = config_snapshot.get("enabled_stages", [s["name"] for s in ALL_STAGES])
        pipeline = _build_pipeline(enabled)
        stage_names = enabled
        doc["enabled_stages"] = list(enabled)  # 실행 시점의 스테이지 기록

        # MIME 타입 추론 (needs_conversion 판단용)
        import mimetypes
        mime_type, _ = mimetypes.guess_type(filename)
        mime_type = mime_type or "application/octet-stream"

        # API 키 해석 (설정 패널 키 → 환경변수 캐시 fallback)
        api_keys_resolved = {
            prov: state.resolve_api_key(prov)
            for prov in config_snapshot.get("api_keys", {})
        }

        # 컨텍스트 구성
        context: dict[str, Any] = {
            "document_id": doc_id,
            "file_path": file_path,
            "filename": filename,
            "original_name": filename,
            "mode": config_snapshot["mode"],
            "models": dict(config_snapshot["models"]),
            "adapter_name": config_snapshot["adapter"],
            "_adapter_module": config_snapshot.get("adapter_module", ""),
            "_adapter_class": config_snapshot.get("adapter_class", ""),
            "uploaded_at": doc.get("created_at_iso", ""),
            "needs_conversion": needs_conversion(mime_type),
            "_api_keys": api_keys_resolved,
            "_config_snapshot": config_snapshot,
        }

        # 어댑터 연결: 어댑터가 설정되어 있으면 config를 context에 주입
        await _inject_adapter_config(context)

        # 파이프라인 실행
        result = await pipeline.run(context)

        # 취소 체크 (파이프라인 실행 중 삭제된 경우)
        if doc.get("_cancelled"):
            return

        # stage_data를 문서에 병합
        if "stage_data" in result:
            for sname, sdata in result["stage_data"].items():
                doc["stages_data"][sname] = sdata

        # 결과 반영
        doc["status"] = "completed"
        doc["progress"] = 100
        doc["completed_at"] = time.time()
        doc["duration"] = doc["completed_at"] - doc["started_at"]
        doc["extracted_text"] = result.get("extracted_text", result.get("text", ""))
        # 변환된 PDF 경로 보존 (프리뷰용)
        if result.get("converted_pdf_path"):
            doc["converted_pdf_path"] = result["converted_pdf_path"]
        if result.get("conversion_failed"):
            doc["conversion_failed"] = True
            doc["conversion_error"] = result.get("conversion_error", "")

        is_stub = config_snapshot["mode"] == "stub"

        doc["result"] = {
            "document_type": result.get("document_type", "general"),
            "classification_confidence": result.get("classification_confidence", "-" if is_stub else 0.0),
            "detections": result.get("detections", []),
            "text_preview": (result.get("extracted_text", "") or "")[:200],
            "stages_executed": result.get("_pipeline", {}).get("stages_executed", []),
            "stages_skipped": result.get("_pipeline", {}).get("stages_skipped", []),
            "display_name": result.get("display_name", filename),
            "adapter_status": result.get("_adapter_status"),
        }

        # 품질 평가
        if config_snapshot.get("quality_gate", True) and not is_stub:
            score = quality_gate.evaluate({
                "classification_confidence": doc["result"]["classification_confidence"],
                "full_text": doc.get("extracted_text", ""),
                "document_type": doc["result"]["document_type"],
            })
            doc["quality"] = {
                "overall": score.overall,
                "confidence": score.classification_confidence,
                "text_quality": score.text_quality,
                "passed": score.passed,
                "flags": score.flags,
            }
        else:
            # stub: 품질 "-"
            doc["quality"] = None

        # 비용 추적 — stub은 비용 없음, real은 _usage 토큰 기반 계산
        if is_stub:
            doc["cost"] = None
        else:
            doc["cost"] = _calculate_cost(result)

        # 완료 이벤트
        await event_bus.emit(PipelineEvent(
            event_type="document_processed",
            document_id=doc_id,
            stage="complete",
            payload={
                "document_type": doc["result"]["document_type"],
                "duration": doc["duration"],
            },
        ))

        # 감사 로그
        audit_log.record(AuditEntry(
            document_id=doc_id,
            stage="complete",
            action="pipeline_completed",
            actor="xpipe-demo",
            details={
                "duration": doc["duration"],
                "document_type": doc["result"]["document_type"],
                "mode": config_snapshot["mode"],
            },
        ))

    except Exception as exc:
        logger.exception("파이프라인 실행 실패: doc_id=%s", doc_id)
        doc["status"] = "error"
        doc["error"] = str(exc)
        doc["error_stage"] = doc.get("current_stage", "unknown")
        doc["completed_at"] = time.time()
        doc["duration"] = doc["completed_at"] - doc.get("started_at", doc["completed_at"])

        await event_bus.emit(PipelineEvent(
            event_type="error",
            document_id=doc_id,
            stage=doc.get("current_stage", "unknown"),
            payload={"error": str(exc)},
        ))

        audit_log.record(AuditEntry(
            document_id=doc_id,
            stage=doc.get("current_stage", "unknown"),
            action="pipeline_failed",
            actor="xpipe-demo",
            details={"error": str(exc)},
        ))
    finally:
        # 리스너 해제 (Gini 지적 해결)
        event_bus.off("stage_start", _track_stage_start)
        event_bus.off("stage_complete", _track_stage)


_PREVIEWABLE_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg",
                     ".txt", ".md", ".csv", ".log", ".json", ".xml", ".yaml", ".yml"}


# ---------------------------------------------------------------------------
# 비용 계산 (토큰 기반)
# ---------------------------------------------------------------------------
# 모델별 1K 토큰 가격 (USD)
_MODEL_PRICING: dict[str, dict[str, float]] = {
    # Chat models (input / output per 1K tokens)
    "gpt-4.1-mini":     {"input": 0.0004, "output": 0.0016},
    "gpt-4.1-nano":     {"input": 0.0001, "output": 0.0004},
    "gpt-4.1":          {"input": 0.002,  "output": 0.008},
    "gpt-4o-mini":      {"input": 0.00015,"output": 0.0006},
    "gpt-4o":           {"input": 0.0025, "output": 0.01},
    # Embedding models (input only per 1K tokens)
    "text-embedding-3-small": {"input": 0.00002},
    "text-embedding-3-large": {"input": 0.00013},
    "text-embedding-ada-002": {"input": 0.0001},
}

# Upstage OCR 페이지당 비용 (USD)
_UPSTAGE_OCR_COST_PER_PAGE = 0.01


def _calculate_cost(result: dict[str, Any]) -> float | None:
    """파이프라인 결과의 _usage 데이터를 기반으로 비용 계산.

    Returns:
        비용(USD). 사용량 데이터가 없으면 None.
    """
    usage_data = result.get("_usage", {})
    if not usage_data:
        # fallback: stage_data의 output.tokens에서 토큰 정보 수집
        stage_data = result.get("stage_data", {})
        for sname, sdata in stage_data.items():
            tokens = sdata.get("output", {}).get("tokens")
            if tokens:
                usage_data[sname] = tokens
        if not usage_data:
            return None

    total_cost = 0.0
    has_data = False

    for stage_name, usage in usage_data.items():
        model = usage.get("model", "")
        pricing = _MODEL_PRICING.get(model)
        if not pricing:
            # 알 수 없는 모델 — gpt-4.1-mini 기본 가격 적용
            pricing = _MODEL_PRICING.get("gpt-4.1-mini", {"input": 0.0004, "output": 0.0016})

        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)

        # 입력 비용
        if prompt_tokens > 0:
            total_cost += (prompt_tokens / 1000) * pricing.get("input", 0)
            has_data = True

        # 출력 비용 (embedding은 output 가격 없음)
        if completion_tokens > 0 and "output" in pricing:
            total_cost += (completion_tokens / 1000) * pricing["output"]
            has_data = True

        # embedding: total_tokens 기반 (prompt_tokens가 없을 수 있음)
        if prompt_tokens == 0 and usage.get("total_tokens", 0) > 0:
            total_cost += (usage["total_tokens"] / 1000) * pricing.get("input", 0)
            has_data = True

    # OCR 비용 (extract 스테이지의 stage_data에서 페이지 수 확인)
    stage_data = result.get("stage_data", {})
    extract_data = stage_data.get("extract", {})
    extract_output = extract_data.get("output", {})
    if extract_output.get("method", "").startswith("ocr") or "ocr" in extract_output.get("method", ""):
        # OCR 사용 — 실제 페이지 수 기반 비용 (없으면 1페이지)
        ocr_pages = result.get("_ocr_pages", 1)
        total_cost += _UPSTAGE_OCR_COST_PER_PAGE * ocr_pages
        has_data = True

    return total_cost if has_data else None


def _can_preview(doc: dict[str, Any]) -> bool:
    """프리뷰 가능 여부: PDF/이미지는 직접, 변환 파일은 PDF 존재+크기>0 시"""
    conv = doc.get("converted_pdf_path", "")
    if conv and os.path.exists(conv) and os.path.getsize(conv) > 0:
        return True
    filename = doc.get("filename", "")
    ext = os.path.splitext(filename)[1].lower() if filename else ""
    return ext in _PREVIEWABLE_EXTS


def _create_doc_entry(doc_id: str, filename: str, file_size: int, file_path: str) -> dict[str, Any]:
    """문서 상태 엔트리 생성"""
    state._queue_counter += 1
    queue_number = state._queue_counter

    stage_names = current_config.get("enabled_stages", [s["name"] for s in ALL_STAGES])
    now = time.time()
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()

    return {
        "queue_number": queue_number,
        "id": doc_id,
        "filename": filename,
        "file_size": file_size,
        "file_path": file_path,
        "status": "queued",
        "progress": 0,
        "current_stage": None,
        "stages_detail": {name: {"status": "pending"} for name in stage_names},
        "stages_data": {},  # v2: 각 스테이지의 input/output 데이터
        "extracted_text": "",  # v2: 추출 텍스트 전문
        "summary": None,  # AI 요약 (캐시)
        "result": None,
        "quality": None,
        "cost": None,
        "error": None,
        "error_stage": None,
        "created_at": now,
        "created_at_iso": now_iso,
        "started_at": None,
        "completed_at": None,
        "duration": None,
        "config": {k: v for k, v in current_config.items() if k != "api_keys"},
    }


# ---------------------------------------------------------------------------
# FastAPI 앱
# ---------------------------------------------------------------------------
app = FastAPI(title="xPipeWeb", version=VERSION)


# --- 정적 파일 서빙 ---

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """메인 HTML 서빙"""
    html_path = WEB_DIR / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@app.get("/style.css")
async def serve_css():
    """CSS 서빙"""
    css_path = WEB_DIR / "style.css"
    return Response(
        css_path.read_text(encoding="utf-8"),
        media_type="text/css",
    )


@app.get("/app.js")
async def serve_js():
    """JS 서빙"""
    js_path = WEB_DIR / "app.js"
    return Response(
        js_path.read_text(encoding="utf-8"),
        media_type="application/javascript",
    )


# --- 파일 프리뷰 서빙 ---

@app.get("/api/file/{doc_id}")
async def serve_file(doc_id: str, preview: bool = True):
    """파일 서빙 — preview=true면 변환된 PDF 우선, false면 원본

    변환된 PDF(convPdfPath) → 프리뷰 가능
    원본(destPath) → 다운로드용
    """
    from urllib.parse import quote

    doc = documents.get(doc_id)
    if not doc:
        raise HTTPException(404, f"문서를 찾을 수 없습니다: {doc_id}")

    def _content_disposition(name: str) -> str:
        """한글 파일명 지원 Content-Disposition (RFC 5987)"""
        return f"inline; filename*=UTF-8''{quote(name, safe='')}"

    # 프리뷰: 변환된 PDF 우선 → 원본 fallback
    if preview:
        conv_path = doc.get("converted_pdf_path", "")
        if conv_path and os.path.exists(conv_path) and os.path.getsize(conv_path) > 0:
            return Response(
                open(conv_path, "rb").read(),
                media_type="application/pdf",
                headers={"Content-Disposition": _content_disposition(doc.get("filename", "file") + ".pdf")},
            )

    file_path = doc.get("file_path", "")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(404, "파일을 찾을 수 없습니다")

    import mimetypes
    mime_type, _ = mimetypes.guess_type(file_path)
    mime_type = mime_type or "application/octet-stream"

    return Response(
        open(file_path, "rb").read(),
        media_type=mime_type,
        headers={"Content-Disposition": _content_disposition(doc.get("filename", "file"))},
    )


# --- 파일 업로드 ---

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """단일 파일 업로드 + 파이프라인 실행"""
    if not file.filename:
        raise HTTPException(400, "파일명이 없습니다")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, f"파일 크기 초과: 최대 {MAX_FILE_SIZE // 1024 // 1024}MB")

    doc_id = str(uuid.uuid4())[:8]
    file_path = os.path.join(state.temp_dir, f"{doc_id}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(content)

    documents[doc_id] = _create_doc_entry(doc_id, file.filename, len(content), file_path)

    audit_log.record(AuditEntry(
        document_id=doc_id,
        stage="upload",
        action="file_uploaded",
        actor="user",
        details={"filename": file.filename, "size": len(content)},
    ))

    job = Job(job_id=doc_id, file_path=file_path, filename=file.filename)
    await state.pipeline_queue.put(job)
    return {"doc_id": doc_id, "filename": file.filename, "status": "queued"}


@app.post("/api/upload/batch")
async def upload_batch(files: list[UploadFile] = File(...)):
    """다중 파일 업로드"""
    results = []
    for file in files:
        if not file.filename:
            continue

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            results.append({
                "filename": file.filename,
                "error": f"파일 크기 초과: 최대 {MAX_FILE_SIZE // 1024 // 1024}MB",
            })
            continue

        doc_id = str(uuid.uuid4())[:8]
        file_path = os.path.join(state.temp_dir, f"{doc_id}_{file.filename}")
        with open(file_path, "wb") as f:
            f.write(content)

        documents[doc_id] = _create_doc_entry(doc_id, file.filename, len(content), file_path)

        audit_log.record(AuditEntry(
            document_id=doc_id,
            stage="upload",
            action="file_uploaded",
            actor="user",
            details={"filename": file.filename, "size": len(content)},
        ))

        job = Job(job_id=doc_id, file_path=file_path, filename=file.filename)
        await state.pipeline_queue.put(job)
        results.append({"doc_id": doc_id, "filename": file.filename, "status": "queued"})

    return {"files": results, "total": len(results)}


# --- 상태/결과 조회 ---

@app.get("/api/status/{doc_id}")
async def get_status(doc_id: str):
    """처리 상태 조회"""
    doc = documents.get(doc_id)
    if not doc:
        raise HTTPException(404, f"문서를 찾을 수 없습니다: {doc_id}")

    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "status": doc["status"],
        "progress": doc["progress"],
        "current_stage": doc["current_stage"],
        "stages_detail": doc["stages_detail"],
        "error": doc["error"],
        "error_stage": doc.get("error_stage"),
        "duration": doc["duration"],
    }


@app.get("/api/results/{doc_id}")
async def get_results(doc_id: str):
    """처리 결과 조회 (분류, 감지, 메타, 품질)"""
    doc = documents.get(doc_id)
    if not doc:
        raise HTTPException(404, f"문서를 찾을 수 없습니다: {doc_id}")

    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "status": doc["status"],
        "result": doc["result"],
        "quality": doc["quality"],
        "cost": doc["cost"],
        "duration": doc["duration"],
        "config": doc["config"],
    }


@app.get("/api/documents")
async def list_documents():
    """전체 문서 목록 조회"""
    docs = []
    for doc in documents.values():
        # 감사 건수를 실제 AuditLog에서 조회
        audit_entries = audit_log.get_by_document(doc["id"])
        docs.append({
            "id": doc["id"],
            "queue_number": doc.get("queue_number", 0),
            "filename": doc["filename"],
            "file_size": doc["file_size"],
            "status": doc["status"],
            "progress": doc["progress"],
            "current_stage": doc["current_stage"],
            "result": doc.get("result"),
            "quality": doc.get("quality"),
            "cost": doc.get("cost"),
            "error": doc.get("error"),
            "error_stage": doc.get("error_stage"),
            "duration": doc.get("duration"),
            "created_at": doc["created_at"],
            "stages_detail": doc.get("stages_detail", {}),
            "stages_data": doc.get("stages_data", {}),
            "has_preview": _can_preview(doc),
            "is_converted": bool(doc.get("converted_pdf_path")),
            "conversion_failed": bool(doc.get("conversion_failed")),
            "conversion_error": doc.get("conversion_error", ""),
            "enabled_stages": doc.get("enabled_stages", []),
            "audit_count": len(audit_entries),
        })
    return {"documents": docs}


# --- v2 API: 스테이지 데이터 + 추출 텍스트 ---

@app.get("/api/stages/{doc_id}")
async def get_stages_data(doc_id: str):
    """스테이지별 입출력 데이터 조회 (R1)"""
    doc = documents.get(doc_id)
    if not doc:
        raise HTTPException(404, f"문서를 찾을 수 없습니다: {doc_id}")

    return {
        "doc_id": doc_id,
        "stages_data": doc.get("stages_data", {}),
        "stages_detail": doc.get("stages_detail", {}),
    }


@app.get("/api/text/{doc_id}")
async def get_extracted_text(doc_id: str):
    """추출 텍스트 전문 조회 (R2)"""
    doc = documents.get(doc_id)
    if not doc:
        raise HTTPException(404, f"문서를 찾을 수 없습니다: {doc_id}")

    text = doc.get("extracted_text", "")
    mode = doc.get("config", {}).get("mode", "stub")

    # stub 모드라도 텍스트/PDF/변환 가능 파일은 실제 내용을 추출하므로 is_stub=False
    import mimetypes, os
    filename = doc.get("filename", "")
    mime_type, _ = mimetypes.guess_type(filename)
    ext = os.path.splitext(filename)[1].lower()
    TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".log", ".json", ".xml", ".yaml", ".yml", ".ini", ".cfg", ".conf", ".py", ".js", ".ts", ".html", ".css"}
    CONVERTIBLE_EXTENSIONS = {".hwp", ".doc", ".docx", ".pptx", ".ppt", ".xls", ".xlsx"}
    is_text_file = (mime_type or "").startswith("text/") or ext in TEXT_EXTENSIONS
    is_pdf = (mime_type or "") == "application/pdf"
    is_convertible = ext in CONVERTIBLE_EXTENSIONS
    # 이미지만 실제 추출이 불가능 (OCR 필요)
    is_stub = mode == "stub" and not is_text_file and not is_pdf and not is_convertible

    return {
        "doc_id": doc_id,
        "text": text,
        "text_length": len(text),
        "is_stub": is_stub,
    }


# --- AI 요약 ---

@app.get("/api/summary/{doc_id}")
async def get_summary(doc_id: str):
    """AI 요약 생성 (설정 패널 LLM 모델 사용, 결과 캐시)"""
    doc = documents.get(doc_id)
    if not doc:
        raise HTTPException(404, f"문서를 찾을 수 없습니다: {doc_id}")

    # 시뮬레이션 모드에서는 AI 호출 차단
    mode = doc.get("config", {}).get("mode", current_config.get("mode", "stub"))
    if mode == "stub":
        return {
            "doc_id": doc_id,
            "summary": None,
            "cached": False,
            "simulation": True,
        }

    text = doc.get("extracted_text", "")
    if not text or len(text.strip()) < 10:
        return {
            "doc_id": doc_id,
            "summary": "(텍스트가 너무 짧아 요약할 수 없습니다)",
            "cached": False,
        }

    # 캐시 확인
    if doc.get("summary"):
        return {
            "doc_id": doc_id,
            "summary": doc["summary"],
            "cached": True,
        }

    # OpenAI API 호출
    try:
        import openai
        # 설정 패널 키 우선, 없으면 환경변수 fallback
        api_key = current_config.get("api_keys", {}).get("openai", "") or None
        client = openai.OpenAI(api_key=api_key)  # api_key=None이면 환경변수 사용

        # 텍스트 10,000자 제한
        input_text = text[:10000]
        if len(text) > 10000:
            input_text += "\n\n(... 이하 생략, 총 " + str(len(text)) + "자)"

        filename = doc.get("filename", "")
        doc_type = (doc.get("result") or {}).get("document_type", "")

        llm_model = current_config.get("models", {}).get("llm", "gpt-4.1-mini")
        response = client.chat.completions.create(
            model=llm_model,
            messages=[
                {
                    "role": "system",
                    "content": "문서 요약 전문가. 핵심 내용을 3~5줄로 간결하게 요약. 한국어로 응답.",
                },
                {
                    "role": "user",
                    "content": f"파일명: {filename}\n문서유형: {doc_type}\n\n--- 본문 ---\n{input_text}\n\n위 문서를 3~5줄로 요약해주세요.",
                },
            ],
            max_tokens=500,
            temperature=0.3,
        )

        summary = response.choices[0].message.content.strip()
        doc["summary"] = summary  # 캐시 저장

        return {
            "doc_id": doc_id,
            "summary": summary,
            "cached": False,
        }

    except ImportError:
        raise HTTPException(503, "openai 패키지가 설치되지 않았습니다")
    except Exception as exc:
        logger.exception("AI 요약 실패: doc_id=%s", doc_id)
        raise HTTPException(500, f"요약 생성 실패: {exc}")


# --- SSE 실시간 이벤트 ---

@app.get("/api/events")
async def sse_stream():
    """SSE 실시간 이벤트 스트림"""
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    state.sse_queues.append(queue)

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'version': VERSION})}\n\n"

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"id: {event.get('id', '')}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if queue in state.sse_queues:
                state.sse_queues.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --- 설정 ---

class ConfigUpdate(BaseModel):
    adapter: Optional[str] = None
    adapter_module: Optional[str] = None
    adapter_class: Optional[str] = None
    quality_gate: Optional[bool] = None
    mode: Optional[str] = None
    models: Optional[dict[str, str]] = None
    api_keys: Optional[dict[str, str]] = None
    enabled_stages: Optional[list[str]] = None
    storage_path: Optional[str] = None


class AdapterTestRequest(BaseModel):
    adapter_module: str
    adapter_class: str


def _get_available_llm_models() -> list[str]:
    """OpenAI API에서 사용 가능한 chat 모델 목록 조회 (캐시)"""
    if state._cached_llm_models is not None:
        return state._cached_llm_models

    # 폴백 목록 (API 조회 실패 시)
    fallback = [
        "gpt-4.1-mini", "gpt-4.1", "gpt-4.1-nano",
        "gpt-4o-mini", "gpt-4o", "gpt-4-turbo",
        "o4-mini", "o3-mini", "o1-mini", "o1",
    ]
    try:
        import openai
        api_key = current_config.get("api_keys", {}).get("openai", "") or None
        client = openai.OpenAI(api_key=api_key)
        models = client.models.list()
        # chat completion 가능한 모델만 필터
        chat_prefixes = ("gpt-4", "gpt-3.5", "o1", "o3", "o4", "chatgpt")
        # 제외: audio, realtime, transcribe, tts, search, image, diarize, deep-research, instruct
        exclude_keywords = ("audio", "realtime", "transcribe", "tts", "search", "image", "diarize", "deep-research", "instruct")
        chat_models = sorted(
            [m.id for m in models
             if any(m.id.startswith(p) for p in chat_prefixes)
             and not any(kw in m.id for kw in exclude_keywords)],
            key=lambda x: (
                0 if x.startswith("gpt-4.1") else
                1 if x.startswith("gpt-4.5") else
                2 if x.startswith("gpt-4o") else
                3 if x.startswith("o4") else
                4 if x.startswith("o3") else
                5 if x.startswith("o1") else
                6,
                x,
            ),
        )
        state._cached_llm_models = chat_models if chat_models else fallback
    except Exception as e:
        logger.warning(f"OpenAI 모델 목록 조회 실패: {e}, 폴백 사용")
        state._cached_llm_models = fallback
    return state._cached_llm_models


def _mask_key(key: str) -> str:
    """API 키 마스킹 (앞 7자 + *****)"""
    if not key:
        return ""
    return key[:7] + "*****" if len(key) > 7 else "***"


def _key_source(provider: str) -> str:
    """키 출처 반환: 'config' | 'env' | 'none'"""
    config_key = current_config.get("api_keys", {}).get(provider, "")
    if config_key:
        return "config"
    env_key = state.env_api_keys.get(provider, "")
    if env_key:
        return "env"
    return "none"


@app.get("/api/config")
async def get_config():
    """현재 설정 조회"""
    # 키는 마스킹하여 반환
    api_keys_masked = {}
    for provider in current_config.get("api_keys", {}):
        actual_key = state.resolve_api_key(provider)
        api_keys_masked[provider] = {
            "masked": _mask_key(actual_key),
            "source": _key_source(provider),
            "set": bool(actual_key),
        }

    config_safe = {k: v for k, v in current_config.items() if k != "api_keys"}
    config_safe["api_keys_status"] = api_keys_masked

    # 스테이지 메타데이터 (토글 UI용)
    stage_meta = []
    for s in ALL_STAGES:
        name = s["name"]
        fixed = name in ("ingest", "complete")
        stage_meta.append({
            "name": name,
            "fixed": fixed,
            "skip_if": s.get("skip_if"),
            "requires": _stage_dependencies().get(name, []),
        })

    # 저장 경로 정보
    storage_info = {
        "storage_path": current_config.get("storage_path", ""),
        "active_path": state.temp_dir or "",
        "is_temporary": not bool(current_config.get("storage_path")),
    }

    return {
        "config": config_safe,
        "stage_meta": stage_meta,
        "available_modes": ["stub", "real"],
        "available_models": {
            "llm": _get_available_llm_models(),
            "ocr": ["upstage"],
            "embedding": ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"],
        },
        "storage": storage_info,
    }


def _stage_dependencies() -> dict[str, list[str]]:
    """스테이지 의존성 정의"""
    return {
        "extract": ["convert"],
        "classify": ["extract"],
        "detect_special": ["extract"],
        "embed": ["extract"],
    }


@app.put("/api/config")
async def update_config(body: ConfigUpdate):
    """설정 변경 (다음 업로드부터 적용)"""
    if body.adapter is not None:
        if body.adapter != "none":
            # "none" 이외의 어댑터는 adapter_module/adapter_class가 함께 설정되어야 함
            has_module = bool(body.adapter_module) or bool(current_config.get("adapter_module"))
            has_class = bool(body.adapter_class) or bool(current_config.get("adapter_class"))
            if not (has_module and has_class):
                raise HTTPException(
                    400,
                    f"어댑터 '{body.adapter}' 사용 시 adapter_module과 "
                    f"adapter_class를 함께 설정해야 합니다"
                )
        current_config["adapter"] = body.adapter

    # 어댑터 모듈/클래스 변경 시: 화이트리스트 검증 + import 사전 검증
    new_module = body.adapter_module if body.adapter_module is not None else current_config.get("adapter_module", "")
    new_class = body.adapter_class if body.adapter_class is not None else current_config.get("adapter_class", "")

    if body.adapter_module is not None or body.adapter_class is not None:
        # 값이 비어있으면 (어댑터 해제) 검증 스킵
        if new_module and new_class:
            # 화이트리스트 검증
            allowed_classes = ALLOWED_ADAPTERS.get(new_module)
            if allowed_classes is None or new_class not in allowed_classes:
                raise HTTPException(
                    400,
                    f"허용되지 않는 어댑터입니다: {new_module}.{new_class}"
                )
            # import 사전 검증 (저장 전 로드 가능 여부 확인)
            try:
                mod = importlib.import_module(new_module)
                getattr(mod, new_class)
            except (ImportError, AttributeError) as e:
                raise HTTPException(400, f"어댑터를 로드할 수 없습니다: {e}")

        # 어댑터 캐시 무효화
        state.cached_adapter = None
        state.cached_adapter_key = ""

    if body.adapter_module is not None:
        current_config["adapter_module"] = body.adapter_module
    if body.adapter_class is not None:
        current_config["adapter_class"] = body.adapter_class

    if body.enabled_stages is not None:
        valid_names = {s["name"] for s in ALL_STAGES}
        for name in body.enabled_stages:
            if name not in valid_names:
                raise HTTPException(400, f"유효하지 않은 스테이지: {name}")
        # ingest/complete는 항상 포함
        stages = list(body.enabled_stages)
        if "ingest" not in stages:
            stages.insert(0, "ingest")
        if "complete" not in stages:
            stages.append("complete")
        current_config["enabled_stages"] = stages

    if body.quality_gate is not None:
        current_config["quality_gate"] = body.quality_gate

    if body.mode is not None:
        if body.mode not in ("stub", "real"):
            raise HTTPException(400, f"유효하지 않은 모드: {body.mode}")
        # real 모드 전환 시 API 키 유효성 경고
        if body.mode == "real":
            missing = []
            for prov, env_var in _env_key_map.items():
                if not state.resolve_api_key(prov):
                    missing.append(f"{prov} ({env_var})")
            if missing:
                logger.warning("실제 실행 모드 전환: API 키 미설정 — %s", ", ".join(missing))
        current_config["mode"] = body.mode

    if body.models is not None:
        current_config["models"].update(body.models)

    if body.api_keys is not None:
        current_config.setdefault("api_keys", {})
        for provider, key in body.api_keys.items():
            if provider not in ("openai", "upstage"):
                raise HTTPException(400, f"지원하지 않는 프로바이더: {provider}")
            current_config["api_keys"][provider] = key

    if body.storage_path is not None:
        new_path = body.storage_path.strip()

        if new_path:
            # 경로가 지정된 경우: 디렉토리 존재 여부 확인 → 없으면 생성
            try:
                os.makedirs(new_path, exist_ok=True)
            except OSError as exc:
                raise HTTPException(400, f"저장 경로를 생성할 수 없습니다: {exc}")
            if not os.access(new_path, os.W_OK):
                raise HTTPException(400, f"저장 경로에 쓰기 권한이 없습니다: {new_path}")

            # 처리 중/대기 중 문서가 있으면 경로 변경 차단
            active_docs = [d for d in state.documents.values() if d["status"] in ("queued", "processing")]
            if active_docs:
                raise HTTPException(400, f"처리 중인 문서 {len(active_docs)}건이 있어 저장 경로를 변경할 수 없습니다. 완료 후 다시 시도하세요.")

            # 기존 임시 디렉토리 정리 (임시 디렉토리였고 문서가 없는 경우만)
            old_storage = state.current_config.get("storage_path", "")
            if not old_storage and state.temp_dir and os.path.exists(state.temp_dir):
                if not state.documents:
                    shutil.rmtree(state.temp_dir, ignore_errors=True)
                    logger.info("기존 임시 디렉토리 삭제: %s", state.temp_dir)
                else:
                    logger.info("기존 임시 디렉토리 유지 (완료 문서 파일 보존): %s", state.temp_dir)

            state.current_config["storage_path"] = new_path
            state.temp_dir = new_path
            logger.info("저장 경로 변경: %s", new_path)
        else:
            # 빈 문자열 = 임시 디렉토리로 복원
            old_path = state.current_config.get("storage_path", "")
            state.current_config["storage_path"] = ""
            new_temp = tempfile.mkdtemp(prefix="xpipe_demo_")
            state.temp_dir = new_temp
            logger.info("임시 디렉토리로 복원: %s (이전 경로: %s — 파일 유지)", new_temp, old_path)

    # 응답에서 api_keys 원본은 제외
    config_safe = {k: v for k, v in current_config.items() if k != "api_keys"}
    return {"config": config_safe, "message": "설정이 업데이트되었습니다 (다음 업로드부터 적용)"}


@app.post("/api/adapter/test")
async def test_adapter(body: AdapterTestRequest):
    """어댑터 연결 테스트 (설정 저장 전 사전 검증)"""
    # 1. 화이트리스트 검증
    allowed_classes = ALLOWED_ADAPTERS.get(body.adapter_module)
    if allowed_classes is None or body.adapter_class not in allowed_classes:
        return {
            "success": False,
            "error": f"허용되지 않는 어댑터: {body.adapter_module}.{body.adapter_class}",
        }

    try:
        # 2. 모듈 로딩
        mod = importlib.import_module(body.adapter_module)
        adapter_cls = getattr(mod, body.adapter_class)

        # 3. 인스턴스화
        adapter = adapter_cls()

        # 4. get_classification_config 호출 (사이드 이펙트 없는 안전한 메서드)
        config = await adapter.get_classification_config()
        categories_count = len(config.categories) if config else 0

        # 5. 메서드 구현 여부 확인 (호출하지 않고 hasattr + callable만)
        capabilities = {
            "classification": callable(getattr(adapter, "get_classification_config", None)),
            "detection": callable(getattr(adapter, "detect_special_documents", None)),
            "entity_resolution": callable(getattr(adapter, "resolve_entity", None)),
            "display_name": callable(getattr(adapter, "generate_display_name", None)),
        }

        return {
            "success": True,
            "adapter_name": body.adapter_class,
            "capabilities": capabilities,
            "classification_categories_count": categories_count,
            "error": None,
        }
    except ImportError as e:
        return {"success": False, "error": f"모듈을 찾을 수 없습니다: {e}"}
    except AttributeError as e:
        return {"success": False, "error": f"클래스를 찾을 수 없습니다: {e}"}
    except Exception as e:
        return {"success": False, "error": f"어댑터 초기화 실패: {e}"}


# --- 벤치마크 ---

@app.get("/api/benchmark")
async def get_benchmark():
    """벤치마크 요약"""
    completed_docs = [d for d in documents.values() if d["status"] == "completed"]
    error_docs = [d for d in documents.values() if d["status"] == "error"]
    total = len(documents)

    if not completed_docs:
        return {
            "total": total,
            "completed": 0,
            "errors": len(error_docs),
            "message": "완료된 문서가 없습니다",
        }

    durations = [d["duration"] for d in completed_docs if d.get("duration")]
    total_duration = sum(durations) if durations else 0
    avg_duration = total_duration / len(durations) if durations else 0

    confidences = []
    quality_passed = 0
    total_cost = sum(d.get("cost", 0) or 0 for d in completed_docs)

    for d in completed_docs:
        conf = d.get("result", {}).get("classification_confidence")
        if isinstance(conf, (int, float)):
            confidences.append(conf)
        if d.get("quality", {}) and d["quality"].get("passed"):
            quality_passed += 1

    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
    throughput = len(completed_docs) / total_duration * 60 if total_duration > 0 else 0

    return {
        "total": total,
        "completed": len(completed_docs),
        "errors": len(error_docs),
        "total_duration_sec": round(total_duration, 2),
        "avg_duration_sec": round(avg_duration, 2),
        "throughput_per_min": round(throughput, 1),
        "avg_confidence": round(avg_confidence, 4) if confidences else "-",
        "quality_pass_rate": round(quality_passed / len(completed_docs) * 100, 1) if completed_docs else 0,
        "total_cost": round(total_cost, 6) if total_cost else "-",
        "cost_per_doc": round(total_cost / len(completed_docs), 6) if total_cost and completed_docs else "-",
        "mode": current_config["mode"],
        "stages": len(current_config.get("enabled_stages", [])),
    }


# --- 감사 로그 ---

@app.get("/api/audit/{doc_id}")
async def get_audit(doc_id: str):
    """문서별 감사 로그 조회"""
    entries = audit_log.get_by_document(doc_id)
    return {
        "doc_id": doc_id,
        "entries": [e.to_dict() for e in entries],
        "total": len(entries),
    }


# --- 비용 ---

@app.get("/api/cost")
async def get_cost():
    """비용 요약"""
    summary = cost_tracker.get_summary("all")
    return summary


# --- 재시도/삭제 ---

@app.post("/api/retry/{doc_id}")
async def retry_document(doc_id: str):
    """에러 문서 재시도"""
    doc = documents.get(doc_id)
    if not doc:
        raise HTTPException(404, f"문서를 찾을 수 없습니다: {doc_id}")
    if doc["status"] != "error":
        raise HTTPException(400, "에러 상태의 문서만 재시도 가능합니다")

    # 상태 리셋
    stage_names = current_config.get("enabled_stages", [s["name"] for s in ALL_STAGES])
    doc["status"] = "queued"
    doc["progress"] = 0
    doc["current_stage"] = None
    doc["stages_detail"] = {name: {"status": "pending"} for name in stage_names}
    doc["stages_data"] = {}
    doc["extracted_text"] = ""
    doc["result"] = None
    doc["quality"] = None
    doc["error"] = None
    doc["error_stage"] = None
    doc["started_at"] = None
    doc["completed_at"] = None
    doc["duration"] = None

    job = Job(job_id=doc_id, file_path=doc["file_path"], filename=doc["filename"])
    await state.pipeline_queue.put(job)
    return {"doc_id": doc_id, "status": "queued", "message": "재시도 시작"}


@app.delete("/api/documents")
async def remove_all_documents():
    """전체 문서 제거 (초기화)"""
    count = len(state.documents)
    for doc in state.documents.values():
        # 처리 중 문서에 cancellation 플래그
        if doc["status"] in ("queued", "processing"):
            doc["_cancelled"] = True
        fp = doc.get("file_path")
        if fp and os.path.exists(fp):
            try:
                os.remove(fp)
            except OSError:
                pass
    state.documents.clear()
    state._queue_counter = 0
    return {"removed": count, "message": "전체 초기화 완료"}


@app.delete("/api/documents/{doc_id}")
async def remove_document(doc_id: str):
    """문서 제거 (처리 중이면 _cancelled 플래그 설정)"""
    doc = documents.get(doc_id)
    if not doc:
        raise HTTPException(404, f"문서를 찾을 수 없습니다: {doc_id}")

    # 처리 중이면 cancellation 플래그 설정
    if doc["status"] in ("queued", "processing"):
        doc["_cancelled"] = True

    documents.pop(doc_id, None)

    fp = doc.get("file_path")
    if fp and os.path.exists(fp):
        try:
            os.remove(fp)
        except OSError:
            pass

    return {"doc_id": doc_id, "message": "제거 완료"}


# ---------------------------------------------------------------------------
# 서버 생명주기
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def on_startup():
    global _env_key_map, state
    # uvicorn 직접 실행 시 _env_key_map이 빈 상태 → 기본값 설정
    if not _env_key_map:
        _env_key_map = {
            "openai": "OPENAI_API_KEY",
            "upstage": "UPSTAGE_API_KEY",
        }
        # state를 재생성하지 않고 기존 인스턴스의 env_api_keys만 갱신
        # (재생성하면 모듈 레벨 alias가 이전 객체를 가리켜 이벤트/문서 추적이 깨짐)
        state.env_api_keys = {
            prov: os.environ.get(env_var, "")
            for prov, env_var in _env_key_map.items()
        }
        state.current_config["mode"] = "real" if state.env_api_keys.get("openai") else "stub"
        logger.info("[xPipeWeb] 기본 env_key_map 적용 (uvicorn 직접 실행)")

    storage_path = state.current_config.get("storage_path", "")
    if storage_path:
        # 사용자 지정 경로 사용 + 권한 확인
        try:
            os.makedirs(storage_path, exist_ok=True)
        except OSError:
            storage_path = ""
        if storage_path and os.access(storage_path, os.W_OK):
            state.temp_dir = storage_path
            logger.info("xPipeWeb v%s 시작 — 저장 경로: %s (사용자 지정)", VERSION, state.temp_dir)
        else:
            logger.warning("저장 경로 사용 불가: %s — 임시 디렉토리로 전환", state.current_config.get("storage_path"))
            state.current_config["storage_path"] = ""
            storage_path = ""
    if not storage_path:
        state.temp_dir = tempfile.mkdtemp(prefix="xpipe_demo_")
        logger.info("xPipeWeb v%s 시작 — 임시 디렉토리: %s", VERSION, state.temp_dir)
    state._adapter_cache_lock = asyncio.Lock()
    state._worker_task = asyncio.create_task(_queue_worker())
    logger.info("큐 워커 시작 (max_concurrency=%d)", MAX_CONCURRENCY)


@app.on_event("shutdown")
async def on_shutdown():
    # 1. 워커 루프 중지
    if state._worker_task:
        state._worker_task.cancel()
        try:
            await state._worker_task
        except asyncio.CancelledError:
            pass

    # 2. 실행 중 파이프라인 태스크 취소 + 대기
    if state._running_tasks:
        cancelled_count = len(state._running_tasks)
        for task in list(state._running_tasks):
            task.cancel()
        await asyncio.gather(*state._running_tasks, return_exceptions=True)
        state._running_tasks.clear()
        logger.info("실행 중 파이프라인 태스크 %d개 취소", cancelled_count)

    logger.info("큐 워커 종료")

    # 3. 임시 디렉토리 삭제 (사용자 지정 경로가 아닌 경우만)
    if state.temp_dir and os.path.exists(state.temp_dir):
        if state.current_config.get("storage_path"):
            logger.info("사용자 지정 저장 경로 유지: %s (파일 삭제 안 함)", state.temp_dir)
        else:
            shutil.rmtree(state.temp_dir, ignore_errors=True)
            logger.info("임시 디렉토리 삭제: %s", state.temp_dir)


# ---------------------------------------------------------------------------
# 엔트리포인트
# ---------------------------------------------------------------------------

def run_server(env_key_map: dict[str, str] | None = None):
    """서버 시작

    Args:
        env_key_map: Provider별 환경변수 이름 매핑.
                     예: {"openai": "OPENAI_API_KEY", "upstage": "UPSTAGE_API_KEY"}
                     None이면 빈 dict (코어는 어떤 서비스도 모름).
    """
    global _env_key_map, state
    _env_key_map = env_key_map or {}
    # env_key_map 설정 후 state를 재초기화하여 API 키를 올바르게 읽음
    state = ServerState()
    port = int(os.environ.get("XPIPE_DEMO_PORT", "8200"))
    print(f"\n  xPipeWeb v{VERSION}")
    print(f"  http://localhost:{port}")
    print(f"  스테이지: {len(state.current_config['enabled_stages'])}개")
    print(f"  모드: {state.current_config['mode']}")
    print()
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    # xPipeWeb 독립 실행 시 기본 Provider 환경변수 매핑
    _default_env_keys = {
        "openai": "OPENAI_API_KEY",
        "upstage": "UPSTAGE_API_KEY",
    }
    run_server(env_key_map=_default_env_keys)
