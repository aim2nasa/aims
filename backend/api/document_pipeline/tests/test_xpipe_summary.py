"""
xPipe summary 생성 회귀 테스트

_process_via_xpipe() 내 AI 요약/제목 생성 로직(8-1 단계) 검증.
4개 핵심 시나리오:
1. summarize_text() 성공 → meta.summary, meta.title이 meta_update에 포함
2. summarize_text() 예외 → summary_result={}로 유지, 파이프라인 계속 진행
3. _generate_display_name() 호출 시 실제 summary_result 전달
4. 텍스트 길이 < 10 → summarize_text() 미호출

@since 2026-03-26
"""
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, ANY
from bson import ObjectId
from datetime import datetime


VALID_DOC_ID = str(ObjectId())
TEST_USER_ID = "test_user_001"
TEST_ORIGINAL_NAME = "보험증권.pdf"

MODULE = "routers.doc_prep_main"


def _make_xpipe_result(extracted_text="충분한 텍스트입니다. 테스트용 문서 내용이 여기에 들어갑니다."):
    """xPipe Pipeline.run() 결과를 모사하는 dict"""
    return {
        "extracted_text": extracted_text,
        "document_type": "general",
        "classification_confidence": 0.85,
        "detections": [],
        "stage_data": {"extract": {"output": {"method": "text"}}},
    }


@pytest.fixture
def mock_files_collection():
    """MongoDB files 컬렉션 mock"""
    col = AsyncMock()
    mock_insert = MagicMock()
    mock_insert.inserted_id = ObjectId(VALID_DOC_ID)
    col.insert_one = AsyncMock(return_value=mock_insert)
    col.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    col.find_one = AsyncMock(return_value={"_id": ObjectId(VALID_DOC_ID)})
    return col


@pytest.fixture
def base_xpipe_patches(mock_files_collection):
    """_process_via_xpipe() 실행에 필요한 기본 패치 세트"""
    patches = {}

    p_mongo = patch(f"{MODULE}.MongoService.get_collection", return_value=mock_files_collection)
    patches["mongo"] = p_mongo

    p_file = patch(
        f"{MODULE}.FileService.save_file",
        new_callable=AsyncMock,
        return_value=("saved_name.pdf", "/data/uploads/saved_name.pdf"),
    )
    patches["file_service"] = p_file

    p_pipeline = patch("xpipe.pipeline.Pipeline.run", new_callable=AsyncMock)
    patches["pipeline_run"] = p_pipeline

    p_register = patch("xpipe.pipeline.Pipeline.register_stage")
    patches["register_stage"] = p_register

    mock_adapter = MagicMock()
    mock_adapter.get_classification_config = AsyncMock(return_value=MagicMock(
        extra={"system_prompt": ""},
        prompt_template="",
        categories=[],
        valid_types=[],
    ))
    p_adapter = patch("insurance.adapter.InsuranceDomainAdapter", return_value=mock_adapter)
    patches["adapter"] = p_adapter

    mock_settings = MagicMock()
    mock_settings.OPENAI_API_KEY = "test-key"
    mock_settings.UPSTAGE_API_KEY = "test-key"
    p_settings = patch(f"{MODULE}.get_settings", return_value=mock_settings)
    patches["settings"] = p_settings

    p_notify = patch(f"{MODULE}._notify_progress", new_callable=AsyncMock)
    patches["notify_progress"] = p_notify
    p_complete = patch(f"{MODULE}._notify_document_complete", new_callable=AsyncMock)
    patches["notify_complete"] = p_complete

    p_connect = patch(f"{MODULE}._connect_document_to_customer", new_callable=AsyncMock)
    patches["connect_customer"] = p_connect

    p_display = patch(f"{MODULE}._generate_display_name", new_callable=AsyncMock)
    patches["generate_display_name"] = p_display

    p_conv = patch(f"{MODULE}._trigger_pdf_conversion_for_xpipe", new_callable=AsyncMock)
    patches["pdf_conversion"] = p_conv

    p_mime = patch(f"{MODULE}.is_convertible_mime", return_value=False)
    patches["is_convertible"] = p_mime

    p_tempdir = patch("tempfile.mkdtemp", return_value="/tmp/test_xpipe")
    patches["tempdir"] = p_tempdir

    p_open = patch("builtins.open", MagicMock())
    patches["open"] = p_open

    p_rmtree = patch("shutil.rmtree")
    patches["rmtree"] = p_rmtree

    return patches


def _start_all(patches_dict):
    mocks = {}
    for key, p in patches_dict.items():
        mocks[key] = p.start()
    return mocks


def _stop_all(patches_dict):
    for p in patches_dict.values():
        p.stop()


