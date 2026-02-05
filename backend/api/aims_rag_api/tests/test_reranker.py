"""
SearchReranker 유닛 테스트

테스트 범위:
- rerank() 재순위화 함수
- Cross-Encoder 모델 로딩
- 점수 정규화 (sigmoid)
- final_score 계산 로직
- 에러 핸들링
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import math


class TestSearchRerankerInit:
    """SearchReranker 초기화 테스트"""

    @patch('reranker.CrossEncoder')
    def test_init_loads_default_model(self, mock_cross_encoder):
        """기본 모델(ms-marco-MiniLM-L-12-v2)이 로딩되어야 함"""
        from reranker import SearchReranker

        mock_cross_encoder.return_value = MagicMock()

        reranker = SearchReranker()

        mock_cross_encoder.assert_called_once_with(
            "cross-encoder/ms-marco-MiniLM-L-12-v2",
            max_length=512
        )
        assert reranker.model is not None

    @patch('reranker.CrossEncoder')
    def test_init_custom_model(self, mock_cross_encoder):
        """커스텀 모델 지정 가능"""
        from reranker import SearchReranker

        mock_cross_encoder.return_value = MagicMock()

        reranker = SearchReranker(model_name="cross-encoder/ms-marco-MiniLM-L-6-v2")

        mock_cross_encoder.assert_called_once_with(
            "cross-encoder/ms-marco-MiniLM-L-6-v2",
            max_length=512
        )

    @patch('reranker.CrossEncoder')
    def test_init_model_load_failure(self, mock_cross_encoder):
        """모델 로딩 실패 시 model이 None이어야 함"""
        from reranker import SearchReranker

        mock_cross_encoder.side_effect = Exception("Model not found")

        reranker = SearchReranker()

        assert reranker.model is None


class TestSearchRerankerRerank:
    """rerank() 함수 테스트"""

    @patch('reranker.CrossEncoder')
    def test_rerank_basic(self, mock_cross_encoder):
        """기본 재순위화 테스트"""
        from reranker import SearchReranker

        # Mock 모델 설정
        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        # Cross-Encoder 점수 반환 (높을수록 관련성 높음)
        mock_model.predict.return_value = [2.0, -1.0]

        reranker = SearchReranker()

        search_results = [
            {
                "doc_id": "doc1",
                "score": 0.8,
                "payload": {"preview": "관련 있는 문서 내용", "original_name": "문서1.pdf"}
            },
            {
                "doc_id": "doc2",
                "score": 0.9,
                "payload": {"preview": "관련 없는 문서 내용", "original_name": "문서2.pdf"}
            }
        ]

        result = reranker.rerank("테스트 쿼리", search_results, top_k=2)

        # 재순위화된 결과 확인
        assert len(result) == 2
        # doc1이 더 높은 Cross-Encoder 점수를 받았으므로 상위로
        assert result[0]["doc_id"] == "doc1"
        assert "rerank_score" in result[0]
        assert "original_score" in result[0]
        assert "final_score" in result[0]

    @patch('reranker.CrossEncoder')
    def test_rerank_empty_results(self, mock_cross_encoder):
        """빈 결과 입력 시 빈 리스트 반환"""
        from reranker import SearchReranker

        mock_cross_encoder.return_value = MagicMock()
        reranker = SearchReranker()

        result = reranker.rerank("테스트", [], top_k=5)

        assert result == []

    @patch('reranker.CrossEncoder')
    def test_rerank_no_model(self, mock_cross_encoder):
        """모델 없을 때 원본 결과 반환 (top_k 적용)"""
        from reranker import SearchReranker

        mock_cross_encoder.side_effect = Exception("Model load failed")
        reranker = SearchReranker()

        search_results = [
            {"doc_id": "doc1", "score": 0.9, "payload": {"preview": "내용1"}},
            {"doc_id": "doc2", "score": 0.8, "payload": {"preview": "내용2"}},
            {"doc_id": "doc3", "score": 0.7, "payload": {"preview": "내용3"}}
        ]

        result = reranker.rerank("테스트", search_results, top_k=2)

        # 모델 없으면 원본 그대로 top_k만 적용
        assert len(result) == 2
        assert result[0]["doc_id"] == "doc1"

    @patch('reranker.CrossEncoder')
    def test_rerank_top_k_limit(self, mock_cross_encoder):
        """top_k 제한이 적용되어야 함"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        mock_model.predict.return_value = [1.0, 0.5, 0.0, -0.5, -1.0]

        reranker = SearchReranker()

        search_results = [
            {"doc_id": f"doc{i}", "score": 0.5, "payload": {"preview": f"내용{i}"}}
            for i in range(5)
        ]

        result = reranker.rerank("테스트", search_results, top_k=3)

        assert len(result) == 3


