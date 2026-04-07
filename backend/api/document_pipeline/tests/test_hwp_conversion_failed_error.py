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

    def test_conversion_failed_returns_error_result(self):
        """
        conversion_failed 분기가 result='error'를 반환하여
        후속 처리(변환 대기)로 빠지지 않는지 확인한다.
        """
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        start = content.index('skip_reason == "conversion_failed"')
        block = content[start:start + 2000]

        assert '"result": "error"' in block, (
            "conversion_failed 블록이 error result를 반환해야 합니다 (변환 대기로 빠지면 안 됨)"
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
