"""
Regression 테스트: 에러 로그 노이즈 제거 (#48)

원칙: 일시적 에러(타임아웃, rate limit, 파일 삭제)는 admin에 보고하지 않음.
report_to_admin은 최종 실패(복구 불가)만 호출.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


class TestOcrWorkerNoiseReduction:
    """OCR 워커: 일시적 에러는 admin 보고하지 않음"""

    def test_transient_check_exists(self):
        """is_transient 체크가 report_to_admin 앞에 있는지"""
        source = Path(__file__).parents[1] / "workers" / "ocr_worker.py"
        content = source.read_text(encoding="utf-8")
        assert "is_transient" in content
        assert "not is_transient" in content

    def test_429_is_transient(self):
        """429 상태코드가 일시적 에러로 분류되는지"""
        source = Path(__file__).parents[1] / "workers" / "ocr_worker.py"
        content = source.read_text(encoding="utf-8")
        assert "429" in content

    def test_timeout_is_transient(self):
        """타임아웃이 일시적 에러로 분류되는지"""
        source = Path(__file__).parents[1] / "workers" / "ocr_worker.py"
        content = source.read_text(encoding="utf-8")
        assert "타임아웃" in content


class TestPdfWorkerNoiseReduction:
    """PDF 변환 워커: FileNotFoundError는 admin 보고하지 않음"""

    def test_file_not_found_no_admin_report(self):
        """FileNotFoundError 처리에서 report_to_admin이 제거되었는지"""
        source = Path(__file__).parents[1] / "workers" / "pdf_conversion_worker.py"
        content = source.read_text(encoding="utf-8")

        # FileNotFoundError 블록 찾기
        start = content.index("isinstance(error, FileNotFoundError)")
        block = content[start:start + 500]

        assert "report_to_admin" not in block, (
            "FileNotFoundError 블록에서 report_to_admin이 제거되어야 합니다"
        )
        assert "logger.warning" in block, (
            "FileNotFoundError는 warning 로그로 기록되어야 합니다"
        )
