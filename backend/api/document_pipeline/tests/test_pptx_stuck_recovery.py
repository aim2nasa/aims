"""
[소급 회귀] PPTX 변환 stuck 오판 수정 (#16, dad85c43)

이전 동작: stuck recovery가 active job만 확인 → completed job이 있어도 stuck으로 오판 → failed 처리
수정 후:   active job 없으면 completed job도 확인 → 후처리 재시도 후, 그래도 안 되면 failed

소스 코드 검증 방식: pdf_conversion_worker.py의 _recover_stuck_pending_documents() 메서드에서
completed job 확인 로직이 존재하는지 확인.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest


class TestPptxStuckRecoveryFix:
    """stuck recovery에서 completed job 확인 로직이 존재하는지 소스 검증"""

    def _read_worker_source(self) -> str:
        source = Path(__file__).parents[1] / "workers" / "pdf_conversion_worker.py"
        return source.read_text(encoding="utf-8")

    def _extract_recover_stuck_method(self) -> str:
        """_recover_stuck_pending_documents 메서드 전체 추출"""
        content = self._read_worker_source()
        start = content.index("async def _recover_stuck_pending_documents")
        # 다음 async def 또는 파일 끝까지
        next_method = content.find("\n    async def ", start + 1)
        if next_method == -1:
            next_method = content.find("\n    def ", start + 1)
        if next_method == -1:
            next_method = len(content)
        return content[start:next_method]

    def test_completed_job_check_exists(self):
        """
        stuck recovery에서 completed job 확인 쿼리가 존재하는지 검증.
        이것이 없으면 변환 성공한 문서도 stuck으로 오판하여 failed 처리됨.
        """
        method = self._extract_recover_stuck_method()

        assert '"status": "completed"' in method or "'status': 'completed'" in method, (
            "_recover_stuck_pending_documents에 completed job 확인 쿼리가 없습니다. "
            "변환 성공한 문서가 stuck으로 오판될 수 있습니다."
        )

    def test_completed_job_triggers_post_process(self):
        """
        completed job 발견 시 후처리(post_process_preview) 재시도를 하는지 확인.
        단순 failed 처리가 아닌, 후처리 재시도가 올바른 복구 방법임.
        """
        method = self._extract_recover_stuck_method()

        assert "_post_process_preview" in method, (
            "completed job 발견 시 _post_process_preview 호출이 없습니다. "
            "후처리 재시도 없이 failed로만 처리하면 데이터 손실 발생."
        )

    def test_active_job_check_before_completed(self):
        """
        active job 확인이 completed job 확인보다 먼저 나오는지 검증.
        active job이 있으면 정상 처리 중이므로 skip해야 함.
        """
        method = self._extract_recover_stuck_method()

        active_pos = method.index('"pending", "processing"')
        completed_pos = method.index('"status": "completed"') if '"status": "completed"' in method else method.index("'status': 'completed'")

        assert active_pos < completed_pos, (
            "active job 확인이 completed job 확인보다 먼저 실행되어야 합니다. "
            f"active 위치: {active_pos}, completed 위치: {completed_pos}"
        )

    def test_stuck_fallback_sets_failed(self):
        """
        completed job도 없고 active job도 없는 경우에만 failed로 마킹하는지 확인.
        """
        method = self._extract_recover_stuck_method()

        assert '"upload.conversion_status": "failed"' in method or "'upload.conversion_status': 'failed'" in method, (
            "stuck 확정 시 conversion_status를 failed로 마킹하는 코드가 없습니다"
        )

    def test_pdf_path_used_in_post_process_retry(self):
        """
        후처리 재시도 시 completed job의 result.pdf_path를 사용하는지 확인.
        """
        method = self._extract_recover_stuck_method()

        assert "pdf_path" in method, (
            "후처리 재시도에서 pdf_path를 참조하지 않습니다. "
            "변환 결과 PDF 경로 없이는 후처리 재시도 불가."
        )
