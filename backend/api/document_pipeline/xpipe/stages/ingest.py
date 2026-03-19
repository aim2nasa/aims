"""IngestStage — 파일 수신 스테이지"""
from __future__ import annotations

import mimetypes
import os
import time
from typing import Any

from xpipe.stage import Stage


class IngestStage(Stage):
    """파일 수신 스테이지

    파일 경로/데이터를 받아 파이프라인 컨텍스트에 등록한다.
    파일 메타데이터(크기, MIME, 저장 경로)를 수집하여 stage_data에 기록.
    """

    def get_name(self) -> str:
        return "ingest"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """파일 수신 처리"""
        start = time.time()

        file_path = context.get("file_path", "")
        file_name = context.get("filename", context.get("original_name", "unknown"))
        mode = context.get("mode", "stub")

        # 파일 크기
        file_size = 0
        if file_path and os.path.exists(file_path):
            file_size = os.path.getsize(file_path)

        # MIME 타입 추론
        mime_type, _ = mimetypes.guess_type(file_name)
        mime_type = mime_type or "application/octet-stream"
        context["mime_type"] = mime_type
        context["file_size"] = file_size

        # 저장 경로 (데모에서는 임시 파일 경로 그대로)
        save_name = os.path.basename(file_path) if file_path else file_name
        dest_path = file_path

        context["ingested"] = True
        context.setdefault("document_id", context.get("document_id", ""))

        # stage_data 기록
        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}
        context["stage_data"]["ingest"] = {
            "status": "completed",
            "duration_ms": duration_ms,
            "input": {
                "file_name": file_name,
                "file_size": file_size,
                "file_size_display": _format_size(file_size),
                "mime_type": mime_type,
            },
            "output": {
                "originalName": file_name,
                "saveName": save_name,
                "destPath": dest_path,
                "uploaded_at": context.get("uploaded_at", ""),
                "mime_type": mime_type,
                "file_size": file_size,
            },
        }

        return context


def _format_size(size_bytes: int) -> str:
    """바이트를 사람이 읽을 수 있는 형식으로 변환"""
    if size_bytes < 1024:
        return f"{size_bytes}B"
    if size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f}KB"
    return f"{size_bytes / 1024 / 1024:.1f}MB"