class TestXpipeSummarizeSuccess:
    """시나리오 1: summarize_text() 성공 → meta.summary, meta.title이 DB 업데이트에 포함"""

    @pytest.mark.asyncio
    async def test_summary_and_title_in_meta_update(self, base_xpipe_patches, mock_files_collection, mock_internal_api_writes):
        """summarize_text()가 정상 반환하면 meta.summary, meta.title이 DB에 기록된다"""
        xpipe_result = _make_xpipe_result()
        summary_return = {
            "summary": "보험 증권 요약 내용입니다.",
            "title": "보험 증권 제목",
            "document_type": "general",
            "confidence": 0.9,
        }

        p_summarize = patch(
            f"{MODULE}.OpenAIService.summarize_text",
            new_callable=AsyncMock,
            return_value=summary_return,
        )

        mocks = _start_all(base_xpipe_patches)
        mocks["pipeline_run"].return_value = xpipe_result
        mock_summarize = p_summarize.start()

        try:
            from routers.doc_prep_main import _process_via_xpipe

            await _process_via_xpipe(
                file_content=b"fake pdf content",
                original_name=TEST_ORIGINAL_NAME,
                user_id=TEST_USER_ID,
                customer_id=None,
                source_path=None,
            )

            mock_summarize.assert_called_once()

            # update_file 호출 중 meta.summary, meta.title이 포함된 호출 찾기
            found_meta_update = False
            for call_obj in mock_internal_api_writes["update_file"].call_args_list:
                set_fields = call_obj.kwargs.get("set_fields", {})
                if "meta.summary" in set_fields and "meta.title" in set_fields:
                    assert set_fields["meta.summary"] == "보험 증권 요약 내용입니다."
                    assert set_fields["meta.title"] == "보험 증권 제목"
                    found_meta_update = True
                    break

            assert found_meta_update, "meta.summary와 meta.title이 포함된 update_file 호출을 찾지 못했습니다"

        finally:
            p_summarize.stop()
            _stop_all(base_xpipe_patches)


class TestXpipeSummarizeException:
    """시나리오 2: summarize_text() 예외 → summary_result={}로 유지, 파이프라인 계속"""

    @pytest.mark.asyncio
    async def test_exception_keeps_empty_summary_and_continues(self, base_xpipe_patches, mock_files_collection, mock_internal_api_writes):
        """summarize_text()가 예외를 발생시켜도 파이프라인은 완료되어야 한다"""
        xpipe_result = _make_xpipe_result()

        p_summarize = patch(
            f"{MODULE}.OpenAIService.summarize_text",
            new_callable=AsyncMock,
            side_effect=Exception("OpenAI API 타임아웃"),
        )

        mocks = _start_all(base_xpipe_patches)
        mocks["pipeline_run"].return_value = xpipe_result
        mock_summarize = p_summarize.start()

        try:
            from routers.doc_prep_main import _process_via_xpipe

            result = await _process_via_xpipe(
                file_content=b"fake pdf content",
                original_name=TEST_ORIGINAL_NAME,
                user_id=TEST_USER_ID,
                customer_id=None,
                source_path=None,
            )

            assert result is not None
            mock_summarize.assert_called_once()

            # meta.summary, meta.title이 빈 문자열로 저장되어야 함
            found_meta_update = False
            for call_obj in mock_internal_api_writes["update_file"].call_args_list:
                set_fields = call_obj.kwargs.get("set_fields", {})
                if "meta.summary" in set_fields:
                    assert set_fields["meta.summary"] == ""
                    assert set_fields["meta.title"] == ""
                    found_meta_update = True
                    break

            assert found_meta_update, "summary 예외 시에도 meta_update가 수행되어야 합니다"

        finally:
            p_summarize.stop()
            _stop_all(base_xpipe_patches)


