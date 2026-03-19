"""
xPipeWeb — xPipe 엔진 검증용 개발자 전용 웹 데모 서버

FastAPI 기반. 포트 8200 (XPIPE_DEMO_PORT 환경 변수로 변경 가능).
외부 DB 의존 없이 인메모리로 동작.

실행:
    python -m xpipe.console.web.server
    # 또는
    python -m xpipe demo
"""
from __future__ import annotations

import asyncio
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
from xpipe.pipeline import Pipeline, PipelineDefinition, StageConfig
from xpipe.pipeline_presets import PRESETS, get_preset, list_presets
from xpipe.events import EventBus, PipelineEvent
from xpipe.audit import AuditLog, AuditEntry
from xpipe.cost_tracker import CostTracker, UsageRecord
from xpipe.quality import QualityGate, QualityConfig, QualityScore
from xpipe.stages import (
    IngestStage,
    ExtractStage,
    ClassifyStage,
    DetectSpecialStage,
    EmbedStage,
    CompleteStage,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 상수
# ---------------------------------------------------------------------------
WEB_DIR = Path(__file__).parent
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
VERSION = "0.1.0"

# ---------------------------------------------------------------------------
# 인메모리 상태
# ---------------------------------------------------------------------------
documents: dict[str, dict[str, Any]] = {}  # doc_id -> 문서 상태
sse_events: list[dict[str, Any]] = []  # SSE 이벤트 버퍼
sse_event_id: int = 0

# 글로벌 인프라
event_bus = EventBus()
audit_log = AuditLog()
cost_tracker = CostTracker()
quality_gate = QualityGate()

# 현재 설정
current_config: dict[str, Any] = {
    "adapter": "insurance",
    "preset": "aims-insurance",
    "quality_gate": True,
    "provider": "stub",
}

# 임시 파일 디렉토리
temp_dir: Optional[str] = None

# SSE 클라이언트 큐
sse_queues: list[asyncio.Queue] = []


# ---------------------------------------------------------------------------
# SSE 브릿지 (EventBus -> SSE)
# ---------------------------------------------------------------------------
def _on_pipeline_event(event: PipelineEvent) -> None:
    """EventBus 이벤트를 SSE 버퍼 + 클라이언트 큐에 전달"""
    global sse_event_id
    sse_event_id += 1
    sse_data = {
        "id": sse_event_id,
        **event.to_dict(),
    }
    sse_events.append(sse_data)
    # 버퍼 최대 1000개 유지
    if len(sse_events) > 1000:
        sse_events.pop(0)
    # 연결된 SSE 클라이언트에 push
    for q in sse_queues:
        try:
            q.put_nowait(sse_data)
        except asyncio.QueueFull:
            pass


# 와일드카드 리스너 등록 — 모든 이벤트 수신
event_bus.on("*", _on_pipeline_event)


# ---------------------------------------------------------------------------
# 파이프라인 조립
# ---------------------------------------------------------------------------
def _build_pipeline(preset_name: str) -> Pipeline:
    """프리셋 기반 파이프라인 조립 (내장 스테이지 자동 등록)"""
    preset = get_preset(preset_name)
    pipeline = Pipeline.from_dict(preset)
    pipeline.event_bus = event_bus

    # 내장 스테이지 등록
    pipeline.register_stage("ingest", IngestStage)
    pipeline.register_stage("extract", ExtractStage)
    pipeline.register_stage("classify", ClassifyStage)
    pipeline.register_stage("detect_special", DetectSpecialStage)
    pipeline.register_stage("embed", EmbedStage)
    pipeline.register_stage("complete", CompleteStage)

    return pipeline


async def _run_pipeline(doc_id: str, file_path: str, filename: str) -> None:
    """파이프라인 실행 (백그라운드 태스크)"""
    doc = documents.get(doc_id)
    if not doc:
        return

    try:
        doc["status"] = "processing"
        doc["started_at"] = time.time()

        pipeline = _build_pipeline(current_config["preset"])
        stage_names = [s["name"] for s in get_preset(current_config["preset"])["stages"]]
        total_stages = len(stage_names)

        # 스테이지별 진행 추적을 위해 이벤트 리스너 등록
        stages_completed = []

        def _track_stage(event: PipelineEvent) -> None:
            if event.document_id == doc_id and event.event_type == "stage_complete":
                stage_name = event.stage
                stages_completed.append(stage_name)
                progress = int(len(stages_completed) / total_stages * 100)
                doc["progress"] = progress
                doc["current_stage"] = stage_name
                doc["stages_detail"][stage_name] = {
                    "status": "completed",
                    "completed_at": time.time(),
                    "duration": 0,
                }

                # 감사 로그
                audit_log.record(AuditEntry(
                    document_id=doc_id,
                    stage=stage_name,
                    action="stage_completed",
                    actor=f"stub/{current_config['provider']}",
                    details={"pipeline": current_config["preset"]},
                ))

        event_bus.on("stage_complete", _track_stage)

        # 컨텍스트 구성
        context: dict[str, Any] = {
            "document_id": doc_id,
            "file_path": file_path,
            "filename": filename,
            "original_name": filename,
        }

        # 파이프라인 실행 (stub 스테이지는 빠르지만 리얼 느낌을 위해 약간의 지연)
        for stage_config in pipeline.definition.stages:
            stage_name = stage_config.name
            doc["current_stage"] = stage_name
            doc["stages_detail"].setdefault(stage_name, {})
            doc["stages_detail"][stage_name]["status"] = "running"
            doc["stages_detail"][stage_name]["started_at"] = time.time()

            # SSE 이벤트 직접 발행 (stage_start)
            await event_bus.emit(PipelineEvent(
                event_type="stage_start",
                document_id=doc_id,
                stage=stage_name,
                payload={"pipeline": current_config["preset"]},
            ))

            # 리얼 느낌의 지연 (stub 모드)
            await asyncio.sleep(0.1 + 0.05 * hash(stage_name) % 5 * 0.1)

        # 실제 파이프라인 실행
        result = await pipeline.run(context)

        # 결과 반영
        doc["status"] = "completed"
        doc["progress"] = 100
        doc["completed_at"] = time.time()
        doc["duration"] = doc["completed_at"] - doc["started_at"]
        doc["result"] = {
            "document_type": result.get("document_type", "general"),
            "classification_confidence": result.get("classification_confidence", 0.85),
            "detections": result.get("detections", []),
            "text_preview": result.get("text", "")[:200],
            "stages_executed": result.get("_pipeline", {}).get("stages_executed", []),
            "stages_skipped": result.get("_pipeline", {}).get("stages_skipped", []),
        }

        # stub 모드의 시뮬레이션 결과 보강
        if current_config["provider"] == "stub":
            doc["result"]["document_type"] = _stub_classify(filename)
            doc["result"]["classification_confidence"] = 0.87
            doc["result"]["text_preview"] = f"[stub] {filename}에서 추출된 텍스트 미리보기"

        # 품질 평가
        if current_config.get("quality_gate", True):
            score = quality_gate.evaluate({
                "classification_confidence": doc["result"]["classification_confidence"],
                "full_text": doc["result"].get("text_preview", ""),
                "document_type": doc["result"]["document_type"],
            })
            doc["quality"] = {
                "overall": score.overall,
                "confidence": score.classification_confidence,
                "text_quality": score.text_quality,
                "passed": score.passed,
                "flags": score.flags,
            }

        # 비용 추적 (stub)
        cost_record = UsageRecord(
            provider=current_config["provider"],
            operation="pipeline",
            input_tokens=500,
            output_tokens=100,
            estimated_cost=0.003,
            timestamp=PipelineEvent(
                event_type="", document_id="", stage=""
            ).timestamp,
        )
        cost_tracker.record(cost_record)
        doc["cost"] = cost_record.estimated_cost

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
                "quality_passed": doc.get("quality", {}).get("passed"),
            },
        ))

        # 리스너 정리 (간단히 — 실제 프로덕션에서는 unregister 필요)

    except Exception as exc:
        logger.exception("파이프라인 실행 실패: doc_id=%s", doc_id)
        doc["status"] = "error"
        doc["error"] = str(exc)
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


