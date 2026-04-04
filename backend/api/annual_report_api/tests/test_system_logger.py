"""
system_logger 스키마 통일 regression 테스트
- errorLogger.js _insertLog() / analytics_writer.py log_system_event()와 동일한 스키마 검증
"""
import sys
import os
from pathlib import Path

# annual_report_api 디렉토리를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from unittest.mock import patch, MagicMock


# --- 필수 필드 목록 (errorLogger.js 스키마) ---
REQUIRED_TOP_LEVEL_FIELDS = {"level", "message", "data", "actor", "timestamp", "source", "error", "context", "meta"}
REQUIRED_ACTOR_FIELDS = {"user_id", "name", "email", "role", "ip_address", "user_agent"}
REQUIRED_SOURCE_FIELDS = {"type", "endpoint", "method", "component", "url", "file", "line", "column"}
REQUIRED_CONTEXT_FIELDS = {"request_id", "session_id", "browser", "os", "version", "payload", "response_status", "component_stack"}
REQUIRED_META_FIELDS = {"resolved", "resolved_by", "resolved_at", "notes"}
REQUIRED_ERROR_FIELDS = {"type", "code", "message", "stack", "severity", "category"}


class TestSendErrorLog:
    """send_error_log 스키마 검증"""

    def test_error_log_with_exception_has_correct_schema(self):
        """send_error_log(error=Exception) 호출 시 전체 스키마 검증"""
        mock_collection = MagicMock()
        with patch("system_logger._get_collection", return_value=mock_collection):
            from system_logger import send_error_log
            result = send_error_log("test_component", "test error", ValueError("bad value"), {"key": "val"})

        assert result is True
        mock_collection.insert_one.assert_called_once()
        doc = mock_collection.insert_one.call_args[0][0]

        # 최상위 필수 필드
        assert REQUIRED_TOP_LEVEL_FIELDS.issubset(doc.keys()), f"누락 필드: {REQUIRED_TOP_LEVEL_FIELDS - doc.keys()}"

        # 값 검증
        assert doc["level"] == "error"
        assert doc["message"] == "test error"
        assert doc["data"] == {"key": "val"}

        # actor
        assert REQUIRED_ACTOR_FIELDS.issubset(doc["actor"].keys())
        assert doc["actor"]["role"] == "anonymous"

        # source
        assert REQUIRED_SOURCE_FIELDS.issubset(doc["source"].keys())
        assert doc["source"]["type"] == "backend"
        assert doc["source"]["component"] == "test_component"

        # error 객체
        assert doc["error"] is not None
        assert REQUIRED_ERROR_FIELDS.issubset(doc["error"].keys())
        assert doc["error"]["type"] == "ValueError"
        assert doc["error"]["message"] == "bad value"
        assert doc["error"]["severity"] == "high"
        assert doc["error"]["category"] == "runtime"

        # context
        assert REQUIRED_CONTEXT_FIELDS.issubset(doc["context"].keys())
        assert doc["context"]["request_id"] is not None  # uuid

        # meta
        assert REQUIRED_META_FIELDS.issubset(doc["meta"].keys())
        assert doc["meta"]["resolved"] is False

    def test_error_log_without_exception_has_fallback_error_obj(self):
        """send_error_log(error=None) 호출 시 error 객체가 기본값으로 채워지는지 확인"""
        mock_collection = MagicMock()
        with patch("system_logger._get_collection", return_value=mock_collection):
            from system_logger import send_error_log
            result = send_error_log("comp", "something failed")

        assert result is True
        doc = mock_collection.insert_one.call_args[0][0]

        assert doc["error"] is not None
        assert doc["error"]["type"] == "Error"
        assert doc["error"]["message"] == "something failed"
        assert doc["error"]["stack"] is None
        assert doc["error"]["severity"] == "high"

    def test_error_log_db_failure_returns_false(self):
        """MongoDB 삽입 실패 시 False 반환, 예외 전파 없음"""
        mock_collection = MagicMock()
        mock_collection.insert_one.side_effect = Exception("connection refused")
        with patch("system_logger._get_collection", return_value=mock_collection):
            from system_logger import send_error_log
            result = send_error_log("test", "msg")

        assert result is False


class TestSendWarnLog:
    """send_warn_log 스키마 검증"""

    def test_warn_log_has_correct_schema(self):
        """send_warn_log 호출 시 level=warn, error=None 검증"""
        mock_collection = MagicMock()
        with patch("system_logger._get_collection", return_value=mock_collection):
            from system_logger import send_warn_log
            result = send_warn_log("test_component", "warning msg", {"detail": "info"})

        assert result is True
        doc = mock_collection.insert_one.call_args[0][0]

        # 최상위 필수 필드
        assert REQUIRED_TOP_LEVEL_FIELDS.issubset(doc.keys())

        assert doc["level"] == "warn"
        assert doc["message"] == "warning msg"
        assert doc["error"] is None
        assert doc["data"] == {"detail": "info"}

        # 구조 필드 존재 확인
        assert REQUIRED_ACTOR_FIELDS.issubset(doc["actor"].keys())
        assert REQUIRED_SOURCE_FIELDS.issubset(doc["source"].keys())
        assert REQUIRED_CONTEXT_FIELDS.issubset(doc["context"].keys())
        assert REQUIRED_META_FIELDS.issubset(doc["meta"].keys())

    def test_warn_log_db_failure_returns_false(self):
        """MongoDB 삽입 실패 시 False 반환"""
        mock_collection = MagicMock()
        mock_collection.insert_one.side_effect = Exception("timeout")
        with patch("system_logger._get_collection", return_value=mock_collection):
            from system_logger import send_warn_log
            result = send_warn_log("test", "msg")

        assert result is False
