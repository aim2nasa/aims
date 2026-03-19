"""
xPipe Audit Log — 변경 불가 감사 로그

설계 원칙:
- 표준 라이브러리만 사용 (hashlib, json — xpipe 독립성 유지)
- 인메모리 구현 (외부 저장소 의존 없음)
- SHA-256 체크섬으로 무결성 보장
- 기록된 엔트리는 수정/삭제 불가 (append-only)
- 향후 MongoDB 등 영구 저장소 연동은 별도 구현체로 확장

사용 예:
    audit = AuditLog()
    entry = audit.record(AuditEntry(
        document_id="abc123",
        stage="classification",
        action="classified",
        actor="openai/gpt-4o",
        details={"category": "policy", "confidence": 0.95},
    ))
    assert audit.verify_integrity(entry)
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class AuditEntry:
    """감사 로그 엔트리

    Attributes:
        document_id: 대상 문서 ID
        stage: 파이프라인 단계 (예: "classification", "ocr", "embedding")
        action: 수행된 동작 (예: "classified", "ocr_completed", "embedding_created")
        actor: 수행 주체 (Provider 이름, 사용자 ID 등)
        details: 상세 데이터 (AI 응답 원문, confidence 등)
        timestamp: ISO 8601 타임스탬프 (미지정 시 자동 생성)
        checksum: SHA-256 해시 (무결성 검증용, 자동 생성)
    """
    document_id: str
    stage: str
    action: str
    actor: str
    details: dict = field(default_factory=dict)
    timestamp: str = ""
    checksum: str = ""

    def __post_init__(self) -> None:
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()
        if not self.checksum:
            self.checksum = self._compute_checksum()

    def _compute_checksum(self) -> str:
        """엔트리 데이터의 SHA-256 체크섬 계산

        checksum 필드 자체를 제외한 모든 필드를 해싱한다.
        """
        data = {
            "document_id": self.document_id,
            "stage": self.stage,
            "action": self.action,
            "actor": self.actor,
            "details": self.details,
            "timestamp": self.timestamp,
        }
        serialized = json.dumps(data, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        """직렬화용 dict 변환"""
        return {
            "document_id": self.document_id,
            "stage": self.stage,
            "action": self.action,
            "actor": self.actor,
            "details": self.details,
            "timestamp": self.timestamp,
            "checksum": self.checksum,
        }


class AuditLog:
    """변경 불가 감사 로그 관리

    append-only 방식으로 기록하며, 기록된 엔트리의
    무결성을 체크섬으로 검증할 수 있다.
    """

    def __init__(self) -> None:
        self._entries: list[AuditEntry] = []

    def record(self, entry: AuditEntry) -> AuditEntry:
        """감사 로그 기록

        체크섬이 비어 있으면 자동 생성한다.

        Args:
            entry: 기록할 감사 엔트리

        Returns:
            체크섬이 포함된 AuditEntry
        """
        # 체크섬 재계산 (timestamp 변경 등에 대비)
        if not entry.checksum:
            entry.checksum = entry._compute_checksum()

        self._entries.append(entry)
        logger.debug(
            "감사 로그 기록: doc=%s stage=%s action=%s",
            entry.document_id,
            entry.stage,
            entry.action,
        )
        return entry

    def get_all(self) -> list[AuditEntry]:
        """전체 감사 로그 반환 (방어적 복사)"""
        return list(self._entries)

    def get_by_document(self, document_id: str) -> list[AuditEntry]:
        """특정 문서의 감사 로그 조회

        Args:
            document_id: 문서 ID

        Returns:
            해당 문서의 AuditEntry 목록 (시간순)
        """
        return [e for e in self._entries if e.document_id == document_id]

    def get_by_stage(self, stage: str) -> list[AuditEntry]:
        """특정 단계의 감사 로그 조회

        Args:
            stage: 파이프라인 단계

        Returns:
            해당 단계의 AuditEntry 목록
        """
        return [e for e in self._entries if e.stage == stage]

    def get_by_actor(self, actor: str) -> list[AuditEntry]:
        """특정 수행 주체의 감사 로그 조회

        Args:
            actor: 수행 주체

        Returns:
            해당 actor의 AuditEntry 목록
        """
        return [e for e in self._entries if e.actor == actor]

    def get_by_period(self, start: str, end: str) -> list[AuditEntry]:
        """기간별 감사 로그 조회

        ISO 8601 문자열 기준 비교 (사전순).

        Args:
            start: 시작 시각 (inclusive)
            end: 종료 시각 (inclusive)

        Returns:
            해당 기간의 AuditEntry 목록
        """
        return [
            e for e in self._entries
            if start <= e.timestamp <= end
        ]

    def verify_integrity(self, entry: AuditEntry) -> bool:
        """엔트리의 체크섬 무결성 검증

        체크섬을 재계산하여 기존 checksum 필드와 비교한다.

        Args:
            entry: 검증할 AuditEntry

        Returns:
            무결성 유지 여부
        """
        expected = entry._compute_checksum()
        return entry.checksum == expected

    def verify_all(self) -> dict[str, Any]:
        """전체 로그 무결성 검증

        Returns:
            {
                "total": 전체 건수,
                "valid": 유효 건수,
                "invalid": 유효하지 않은 건수,
                "invalid_entries": 유효하지 않은 엔트리 인덱스 목록,
            }
        """
        invalid_indices: list[int] = []
        for i, entry in enumerate(self._entries):
            if not self.verify_integrity(entry):
                invalid_indices.append(i)

        return {
            "total": len(self._entries),
            "valid": len(self._entries) - len(invalid_indices),
            "invalid": len(invalid_indices),
            "invalid_entries": invalid_indices,
        }

    def get_stats(self) -> dict[str, Any]:
        """감사 로그 통계

        Returns:
            총 건수, 문서별/단계별/액터별 건수 집계
        """
        by_stage: dict[str, int] = {}
        by_action: dict[str, int] = {}
        by_actor: dict[str, int] = {}
        documents: set[str] = set()

        for entry in self._entries:
            documents.add(entry.document_id)
            by_stage[entry.stage] = by_stage.get(entry.stage, 0) + 1
            by_action[entry.action] = by_action.get(entry.action, 0) + 1
            by_actor[entry.actor] = by_actor.get(entry.actor, 0) + 1

        return {
            "total_entries": len(self._entries),
            "unique_documents": len(documents),
            "by_stage": by_stage,
            "by_action": by_action,
            "by_actor": by_actor,
        }
