"""
Regression 테스트: HWP 변환 실패 시 처리 흐름 (#19, #39)

#19 이전: HWP 변환 실패 → "변환 대기" (progress: 60) → 영구 stuck
#19 수정: HWP 변환 실패 → 에러 상태 (progress: -1, status: failed)
#39 수정: HWP 변환 실패 → 큐 위임 성공 시 completed_with_skip,
          큐 위임 실패 시 에러 상태 (fallback)
          + soffice 직접 호출 제거, ConvertStage 파이프라인 등록
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest


def _read_doc_prep_main() -> str:
    """doc_prep_main.py 소스 읽기"""
    source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
    return source.read_text(encoding="utf-8")


def _read_convert_stage() -> str:
    """convert.py 소스 읽기"""
    source = Path(__file__).parents[1] / "xpipe" / "stages" / "convert.py"
    return source.read_text(encoding="utf-8")


def _extract_conversion_failed_block(content: str, size: int = 5000) -> str:
    """conversion_failed 분기 블록 추출"""
    start = content.index('skip_reason == "conversion_failed"')
    return content[start:start + size]


class TestConversionFailedQueueDelegation:
    """#39: conversion_failed 시 큐 위임 후 completed_with_skip 처리"""

    def test_conversion_failed_delegates_to_queue(self):
        """변환 실패 시 PdfConversionQueueService.enqueue 호출이 있는지 확인"""
        block = _extract_conversion_failed_block(_read_doc_prep_main())
        assert "PdfConversionQueueService" in block, (
            "conversion_failed 블록에서 PdfConversionQueueService 큐 위임이 없습니다"
        )
        assert "enqueue" in block, (
            "conversion_failed 블록에서 enqueue 호출이 없습니다"
        )

    def test_queue_success_sets_completed_with_skip(self):
        """큐 등록 성공 시 completed_with_skip 상태로 처리"""
        block = _extract_conversion_failed_block(_read_doc_prep_main())
        assert '"status": "completed_with_skip"' in block, (
            "큐 등록 성공 시 status를 completed_with_skip으로 설정해야 합니다"
        )
        assert '"conversion_pending"' in block, (
            "큐 등록 성공 시 processingSkipReason이 conversion_pending이어야 합니다"
        )

    def test_queue_failure_falls_back_to_error(self):
        """큐 등록 실패 시 에러 상태로 fallback"""
        block = _extract_conversion_failed_block(_read_doc_prep_main())
        assert '"status": "failed"' in block, (
            "큐 등록 실패 시 status를 failed로 설정해야 합니다 (fallback)"
        )
        assert '"overallStatus": "error"' in block, (
            "큐 등록 실패 시 overallStatus를 error로 설정해야 합니다 (fallback)"
        )

    def test_conversion_failed_before_conversion_pending(self):
        """conversion_failed 에러 처리가 conversion_pending 설정보다 먼저 나와야 함"""
        content = _read_doc_prep_main()
        error_pos = content.index('skip_reason == "conversion_failed"')
        pending_pos = content.index('conversion_pending 상태로 설정')
        assert error_pos < pending_pos, (
            "conversion_failed 처리가 conversion_pending보다 먼저 실행되어야 합니다"
        )


class TestConversionFailedErrorFallback:
    """#19 호환: 큐 실패 시 에러 상태 전환 보장"""

    def test_error_fallback_has_notify_progress(self):
        """큐 실패 fallback에서 _notify_progress를 호출하는지 확인"""
        block = _extract_conversion_failed_block(_read_doc_prep_main())
        assert '_notify_progress' in block, (
            "conversion_failed 블록에서 _notify_progress 호출이 없습니다"
        )

    def test_error_detail_field_exists(self):
        """큐 실패 fallback에서 error.detail 필드를 DB에 저장하는지 확인"""
        block = _extract_conversion_failed_block(_read_doc_prep_main())
        assert '"error.detail"' in block, (
            "conversion_failed 블록에 error.detail 필드 저장이 없습니다"
        )

    def test_error_detail_includes_mime_info(self):
        """error.detail에 mime 정보가 포함되는지 확인"""
        block = _extract_conversion_failed_block(_read_doc_prep_main())
        assert "detected_mime" in block, (
            "conversion_failed 블록의 detail에 mime 정보가 없습니다"
        )

    def test_error_detail_includes_conversion_error(self):
        """error.detail에 conversion_error 정보가 포함되는지 확인"""
        block = _extract_conversion_failed_block(_read_doc_prep_main())
        assert "conversion_error" in block, (
            "conversion_failed 블록의 detail에 conversion_error가 없습니다"
        )


