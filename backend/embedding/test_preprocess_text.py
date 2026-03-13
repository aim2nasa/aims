"""preprocess_text() 단위 테스트"""
import pytest
from split_text_into_chunks import preprocess_text


class TestCRLFNormalization:
    def test_crlf_to_lf(self):
        assert preprocess_text("hello\r\nworld") == "hello\nworld"

    def test_mixed_line_endings(self):
        result = preprocess_text("a\r\nb\nc\r\n")
        assert "\r" not in result


class TestTabNormalization:
    def test_single_tab(self):
        assert preprocess_text("a\tb") == "a b"

    def test_multiple_tabs(self):
        assert preprocess_text("a\t\t\tb") == "a b"


class TestSpaceNormalization:
    def test_three_or_more_spaces(self):
        assert preprocess_text("a   b") == "a b"

    def test_two_spaces_preserved(self):
        assert preprocess_text("a  b") == "a  b"

    def test_newlines_preserved(self):
        result = preprocess_text("a\n\nb")
        assert result == "a\n\nb"


class TestBlankLineReduction:
    def test_four_blank_lines_reduced(self):
        result = preprocess_text("a\n\n\n\nb")
        assert result == "a\n\n\nb"

    def test_three_blank_lines_preserved(self):
        result = preprocess_text("a\n\n\nb")
        assert result == "a\n\n\nb"

    def test_many_blank_lines_reduced(self):
        result = preprocess_text("a\n\n\n\n\n\n\nb")
        assert result == "a\n\n\nb"


class TestRepeatLineRemoval:
    def test_four_repeats_reduced_to_three(self):
        """10자+ 동일 라인 4회 반복 → 3회까지 유지"""
        line = "이것은 반복되는 라인입니다"  # 12자
        text = "\n".join([line] * 4)
        result = preprocess_text(text)
        assert result.count(line) == 3

    def test_five_repeats_reduced_to_three(self):
        line = "이것은 반복되는 라인입니다"
        text = "\n".join([line] * 5)
        result = preprocess_text(text)
        assert result.count(line) == 3

    def test_three_repeats_preserved(self):
        """3회 반복은 그대로 유지"""
        line = "이것은 반복되는 라인입니다"
        text = "\n".join([line] * 3)
        result = preprocess_text(text)
        assert result.count(line) == 3

    def test_short_line_not_removed(self):
        """10자 미만 라인은 반복 제거 대상 제외"""
        line = "짧은라인"  # 4자
        text = "\n".join([line] * 10)
        result = preprocess_text(text)
        assert result.count(line) == 10

    def test_exactly_ten_chars(self):
        """정확히 10자 라인은 제거 대상"""
        line = "가나다라마바사아자차"  # 10자
        text = "\n".join([line] * 5)
        result = preprocess_text(text)
        assert result.count(line) == 3


class TestEdgeCases:
    def test_empty_string(self):
        assert preprocess_text("") == ""

    def test_none_input(self):
        assert preprocess_text(None) is None

    def test_normal_text_unchanged(self):
        text = "보험 계약 내용을 확인합니다.\n보험료: 73,230원"
        assert preprocess_text(text) == text

    def test_combined_noise(self):
        """CRLF + 탭 + 공백 + 빈줄 복합"""
        text = "제목\r\n\r\n\r\n\r\n내용\t\t값   결과"
        result = preprocess_text(text)
        assert "\r" not in result
        assert "\t" not in result
        assert "   " not in result
        assert "\n\n\n\n" not in result
