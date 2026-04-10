"""
test_insurer_name_persistence_57.py

Regression tests for issue #57: insurer_name DB persistence path.

Gini Gate FAIL 발견:
- background.py 에서 추출한 insurer_name 이 metadata 로 머지되지 않아
  save_annual_report 에서 None 으로 저장되던 문제.
- db_writer.py 의 metadata 언팩/annual_report dict 에 insurer_name 필드가
  없어 저장 경로가 끊겨 있던 문제.

본 테스트는 두 가지 회귀를 단위 수준에서 고정한다:

1) test_db_writer_saves_insurer_name
   - save_annual_report() 가 metadata.insurer_name 을 annual_report dict 에
     담아 push_annual_report 로 전달하는지 확인.

2) test_background_merges_insurer_name_into_metadata
   - background.py 의 머지 로직 (extract_ar_meta 결과 → metadata dict) 이
     insurer_name 을 정확히 metadata 로 복사하는지 확인.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from bson import ObjectId


# annual_report_api 루트를 sys.path 에 추가 (서비스 모듈 직접 import 용)
_api_root = Path(__file__).resolve().parent.parent
if str(_api_root) not in sys.path:
    sys.path.insert(0, str(_api_root))


@pytest.fixture
def fake_customer_id() -> str:
    return str(ObjectId())


@pytest.fixture
def base_metadata() -> dict:
    return {
        "customer_name": "[계약자]",
        "report_title": "연간 보장 분석 리포트",
        "issue_date": "2024-06-30",
        "fsr_name": "[설계사]",
        "insurer_name": "메트라이프생명",
    }


@pytest.fixture
def base_report_data() -> dict:
    return {
        "보유계약 현황": [],
        "부활가능 실효계약": [],
        "총_월보험료": 0,
    }


class TestDBWriterInsurerName:
    """db_writer.save_annual_report 가 insurer_name 을 영속화하는지 회귀 고정."""

    def test_db_writer_saves_insurer_name(
        self, fake_customer_id, base_metadata, base_report_data
    ):
        """metadata.insurer_name 이 annual_report dict 에 담겨 저장되어야 한다."""
        from services import db_writer as db_writer_mod
        importlib.reload(db_writer_mod)

        captured = {}

        def _fake_push(customer_id, report_dict):
            captured["customer_id"] = customer_id
            captured["report"] = report_dict
            return {"success": True, "data": {"modifiedCount": 1}}

        fake_customer = {
            "_id": ObjectId(fake_customer_id),
            "personal_info": {"name": "[계약자]"},
            "annual_reports": [],
        }

        with patch.object(db_writer_mod, "get_customer", return_value=fake_customer), \
             patch.object(db_writer_mod, "push_annual_report", side_effect=_fake_push), \
             patch.object(db_writer_mod, "notify_ar_status_change"):
            result = db_writer_mod.save_annual_report(
                db=MagicMock(),
                customer_id=fake_customer_id,
                report_data=base_report_data,
                metadata=base_metadata,
                source_file_id=None,
            )

        assert result["success"] is True, f"save_annual_report 실패: {result}"
        assert "report" in captured, "push_annual_report 가 호출되지 않았습니다"

        report = captured["report"]
        assert "insurer_name" in report, (
            "annual_report dict 에 insurer_name 필드가 없습니다 "
            "(db_writer 저장 경로 회귀)"
        )
        assert report["insurer_name"] == "메트라이프생명", (
            f"insurer_name 값이 저장되지 않았습니다: {report.get('insurer_name')!r}"
        )

    def test_db_writer_insurer_name_none_when_missing(
        self, fake_customer_id, base_report_data
    ):
        """metadata 에 insurer_name 이 없으면 None 으로 저장되어야 한다 (필드는 존재)."""
        from services import db_writer as db_writer_mod
        importlib.reload(db_writer_mod)

        metadata_no_insurer = {
            "customer_name": "[계약자]",
            "report_title": "연간 리포트",
            "issue_date": "2024-06-30",
            "fsr_name": "[설계사]",
            # insurer_name 누락
        }

        captured = {}

        def _fake_push(customer_id, report_dict):
            captured["report"] = report_dict
            return {"success": True, "data": {"modifiedCount": 1}}

        fake_customer = {
            "_id": ObjectId(fake_customer_id),
            "personal_info": {"name": "[계약자]"},
            "annual_reports": [],
        }

        with patch.object(db_writer_mod, "get_customer", return_value=fake_customer), \
             patch.object(db_writer_mod, "push_annual_report", side_effect=_fake_push), \
             patch.object(db_writer_mod, "notify_ar_status_change"):
            db_writer_mod.save_annual_report(
                db=MagicMock(),
                customer_id=fake_customer_id,
                report_data=base_report_data,
                metadata=metadata_no_insurer,
                source_file_id=None,
            )

        report = captured["report"]
        assert "insurer_name" in report, (
            "insurer_name 필드는 항상 annual_report dict 에 존재해야 합니다"
        )
        assert report["insurer_name"] is None


class TestBackgroundMetadataMerge:
    """background.py 가 extract_ar_meta 결과의 insurer_name 을 metadata 로 머지하는지 회귀 고정."""

    @staticmethod
    def _merge_extracted_into_metadata(extracted: dict, metadata: dict) -> dict:
        """
        background.py (queue + BG 루프) 의 머지 규칙을 그대로 재현한다.

        규칙: extracted 가 값을 가지면 metadata 에 덮어쓴다.
        이 함수의 동작이 background.py 의 두 머지 블록과 동치여야 한다.
        """
        if extracted.get("customer_name"):
            metadata["customer_name"] = extracted["customer_name"]
        if extracted.get("issue_date"):
            metadata["issue_date"] = extracted["issue_date"]
        if extracted.get("fsr_name"):
            metadata["fsr_name"] = extracted["fsr_name"]
        if extracted.get("report_title"):
            metadata["report_title"] = extracted["report_title"]
        if extracted.get("insurer_name"):
            metadata["insurer_name"] = extracted["insurer_name"]
        return metadata

    def test_background_merges_insurer_name_into_metadata(self):
        """extract_ar_meta 가 insurer_name 을 반환하면 metadata 에 머지되어야 한다."""
        extracted = {
            "customer_name": "[계약자]",
            "issue_date": "2024-06-30",
            "fsr_name": "[설계사]",
            "report_title": "연간 리포트",
            "insurer_name": "MetLife",
        }
        metadata: dict = {}

        merged = self._merge_extracted_into_metadata(extracted, metadata)

        assert merged.get("insurer_name") == "MetLife", (
            "background 머지 로직이 insurer_name 을 metadata 로 복사하지 않음"
        )

    def test_background_merge_preserves_existing_insurer_name(self):
        """extract 결과에 insurer_name 이 없을 땐 기존 metadata 값을 보존해야 한다."""
        extracted = {
            "customer_name": "[계약자]",
            "issue_date": "2024-06-30",
            # insurer_name 없음
        }
        metadata = {"insurer_name": "메트라이프생명"}

        merged = self._merge_extracted_into_metadata(extracted, metadata)

        assert merged.get("insurer_name") == "메트라이프생명"

    def test_background_py_source_contains_insurer_name_merge(self):
        """
        소스 레벨 가드: background.py 의 두 머지 블록에 insurer_name 머지 코드가
        실제로 존재해야 한다. (회귀 방지 — 코드가 삭제되면 즉시 실패)
        """
        bg_path = _api_root / "routes" / "background.py"
        source = bg_path.read_text(encoding="utf-8")

        # 두 번 이상 등장해야 한다 (queue 루프 + BG 루프)
        needle = 'metadata["insurer_name"] = extracted["insurer_name"]'
        occurrences = source.count(needle)
        assert occurrences >= 2, (
            f"background.py 에 insurer_name 머지 구문이 {occurrences}회만 등장합니다. "
            "queue + BG 두 머지 블록 모두에 필요합니다."
        )
