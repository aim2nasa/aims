"""
xPipe 경로 포함 original_name 처리 및 API 키 주입 회귀 테스트

ISSUE-2 (2026-03-25): xPipe가 prod에서 전량 실패한 근본 원인 2가지 검증:
1. original_name에 하위 디렉토리 경로가 포함될 때 FileNotFoundError 발생 방지
2. API 키가 settings 객체에서 올바르게 xPipe context에 주입되는지 확인

@since 2026-03-25
@issue ISSUE-2: xPipe 전량 실패 — legacy fallback 의존
"""
import sys
import os
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId


class TestXPipeTmpPathWithNestedOriginalName:
    """original_name에 경로 구조가 포함될 때 tmp_path 생성 회귀 테스트

    일괄등록 시 original_name이 '고객사/계약자,피보험자/피보험자/파일.pdf' 형태로
    하위 디렉토리 구조를 포함할 수 있다. 이때 os.path.join(tmp_dir, original_name)은
    중간 디렉토리가 미생성 상태에서 open()을 호출하여 FileNotFoundError를 발생시킨다.

    수정: os.path.basename(original_name) 사용으로 파일명만 추출.
    """

    @pytest.mark.parametrize("original_name", [
        # 실제 prod에서 발생한 패턴: 고객사/계약자,피보험자/피보험자/파일명.pdf
        "캐치업코리아/김보성,안영미/안영미/안영미백병원보험금청구서.pdf",
        "캐치업코리아/김보성,안영미/안영미/안영미백병원보험금청구서1.pdf",
        # 2단계 경로
        "고객사/문서.pdf",
        # 4단계 이상 경로
        "A/B/C/D/E/파일.pdf",
        # 단순 파일명 (기존 동작 보장)
        "단순파일.pdf",
        # 빈 문자열 (폴백)
        "",
    ])
    def test_tmp_path_creation_no_file_not_found_error(self, original_name):
        """경로가 포함된 original_name으로 임시 파일 저장 시 FileNotFoundError가 발생하지 않아야 함"""
        tmp_dir = tempfile.mkdtemp()
        try:
            # 수정된 로직: basename 사용
            tmp_path = os.path.join(tmp_dir, os.path.basename(original_name) or "upload.pdf")

            # FileNotFoundError 없이 파일 쓰기 성공해야 함
            with open(tmp_path, "wb") as f:
                f.write(b"test content")

            assert os.path.exists(tmp_path)

            # 파일명이 basename만 포함하는지 확인 (중간 디렉토리 없음)
            assert os.path.dirname(tmp_path) == tmp_dir
        finally:
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)

    @pytest.mark.parametrize("original_name,expected_basename", [
        ("캐치업코리아/김보성,안영미/안영미/파일.pdf", "파일.pdf"),
        ("고객사/문서.jpg", "문서.jpg"),
        ("A/B/C/파일.hwp", "파일.hwp"),
        ("단순파일.pdf", "단순파일.pdf"),
    ])
    def test_basename_extraction(self, original_name, expected_basename):
        """os.path.basename이 정확한 파일명만 추출하는지 확인"""
        result = os.path.basename(original_name)
        assert result == expected_basename

    def test_empty_original_name_fallback(self):
        """original_name이 빈 문자열일 때 'upload.pdf' 폴백"""
        result = os.path.basename("") or "upload.pdf"
        assert result == "upload.pdf"

    def test_none_original_name_fallback(self):
        """original_name이 None일 때 'upload.pdf' 폴백"""
        original_name = None
        safe_name = os.path.basename(original_name or "") or "upload.pdf"
        assert safe_name == "upload.pdf"


