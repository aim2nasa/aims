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
    _paginate,
    _restore_order,
    WEIGHT_HIGH,
    WEIGHT_LOW,
    WEIGHT_BASELINE,
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

    def test_no_match_returns_baseline(self):
        """점수 필드에서 매칭 없으면 baseline 점수 (full_text에서만 매칭된 경우)"""
        doc = {"displayName": "사진.jpg"}
        score = _compute_relevance_score(doc, ["보험"])
        assert score == WEIGHT_BASELINE * 1  # 키워드 1개 × baseline

    def test_no_match_baseline_multiple_keywords(self):
        """여러 키워드 모두 점수 필드에서 매칭 안 되면 키워드 수 × baseline"""
        doc = {"displayName": "사진.jpg"}
        score = _compute_relevance_score(doc, ["보험", "증권"])
        assert score == WEIGHT_BASELINE * 2

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

    def test_partial_match_no_baseline(self):
        """일부 키워드가 점수 필드에서 매칭되면 baseline 미적용 (score > 0)"""
        doc = {"displayName": "보험증권.pdf"}
        # "보험"은 파일명에서 매칭(3점), "계약"은 아무데서도 매칭 안됨
        # 총 점수 = 3 > 0 이므로 baseline 미적용
        score = _compute_relevance_score(doc, ["보험", "계약"])
        assert score == WEIGHT_HIGH  # 3점 (baseline 아님)

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


# ── _paginate (페이지 슬라이싱) ──


class TestPaginate:
    def test_page1_of_2(self):
        """total=25, page_size=20 → page1: start=0, end=20, total_pages=2"""
        result = _paginate(total=25, page=1, page_size=20)
        assert result["total_pages"] == 2
        assert result["start"] == 0
        assert result["end"] == 20

    def test_page2_of_2(self):
        """total=25, page_size=20 → page2: start=20, end=40 (슬라이싱이 넘쳐도 안전)"""
        result = _paginate(total=25, page=2, page_size=20)
        assert result["total_pages"] == 2
        assert result["start"] == 20
        assert result["end"] == 40

    def test_page2_slice_actual_items(self):
        """page2 슬라이싱을 실제 리스트에 적용하면 5건만 반환"""
        items = list(range(25))
        pag = _paginate(total=25, page=2, page_size=20)
        sliced = items[pag["start"]:pag["end"]]
        assert len(sliced) == 5

    def test_total_zero_early_return(self):
        """total=0 → total_pages=0, start=0, end=20"""
        result = _paginate(total=0, page=1, page_size=20)
        assert result["total_pages"] == 0
        assert result["start"] == 0
        assert result["end"] == 20

    def test_total_zero_empty_slice(self):
        """total=0인 빈 리스트를 슬라이싱하면 빈 리스트"""
        items = []
        pag = _paginate(total=0, page=1, page_size=20)
        assert items[pag["start"]:pag["end"]] == []

    def test_exact_page_boundary(self):
        """total=40, page_size=20 → 정확히 2페이지"""
        result = _paginate(total=40, page=2, page_size=20)
        assert result["total_pages"] == 2
        assert result["start"] == 20
        assert result["end"] == 40

    def test_single_item(self):
        """total=1 → total_pages=1"""
        result = _paginate(total=1, page=1, page_size=20)
        assert result["total_pages"] == 1
        assert result["start"] == 0
        assert result["end"] == 20

    def test_total_pages_ceil_consistency(self):
        """total > 0이면 total_pages >= 1 (max(1,...) 없이도 ceil이 보장)"""
        for total in [1, 5, 19, 20, 21, 100]:
            pag = _paginate(total=total, page=1, page_size=20)
            assert pag["total_pages"] >= 1, f"total={total}에서 total_pages가 0"


# ── _restore_order (정렬 순서 복원) ──


class TestRestoreOrder:
    def test_restores_order(self):
        """page_docs 순서대로 full_docs가 정렬되는지 확인"""
        page_docs = [
            {"_id": "aaa", "score": 10},
            {"_id": "bbb", "score": 8},
            {"_id": "ccc", "score": 5},
        ]
        # MongoDB 재조회 결과는 순서 보장 안 됨 (역순으로 시뮬레이션)
        full_docs = [
            {"_id": "ccc", "full_text": "C 전문"},
            {"_id": "aaa", "full_text": "A 전문"},
            {"_id": "bbb", "full_text": "B 전문"},
        ]
        result = _restore_order(page_docs, full_docs)
        assert [str(d["_id"]) for d in result] == ["aaa", "bbb", "ccc"]

    def test_fallback_on_missing_full_doc(self):
        """재조회 실패 시 원본 문서(full_text 없음)를 fallback으로 사용"""
        page_docs = [
            {"_id": "aaa", "score": 10},
            {"_id": "bbb", "score": 8},
        ]
        # bbb가 재조회에서 누락
        full_docs = [
            {"_id": "aaa", "full_text": "A 전문"},
        ]
        result = _restore_order(page_docs, full_docs)
        assert len(result) == 2
        assert result[0]["full_text"] == "A 전문"
        # bbb는 원본 사용 (full_text 없음)
        assert result[1]["_id"] == "bbb"
        assert "full_text" not in result[1]

    def test_empty_inputs(self):
        """빈 page_docs → 빈 결과"""
        assert _restore_order([], []) == []
        assert _restore_order([], [{"_id": "aaa"}]) == []

    def test_full_docs_empty_all_fallback(self):
        """full_docs가 비어있으면 모든 문서가 원본 fallback"""
        page_docs = [{"_id": "aaa"}, {"_id": "bbb"}]
        result = _restore_order(page_docs, [])
        assert len(result) == 2
        assert result[0]["_id"] == "aaa"
        assert result[1]["_id"] == "bbb"
