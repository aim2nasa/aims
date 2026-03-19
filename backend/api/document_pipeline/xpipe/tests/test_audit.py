"""
xPipe AuditLog 테스트

- AuditEntry 생성/직렬화/체크섬
- AuditLog 기록/조회 (문서별, 단계별, 액터별, 기간별)
- 무결성 검증 (단건/전체)
- 통계 조회
"""
from __future__ import annotations

import pytest

from xpipe.audit import AuditEntry, AuditLog


# ===========================================================================
# 헬퍼
# ===========================================================================


def _make_entry(
    document_id: str = "doc-001",
    stage: str = "classification",
    action: str = "classified",
    actor: str = "openai/gpt-4o",
    details: dict | None = None,
    timestamp: str = "",
) -> AuditEntry:
    """테스트용 AuditEntry 생성 헬퍼"""
    return AuditEntry(
        document_id=document_id,
        stage=stage,
        action=action,
        actor=actor,
        details=details or {},
        timestamp=timestamp,
    )


# ===========================================================================
# AuditEntry 테스트
# ===========================================================================


class TestAuditEntry:
    """AuditEntry 데이터 클래스"""

    def test_create_entry(self):
        """기본 엔트리 생성"""
        entry = _make_entry()
        assert entry.document_id == "doc-001"
        assert entry.stage == "classification"
        assert entry.action == "classified"
        assert entry.actor == "openai/gpt-4o"
        assert entry.timestamp  # 자동 생성됨
        assert entry.checksum  # 자동 생성됨

    def test_auto_timestamp(self):
        """timestamp 미지정 시 자동 생성"""
        entry = _make_entry()
        assert entry.timestamp != ""
        assert "T" in entry.timestamp

    def test_custom_timestamp(self):
        """timestamp 지정 시 해당 값 사용"""
        entry = _make_entry(timestamp="2026-03-19T12:00:00")
        assert entry.timestamp == "2026-03-19T12:00:00"

    def test_auto_checksum(self):
        """checksum 자동 생성"""
        entry = _make_entry()
        assert len(entry.checksum) == 64  # SHA-256 hex

    def test_checksum_deterministic(self):
        """동일 데이터 → 동일 체크섬"""
        e1 = _make_entry(timestamp="2026-03-19T12:00:00")
        e2 = _make_entry(timestamp="2026-03-19T12:00:00")
        assert e1.checksum == e2.checksum

    def test_checksum_changes_with_data(self):
        """데이터 변경 → 체크섬 변경"""
        e1 = _make_entry(action="classified", timestamp="2026-03-19T12:00:00")
        e2 = _make_entry(action="reclassified", timestamp="2026-03-19T12:00:00")
        assert e1.checksum != e2.checksum

    def test_to_dict(self):
        """to_dict()로 직렬화"""
        entry = _make_entry(
            document_id="doc-002",
            stage="ocr",
            action="ocr_completed",
            actor="upstage/ocr",
            details={"pages": 3},
            timestamp="2026-03-19T12:00:00",
        )
        d = entry.to_dict()
        assert d["document_id"] == "doc-002"
        assert d["stage"] == "ocr"
        assert d["action"] == "ocr_completed"
        assert d["actor"] == "upstage/ocr"
        assert d["details"] == {"pages": 3}
        assert d["timestamp"] == "2026-03-19T12:00:00"
        assert "checksum" in d

    def test_details_default_empty(self):
        """details 미지정 시 빈 dict"""
        entry = AuditEntry(
            document_id="d1",
            stage="s1",
            action="a1",
            actor="actor",
        )
        assert entry.details == {}


# ===========================================================================
# AuditLog 기록/조회
# ===========================================================================


class TestAuditLogRecord:
    """AuditLog 기록"""

    def test_record_entry(self):
        """엔트리 기록"""
        audit = AuditLog()
        entry = _make_entry()
        result = audit.record(entry)
        assert result is entry
        assert len(audit.get_all()) == 1

    def test_record_multiple(self):
        """복수 엔트리 기록"""
        audit = AuditLog()
        audit.record(_make_entry(document_id="d1"))
        audit.record(_make_entry(document_id="d2"))
        audit.record(_make_entry(document_id="d3"))
        assert len(audit.get_all()) == 3

    def test_get_all_defensive_copy(self):
        """get_all()은 방어적 복사"""
        audit = AuditLog()
        audit.record(_make_entry())
        entries = audit.get_all()
        entries.clear()
        assert len(audit.get_all()) == 1


