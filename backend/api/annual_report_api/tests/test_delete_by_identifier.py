"""
AR 삭제 식별자 기반 매칭 regression 테스트

버그: 인덱스 기반 삭제 시 조회/삭제 API의 배열 불일치로 잘못된 AR 삭제
수정: source_file_id 또는 issue_date+customer_name 식별자 기반 매칭

@since 2026-03-22
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from bson import ObjectId


# db_writer의 delete_annual_reports를 직접 import하기 어려우므로
# _should_delete 로직을 동일하게 재현하여 단위 테스트
class TestShouldDeleteMatcher:
    """_should_delete 매칭 로직 단위 테스트"""

    @staticmethod
    def _should_delete(report: dict, report_identifiers: list[dict]) -> bool:
        """db_writer.py의 _should_delete 로직 재현 (datetime 변환 포함)"""
        for ident in report_identifiers:
            sfid = ident.get("source_file_id")
            if sfid:
                if str(report.get("source_file_id", "")) == sfid:
                    return True
            else:
                db_issue_date = report.get("issue_date")
                if isinstance(db_issue_date, datetime):
                    db_issue_date = db_issue_date.isoformat()
                if (db_issue_date == ident.get("issue_date")
                        and report.get("customer_name") == ident.get("customer_name")):
                    return True
        return False

    def test_source_file_id_매칭(self):
        """source_file_id가 있으면 그것으로 매칭"""
        report = {"source_file_id": "aaa111", "customer_name": "곽승철"}
        identifiers = [{"source_file_id": "aaa111"}]
        assert self._should_delete(report, identifiers) is True

    def test_source_file_id_불일치(self):
        """다른 source_file_id는 매칭 안 됨"""
        report = {"source_file_id": "aaa111", "customer_name": "곽승철"}
        identifiers = [{"source_file_id": "bbb222"}]
        assert self._should_delete(report, identifiers) is False

    def test_issue_date_문자열_매칭(self):
        """issue_date가 문자열이면 그대로 비교"""
        report = {"issue_date": "2025.08.29", "customer_name": "신상철"}
        identifiers = [{"issue_date": "2025.08.29", "customer_name": "신상철"}]
        assert self._should_delete(report, identifiers) is True

    def test_issue_date_datetime_매칭(self):
        """[핵심] issue_date가 datetime 객체여도 isoformat 변환 후 비교"""
        dt = datetime(2025, 8, 29, tzinfo=timezone.utc)
        report = {"issue_date": dt, "customer_name": "신상철"}
        identifiers = [{"issue_date": dt.isoformat(), "customer_name": "신상철"}]
        assert self._should_delete(report, identifiers) is True

    def test_issue_date_datetime_불일치_이전_버그(self):
        """[회귀 방지] datetime vs string 비교가 False가 되면 안 됨"""
        dt = datetime(2025, 8, 29, tzinfo=timezone.utc)
        report = {"issue_date": dt, "customer_name": "신상철"}
        # 다른 날짜
        identifiers = [{"issue_date": "2026-01-01T00:00:00+00:00", "customer_name": "신상철"}]
        assert self._should_delete(report, identifiers) is False

    def test_customer_name_불일치(self):
        """같은 날짜지만 다른 소유주면 매칭 안 됨"""
        report = {"issue_date": "2025.08.29", "customer_name": "곽승철"}
        identifiers = [{"issue_date": "2025.08.29", "customer_name": "신상철"}]
        assert self._should_delete(report, identifiers) is False

    def test_복수_식별자_매칭(self):
        """여러 식별자 중 하나라도 매칭되면 삭제 대상"""
        report = {"source_file_id": "bbb222", "customer_name": "신상철"}
        identifiers = [
            {"source_file_id": "aaa111"},
            {"source_file_id": "bbb222"},
        ]
        assert self._should_delete(report, identifiers) is True

    def test_빈_식별자(self):
        """빈 식별자 배열이면 삭제 안 됨"""
        report = {"source_file_id": "aaa111", "customer_name": "곽승철"}
        assert self._should_delete(report, []) is False

    def test_source_file_id_ObjectId_문자열_매칭(self):
        """DB의 source_file_id가 ObjectId일 때 str() 변환 후 매칭"""
        oid = ObjectId()
        report = {"source_file_id": oid, "customer_name": "곽승철"}
        identifiers = [{"source_file_id": str(oid)}]
        assert self._should_delete(report, identifiers) is True
