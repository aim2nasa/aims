"""IngestStage — 파일 수신 스테이지"""
from __future__ import annotations

from typing import Any

from xpipe.stage import Stage


class IngestStage(Stage):
    """파일 수신 스테이지

    파일 경로/데이터를 받아 파이프라인 컨텍스트에 등록한다.
    실제 파일 저장, 메타데이터 추출 등은 도메인 구현에서 확장.
    """

    def get_name(self) -> str:
        return "ingest"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """파일 수신 처리

        context에 file_path 또는 file_data가 있으면 ingested 플래그를 설정한다.

        TODO: 실제 서비스 연동 (파일 저장, MIME 감지, 해시 계산)
        """
        context["ingested"] = True
        context.setdefault("document_id", context.get("document_id", ""))
        return context
