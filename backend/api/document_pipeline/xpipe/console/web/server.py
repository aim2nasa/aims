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
# 상수
# ---------------------------------------------------------------------------
WEB_DIR = Path(__file__).parent
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
VERSION = "0.2.1"

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

# 현재 설정 (provider → mode 로 수정)
current_config: dict[str, Any] = {
    "adapter": "insurance",
    "preset": "aims-insurance",
    "quality_gate": True,
    "mode": "stub",
    "models": {
        "llm": "gpt-4.1-mini",
        "ocr": "upstage",
        "embedding": "text-embedding-3-small",
    },
    "api_keys": {
        "openai": "",   # 빈 문자열이면 환경변수 fallback
        "upstage": "",  # Upstage OCR API 키
    },
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
    pipeline.register_stage("convert", ConvertStage)
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
            preset_data = get_preset(current_config["preset"])
            total_stages = len(preset_data["stages"])
            progress = int(len(stages_completed) / total_stages * 100)
            doc["progress"] = progress
            doc["current_stage"] = stage_name

            doc["stages_detail"][stage_name] = {
                "status": "completed",
                "completed_at": time.time(),
                "duration_ms": event.payload.get("duration_ms", 0),
            }

            # 감사 로그
            audit_log.record(AuditEntry(
                document_id=doc_id,
                stage=stage_name,
                action="stage_completed",
                actor=f"{current_config['mode']}/{current_config['adapter']}",
                details={"pipeline": current_config["preset"]},
            ))

    event_bus.on("stage_start", _track_stage_start)
    event_bus.on("stage_complete", _track_stage)

    try:
        # 취소 체크
        if doc.get("_cancelled"):
            return

        doc["status"] = "processing"
        doc["started_at"] = time.time()

        pipeline = _build_pipeline(current_config["preset"])
        preset_data = get_preset(current_config["preset"])
        stage_names = [s["name"] for s in preset_data["stages"]]

        # MIME 타입 추론 (needs_conversion 판단용)
        import mimetypes
        mime_type, _ = mimetypes.guess_type(filename)
        mime_type = mime_type or "application/octet-stream"

        # API 키 해석 (설정 패널 키 → 환경변수 fallback)
        api_keys_resolved = {}
        env_map = {"openai": "OPENAI_API_KEY", "upstage": "UPSTAGE_API_KEY"}
        for prov, key in current_config.get("api_keys", {}).items():
            api_keys_resolved[prov] = key or os.environ.get(env_map.get(prov, ""), "")

        # 컨텍스트 구성
        context: dict[str, Any] = {
            "document_id": doc_id,
            "file_path": file_path,
            "filename": filename,
            "original_name": filename,
            "mode": current_config["mode"],
            "models": dict(current_config["models"]),
            "adapter_name": current_config["adapter"],
            "uploaded_at": doc.get("created_at_iso", ""),
            "needs_conversion": needs_conversion(mime_type),
            "_api_keys": api_keys_resolved,
        }

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

        is_stub = current_config["mode"] == "stub"

        doc["result"] = {
            "document_type": result.get("document_type", "general"),
            "classification_confidence": result.get("classification_confidence", "-" if is_stub else 0.0),
            "detections": result.get("detections", []),
            "text_preview": (result.get("extracted_text", "") or "")[:200],
            "stages_executed": result.get("_pipeline", {}).get("stages_executed", []),
            "stages_skipped": result.get("_pipeline", {}).get("stages_skipped", []),
            "display_name": result.get("display_name", filename),
        }

        # 품질 평가
        if current_config.get("quality_gate", True) and not is_stub:
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

        # 비용 추적
        if is_stub:
            doc["cost"] = None
        else:
            cost_record = UsageRecord(
                provider=current_config["mode"],
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
                "mode": current_config["mode"],
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


_PREVIEWABLE_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"}


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
    preset_data = get_preset(current_config["preset"])
    stage_names = [s["name"] for s in preset_data["stages"]]
    now = time.time()
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()

    return {
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
        "config": dict(current_config),
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

    AIMS 패턴: 변환된 PDF(convPdfPath) → 프리뷰 가능
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
    file_path = os.path.join(temp_dir, f"{doc_id}_{file.filename}")
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

        documents[doc_id] = _create_doc_entry(doc_id, file.filename, len(content), file_path)

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
        docs.append({
            "id": doc["id"],
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
    sse_queues.append(queue)

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
    mode: Optional[str] = None
    models: Optional[dict[str, str]] = None
    api_keys: Optional[dict[str, str]] = None


# 캐시된 LLM 모델 목록 (서버 시작 시 1회 조회)
_cached_llm_models: list[str] | None = None


def _get_available_llm_models() -> list[str]:
    """OpenAI API에서 사용 가능한 chat 모델 목록 조회 (캐시)"""
    global _cached_llm_models
    if _cached_llm_models is not None:
        return _cached_llm_models

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
        _cached_llm_models = chat_models if chat_models else fallback
    except Exception as e:
        logger.warning(f"OpenAI 모델 목록 조회 실패: {e}, 폴백 사용")
        _cached_llm_models = fallback
    return _cached_llm_models


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
    env_map = {"openai": "OPENAI_API_KEY", "upstage": "UPSTAGE_API_KEY"}
    env_key = os.environ.get(env_map.get(provider, ""), "")
    if env_key:
        return "env"
    return "none"


@app.get("/api/config")
async def get_config():
    """현재 설정 조회"""
    # 키는 마스킹하여 반환
    api_keys_masked = {}
    for provider, key in current_config.get("api_keys", {}).items():
        env_var = {"openai": "OPENAI_API_KEY", "upstage": "UPSTAGE_API_KEY"}.get(provider, "")
        actual_key = key or os.environ.get(env_var, "")
        api_keys_masked[provider] = {
            "masked": _mask_key(actual_key),
            "source": _key_source(provider),
            "set": bool(actual_key),
        }

    config_safe = {k: v for k, v in current_config.items() if k != "api_keys"}
    config_safe["api_keys_status"] = api_keys_masked

    return {
        "config": config_safe,
        "available_presets": list_presets(),
        "available_adapters": ["insurance", "legal", "none"],
        "available_modes": ["stub", "real"],
        "available_models": {
            "llm": _get_available_llm_models(),
            "ocr": ["upstage"],
            "embedding": ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"],
        },
    }


@app.put("/api/config")
async def update_config(body: ConfigUpdate):
    """설정 변경 (다음 업로드부터 적용)"""
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

    if body.mode is not None:
        if body.mode not in ("stub", "real"):
            raise HTTPException(400, f"유효하지 않은 모드: {body.mode}")
        current_config["mode"] = body.mode

    if body.models is not None:
        current_config["models"].update(body.models)

    if body.api_keys is not None:
        current_config.setdefault("api_keys", {})
        for provider, key in body.api_keys.items():
            if provider not in ("openai", "upstage"):
                raise HTTPException(400, f"지원하지 않는 프로바이더: {provider}")
            current_config["api_keys"][provider] = key

    # 응답에서 api_keys 원본은 제외
    config_safe = {k: v for k, v in current_config.items() if k != "api_keys"}
    return {"config": config_safe, "message": "설정이 업데이트되었습니다 (다음 업로드부터 적용)"}


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
    doc["stages_data"] = {}
    doc["extracted_text"] = ""
    doc["result"] = None
    doc["quality"] = None
    doc["error"] = None
    doc["error_stage"] = None
    doc["started_at"] = None
    doc["completed_at"] = None
    doc["duration"] = None

    asyncio.create_task(_run_pipeline(doc_id, doc["file_path"], doc["filename"]))
    return {"doc_id": doc_id, "status": "queued", "message": "재시도 시작"}


@app.delete("/api/documents")
async def remove_all_documents():
    """전체 문서 제거 (초기화)"""
    count = len(documents)
    for doc in documents.values():
        # 처리 중 문서에 cancellation 플래그
        if doc["status"] in ("queued", "processing"):
            doc["_cancelled"] = True
        fp = doc.get("file_path")
        if fp and os.path.exists(fp):
            try:
                os.remove(fp)
            except OSError:
                pass
    documents.clear()
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
    global temp_dir
    temp_dir = tempfile.mkdtemp(prefix="xpipe_demo_")
    logger.info("xPipeWeb v%s 시작 — 임시 디렉토리: %s", VERSION, temp_dir)


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
    print(f"  모드: {current_config['mode']}")
    print()
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    run_server()
