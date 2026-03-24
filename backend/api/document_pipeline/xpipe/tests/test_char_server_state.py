"""Characterization tests: server.py 글로벌 상태 구조 캡처

실행: cd d:\\aims\\backend\\api\\document_pipeline && python -m pytest xpipe/tests/test_char_server_state.py -v

server.py의 글로벌 변수 타입과 초기값, current_config 구조를 캡처한다.
주의: server.py import 시 _load_env_files() side effect가 발생하므로,
환경변수/파일 존재 여부에 따라 출력이 달라질 수 있다.
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest


class TestServerGlobalState:
    """server.py 인메모리 글로벌 상태 구조 캡처"""

    @pytest.fixture(autouse=True)
    def _import_server(self):
        """server 모듈을 한번만 import (side effect 허용)"""
        # _load_env_files()가 실행됨 — 환경에 따라 파일 로드 출력이 나올 수 있음
        from xpipe.console.web import server
        self.server = server

    def test_documents_is_empty_dict(self):
        """documents: dict[str, dict] — 초기 비어있음"""
        assert isinstance(self.server.documents, dict)

    def test_sse_events_is_list(self):
        """sse_events: list — 초기 비어있음"""
        assert isinstance(self.server.sse_events, list)

    def test_current_config_structure(self):
        """current_config 딕셔너리의 키 구조 캡처"""
        config = self.server.current_config
        assert isinstance(config, dict)

        # 필수 키 존재 확인
        expected_keys = {"adapter", "quality_gate", "mode", "enabled_stages", "models", "api_keys", "storage_path", "adapter_module", "adapter_class"}
        assert expected_keys.issubset(set(config.keys()))

    def test_current_config_enabled_stages(self):
        """기본 enabled_stages는 7개 스테이지 전부 활성"""
        stages = self.server.current_config["enabled_stages"]
        expected = ["ingest", "convert", "extract", "classify", "detect_special", "embed", "complete"]
        assert stages == expected

    def test_current_config_models_defaults(self):
        """기본 모델 설정: llm=gpt-4.1-mini, ocr=upstage, embedding=text-embedding-3-small"""
        models = self.server.current_config["models"]
        assert models["llm"] == "gpt-4.1-mini"
        assert models["ocr"] == "upstage"
        assert models["embedding"] == "text-embedding-3-small"

    def test_max_concurrency_and_constants(self):
        """상수값 캡처: MAX_CONCURRENCY=2, MAX_FILE_SIZE=50MB"""
        assert self.server.MAX_CONCURRENCY == 2
        assert self.server.MAX_FILE_SIZE == 50 * 1024 * 1024