def _stub_classify(filename: str) -> str:
    """stub 분류 — 파일명 기반 단순 추정 (데모 시각화용)"""
    fn = filename.lower()
    if any(k in fn for k in ["보험", "증권", "policy"]):
        return "보험증권"
    if any(k in fn for k in ["계약", "contract"]):
        return "계약서"
    if any(k in fn for k in ["청구", "claim"]):
        return "보험금청구서"
    if any(k in fn for k in ["ar", "annual", "연간"]):
        return "연간보고서"
    if any(k in fn for k in ["crs", "review", "검토"]):
        return "고객검토서"
    if any(k in fn for k in ["진단", "medical"]):
        return "진단서"
    return "일반문서"


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


# --- 파일 업로드 ---

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """단일 파일 업로드 + 파이프라인 실행"""
    if not file.filename:
        raise HTTPException(400, "파일명이 없습니다")

    # 파일 크기 체크
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, f"파일 크기 초과: 최대 {MAX_FILE_SIZE // 1024 // 1024}MB")

    # 임시 파일 저장
    doc_id = str(uuid.uuid4())[:8]
    file_path = os.path.join(temp_dir, f"{doc_id}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(content)

    # 문서 상태 초기화
    preset_data = get_preset(current_config["preset"])
    stage_names = [s["name"] for s in preset_data["stages"]]

    documents[doc_id] = {
        "id": doc_id,
        "filename": file.filename,
        "file_size": len(content),
        "file_path": file_path,
        "status": "queued",
        "progress": 0,
        "current_stage": None,
        "stages_detail": {name: {"status": "pending"} for name in stage_names},
        "result": None,
        "quality": None,
        "cost": 0.0,
        "error": None,
        "created_at": time.time(),
        "started_at": None,
        "completed_at": None,
        "duration": None,
        "config": dict(current_config),
    }

    # 감사 로그
    audit_log.record(AuditEntry(
        document_id=doc_id,
        stage="upload",
        action="file_uploaded",
        actor="user",
        details={"filename": file.filename, "size": len(content)},
    ))

    # 백그라운드에서 파이프라인 실행
    asyncio.create_task(_run_pipeline(doc_id, file_path, file.filename))

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
        file_path = os.path.join(temp_dir, f"{doc_id}_{file.filename}")
        with open(file_path, "wb") as f:
            f.write(content)

        preset_data = get_preset(current_config["preset"])
        stage_names = [s["name"] for s in preset_data["stages"]]

        documents[doc_id] = {
            "id": doc_id,
            "filename": file.filename,
            "file_size": len(content),
            "file_path": file_path,
            "status": "queued",
            "progress": 0,
            "current_stage": None,
            "stages_detail": {name: {"status": "pending"} for name in stage_names},
            "result": None,
            "quality": None,
            "cost": 0.0,
            "error": None,
            "created_at": time.time(),
            "started_at": None,
            "completed_at": None,
            "duration": None,
            "config": dict(current_config),
        }

        audit_log.record(AuditEntry(
            document_id=doc_id,
            stage="upload",
            action="file_uploaded",
            actor="user",
            details={"filename": file.filename, "size": len(content)},
        ))

        asyncio.create_task(_run_pipeline(doc_id, file_path, file.filename))
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
        docs.append({
            "id": doc["id"],
            "filename": doc["filename"],
            "file_size": doc["file_size"],
            "status": doc["status"],
            "progress": doc["progress"],
            "current_stage": doc["current_stage"],
            "result": doc.get("result"),
            "quality": doc.get("quality"),
            "cost": doc.get("cost", 0),
            "error": doc.get("error"),
            "duration": doc.get("duration"),
            "created_at": doc["created_at"],
        })
    return {"documents": docs}


# --- SSE 실시간 이벤트 ---

@app.get("/api/events")
async def sse_stream():
    """SSE 실시간 이벤트 스트림"""
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    sse_queues.append(queue)

    async def event_generator():
        try:
            # Last-Event-ID 기반 재전송 (간이)
            yield f"data: {json.dumps({'type': 'connected', 'version': VERSION})}\n\n"

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"id: {event.get('id', '')}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    # keepalive
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if queue in sse_queues:
                sse_queues.remove(queue)

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
    preset: Optional[str] = None
    quality_gate: Optional[bool] = None
    provider: Optional[str] = None


@app.get("/api/config")
async def get_config():
    """현재 설정 조회"""
    return {
        "config": current_config,
        "available_presets": list_presets(),
        "available_adapters": ["insurance", "legal", "none"],
        "available_providers": ["stub", "real"],
    }


@app.put("/api/config")
async def update_config(body: ConfigUpdate):
    """어댑터/프리셋 전환 (다음 업로드부터 적용)"""
    if body.adapter is not None:
        if body.adapter not in ("insurance", "legal", "none"):
            raise HTTPException(400, f"유효하지 않은 어댑터: {body.adapter}")
        current_config["adapter"] = body.adapter

    if body.preset is not None:
        if body.preset not in PRESETS:
            raise HTTPException(400, f"유효하지 않은 프리셋: {body.preset}")
        current_config["preset"] = body.preset

    if body.quality_gate is not None:
        current_config["quality_gate"] = body.quality_gate

    if body.provider is not None:
        if body.provider not in ("stub", "real"):
            raise HTTPException(400, f"유효하지 않은 프로바이더: {body.provider}")
        current_config["provider"] = body.provider

    return {"config": current_config, "message": "설정이 업데이트되었습니다 (다음 업로드부터 적용)"}


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

    # 스테이지별 평균 (간이 — stage_detail에서 추출)
    confidences = []
    quality_passed = 0
    total_cost = sum(d.get("cost", 0) for d in completed_docs)

    for d in completed_docs:
        if d.get("result", {}).get("classification_confidence"):
            confidences.append(d["result"]["classification_confidence"])
        if d.get("quality", {}).get("passed"):
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
        "avg_confidence": round(avg_confidence, 4),
        "quality_pass_rate": round(quality_passed / len(completed_docs) * 100, 1) if completed_docs else 0,
        "total_cost": round(total_cost, 6),
        "cost_per_doc": round(total_cost / len(completed_docs), 6) if completed_docs else 0,
        "provider": current_config["provider"],
        "preset": current_config["preset"],
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
    preset_data = get_preset(current_config["preset"])
    stage_names = [s["name"] for s in preset_data["stages"]]
    doc["status"] = "queued"
    doc["progress"] = 0
    doc["current_stage"] = None
    doc["stages_detail"] = {name: {"status": "pending"} for name in stage_names}
    doc["result"] = None
    doc["quality"] = None
    doc["error"] = None
    doc["started_at"] = None
    doc["completed_at"] = None
    doc["duration"] = None

    asyncio.create_task(_run_pipeline(doc_id, doc["file_path"], doc["filename"]))
    return {"doc_id": doc_id, "status": "queued", "message": "재시도 시작"}


@app.delete("/api/documents/{doc_id}")
async def remove_document(doc_id: str):
    """문서 제거"""
    doc = documents.pop(doc_id, None)
    if not doc:
        raise HTTPException(404, f"문서를 찾을 수 없습니다: {doc_id}")

    # 임시 파일 삭제
    fp = doc.get("file_path")
    if fp and os.path.exists(fp):
        os.remove(fp)

    return {"doc_id": doc_id, "message": "제거 완료"}


# ---------------------------------------------------------------------------
# 서버 생명주기
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def on_startup():
    global temp_dir
    temp_dir = tempfile.mkdtemp(prefix="xpipe_demo_")
    logger.info("xPipeWeb 시작 — 임시 디렉토리: %s", temp_dir)


@app.on_event("shutdown")
async def on_shutdown():
    if temp_dir and os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)
        logger.info("임시 디렉토리 삭제: %s", temp_dir)


# ---------------------------------------------------------------------------
# 엔트리포인트
# ---------------------------------------------------------------------------

def run_server():
    """서버 시작"""
    port = int(os.environ.get("XPIPE_DEMO_PORT", "8200"))
    print(f"\n  xPipeWeb v{VERSION}")
    print(f"  http://localhost:{port}")
    print(f"  프리셋: {current_config['preset']}")
    print(f"  프로바이더: {current_config['provider']}")
    print()
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    run_server()
