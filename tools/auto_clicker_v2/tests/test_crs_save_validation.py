# -*- coding: utf-8 -*-
"""
CRS/변액리포트 PDF 저장 검증 로직 Regression Tests

commit 05f39e0e에서 추가된 디스크 파일 존재 확인 로직을 테스트.
기존: 저장 다이얼로그가 닫히면 성공 판정 → 사일런트 실패 미감지
수정: 저장 전/후 파일 목록 비교로 실제 파일 생성 확인

실행: python -m pytest tests/test_crs_save_validation.py -v
"""
import os
import tempfile
import shutil

import pytest


# ══════════════════════════════════════════════════════════════
# 저장 검증 로직 재현 (verify_customer_integrated_view.py에서 추출)
# ══════════════════════════════════════════════════════════════

def validate_save_result(save_dir, pdf_files_before):
    """
    PDF 저장 후 디스크 파일 존재 여부로 성공/실패 판정.
    verify_customer_integrated_view.py의 save_report_pdf() 내 검증 로직 재현.

    Args:
        save_dir: PDF 저장 디렉토리 경로
        pdf_files_before: 저장 전 PDF 파일 이름 set

    Returns:
        dict: {'saved': bool, 'success': bool, 'saved_filename': str|None, 'error': str|None}
    """
    result = {'saved': False, 'success': False, 'saved_filename': None, 'error': None}

    if save_dir and os.path.isdir(save_dir):
        pdf_files_after = set(f for f in os.listdir(save_dir) if f.lower().endswith('.pdf'))
        new_files = pdf_files_after - pdf_files_before
        if new_files:
            result['saved'] = True
            result['success'] = True
            result['saved_filename'] = sorted(new_files)[0]
        else:
            result['saved'] = False
            result['success'] = False
            result['error'] = "PDF 파일 디스크 미생성 (사일런트 실패)"
    else:
        # 저장 디렉토리 미지정 시 다이얼로그 기준 (기존 동작 유지)
        result['saved'] = True
        result['success'] = True

    return result


# ══════════════════════════════════════════════════════════════
# 테스트
# ══════════════════════════════════════════════════════════════

class TestSaveValidation:
    """PDF 저장 검증 로직 테스트"""

    @pytest.fixture(autouse=True)
    def setup_teardown(self):
        """임시 디렉토리 생성/정리"""
        self.tmp_dir = tempfile.mkdtemp(prefix="ac_test_save_")
        yield
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_new_file_detected(self):
        """저장 후 새 파일 생성 → success"""
        before = set()
        # 파일 생성 시뮬레이션
        with open(os.path.join(self.tmp_dir, "AR_test.pdf"), "w") as f:
            f.write("dummy")
        result = validate_save_result(self.tmp_dir, before)
        assert result['saved'] is True
        assert result['success'] is True
        assert result['saved_filename'] == "AR_test.pdf"
        assert result['error'] is None

    def test_no_new_file_silent_failure(self):
        """저장 후 파일 미생성 → 사일런트 실패 감지"""
        before = set()
        result = validate_save_result(self.tmp_dir, before)
        assert result['saved'] is False
        assert result['success'] is False
        assert "사일런트 실패" in result['error']

    def test_existing_files_not_counted(self):
        """기존 파일은 새 파일로 카운트되지 않음"""
        # 기존 파일 생성
        with open(os.path.join(self.tmp_dir, "existing.pdf"), "w") as f:
            f.write("old")
        before = {"existing.pdf"}
        result = validate_save_result(self.tmp_dir, before)
        assert result['saved'] is False
        assert result['success'] is False

    def test_multiple_new_files(self):
        """여러 새 파일 중 정렬된 첫 파일명 반환"""
        before = set()
        for name in ["CRS_003.pdf", "CRS_001.pdf", "CRS_002.pdf"]:
            with open(os.path.join(self.tmp_dir, name), "w") as f:
                f.write("dummy")
        result = validate_save_result(self.tmp_dir, before)
        assert result['saved'] is True
        assert result['saved_filename'] == "CRS_001.pdf"

    def test_nonexistent_directory(self):
        """존재하지 않는 디렉토리 → 다이얼로그 기준 (기존 동작)"""
        result = validate_save_result("/nonexistent/path", set())
        assert result['saved'] is True  # 기존 동작 유지
        assert result['success'] is True

    def test_none_directory(self):
        """save_dir=None → 다이얼로그 기준"""
        result = validate_save_result(None, set())
        assert result['saved'] is True
        assert result['success'] is True

    def test_case_insensitive_pdf_extension(self):
        """PDF 확장자 대소문자 무관"""
        before = set()
        with open(os.path.join(self.tmp_dir, "report.PDF"), "w") as f:
            f.write("dummy")
        result = validate_save_result(self.tmp_dir, before)
        assert result['saved'] is True
        assert result['saved_filename'] == "report.PDF"

    def test_non_pdf_files_ignored(self):
        """PDF가 아닌 파일은 무시"""
        before = set()
        with open(os.path.join(self.tmp_dir, "report.txt"), "w") as f:
            f.write("dummy")
        with open(os.path.join(self.tmp_dir, "image.png"), "w") as f:
            f.write("dummy")
        result = validate_save_result(self.tmp_dir, before)
        assert result['saved'] is False
        assert result['success'] is False

    def test_before_set_filters_correctly(self):
        """before set에 있는 파일은 제외, 새 파일만 감지"""
        # 기존 파일
        with open(os.path.join(self.tmp_dir, "old.pdf"), "w") as f:
            f.write("old")
        before = {"old.pdf"}
        # 새 파일 추가
        with open(os.path.join(self.tmp_dir, "new.pdf"), "w") as f:
            f.write("new")
        result = validate_save_result(self.tmp_dir, before)
        assert result['saved'] is True
        assert result['saved_filename'] == "new.pdf"


class TestSourceCodeValidation:
    """verify_customer_integrated_view.py의 저장 검증 로직이 존재하는지 소스 확인"""

    @pytest.fixture(autouse=True)
    def setup(self):
        ac_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        verify_py = os.path.join(ac_dir, "verify_customer_integrated_view.py")
        with open(verify_py, "r", encoding="utf-8") as f:
            self.source = f.read()

    def test_disk_validation_exists(self):
        """디스크 파일 존재 확인 로직이 소스에 있는지"""
        assert "pdf_files_after" in self.source, (
            "pdf_files_after 변수가 없음. 디스크 파일 존재 확인 로직이 제거됨."
        )
        assert "new_files" in self.source, (
            "new_files 변수가 없음. before/after 비교 로직이 제거됨."
        )

    def test_silent_failure_detection(self):
        """사일런트 실패 감지 메시지가 소스에 있는지"""
        assert "사일런트 실패" in self.source, (
            "'사일런트 실패' 에러 메시지가 없음. 저장 실패 감지가 제거됨."
        )
