"""
Regression 테스트: md 파일 MIME text/plain 교정 (#42)

이전: .md → application/octet-stream → BIN 뱃지, UNSUPPORTED 처리
수정 후: .md → text/plain으로 교정 → TXT 뱃지, 정상 텍스트 처리
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


class TestMimeCorrectionInDocPrepMain:
    """doc_prep_main.py에서 TEXT_EXTENSIONS MIME 교정 로직 존재 확인"""

    def test_mime_correction_exists(self):
        """application/octet-stream인데 TEXT_EXTENSIONS이면 text/plain으로 교정하는 코드가 있는지"""
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        assert 'TEXT_EXTENSIONS' in content, (
            "doc_prep_main.py에서 TEXT_EXTENSIONS를 참조하지 않습니다"
        )
        assert '"text/plain"' in content, (
            "doc_prep_main.py에 text/plain 교정 코드가 없습니다"
        )

    def test_correction_after_mime_detection(self):
        """MIME 교정이 mimetypes.guess_type 이후에 위치하는지"""
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        guess_pos = content.index("mt.guess_type")
        correction_pos = content.index("TEXT_EXTENSIONS", guess_pos)
        assert correction_pos > guess_pos, (
            "MIME 교정이 mimetypes.guess_type 이후에 위치해야 합니다"
        )

    def test_md_recognized_as_text(self):
        """.md가 TEXT_EXTENSIONS에 포함되어 text/plain으로 교정 가능"""
        from xpipe.stages.extract import TEXT_EXTENSIONS
        assert ".md" in TEXT_EXTENSIONS