class TestXpipeDisplayNameReceivesSummaryResult:
    """시나리오 3: _generate_display_name() 호출 시 실제 summary_result 전달"""

    @pytest.mark.asyncio
    async def test_display_name_gets_real_summary_result(self, base_xpipe_patches, mock_files_collection):
        """_generate_display_name()에 summary_result(title 포함)가 전달되어야 한다"""
        xpipe_result = _make_xpipe_result()
        summary_return = {
            "summary": "요약 내용",
            "title": "AI 생성 제목",
            "document_type": "general",
            "confidence": 0.9,
        }

        p_summarize = patch(
            f"{MODULE}.OpenAIService.summarize_text",
            new_callable=AsyncMock,
            return_value=summary_return,
        )

        mocks = _start_all(base_xpipe_patches)
        mocks["pipeline_run"].return_value = xpipe_result
        p_summarize.start()

        try:
            from routers.doc_prep_main import _process_via_xpipe

            await _process_via_xpipe(
                file_content=b"fake pdf content",
                original_name=TEST_ORIGINAL_NAME,
                user_id=TEST_USER_ID,
                customer_id=None,
                source_path=None,
            )

            mock_display = mocks["generate_display_name"]
            mock_display.assert_called_once()

            call_kwargs = mock_display.call_args
            if call_kwargs.kwargs:
                passed_summary = call_kwargs.kwargs.get("summary_result")
            else:
                passed_summary = call_kwargs.args[4] if len(call_kwargs.args) > 4 else None

            assert passed_summary is not None, "summary_result가 전달되지 않았습니다"
            assert passed_summary == summary_return

        finally:
            p_summarize.stop()
            _stop_all(base_xpipe_patches)


class TestXpipeShortTextSkipsSummary:
    """시나리오 4: 텍스트 길이 < 10 → summarize_text() 미호출"""

    @pytest.mark.asyncio
    async def test_short_text_does_not_call_summarize(self, base_xpipe_patches, mock_files_collection, mock_internal_api_writes):
        """추출 텍스트가 10자 미만이면 summarize_text()가 호출되지 않아야 한다"""
        xpipe_result = _make_xpipe_result(extracted_text="짧은글")

        p_summarize = patch(
            f"{MODULE}.OpenAIService.summarize_text",
            new_callable=AsyncMock,
            return_value={"summary": "불려서는 안 됨", "title": "불려서는 안 됨"},
        )

        mocks = _start_all(base_xpipe_patches)
        mocks["pipeline_run"].return_value = xpipe_result
        mock_summarize = p_summarize.start()

        try:
            from routers.doc_prep_main import _process_via_xpipe

            await _process_via_xpipe(
                file_content=b"fake pdf content",
                original_name="1234567890.pdf",
                user_id=TEST_USER_ID,
                customer_id=None,
                source_path=None,
            )

            mock_summarize.assert_not_called()

            # meta.summary, meta.title이 빈 문자열인지 확인
            found_meta_update = False
            for call_obj in mock_internal_api_writes["update_file"].call_args_list:
                set_fields = call_obj.kwargs.get("set_fields", {})
                if "meta.summary" in set_fields:
                    assert set_fields["meta.summary"] == ""
                    assert set_fields["meta.title"] == ""
                    found_meta_update = True
                    break

            assert found_meta_update, "텍스트가 짧아도 meta_update는 수행되어야 합니다"

        finally:
            p_summarize.stop()
            _stop_all(base_xpipe_patches)

    @pytest.mark.asyncio
    async def test_empty_text_does_not_call_summarize(self, base_xpipe_patches, mock_files_collection):
        """추출 텍스트가 빈 문자열이면 summarize_text()가 호출되지 않아야 한다"""
        xpipe_result = _make_xpipe_result(extracted_text="")

        p_summarize = patch(
            f"{MODULE}.OpenAIService.summarize_text",
            new_callable=AsyncMock,
        )

        mocks = _start_all(base_xpipe_patches)
        mocks["pipeline_run"].return_value = xpipe_result
        mock_summarize = p_summarize.start()

        try:
            from routers.doc_prep_main import _process_via_xpipe

            await _process_via_xpipe(
                file_content=b"fake pdf content",
                original_name="1234567890.pdf",
                user_id=TEST_USER_ID,
                customer_id=None,
                source_path=None,
            )

            mock_summarize.assert_not_called()

        finally:
            p_summarize.stop()
            _stop_all(base_xpipe_patches)

    @pytest.mark.asyncio
    async def test_whitespace_only_text_does_not_call_summarize(self, base_xpipe_patches, mock_files_collection):
        """공백만 있는 텍스트(strip 후 10자 미만)면 summarize_text()가 호출되지 않아야 한다"""
        xpipe_result = _make_xpipe_result(extracted_text="   \n\t   ")

        p_summarize = patch(
            f"{MODULE}.OpenAIService.summarize_text",
            new_callable=AsyncMock,
        )

        mocks = _start_all(base_xpipe_patches)
        mocks["pipeline_run"].return_value = xpipe_result
        mock_summarize = p_summarize.start()

        try:
            from routers.doc_prep_main import _process_via_xpipe

            await _process_via_xpipe(
                file_content=b"fake pdf content",
                original_name="1234567890.pdf",
                user_id=TEST_USER_ID,
                customer_id=None,
                source_path=None,
            )

            mock_summarize.assert_not_called()

        finally:
            p_summarize.stop()
            _stop_all(base_xpipe_patches)
