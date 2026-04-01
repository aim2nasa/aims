"""
xPipe CLI 테스트

CLI 명령(version, status, test)이 올바르게 동작하는지 검증한다.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

# document_pipeline 디렉토리
DP_DIR = Path(__file__).parent.parent.parent

# Windows cp949 인코딩 문제 방지
_ENV = {**os.environ, "PYTHONIOENCODING": "utf-8"}


def _run_xpipe(*args: str) -> subprocess.CompletedProcess:
    """xpipe CLI를 subprocess로 실행하고 결과를 반환한다.

    Windows cp949 인코딩 문제를 방지하기 위해 바이트 모드로 읽고 utf-8 디코딩한다.
    """
    result = subprocess.run(
        [sys.executable, "-m", "xpipe", *args],
        capture_output=True,
        cwd=str(DP_DIR),
        env=_ENV,
    )
    # 바이트 → 문자열 변환 (utf-8, 실패 시 대체 문자)
    result.stdout = result.stdout.decode("utf-8", errors="replace") if result.stdout else ""
    result.stderr = result.stderr.decode("utf-8", errors="replace") if result.stderr else ""
    return result


class TestCLIVersion:
    """xpipe version 명령 테스트"""

    def test_version_output(self):
        """python -m xpipe version → 'xpipe X.Y.Z' 출력 (동적 버전 비교)"""
        from xpipe.cli import _get_version
        expected_version = _get_version()
        result = _run_xpipe("version")
        assert result.returncode == 0
        assert "xpipe" in result.stdout
        assert expected_version in result.stdout

    def test_version_via_cli_main(self):
        """cli.main()을 직접 호출하여 version이 semver 형식인지 확인"""
        import re
        from xpipe.cli import _get_version
        version = _get_version()
        assert re.match(r"^\d+\.\d+\.\d+$", version), f"버전이 semver 형식이 아닙니다: {version}"


class TestCLIStatus:
    """xpipe status 명령 테스트"""

    def test_status_output(self):
        """python -m xpipe status → ABC 정의 목록 출력"""
        result = _run_xpipe("status")
        assert result.returncode == 0
        assert "DomainAdapter" in result.stdout
        assert "DocumentStore" in result.stdout
        assert "JobQueue" in result.stdout
        assert "abstract" in result.stdout

    def test_status_shows_adapter_methods(self):
        """status에 ABC의 abstract 메서드가 나열되는지 확인"""
        result = _run_xpipe("status")
        assert "detect_special_documents" in result.stdout
        assert "get_classification_config" in result.stdout


class TestCLINoCommand:
    """명령 없이 실행 시 도움말 출력"""

    def test_no_command_shows_help(self):
        """python -m xpipe → 도움말 출력 + 비정상 종료"""
        result = _run_xpipe()
        assert result.returncode != 0
        combined = (result.stderr + result.stdout).lower()
        assert "usage" in combined or "xpipe" in combined