class TestSofficeRemoved:
    """#39: soffice 직접 호출이 ConvertStage에서 완전 제거되었는지 검증"""

    def test_no_soffice_direct_method(self):
        """_try_soffice_direct 메서드가 제거되었는지 확인"""
        content = _read_convert_stage()
        assert "_try_soffice_direct" not in content, (
            "ConvertStage에 _try_soffice_direct 메서드가 아직 존재합니다. "
            "soffice 직접 호출은 구조적으로 불안정하므로 완전 제거해야 합니다."
        )

    def test_no_subprocess_import(self):
        """subprocess 모듈 사용이 없는지 확인"""
        content = _read_convert_stage()
        assert "import subprocess" not in content, (
            "ConvertStage에 subprocess import가 있습니다. soffice 직접 호출 흔적입니다."
        )

    def test_no_soffice_binary_reference(self):
        """soffice/libreoffice 바이너리 참조가 없는지 확인"""
        content = _read_convert_stage()
        # 주석이나 docstring이 아닌 실행 코드에서 soffice를 참조하는지 체크
        lines = content.split('\n')
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if stripped.startswith('#') or stripped.startswith('"""') or stripped.startswith("'''"):
                continue
            assert 'shutil.which("soffice")' not in line, (
                f"Line {i}: soffice 바이너리 탐색 코드가 있습니다"
            )
            assert 'shutil.which("libreoffice")' not in line, (
                f"Line {i}: libreoffice 바이너리 탐색 코드가 있습니다"
            )

    def test_pdf_converter_is_sole_method(self):
        """pdf_converter 서비스가 유일한 변환 수단인지 확인"""
        content = _read_convert_stage()
        assert "_try_pdf_converter_service" in content, (
            "ConvertStage에 _try_pdf_converter_service가 없습니다"
        )
        assert "localhost:8005" in content or "_DEFAULT_CONVERTER_URL" in content, (
            "pdf_converter 서비스 URL 설정이 없습니다"
        )


class TestConvertStagePipelineRegistration:
    """#39: ConvertStage가 xPipe 파이프라인에 등록되었는지 검증"""

    def test_convert_stage_imported(self):
        """doc_prep_main.py에서 ConvertStage를 import하는지 확인"""
        content = _read_doc_prep_main()
        assert "from xpipe.stages.convert import ConvertStage" in content, (
            "doc_prep_main.py에서 ConvertStage import가 없습니다"
        )

    def test_convert_stage_registered(self):
        """ConvertStage가 pipeline에 register_stage로 등록되는지 확인"""
        content = _read_doc_prep_main()
        assert 'register_stage("convert", ConvertStage)' in content, (
            "ConvertStage가 파이프라인에 등록되지 않았습니다"
        )

    def test_convert_before_extract(self):
        """convert 스테이지가 extract 앞에 배치되는지 확인"""
        content = _read_doc_prep_main()
        convert_pos = content.index('StageConfig(name="convert")')
        extract_pos = content.index('StageConfig(name="extract")')
        assert convert_pos < extract_pos, (
            "convert 스테이지가 extract보다 먼저 실행되어야 합니다"
        )


class TestPreCommitRegressionTestHook:
    """pre-commit hook의 regression 테스트 강제 기능 검증"""

    def test_hook_has_regression_test_check(self):
        """pre_commit_review.py에 check_regression_test 함수가 있는지 확인"""
        hook_file = Path(__file__).parents[4] / "scripts" / "pre_commit_review.py"
        content = hook_file.read_text(encoding="utf-8")
        assert "def check_regression_test" in content

    def test_hook_checks_fix_branch(self):
        """fix/ 브랜치에서만 체크하는지 확인"""
        hook_file = Path(__file__).parents[4] / "scripts" / "pre_commit_review.py"
        content = hook_file.read_text(encoding="utf-8")
        assert 'branch.startswith("fix/")' in content


class TestCorruptedPdfErrorDetail:
    """[Regression #21] corrupted_pdf 에러 시 error.detail 저장"""

    def test_corrupted_pdf_block_has_error_detail_in_db(self):
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")
        start = content.index('skip_reason == "corrupted_pdf"')
        block = content[start:start + 3000]
        assert '"error.detail"' in block

    def test_corrupted_pdf_notify_progress_has_error_detail(self):
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")
        start = content.index('skip_reason == "corrupted_pdf"')
        block = content[start:start + 3000]
        assert "error_detail=" in block


class TestDuplicateFileErrorDetail:
    """[Regression #21] duplicate_file 에러 시 error.detail 저장"""

    def test_duplicate_file_notify_progress_has_error_detail(self):
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")
        start = content.index("except DuplicateKeyError")
        block = content[start:start + 500]
        assert "error_detail=" in block

    def test_duplicate_file_error_detail_no_file_hash(self):
        """보안: error_detail에 file_hash 노출 금지"""
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")
        start = content.index("except DuplicateKeyError")
        block = content[start:start + 500]
        assert "file_hash=" not in block
