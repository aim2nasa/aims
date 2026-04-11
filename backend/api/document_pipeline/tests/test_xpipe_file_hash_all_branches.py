"""
xPipe 파이프라인 file_hash 저장 회귀 테스트 (#68)

이슈: doc_prep_main._process_via_xpipe()의 4개 분기(손상 PDF, 변환 실패,
변환 대기, 보관 완료)에서 meta.file_hash가 DB에 저장되지 않아,
프론트엔드 중복 검사(duplicateChecker.ts가 빈 해시 제외)를 우회하여
이미지/압축/HWP 등이 매번 신규 등록되는 버그.

검증 목표: 4개 분기 각각에서 update_file 호출 set_fields에
meta.file_hash가 포함되고, 그 값이 SHA-256 해시(64자 hex)와 동일한지 확인.
"""
import hashlib
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

TEST_DOC_ID = "507f1f77bcf86cd799439011"
TEST_CONTENT = b"regression test file bytes for #68"
EXPECTED_HASH = hashlib.sha256(TEST_CONTENT).hexdigest()


def _find_set_field(mock_update, key):
    """update_file mock 호출 중 해당 key가 포함된 set_fields를 찾아 반환"""
    for call_item in mock_update.call_args_list:
        set_fields = call_item.kwargs.get("set_fields") or {}
        if key in set_fields:
            return set_fields
    return None


def _assert_hash_in_update(mock_update, expected_hash):
    """update_file 호출 중 meta.file_hash가 기대값으로 저장되었는지 확인"""
    hash_calls = []
    for call_item in mock_update.call_args_list:
        set_fields = call_item.kwargs.get("set_fields") or {}
        if "meta.file_hash" in set_fields:
            hash_calls.append(set_fields["meta.file_hash"])
    assert hash_calls, (
        "meta.file_hash가 어떤 update_file 호출에도 포함되지 않았습니다. "
        f"호출 내역: {[c.kwargs.get('set_fields') for c in mock_update.call_args_list]}"
    )
    assert expected_hash in hash_calls, (
        f"meta.file_hash 값이 예상과 다릅니다. 기대={expected_hash}, 실제={hash_calls}"
    )


class _FakePipeline:
    """Pipeline.run() 결과를 주입할 수 있는 페이크 파이프라인"""

    def __init__(self, result_dict):
        self._result = result_dict

    def register_stage(self, *args, **kwargs):
        pass

    async def run(self, context):
        return dict(self._result)


def _patch_xpipe_environment(pipeline_result):
    """_process_via_xpipe 실행에 필요한 외부 의존성을 일괄 mock"""
    return [
        patch(
            "routers.doc_prep_main.Pipeline",
            lambda definition: _FakePipeline(pipeline_result),
            create=True,
        ),
        # xpipe 모듈 import 자체를 mock (함수 내부 local import 대응)
        patch.dict(
            "sys.modules",
            {
                # 실제 xpipe 모듈이 있더라도 register_stage만 사용하므로 문제 없음
            },
        ),
        patch(
            "services.file_service.FileService.save_file",
            new=AsyncMock(return_value=("saved.bin", "/data/saved.bin")),
        ),
        patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock),
        patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock),
        patch(
            "routers.doc_prep_main._connect_document_to_customer",
            new_callable=AsyncMock,
        ),
        patch(
            "routers.doc_prep_main.MongoService.get_collection",
            return_value=AsyncMock(),
        ),
    ]


async def _invoke_xpipe(pipeline_result, *, original_name, mime_type):
    """_process_via_xpipe를 호출하고 update_file mock을 반환"""
    from routers import doc_prep_main as mod

    # Pipeline/Stages import 경로가 함수 내부 지역 import이므로
    # xpipe 네임스페이스 자체를 MagicMock으로 치환하여 register_stage 등을 무해화
    import sys
    import types

    fake_xpipe = types.ModuleType("xpipe")
    fake_pipeline_mod = types.ModuleType("xpipe.pipeline")

    class _StageConfig:
        def __init__(self, name):
            self.name = name

    class _PipelineDefinition:
        def __init__(self, name, stages):
            self.name = name
            self.stages = stages

    def _pipeline_factory(definition):
        return _FakePipeline(pipeline_result)

    fake_pipeline_mod.Pipeline = _pipeline_factory
    fake_pipeline_mod.PipelineDefinition = _PipelineDefinition
    fake_pipeline_mod.StageConfig = _StageConfig

    # stage 서브 모듈 (register_stage 대상)
    def _stage_stub():
        return MagicMock()

    stage_modules = {}
    for sub in ("classify", "complete", "convert", "detect_special", "extract"):
        m = types.ModuleType(f"xpipe.stages.{sub}")
        # 각 스테이지 클래스 이름은 register_stage 인자로만 쓰이므로 MagicMock이면 충분
        class_name = {
            "classify": "ClassifyStage",
            "complete": "CompleteStage",
            "convert": "ConvertStage",
            "detect_special": "DetectSpecialStage",
            "extract": "ExtractStage",
        }[sub]
        setattr(m, class_name, MagicMock())
        # extract는 TEXT_EXTENSIONS도 필요
        if sub == "extract":
            m.TEXT_EXTENSIONS = {".txt", ".md", ".csv"}
        stage_modules[f"xpipe.stages.{sub}"] = m

    fake_stages_mod = types.ModuleType("xpipe.stages")

    # insurance.adapter mock
    fake_insurance = types.ModuleType("insurance")
    fake_insurance_adapter = types.ModuleType("insurance.adapter")

    class _FakeClassifyConfig:
        prompt_template = ""
        valid_types = []
        categories = []
        extra = {"system_prompt": ""}

    class _FakeAdapter:
        async def get_classification_config(self):
            return _FakeClassifyConfig()

    fake_insurance_adapter.InsuranceDomainAdapter = _FakeAdapter

    saved_modules = {}
    inject = {
        "xpipe": fake_xpipe,
        "xpipe.pipeline": fake_pipeline_mod,
        "xpipe.stages": fake_stages_mod,
        "insurance": fake_insurance,
        "insurance.adapter": fake_insurance_adapter,
        **stage_modules,
    }
    for k, v in inject.items():
        saved_modules[k] = sys.modules.get(k)
        sys.modules[k] = v

    try:
        with patch(
            "services.file_service.FileService.save_file",
            new=AsyncMock(return_value=("saved.bin", "/data/saved.bin")),
        ), patch(
            "routers.doc_prep_main._notify_progress",
            new_callable=AsyncMock,
        ), patch(
            "routers.doc_prep_main._notify_document_complete",
            new_callable=AsyncMock,
        ), patch(
            "routers.doc_prep_main._connect_document_to_customer",
            new_callable=AsyncMock,
        ), patch(
            "routers.doc_prep_main.MongoService.get_collection",
            return_value=AsyncMock(),
        ):
            await mod._process_via_xpipe(
                file_content=TEST_CONTENT,
                original_name=original_name,
                user_id="test_user",
                customer_id=None,
                source_path=None,
                mime_type=mime_type,
                existing_doc_id=TEST_DOC_ID,
            )
    finally:
        for k, v in saved_modules.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


