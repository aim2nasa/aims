"""
auto_parse_annual_reports Internal API 전환 regression 테스트
- files/customers 컬렉션 직접 접근 금지 확인
- internal_api.query_files() 경유 조회 확인
"""
import sys
import os
from pathlib import Path

# annual_report_api 디렉토리를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))


class TestNoDirectDbAccess:
    """auto_parse_annual_reports.py가 files/customers 컬렉션을 직접 접근하지 않는지 소스 검증"""

    def _read_source(self):
        source_path = Path(__file__).parent.parent / "auto_parse_annual_reports.py"
        return source_path.read_text(encoding="utf-8")

    def test_no_db_files_direct_access(self):
        """db['files'] 직접 접근이 없어야 함"""
        source = self._read_source()
        assert 'db["files"]' not in source, "db['files'] 직접 접근 금지 — internal_api 경유 필수"
        assert "db['files']" not in source, "db['files'] 직접 접근 금지 — internal_api 경유 필수"

    def test_no_db_customers_direct_access(self):
        """db['customers'] 직접 접근이 없어야 함"""
        source = self._read_source()
        assert 'db["customers"]' not in source, "db['customers'] 직접 접근 금지 — internal_api 경유 필수"
        assert "db['customers']" not in source, "db['customers'] 직접 접근 금지 — internal_api 경유 필수"

    def test_imports_internal_api_query_files(self):
        """internal_api.query_files import 존재 확인"""
        source = self._read_source()
        assert "from internal_api import query_files" in source or "import internal_api" in source, \
            "internal_api 모듈을 통한 파일 조회 필수"


class TestGetUnprocessedFilesUsesInternalApi:
    """get_unprocessed_files가 internal_api.query_files()를 호출하는지 mock 검증"""

    def test_calls_query_files(self):
        """get_unprocessed_files 호출 시 query_files가 실행됨"""
        from unittest.mock import patch, MagicMock

        mock_files = [
            {"_id": "id1", "contentType": "application/pdf", "upload": {"originalName": "test.pdf"}, "length": 2048},
            {"_id": "id2", "contentType": "application/pdf", "upload": {"originalName": "ar.pdf"}, "length": 4096},
        ]

        with patch("auto_parse_annual_reports.query_files", return_value=mock_files) as mock_qf, \
             patch("auto_parse_annual_reports.MongoClient") as mock_mongo_cls:
            # processing_collection mock — 미처리 상태
            mock_proc_coll = MagicMock()
            mock_proc_coll.find_one.return_value = None

            mock_db = MagicMock()
            mock_db.__getitem__ = MagicMock(return_value=mock_proc_coll)
            mock_client = MagicMock()
            mock_client.__getitem__ = MagicMock(return_value=mock_db)
            mock_mongo_cls.return_value = mock_client

            from auto_parse_annual_reports import AnnualReportAutoParser
            parser = AnnualReportAutoParser()
            files = parser.get_unprocessed_files(lookback_hours=24)

            mock_qf.assert_called_once()

            # filter에 contentType 조건 포함 확인
            call_kwargs = mock_qf.call_args
            filter_arg = call_kwargs.kwargs.get("filter") or call_kwargs[1].get("filter", {})
            assert "contentType" in filter_arg, "query_files filter에 contentType 조건 필수"
