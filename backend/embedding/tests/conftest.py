# -*- coding: utf-8 -*-
"""
full_pipeline 테스트용 conftest.py

full_pipeline.py가 import하는 서버 전용 모듈(langchain, qdrant 등)과
환경변수를 사전에 mock하여 로컬 테스트 환경에서 실행 가능하게 합니다.
"""
import sys
import os
from unittest.mock import MagicMock

# ── 환경변수 사전 설정 (모듈 레벨 체크 통과용) ──
os.environ.setdefault("INTERNAL_API_KEY", "test-internal-api-key")
os.environ.setdefault("N8N_WEBHOOK_API_KEY", "test-webhook-api-key")

# ── 서버 전용 모듈 mock ──
# full_pipeline.py가 import하는 모듈 중 로컬에 없는 것들을 미리 등록
_mock_modules = [
    "extract_text_from_mongo",
    "split_text_into_chunks",
    "create_embeddings",
    "save_to_qdrant",
    # langchain 관련 (split_text_into_chunks 내부 의존성)
    "langchain",
    "langchain.text_splitter",
    # qdrant 관련 (save_to_qdrant 내부 의존성)
    "qdrant_client",
    "qdrant_client.http",
    "qdrant_client.http.models",
]

for mod_name in _mock_modules:
    if mod_name not in sys.modules:
        mock_mod = MagicMock()
        # create_embeddings 모듈의 EmbeddingError는 실제 Exception이어야 함
        if mod_name == "create_embeddings":
            class _EmbeddingError(Exception):
                def __init__(self, error_code="UNKNOWN", message=""):
                    self.error_code = error_code
                    self.message = message
                    super().__init__(message)
            mock_mod.EmbeddingError = _EmbeddingError
            mock_mod.create_embeddings_for_chunks = MagicMock()
        sys.modules[mod_name] = mock_mod

# full_pipeline 모듈이 이미 캐시되어 있으면 제거 (재import 보장)
if "full_pipeline" in sys.modules:
    del sys.modules["full_pipeline"]