class TestScoreNormalization:
    """점수 정규화 테스트"""

    @patch('reranker.CrossEncoder')
    def test_sigmoid_normalization(self, mock_cross_encoder):
        """sigmoid 정규화: 0 근처 → 0.5, 양수 → 0.5~1.0, 음수 → 0~0.5"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model

        # 점수 범위 테스트
        test_scores = [0.0, 5.0, -5.0, 10.0, -10.0]
        mock_model.predict.return_value = test_scores

        reranker = SearchReranker()

        search_results = [
            {"doc_id": f"doc{i}", "score": 0.5, "payload": {"preview": f"내용{i}"}}
            for i in range(len(test_scores))
        ]

        result = reranker.rerank("테스트", search_results, top_k=5)

        # 정규화된 점수 범위 확인
        for r in result:
            assert 0.0 <= r["rerank_score"] <= 1.0

    @patch('reranker.CrossEncoder')
    def test_rerank_score_zero_input(self, mock_cross_encoder):
        """Cross-Encoder 점수 0 → rerank_score 0.5"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        mock_model.predict.return_value = [0.0]

        reranker = SearchReranker()

        search_results = [
            {"doc_id": "doc1", "score": 0.5, "payload": {"preview": "내용"}}
        ]

        result = reranker.rerank("테스트", search_results, top_k=1)

        # sigmoid(0) = 0.5
        assert abs(result[0]["rerank_score"] - 0.5) < 0.001


class TestFinalScoreCalculation:
    """final_score 계산 로직 테스트"""

    @patch('reranker.CrossEncoder')
    def test_high_original_score_boost(self, mock_cross_encoder):
        """original_score >= 5.0 → 원본 점수 2배 부스트"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        mock_model.predict.return_value = [0.0]  # rerank_score = 0.5

        reranker = SearchReranker()

        search_results = [
            {"doc_id": "doc1", "score": 5.0, "payload": {"preview": "파일명 완벽 매칭"}}
        ]

        result = reranker.rerank("테스트", search_results, top_k=1)

        # original >= 5.0: final = original * 2.0 + semantic
        # 5.0 * 2.0 + 0.5 = 10.5
        expected = 5.0 * 2.0 + 0.5
        assert abs(result[0]["final_score"] - expected) < 0.01

    @patch('reranker.CrossEncoder')
    def test_medium_original_score(self, mock_cross_encoder):
        """2.0 <= original_score < 5.0 → 균형 점수"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        mock_model.predict.return_value = [0.0]  # rerank_score = 0.5

        reranker = SearchReranker()

        search_results = [
            {"doc_id": "doc1", "score": 3.0, "payload": {"preview": "일부 매칭"}}
        ]

        result = reranker.rerank("테스트", search_results, top_k=1)

        # 2.0 <= original < 5.0: final = original + semantic * 2.0
        # 3.0 + 0.5 * 2.0 = 4.0
        expected = 3.0 + 0.5 * 2.0
        assert abs(result[0]["final_score"] - expected) < 0.01

    @patch('reranker.CrossEncoder')
    def test_low_original_score(self, mock_cross_encoder):
        """original_score < 2.0 → semantic 위주"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        mock_model.predict.return_value = [0.0]  # rerank_score = 0.5

        reranker = SearchReranker()

        search_results = [
            {"doc_id": "doc1", "score": 1.0, "payload": {"preview": "약한 매칭"}}
        ]

        result = reranker.rerank("테스트", search_results, top_k=1)

        # original < 2.0: final = original * 0.5 + semantic * 5.0
        # 1.0 * 0.5 + 0.5 * 5.0 = 3.0
        expected = 1.0 * 0.5 + 0.5 * 5.0
        assert abs(result[0]["final_score"] - expected) < 0.01

    @patch('reranker.CrossEncoder')
    def test_filename_match_priority(self, mock_cross_encoder):
        """파일명 완벽 매칭(높은 original)이 semantic보다 우선"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        # doc1: Cross-Encoder 낮음, doc2: Cross-Encoder 높음
        mock_model.predict.return_value = [-2.0, 5.0]

        reranker = SearchReranker()

        search_results = [
            {"doc_id": "doc1", "score": 10.0, "payload": {"preview": "파일명 완벽 매칭"}},
            {"doc_id": "doc2", "score": 0.5, "payload": {"preview": "내용만 좋은 문서"}}
        ]

        result = reranker.rerank("테스트", search_results, top_k=2)

        # 파일명 매칭(original 높음)이 semantic보다 우선
        assert result[0]["doc_id"] == "doc1"