class TestAuditLogQuery:
    """AuditLog 조회"""

    def test_get_by_document(self):
        """문서별 조회"""
        audit = AuditLog()
        audit.record(_make_entry(document_id="d1", action="a"))
        audit.record(_make_entry(document_id="d2", action="b"))
        audit.record(_make_entry(document_id="d1", action="c"))

        results = audit.get_by_document("d1")
        assert len(results) == 2
        assert all(e.document_id == "d1" for e in results)

    def test_get_by_document_empty(self):
        """존재하지 않는 문서 → 빈 리스트"""
        audit = AuditLog()
        audit.record(_make_entry(document_id="d1"))
        assert audit.get_by_document("d999") == []

    def test_get_by_stage(self):
        """단계별 조회"""
        audit = AuditLog()
        audit.record(_make_entry(stage="classification"))
        audit.record(_make_entry(stage="ocr"))
        audit.record(_make_entry(stage="classification"))

        results = audit.get_by_stage("classification")
        assert len(results) == 2

    def test_get_by_actor(self):
        """액터별 조회"""
        audit = AuditLog()
        audit.record(_make_entry(actor="openai"))
        audit.record(_make_entry(actor="upstage"))
        audit.record(_make_entry(actor="openai"))

        results = audit.get_by_actor("openai")
        assert len(results) == 2

    def test_get_by_period(self):
        """기간별 조회"""
        audit = AuditLog()
        audit.record(_make_entry(timestamp="2026-03-19T10:00:00"))
        audit.record(_make_entry(timestamp="2026-03-19T12:00:00"))
        audit.record(_make_entry(timestamp="2026-03-19T14:00:00"))
        audit.record(_make_entry(timestamp="2026-03-20T10:00:00"))

        results = audit.get_by_period("2026-03-19T11:00:00", "2026-03-19T15:00:00")
        assert len(results) == 2

    def test_get_by_period_no_match(self):
        """매칭 없는 기간 → 빈 리스트"""
        audit = AuditLog()
        audit.record(_make_entry(timestamp="2026-03-19T10:00:00"))

        results = audit.get_by_period("2026-01-01T00:00:00", "2026-01-02T00:00:00")
        assert results == []

    def test_get_by_period_inclusive(self):
        """기간 경계값 포함 (inclusive)"""
        audit = AuditLog()
        audit.record(_make_entry(timestamp="2026-03-19T10:00:00"))
        audit.record(_make_entry(timestamp="2026-03-19T12:00:00"))

        results = audit.get_by_period("2026-03-19T10:00:00", "2026-03-19T12:00:00")
        assert len(results) == 2


# ===========================================================================
# 무결성 검증
# ===========================================================================


class TestAuditLogIntegrity:
    """체크섬 무결성 검증"""

    def test_verify_integrity_valid(self):
        """정상 엔트리 → True"""
        audit = AuditLog()
        entry = _make_entry()
        audit.record(entry)
        assert audit.verify_integrity(entry) is True

    def test_verify_integrity_tampered(self):
        """변조된 엔트리 → False"""
        audit = AuditLog()
        entry = _make_entry(timestamp="2026-03-19T12:00:00")
        audit.record(entry)

        # 데이터 변조 (action 필드 변경)
        entry.action = "tampered_action"
        assert audit.verify_integrity(entry) is False

    def test_verify_integrity_tampered_details(self):
        """details 변조 → False"""
        audit = AuditLog()
        entry = _make_entry(
            details={"confidence": 0.95},
            timestamp="2026-03-19T12:00:00",
        )
        audit.record(entry)

        entry.details["confidence"] = 0.99
        assert audit.verify_integrity(entry) is False

    def test_verify_all_clean(self):
        """전체 검증 — 모두 정상"""
        audit = AuditLog()
        audit.record(_make_entry(document_id="d1", timestamp="2026-03-19T10:00:00"))
        audit.record(_make_entry(document_id="d2", timestamp="2026-03-19T11:00:00"))

        result = audit.verify_all()
        assert result["total"] == 2
        assert result["valid"] == 2
        assert result["invalid"] == 0
        assert result["invalid_entries"] == []

    def test_verify_all_with_tampered(self):
        """전체 검증 — 변조 엔트리 탐지"""
        audit = AuditLog()
        e1 = _make_entry(document_id="d1", timestamp="2026-03-19T10:00:00")
        e2 = _make_entry(document_id="d2", timestamp="2026-03-19T11:00:00")
        audit.record(e1)
        audit.record(e2)

        # e2 변조
        e2.actor = "malicious_actor"

        result = audit.verify_all()
        assert result["total"] == 2
        assert result["valid"] == 1
        assert result["invalid"] == 1
        assert 1 in result["invalid_entries"]

    def test_verify_all_empty(self):
        """빈 로그 전체 검증"""
        audit = AuditLog()
        result = audit.verify_all()
        assert result["total"] == 0
        assert result["valid"] == 0
        assert result["invalid"] == 0


# ===========================================================================
# 통계
# ===========================================================================


class TestAuditLogStats:
    """get_stats() 통계"""

    def test_empty_stats(self):
        """빈 AuditLog 통계"""
        audit = AuditLog()
        stats = audit.get_stats()
        assert stats["total_entries"] == 0
        assert stats["unique_documents"] == 0
        assert stats["by_stage"] == {}
        assert stats["by_action"] == {}
        assert stats["by_actor"] == {}

    def test_stats_aggregation(self):
        """집계 통계"""
        audit = AuditLog()
        audit.record(_make_entry(document_id="d1", stage="classification", action="classified", actor="openai"))
        audit.record(_make_entry(document_id="d1", stage="ocr", action="ocr_completed", actor="upstage"))
        audit.record(_make_entry(document_id="d2", stage="classification", action="classified", actor="openai"))

        stats = audit.get_stats()
        assert stats["total_entries"] == 3
        assert stats["unique_documents"] == 2
        assert stats["by_stage"]["classification"] == 2
        assert stats["by_stage"]["ocr"] == 1
        assert stats["by_action"]["classified"] == 2
        assert stats["by_action"]["ocr_completed"] == 1
        assert stats["by_actor"]["openai"] == 2
        assert stats["by_actor"]["upstage"] == 1
