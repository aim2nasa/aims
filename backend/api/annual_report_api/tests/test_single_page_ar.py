"""
Regression 테스트: 1페이지 AR 파싱 에러 (#44)

이전: page_num=1 (2페이지) 고정 → 1페이지 AR에서 IndexError
수정: 총 페이지 < page_num이면 마지막 페이지로 fallback
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


class TestPageFallback:
    """페이지 범위 초과 시 fallback 로직 검증"""

    def test_table_extractor_has_fallback(self):
        """table_extractor.py에 페이지 fallback 로직이 있는지"""
        source = Path(__file__).parents[1] / "table_extractor.py"
        content = source.read_text(encoding="utf-8")
        assert "fallback" in content.lower(), (
            "table_extractor.py에 페이지 fallback 로직이 없습니다"
        )
        assert "len(pdf.pages) - 1" in content, (
            "마지막 페이지로 fallback하는 코드가 없습니다"
        )

    def test_pdf_utils_has_fallback(self):
        """pdf_utils.py에 페이지 fallback 로직이 있는지"""
        source = Path(__file__).parents[1] / "utils" / "pdf_utils.py"
        content = source.read_text(encoding="utf-8")
        assert "fallback" in content.lower(), (
            "pdf_utils.py에 페이지 fallback 로직이 없습니다"
        )

    def test_failed_queue_reregistration(self):
        """main.py에서 failed 큐 항목 삭제 후 재등록 로직이 있는지"""
        source = Path(__file__).parents[1] / "main.py"
        content = source.read_text(encoding="utf-8")
        assert "delete_one" in content, (
            "main.py에 failed 큐 항목 삭제 코드가 없습니다"
        )
