"""Characterization tests: CLI의 어댑터 탐색 동작 캡처

실행: cd d:\\aims\\backend\\api\\document_pipeline && python -m pytest xpipe/tests/test_char_cli_adapter.py -v

CLI _cmd_status()에서 환경변수(XPIPE_ADAPTER_MODULE, XPIPE_ADAPTER_CLASS)를 통해
어댑터를 동적으로 로드하는 동작을 캡처한다.
"""
from __future__ import annotations

import importlib
import os
from unittest.mock import patch, MagicMock

import pytest

from xpipe.adapter import DomainAdapter


class TestCliAdapterDiscovery:
    """CLI의 어댑터 탐색 로직 캡처"""

    def test_insurance_adapter_importable(self):
        """insurance.adapter 모듈이 import 가능하고 InsuranceDomainAdapter가 존재"""
        mod = importlib.import_module("insurance.adapter")
        assert hasattr(mod, "InsuranceDomainAdapter")

    def test_insurance_adapter_is_domain_adapter(self):
        """InsuranceDomainAdapter 인스턴스가 DomainAdapter ABC를 구현"""
        mod = importlib.import_module("insurance.adapter")
        adapter_cls = getattr(mod, "InsuranceDomainAdapter")
        adapter = adapter_cls()
        assert isinstance(adapter, DomainAdapter)

    def test_cli_uses_env_vars_for_adapter(self):
        """CLI가 XPIPE_ADAPTER_MODULE/XPIPE_ADAPTER_CLASS 환경변수로 어댑터를 로드"""
        from xpipe.cli import _cmd_status
        import argparse

        # 환경변수 설정 → insurance.adapter.InsuranceDomainAdapter 로드
        env = {
            "XPIPE_ADAPTER_MODULE": "insurance.adapter",
            "XPIPE_ADAPTER_CLASS": "InsuranceDomainAdapter",
        }
        with patch.dict(os.environ, env):
            args = argparse.Namespace()
            result = _cmd_status(args)
        assert result == 0

    def test_cli_no_env_vars_shows_message(self, capsys):
        """환경변수 미설정 시 안내 메시지 출력"""
        from xpipe.cli import _cmd_status
        import argparse

        env_clear = {"XPIPE_ADAPTER_MODULE": "", "XPIPE_ADAPTER_CLASS": ""}
        with patch.dict(os.environ, env_clear):
            args = argparse.Namespace()
            _cmd_status(args)

        captured = capsys.readouterr()
        assert "XPIPE_ADAPTER_MODULE" in captured.out

    def test_cli_import_failure_graceful(self):
        """존재하지 않는 모듈 지정 시 ImportError가 발생하는 것을 확인 (CLI에서 catch)"""
        with patch.dict("sys.modules", {"nonexistent_pkg": None, "nonexistent_pkg.adapter": None}):
            with pytest.raises((ImportError, ModuleNotFoundError)):
                importlib.import_module("nonexistent_pkg.adapter")
