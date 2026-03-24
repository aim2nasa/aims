"""
텍스트 부족 문서의 별칭 생성 스킵 regression 테스트
@since 2026-03-24

버그: 텍스트 없는 이미지(비행기 부품 사진)에 AI가 엉뚱한 별칭 생성
원인: OCR 결과 "◆" 1글자를 summarize_text에 전달 → 환각 별칭 생성
수정: 모든 AI 호출 경로에서 텍스트 최소 10자 체크를 일관 적용

기준: OCR 신뢰도가 아닌 **추출된 텍스트의 절대량**으로 판단
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from routers.doc_display_name import _extract_text_from_document, sanitize_display_name


class TestInsufficientTextSkip:
    """텍스트 부족 문서의 텍스트 추출 및 별칭 생성 스킵 검증"""

    def test_single_char_ocr_text_returned_but_caller_skips(self):
        """OCR full_text가 1자면 추출은 되지만 호출자의 < 10자 체크에서 스킵"""
        doc = {
            "ocr": {"full_text": "◆", "confidence": 0.499, "status": "done"},
            "meta": {"full_text": ""}
        }
        result = _extract_text_from_document(doc)
        # 추출 함수는 텍스트를 반환하지만, 호출자에서 len < 10으로 스킵됨
        assert len(result.strip()) < 10

    def test_sufficient_ocr_text_returned(self):
        """OCR full_text가 10자 이상이면 정상 반환"""
        doc = {
            "ocr": {
                "full_text": "삼성화재 진단서 내용이 여기에 있습니다 2024년 03월",
                "confidence": 0.85,
                "status": "done"
            },
            "meta": {"full_text": ""}
        }
        result = _extract_text_from_document(doc)
        assert "삼성화재" in result
        assert len(result.strip()) >= 10

    def test_low_confidence_but_enough_text_still_returned(self):
        """OCR 신뢰도가 낮아도 텍스트가 충분하면 반환 (텍스트 절대량이 기준)"""
        doc = {
            "ocr": {
                "full_text": "삼성화재 자동차보험 증권번호 12345 계약일 2024.03.15",
                "confidence": 0.45,
                "status": "done"
            },
            "meta": {"full_text": ""}
        }
        result = _extract_text_from_document(doc)
        assert "삼성화재" in result

    def test_meta_full_text_priority_over_ocr(self):
        """meta.full_text가 있으면 OCR보다 우선"""
        doc = {
            "meta": {"full_text": "메타에서 추출된 텍스트 내용입니다"},
            "ocr": {"confidence": 0.1, "full_text": "가비지"}
        }
        result = _extract_text_from_document(doc)
        assert result == "메타에서 추출된 텍스트 내용입니다"

    def test_text_full_text_fallback(self):
        """text.full_text 폴백 동작"""
        doc = {
            "meta": {"full_text": ""},
            "ocr": {"confidence": 0.3, "full_text": ""},
            "text": {"full_text": "텍스트 기반 추출 내용입니다 충분히 긴 텍스트"}
        }
        result = _extract_text_from_document(doc)
        assert "텍스트 기반 추출" in result

    def test_ocr_summary_fallback(self):
        """ocr.summary 폴백 동작 (full_text 비어있을 때)"""
        doc = {
            "meta": {"full_text": ""},
            "ocr": {
                "full_text": "",
                "summary": "이것은 보험 계약서에 대한 요약입니다",
                "confidence": 0.7,
            }
        }
        result = _extract_text_from_document(doc)
        assert "보험 계약서" in result

    def test_empty_ocr_text_returns_empty(self):
        """OCR full_text가 비어있으면 빈 문자열"""
        doc = {
            "ocr": {"full_text": "", "confidence": 0.9, "status": "done"},
            "meta": {"full_text": ""}
        }
        result = _extract_text_from_document(doc)
        assert result == ""

    def test_all_sources_empty_returns_empty(self):
        """모든 텍스트 소스가 비어있으면 빈 문자열"""
        doc = {
            "meta": {"full_text": ""},
            "ocr": {"full_text": "", "summary": ""},
            "text": {"full_text": ""}
        }
        result = _extract_text_from_document(doc)
        assert result == ""

    def test_whitespace_only_text_treated_as_empty(self):
        """공백만 있는 텍스트는 비어있는 것으로 처리"""
        doc = {
            "meta": {"full_text": "   \n\t  "},
            "ocr": {"full_text": "  ", "summary": " "},
        }
        result = _extract_text_from_document(doc)
        assert result == ""

    def test_max_text_length_truncation(self):
        """500자 초과 텍스트는 잘림"""
        long_text = "가" * 600
        doc = {
            "meta": {"full_text": long_text},
        }
        result = _extract_text_from_document(doc)
        assert len(result) == 500


class TestSanitizeDisplayNameEdgeCases:
    """sanitize_display_name 엣지 케이스"""

    def test_empty_name_returns_empty(self):
        """빈 이름 → 빈 문자열"""
        assert sanitize_display_name("") == ""
        assert sanitize_display_name("", "test.jpg") == ""

    def test_special_chars_only_returns_empty(self):
        """특수문자만 있으면 빈 문자열"""
        assert sanitize_display_name("◆●★") == ""