class TestRerankErrorHandling:
    """에러 핸들링 테스트"""

    @patch('reranker.CrossEncoder')
    def test_rerank_predict_error(self, mock_cross_encoder):
        """predict() 오류 시 원본 결과 반환"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        mock_model.predict.side_effect = Exception("CUDA out of memory")

        reranker = SearchReranker()

        search_results = [
            {"doc_id": "doc1", "score": 0.9, "payload": {"preview": "내용1"}},
            {"doc_id": "doc2", "score": 0.8, "payload": {"preview": "내용2"}}
        ]

        result = reranker.rerank("테스트", search_results, top_k=2)

        # 오류 시 원본 반환
        assert len(result) == 2
        assert result[0]["doc_id"] == "doc1"

    @patch('reranker.CrossEncoder')
    def test_rerank_null_payload(self, mock_cross_encoder):
        """payload가 None일 때 처리"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        mock_model.predict.return_value = [1.0, 0.5]

        reranker = SearchReranker()

        search_results = [
            {"doc_id": "doc1", "score": 0.9, "payload": None},
            {"doc_id": "doc2", "score": 0.8, "payload": {"preview": "내용"}}
        ]

        result = reranker.rerank("테스트", search_results, top_k=2)

        # None payload도 처리 가능
        assert len(result) == 2

    @patch('reranker.CrossEncoder')
    def test_rerank_missing_preview(self, mock_cross_encoder):
        """payload에 preview가 없을 때 처리"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        mock_model.predict.return_value = [1.0]

        reranker = SearchReranker()

        search_results = [
            {"doc_id": "doc1", "score": 0.9, "payload": {"original_name": "문서.pdf"}}
        ]

        result = reranker.rerank("테스트", search_results, top_k=1)

        # preview 없어도 처리 가능 (빈 문자열로 대체)
        assert len(result) == 1


class TestRerankSorting:
    """정렬 테스트"""

    @patch('reranker.CrossEncoder')
    def test_rerank_sorts_by_final_score(self, mock_cross_encoder):
        """final_score 내림차순 정렬"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        # 의도적으로 역순 점수 부여
        mock_model.predict.return_value = [3.0, 1.0, 2.0]

        reranker = SearchReranker()

        search_results = [
            {"doc_id": "doc1", "score": 0.5, "payload": {"preview": "내용1"}},
            {"doc_id": "doc2", "score": 0.5, "payload": {"preview": "내용2"}},
            {"doc_id": "doc3", "score": 0.5, "payload": {"preview": "내용3"}}
        ]

        result = reranker.rerank("테스트", search_results, top_k=3)

        # final_score 내림차순
        assert result[0]["final_score"] >= result[1]["final_score"]
        assert result[1]["final_score"] >= result[2]["final_score"]

    @patch('reranker.CrossEncoder')
    def test_rerank_consistent_order_same_score(self, mock_cross_encoder):
        """동일 점수일 때 doc_id로 일관된 정렬"""
        from reranker import SearchReranker

        mock_model = MagicMock()
        mock_cross_encoder.return_value = mock_model
        # 모두 같은 점수
        mock_model.predict.return_value = [0.0, 0.0, 0.0]

        reranker = SearchReranker()

        search_results = [
            {"doc_id": "doc_c", "score": 0.5, "payload": {"preview": "내용"}},
            {"doc_id": "doc_a", "score": 0.5, "payload": {"preview": "내용"}},
            {"doc_id": "doc_b", "score": 0.5, "payload": {"preview": "내용"}}
        ]

        result = reranker.rerank("테스트", search_results, top_k=3)

        # 같은 점수면 doc_id 오름차순
        doc_ids = [r["doc_id"] for r in result]
        assert doc_ids == sorted(doc_ids)