def _make_xpipe_mocks():
    """xPipe 테스트에 필요한 공통 mock 객체 생성 헬퍼"""
    # MongoDB mock
    mock_collection = AsyncMock()
    mock_insert = MagicMock()
    mock_insert.inserted_id = ObjectId()
    mock_collection.insert_one.return_value = mock_insert
    mock_collection.update_one.return_value = MagicMock(modified_count=1)
    mock_collection.find_one.return_value = None

    # InsuranceDomainAdapter mock
    mock_adapter = AsyncMock()
    mock_classification_config = MagicMock()
    mock_classification_config.extra = {"system_prompt": "test"}
    mock_classification_config.prompt_template = "classify: {text}"
    mock_classification_config.categories = []
    mock_classification_config.valid_types = []
    mock_adapter.get_classification_config = AsyncMock(
        return_value=mock_classification_config
    )

    return mock_collection, mock_adapter


class TestXPipeApiKeyInjection:
    """xPipe context에 API 키가 settings 객체에서 올바르게 주입되는지 검증

    기존 문제: os.environ.get("UPSTAGE_API_KEY", "")는 환경변수가 직접 설정되지 않으면
    빈 문자열을 반환. pydantic-settings의 Settings 객체는 .env 파일에서도 로드하므로
    settings.UPSTAGE_API_KEY를 사용해야 함.
    """

    @pytest.mark.asyncio
    async def test_api_keys_from_settings_not_environ(self):
        """API 키가 os.environ이 아닌 settings 객체에서 주입되는지 확인"""
        from routers.doc_prep_main import _process_via_xpipe

        # settings에는 API 키가 있지만 os.environ에는 없는 상황 시뮬레이션
        mock_settings = MagicMock()
        mock_settings.OPENAI_API_KEY = "sk-test-openai-key"
        mock_settings.UPSTAGE_API_KEY = "up-test-upstage-key"

        captured_context = {}

        async def capture_pipeline_run(context):
            """Pipeline.run()을 가로채서 context를 캡처"""
            captured_context.update(context)
            return {
                "extracted_text": "테스트 텍스트",
                "document_type": "general",
                "classification_confidence": 0.9,
                "detections": [],
            }

        mock_collection, mock_adapter = _make_xpipe_mocks()

        # Pipeline mock
        mock_pipeline = MagicMock()
        mock_pipeline.run = AsyncMock(side_effect=capture_pipeline_run)
        mock_pipeline.register_stage = MagicMock()

        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock), \
             patch("config.get_settings", return_value=mock_settings), \
             patch("xpipe.pipeline.Pipeline", return_value=mock_pipeline), \
             patch("insurance.adapter.InsuranceDomainAdapter", return_value=mock_adapter):

            mock_mongo.get_collection.return_value = mock_collection
            mock_file.save_file = AsyncMock(return_value=(
                "saved_file.pdf", "/data/files/saved_file.pdf"
            ))

            # 환경변수에서 API 키 제거 (있다면)
            old_openai = os.environ.pop("OPENAI_API_KEY", None)
            old_upstage = os.environ.pop("UPSTAGE_API_KEY", None)
            try:
                result = await _process_via_xpipe(
                    file_content=b"test pdf content",
                    original_name="테스트.pdf",
                    user_id="test_user",
                    customer_id=None,
                    source_path=None,
                    mime_type="application/pdf",
                )

                # API 키가 settings 객체에서 주입되었는지 확인
                assert captured_context.get("_api_keys", {}).get("openai") == "sk-test-openai-key"
                assert captured_context.get("_api_keys", {}).get("upstage") == "up-test-upstage-key"

                # 결과가 성공이어야 함
                assert result["result"] == "success"
                assert result["engine"] == "xpipe"
            finally:
                # 환경변수 복원
                if old_openai is not None:
                    os.environ["OPENAI_API_KEY"] = old_openai
                if old_upstage is not None:
                    os.environ["UPSTAGE_API_KEY"] = old_upstage