# ========================================
# 분기 1: 손상 PDF (corrupted_pdf)
# ========================================

class TestCorruptedPdfBranch:
    """손상 PDF 에러 분기에서 meta.file_hash 저장"""

    @pytest.mark.asyncio
    async def test_corrupted_pdf_stores_file_hash(self, mock_internal_api_writes):
        pipeline_result = {
            "text_extraction_failed": True,
            "_extraction_skip_reason": "corrupted_pdf",
            "_user_error_message": "파일이 손상되어 처리할 수 없습니다.",
        }

        await _invoke_xpipe(
            pipeline_result,
            original_name="broken.pdf",
            mime_type="application/pdf",
        )

        _assert_hash_in_update(
            mock_internal_api_writes["update_file"], EXPECTED_HASH
        )


# ========================================
# 분기 2: 변환 실패 (conversion_failed) — 큐 등록 실패 경로
# ========================================

class TestConversionFailedBranch:
    """변환 실패 에러 분기에서 meta.file_hash 저장"""

    @pytest.mark.asyncio
    async def test_conversion_failed_stores_file_hash(self, mock_internal_api_writes):
        pipeline_result = {
            "text_extraction_failed": True,
            "_extraction_skip_reason": "conversion_failed",
            "_conversion_error": "libreoffice failed",
        }

        # PdfConversionQueueService.enqueue를 실패시켜 에러 경로로 진입
        with patch(
            "services.pdf_conversion_queue_service.PdfConversionQueueService.enqueue",
            new=AsyncMock(side_effect=RuntimeError("queue down")),
        ):
            await _invoke_xpipe(
                pipeline_result,
                original_name="document.hwp",
                mime_type="application/x-hwp",
            )

        _assert_hash_in_update(
            mock_internal_api_writes["update_file"], EXPECTED_HASH
        )


# ========================================
# 분기 3: 변환 대기 (conversion_pending)
# ========================================

class TestConversionPendingBranch:
    """변환 대기 분기에서 meta.file_hash 저장"""

    @pytest.mark.asyncio
    async def test_conversion_pending_stores_file_hash(self, mock_internal_api_writes):
        # skip_reason이 conversion_failed/corrupted_pdf가 아닌 일반적인 no_text_extractable
        # + 변환 가능 MIME이면 변환 대기 분기로 진입
        pipeline_result = {
            "text_extraction_failed": True,
            "_extraction_skip_reason": "no_text_extractable",
        }

        await _invoke_xpipe(
            pipeline_result,
            original_name="report.hwp",
            mime_type="application/x-hwp",
        )

        _assert_hash_in_update(
            mock_internal_api_writes["update_file"], EXPECTED_HASH
        )


# ========================================
# 분기 4: 보관 완료 (no_text_extractable + 비변환 대상)
# ========================================

class TestArchiveCompletedBranch:
    """이미지/ZIP 등 보관 완료 분기에서 meta.file_hash 저장"""

    @pytest.mark.asyncio
    async def test_image_archive_stores_file_hash(self, mock_internal_api_writes):
        pipeline_result = {
            "text_extraction_failed": True,
            "_extraction_skip_reason": "no_text_extractable",
        }

        # OpenAIService.summarize_text / _is_meaningful_filename mock
        with patch(
            "services.openai_service.OpenAIService._is_meaningful_filename",
            return_value=False,
        ):
            await _invoke_xpipe(
                pipeline_result,
                original_name="photo.jpg",
                mime_type="image/jpeg",
            )

        _assert_hash_in_update(
            mock_internal_api_writes["update_file"], EXPECTED_HASH
        )

    @pytest.mark.asyncio
    async def test_zip_archive_stores_file_hash(self, mock_internal_api_writes):
        pipeline_result = {
            "text_extraction_failed": True,
            "_extraction_skip_reason": "no_text_extractable",
        }

        with patch(
            "services.openai_service.OpenAIService._is_meaningful_filename",
            return_value=False,
        ):
            await _invoke_xpipe(
                pipeline_result,
                original_name="bundle.zip",
                mime_type="application/zip",
            )

        _assert_hash_in_update(
            mock_internal_api_writes["update_file"], EXPECTED_HASH
        )
