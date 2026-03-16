"""
smart_search 유틸리티 함수 단위 테스트
대상: _filter_stopwords, _compute_relevance_score, _get_nested
"""
import sys
import os

# routers 모듈을 import할 수 있도록 경로 추가
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routers.smart_search import (
    _filter_stopwords,
    _compute_relevance_score,
    _get_nested,
    WEIGHT_HIGH,
    WEIGHT_LOW,
    ALL_MATCH_BONUS_MULTIPLIER,
)


# ── _filter_stopwords ──


class TestFilterStopwords:
    def test_removes_stopwords(self):
        """불용어가 정상적으로 제거되는지 확인"""
        result = _filter_stopwords(["보험", "관련", "증권"])
        assert result == ["보험", "증권"]

    def test_all_stopwords_returns_original(self):
        """전부 불용어일 때 원본 반환"""
        keywords = ["관련", "에서", "의"]
        result = _filter_stopwords(keywords)
        assert result == keywords

    def test_no_stopwords(self):
        """불용어가 없으면 그대로 반환"""
        keywords = ["보험", "증권", "계약"]
        result = _filter_stopwords(keywords)
        assert result == keywords

    def test_empty_list(self):
        """빈 리스트 입력 시 빈 리스트 반환"""
        result = _filter_stopwords([])
        assert result == []


# ── _get_nested ──


class TestGetNested:
    def test_simple_key(self):
        """단일 키 접근"""
        doc = {"name": "홍길동"}
        assert _get_nested(doc, "name") == "홍길동"

    def test_nested_key(self):
        """점(.) 구분 중첩 키 접근"""
        doc = {"ocr": {"summary": "보험 증권 요약"}}
        assert _get_nested(doc, "ocr.summary") == "보험 증권 요약"

    def test_missing_key_returns_empty(self):
        """존재하지 않는 키는 빈 문자열 반환"""
        doc = {"ocr": {"summary": "test"}}
        assert _get_nested(doc, "meta.full_text") == ""

    def test_none_value_returns_empty(self):
        """값이 None이면 빈 문자열 반환"""
        doc = {"meta": {"summary": None}}
        assert _get_nested(doc, "meta.summary") == ""

    def test_deeply_nested(self):
        """3단계 이상 중첩"""
        doc = {"a": {"b": {"c": "deep"}}}
        assert _get_nested(doc, "a.b.c") == "deep"

    def test_non_dict_intermediate(self):
        """중간 값이 dict가 아닌 경우 빈 문자열 반환"""
        doc = {"a": "string_value"}
        assert _get_nested(doc, "a.b") == ""


# ── _compute_relevance_score ──


class TestComputeRelevanceScore:
    def test_filename_match_weight_3(self):
        """파일명 매칭 시 가중치 3 적용"""
        doc = {"displayName": "보험증권.pdf"}
        score = _compute_relevance_score(doc, ["보험"])
        assert score == WEIGHT_HIGH  # 3

    def test_body_match_weight_1(self):
        """본문 매칭 시 가중치 1 적용"""
        doc = {"ocr": {"summary": "보험 관련 내용"}}
        score = _compute_relevance_score(doc, ["보험"])
        assert score == WEIGHT_LOW  # 1

    def test_filename_priority_over_body(self):
        """파일명과 본문 모두 매칭되면 파일명 가중치(3)만 적용"""
        doc = {
            "displayName": "보험증권.pdf",
            "ocr": {"summary": "보험 관련 내용"},
        }
        score = _compute_relevance_score(doc, ["보험"])
        assert score == WEIGHT_HIGH  # 3 (본문 1이 아님)

    def test_all_match_bonus(self):
        """2개 이상 키워드가 모두 파일명에 매칭되면 보너스"""
        doc = {"displayName": "보험 증권 계약서.pdf"}
        keywords = ["보험", "증권"]
        score = _compute_relevance_score(doc, keywords)
        # 각 키워드 3점 + 보너스 2 * 5 = 16
        expected = WEIGHT_HIGH * 2 + len(keywords) * ALL_MATCH_BONUS_MULTIPLIER
        assert score == expected

    def test_no_match_zero_score(self):
        """매칭 없으면 0점"""
        doc = {"displayName": "사진.jpg"}
        score = _compute_relevance_score(doc, ["보험"])
        assert score == 0.0

    def test_single_keyword_no_bonus(self):
        """키워드 1개면 all-match 보너스 없음"""
        doc = {"displayName": "보험증권.pdf"}
        score = _compute_relevance_score(doc, ["보험"])
        # 3점만, 보너스 없음 (키워드 2개 이상 조건)
        assert score == WEIGHT_HIGH

    def test_duplicate_keywords_no_overcount(self):
        """중복 키워드가 있어도 과다 카운트하지 않음 (Minor 1 검증)"""
        doc = {"displayName": "보험증권.pdf"}
        score_unique = _compute_relevance_score(doc, ["보험"])
        score_duped = _compute_relevance_score(doc, ["보험", "보험", "보험"])
        assert score_duped == score_unique

    def test_partial_filename_match_no_bonus(self):
        """키워드 일부만 파일명 매칭이면 보너스 없음"""
        doc = {
            "displayName": "보험증권.pdf",
            "ocr": {"summary": "계약 관련 내용"},
        }
        keywords = ["보험", "계약"]
        score = _compute_relevance_score(doc, keywords)
        # 보험=3(파일명) + 계약=1(본문) = 4, 보너스 없음
        assert score == WEIGHT_HIGH + WEIGHT_LOW