class TestXPipeProcessWithNestedPath:
    """경로 포함 original_name으로 _process_via_xpipe가 전체 성공하는지 통합 테스트"""

    @pytest.mark.asyncio
    async def test_xpipe_succeeds_with_nested_original_name(self):
        """일괄등록 형태의 경로가 포함된 original_name으로 xPipe 처리가 성공해야 함

        이 테스트가 실패하면 xPipe가 prod에서 전량 실패하고 legacy fallback으로 처리됨.
        """
        from routers.doc_prep_main import _process_via_xpipe

        mock_settings = MagicMock()
        mock_settings.OPENAI_API_KEY = "sk-test"
        mock_settings.UPSTAGE_API_KEY = "up-test"

        async def mock_pipeline_run(context):
            return {
                "extracted_text": "추출된 텍스트",
                "document_type": "general",
                "classification_confidence": 0.85,
                "detections": [],
            }

        mock_collection, mock_adapter = _make_xpipe_mocks()

        mock_pipeline = MagicMock()
        mock_pipeline.run = AsyncMock(side_effect=mock_pipeline_run)
        mock_pipeline.register_stage = MagicMock()

        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock), \
             patch("config.get_settings", return_value=mock_settings), \
             patch("xpipe.pipeline.Pipeline", return_value=mock_pipeline), \
             patch("insurance.adapter.InsuranceDomainAdapter", return_value=mock_adapter):

            mock_mongo.get_collection.return_value = mock_collection
            mock_file.save_file = AsyncMock(return_value=(
                "saved_file.pdf", "/data/files/saved_file.pdf"
            ))

            # 실제 prod에서 실패한 패턴으로 테스트
            result = await _process_via_xpipe(
                file_content=b"test pdf content",
                original_name="캐치업코리아/김보성,안영미/안영미/안영미백병원보험금청구서.pdf",
                user_id="test_user",
                customer_id=None,
                source_path=None,
                mime_type="application/pdf",
            )

            # xPipe로 처리 성공 (legacy fallback이 아님)
            assert result["result"] == "success"
            assert result["engine"] == "xpipe"

    @pytest.mark.asyncio
    async def test_xpipe_not_fallback_to_legacy(self):
        """경로 포함 original_name이 xPipe 실패 -> legacy fallback을 유발하지 않아야 함"""
        from routers.doc_prep_main import process_document_pipeline

        mock_settings = MagicMock()
        mock_settings.OPENAI_API_KEY = "sk-test"
        mock_settings.UPSTAGE_API_KEY = "up-test"

        async def mock_pipeline_run(context):
            return {
                "extracted_text": "추출된 텍스트",
                "document_type": "general",
                "classification_confidence": 0.85,
                "detections": [],
            }

        mock_collection, mock_adapter = _make_xpipe_mocks()

        mock_pipeline = MagicMock()
        mock_pipeline.run = AsyncMock(side_effect=mock_pipeline_run)
        mock_pipeline.register_stage = MagicMock()

        # PIPELINE_ENGINE=xpipe로 설정
        with patch.dict(os.environ, {"PIPELINE_ENGINE": "xpipe"}), \
             patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock), \
             patch("config.get_settings", return_value=mock_settings), \
             patch("xpipe.pipeline.Pipeline", return_value=mock_pipeline), \
             patch("insurance.adapter.InsuranceDomainAdapter", return_value=mock_adapter), \
             patch("routers.doc_prep_main._process_via_legacy", new_callable=AsyncMock) as mock_legacy:

            mock_mongo.get_collection.return_value = mock_collection
            mock_file.save_file = AsyncMock(return_value=(
                "saved_file.pdf", "/data/files/saved_file.pdf"
            ))

            result = await process_document_pipeline(
                file_content=b"test pdf content",
                original_name="캐치업코리아/김보성,안영미/안영미/파일.pdf",
                user_id="test_user",
                customer_id=None,
                source_path=None,
                mime_type="application/pdf",
            )

            # xPipe로 처리 성공
            assert result["result"] == "success"
            assert result["engine"] == "xpipe"

            # legacy fallback이 호출되지 않아야 함
            mock_legacy.assert_not_called()
