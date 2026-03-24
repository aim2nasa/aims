"""Characterization tests: CLI의 insurance.adapter 탐색 동작 캡처

실행: cd d:\\aims\\backend\\api\\document_pipeline && python -m pytest xpipe/tests/test_char_cli_adapter.py -v

CLI _cmd_status()에서 insurance.adapter를 동적 import하여
InsuranceDomainAdapter를 찾고 DomainAdapter 인스턴스인지 확인하는 동작을 캡처한다.
"""
from __future__ import annotations

import importlib
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

    def test_cli_import_failure_graceful(self):
        """insurance 패키지가 없을 때 ImportError가 발생하는 것을 확인 (CLI에서 catch)"""
        with patch.dict("sys.modules", {"insurance": None, "insurance.adapter": None}):
            with pytest.raises((ImportError, ModuleNotFoundError)):
                importlib.import_module("insurance.adapter")
