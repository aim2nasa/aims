"""
Regression 테스트: HWP 변환 실패 시 에러 상태 전환 (#19)

이전 동작: HWP 변환 실패 → "변환 대기" (progress: 60, conversion_queued) → 영구 stuck
수정 후:   HWP 변환 실패 → 에러 상태 (progress: -1, status: failed) → 사용자에게 노출
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from unittest.mock import AsyncMock, patch, MagicMock


class TestConversionFailedErrorHandling:
    """conversion_failed인 변환 대상 파일이 에러 상태로 전환되는지 검증"""

    def test_conversion_failed_not_queued_as_pending(self):
        """
        doc_prep_main.py에서 skip_reason == 'conversion_failed'이고
        is_convertible_mime()인 경우, "변환 대기"가 아닌 에러 처리 분기가
        먼저 실행되는지 코드 구조를 검증한다.
        """
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        # conversion_failed 에러 처리 분기가 존재하는지
        assert 'skip_reason == "conversion_failed"' in content, (
            "conversion_failed 에러 처리 분기가 doc_prep_main.py에 없습니다"
        )

        # conversion_failed 분기가 is_convertible_mime 분기보다 먼저 나오는지
        error_pos = content.index('skip_reason == "conversion_failed"')
        pending_pos = content.index('conversion_pending 상태로 설정')
        assert error_pos < pending_pos, (
            "conversion_failed 에러 처리가 conversion_pending 설정보다 먼저 실행되어야 합니다. "
            f"에러 처리 위치: {error_pos}, pending 설정 위치: {pending_pos}"
        )

    def test_conversion_failed_sets_error_status(self):
        """
        conversion_failed 분기에서 status='failed', overallStatus='error'를
        설정하는지 확인한다.
        """
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        # conversion_failed 블록 추출 (해당 if문부터 다음 return까지)
        start = content.index('skip_reason == "conversion_failed"')
        # 해당 블록의 return문 찾기
        block = content[start:start + 2000]

        assert '"status": "failed"' in block, (
            "conversion_failed 블록에서 status를 'failed'로 설정해야 합니다"
        )
        assert '"overallStatus": "error"' in block, (
            "conversion_failed 블록에서 overallStatus를 'error'로 설정해야 합니다"
        )
        assert '_notify_progress' in block, (
            "conversion_failed 블록에서 _notify_progress를 호출하여 에러를 전파해야 합니다"
        )

    def test_conversion_failed_sets_error_status_e30609d8(self):
        """
        conversion_failed 분기가 status='failed', overallStatus='error'를
        설정하여 후속 처리(변환 대기)로 빠지지 않는지 확인한다.
        (commit e30609d8)
        """
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        start = content.index('skip_reason == "conversion_failed"')
        block = content[start:start + 2000]

        assert '"status": "failed"' in block, (
            "conversion_failed 블록이 status=failed를 설정해야 합니다"
        )
        assert '"overallStatus": "error"' in block, (
            "conversion_failed 블록이 overallStatus=error를 설정해야 합니다"
        )


class TestPreCommitRegressionTestHook:
    """pre-commit hook의 regression 테스트 강제 기능 검증"""

    def test_hook_has_regression_test_check(self):
        """pre_commit_review.py에 check_regression_test 함수가 있는지 확인"""
        hook_file = Path(__file__).parents[4] / "scripts" / "pre_commit_review.py"
        content = hook_file.read_text(encoding="utf-8")

        assert "def check_regression_test" in content, (
            "pre_commit_review.py에 check_regression_test 함수가 없습니다"
        )

    def test_hook_checks_fix_branch(self):
        """fix/ 브랜치에서만 체크하는지 확인"""
        hook_file = Path(__file__).parents[4] / "scripts" / "pre_commit_review.py"
        content = hook_file.read_text(encoding="utf-8")

        assert 'branch.startswith("fix/")' in content, (
            "check_regression_test가 fix/ 브랜치를 체크하지 않습니다"
        )


class TestCorruptedPdfErrorDetail:
    """
    [Regression #21] corrupted_pdf 에러 시 error.detail에 skip_reason, mime, filename 저장
    """

    def test_corrupted_pdf_block_has_error_detail_in_db(self):
        """corrupted_pdf 분기에서 error.detail 필드를 DB에 저장하는지 확인"""
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        start = content.index('skip_reason == "corrupted_pdf"')
        block = content[start:start + 3000]

        assert '"error.detail"' in block, (
            "corrupted_pdf 블록에 'error.detail' 필드 저장이 없습니다"
        )

    def test_corrupted_pdf_notify_progress_has_error_detail(self):
        """corrupted_pdf 분기에서 _notify_progress에 error_detail 파라미터를 전달하는지 확인"""
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        start = content.index('skip_reason == "corrupted_pdf"')
        block = content[start:start + 3000]

        assert "error_detail=" in block, (
            "corrupted_pdf 블록에서 _notify_progress 호출 시 error_detail 파라미터가 누락되었습니다"
        )


class TestDuplicateFileErrorDetail:
    """
    [Regression #21] duplicate_file 에러 시 error.detail에 파일 정보 저장
    """

    def test_duplicate_file_notify_progress_has_error_detail(self):
        """DuplicateKeyError 처리에서 _notify_progress에 error_detail 파라미터를 전달하는지 확인"""
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        start = content.index("except DuplicateKeyError")
        block = content[start:start + 500]

        assert "error_detail=" in block, (
            "DuplicateKeyError 처리에서 _notify_progress 호출 시 error_detail 파라미터가 누락되었습니다"
        )

    def test_duplicate_file_error_detail_no_file_hash(self):
        """duplicate_file error_detail에 file_hash가 노출되지 않아야 함 (보안)"""
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        start = content.index("except DuplicateKeyError")
        block = content[start:start + 500]

        # error_detail에 file_hash가 포함되면 안 됨 (클라이언트 노출 위험)
        assert "file_hash=" not in block, (
            "duplicate_file error_detail에 file_hash가 포함되어 있습니다. "
            "보안상 file_hash는 클라이언트에 노출되면 안 됩니다."
        )


class TestConversionFailedErrorDetail:
    """
    [소급 회귀] conversion_failed 에러 시 error.detail에 mime, filename, conversion_error 저장
    커밋: e30609d8
    """

    def test_error_detail_field_exists_in_conversion_failed_block(self):
        """
        conversion_failed 분기에서 error.detail 필드를 DB에 저장하는지 확인.
        이전에는 error.detail 없이 저장하여 디버깅 정보가 누락되었음.
        """
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        # conversion_failed 블록 추출
        start = content.index('skip_reason == "conversion_failed"')
        block = content[start:start + 3000]

        assert '"error.detail"' in block, (
            "conversion_failed 블록에 'error.detail' 필드 저장이 없습니다. "
            "mime, filename, conversion_error 정보가 누락됩니다."
        )

    def test_error_detail_includes_mime_info(self):
        """error.detail에 mime 정보가 포함되는지 확인"""
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        start = content.index('skip_reason == "conversion_failed"')
        block = content[start:start + 3000]

        # detail 변수에 mime 정보가 포함되는지 확인
        assert "detected_mime" in block or "mime" in block, (
            "conversion_failed 블록의 detail에 mime 정보가 포함되지 않습니다"
        )

    def test_error_detail_includes_filename(self):
        """error.detail에 filename 정보가 포함되는지 확인"""
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        start = content.index('skip_reason == "conversion_failed"')
        block = content[start:start + 3000]

        assert "original_name" in block or "filename" in block, (
            "conversion_failed 블록의 detail에 filename 정보가 포함되지 않습니다"
        )

    def test_error_detail_includes_conversion_error(self):
        """error.detail에 conversion_error 정보가 포함되는지 확인"""
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        start = content.index('skip_reason == "conversion_failed"')
        block = content[start:start + 3000]

        assert "conversion_error" in block, (
            "conversion_failed 블록의 detail에 conversion_error 정보가 포함되지 않습니다"
        )
