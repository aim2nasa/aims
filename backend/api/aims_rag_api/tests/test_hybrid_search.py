"""
HybridSearchEngine 유닛 테스트

테스트 범위:
- _entity_search() 메타데이터 검색
- _vector_search() 벡터 검색
- _hybrid_search() 하이브리드 검색
- 고객 필터링
- 에러 핸들링
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from bson import ObjectId


class TestHybridSearchEngineInit:
    """HybridSearchEngine 초기화 테스트"""

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_init_connects_to_services(self, mock_qdrant, mock_openai):
        """초기화 시 Qdrant, OpenAI에 연결해야 함"""
        from hybrid_search import HybridSearchEngine

        mock_qdrant.return_value = MagicMock()
        mock_openai.return_value = MagicMock()

        engine = HybridSearchEngine()

        mock_qdrant.assert_called_once_with(host="localhost", port=6333, check_compatibility=False)
        mock_openai.assert_called_once()


class TestEntitySearch:
    """_entity_search() 테스트"""

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_entity_search_basic(self, mock_qdrant, mock_openai):
        """기본 개체명 검색 테스트"""
        from hybrid_search import HybridSearchEngine

        engine = HybridSearchEngine()

        # _api_post를 mock하여 Internal API 응답 시뮬레이션
        mock_docs = [
            {
                "_id": "507f1f77bcf86cd799439011",
                "ownerId": "user123",
                "upload": {"originalName": "홍길동_이력서.pdf", "mimeType": "application/pdf"},
                "meta": {"full_text": "홍길동은 개발자입니다", "tags": ["이력서"], "summary": "개발자 이력서"},
                "ocr": {}
            }
        ]

        with patch.object(engine, '_api_post', return_value=mock_docs):
            query_intent = {
                "query_type": "entity",
                "entities": ["홍길동"],
                "concepts": ["이력"],
                "metadata_keywords": ["홍길동", "이력서"]
            }

            results = engine._entity_search(query_intent, "user123", None, top_k=5)

            assert len(results) == 1
            assert results[0]["payload"]["original_name"] == "홍길동_이력서.pdf"
            assert results[0]["score"] > 0

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_entity_search_filename_perfect_match(self, mock_qdrant, mock_openai):
        """파일명 완벽 매칭 시 높은 점수"""
        from hybrid_search import HybridSearchEngine

        engine = HybridSearchEngine()

        # 파일명에 모든 검색어 포함
        mock_docs = [
            {
                "_id": "507f1f77bcf86cd799439011",
                "ownerId": "user123",
                "upload": {"originalName": "홍길동_이력서.pdf"},
                "meta": {"full_text": ""},
                "ocr": {}
            }
        ]

        with patch.object(engine, '_api_post', return_value=mock_docs):
            query_intent = {
                "entities": ["홍길동"],
                "metadata_keywords": ["홍길동", "이력서"]
            }

            results = engine._entity_search(query_intent, "user123", None, top_k=5)

            # P1-1: 파일명 완벽 매칭 (+10.0 원본) → Sigmoid 정규화 후 0.92+ 범위
            assert results[0]["score"] >= 0.9
            assert results[0]["score"] <= 1.0
            # 원본 점수도 보존되어야 함
            assert results[0]["raw_entity_score"] >= 10.0

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_entity_search_empty_keywords(self, mock_qdrant, mock_openai):
        """검색어 없을 때 빈 결과 반환"""
        from hybrid_search import HybridSearchEngine

        engine = HybridSearchEngine()

        query_intent = {
            "entities": [],
            "metadata_keywords": []
        }

        results = engine._entity_search(query_intent, "user123", None, top_k=5)

        assert results == []

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_entity_search_customer_filter(self, mock_qdrant, mock_openai):
        """고객 ID 필터링"""
        from hybrid_search import HybridSearchEngine

        engine = HybridSearchEngine()

        customer_ids = ["507f1f77bcf86cd799439099"]

        # _api_post 호출 시 전달된 인자를 캡처
        with patch.object(engine, '_api_post', return_value=[]) as mock_api:
            query_intent = {
                "entities": ["테스트"],
                "metadata_keywords": ["테스트"]
            }

            engine._entity_search(query_intent, "user123", customer_ids, top_k=5)

            # _api_post 호출 시 filter에 customerId가 포함되어야 함
            mock_api.assert_called_once()
            call_args = mock_api.call_args
            filter_dict = call_args[0][1]["filter"]  # body["filter"]
            assert "customerId" in filter_dict


class TestVectorSearch:
    """_vector_search() 테스트"""

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_vector_search_basic(self, mock_qdrant, mock_openai):
        """기본 벡터 검색 테스트"""
        from hybrid_search import HybridSearchEngine

        # OpenAI Mock (임베딩)
        mock_openai_client = MagicMock()
        mock_openai.return_value = mock_openai_client
        mock_embedding_response = MagicMock()
        mock_embedding_response.data = [MagicMock(embedding=[0.1] * 1536)]
        mock_openai_client.embeddings.create.return_value = mock_embedding_response

        # Qdrant Mock
        mock_qdrant_client = MagicMock()
        mock_qdrant.return_value = mock_qdrant_client
        mock_search_result = [
            MagicMock(
                payload={"doc_id": "doc1", "preview": "테스트 내용", "original_name": "문서.pdf"},
                score=0.85
            )
        ]
        mock_qdrant_client.search.return_value = mock_search_result

        engine = HybridSearchEngine()
        results = engine._vector_search("테스트 쿼리", "user123", None, top_k=5)

        assert len(results) == 1
        assert results[0]["doc_id"] == "doc1"
        assert results[0]["score"] == 0.85

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_vector_search_uses_correct_model(self, mock_qdrant, mock_openai):
        """text-embedding-3-small 모델 사용 확인"""
        from hybrid_search import HybridSearchEngine

        mock_openai_client = MagicMock()
        mock_openai.return_value = mock_openai_client
        mock_embedding_response = MagicMock()
        mock_embedding_response.data = [MagicMock(embedding=[0.1] * 1536)]
        mock_openai_client.embeddings.create.return_value = mock_embedding_response

        mock_qdrant.return_value.search.return_value = []

        engine = HybridSearchEngine()
        engine._vector_search("테스트", "user123", None, top_k=5)

        # 모델 확인
        call_args = mock_openai_client.embeddings.create.call_args
        assert call_args.kwargs['model'] == "text-embedding-3-small"

    @patch('hybrid_search.send_error_log')
    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_vector_search_embedding_error(self, mock_qdrant, mock_openai, mock_error_log):
        """임베딩 오류 시 빈 결과 반환"""
        from hybrid_search import HybridSearchEngine

        mock_openai_client = MagicMock()
        mock_openai.return_value = mock_openai_client
        mock_openai_client.embeddings.create.side_effect = Exception("API Error")

        engine = HybridSearchEngine()
        results = engine._vector_search("테스트", "user123", None, top_k=5)

        assert results == []
        mock_error_log.assert_called_once()

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_vector_search_deduplicates_chunks(self, mock_qdrant, mock_openai):
        """같은 문서의 여러 청크 중 최고 점수만 유지"""
        from hybrid_search import HybridSearchEngine

        mock_openai_client = MagicMock()
        mock_openai.return_value = mock_openai_client
        mock_embedding_response = MagicMock()
        mock_embedding_response.data = [MagicMock(embedding=[0.1] * 1536)]
        mock_openai_client.embeddings.create.return_value = mock_embedding_response

        mock_qdrant_client = MagicMock()
        mock_qdrant.return_value = mock_qdrant_client
        # 같은 doc_id, 다른 점수
        mock_search_result = [
            MagicMock(payload={"doc_id": "doc1", "chunk_id": 0}, score=0.9),
            MagicMock(payload={"doc_id": "doc1", "chunk_id": 1}, score=0.7),
            MagicMock(payload={"doc_id": "doc1", "chunk_id": 2}, score=0.8)
        ]
        mock_qdrant_client.search.return_value = mock_search_result

        engine = HybridSearchEngine()
        results = engine._vector_search("테스트", "user123", None, top_k=5)

        # 중복 제거 후 1개
        assert len(results) == 1
        # 최고 점수 유지
        assert results[0]["score"] == 0.9


class TestHybridSearch:
    """_hybrid_search() 테스트"""

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_hybrid_search_merges_results(self, mock_qdrant, mock_openai):
        """메타데이터 + 벡터 결과 병합"""
        from hybrid_search import HybridSearchEngine

        mock_qdrant.return_value = MagicMock()
        mock_openai.return_value = MagicMock()

        engine = HybridSearchEngine()

        # 메서드 모킹
        with patch.object(engine, '_entity_search') as mock_entity, \
             patch.object(engine, '_vector_search') as mock_vector:

            mock_entity.return_value = [
                {"doc_id": "doc1", "score": 5.0, "payload": {"preview": "메타 결과"}}
            ]
            mock_vector.return_value = [
                {"doc_id": "doc2", "score": 0.8, "payload": {"preview": "벡터 결과"}}
            ]

            query_intent = {
                "query_type": "mixed",
                "entities": ["테스트"],
                "metadata_keywords": ["테스트"]
            }

            results = engine._hybrid_search("테스트 쿼리", query_intent, "user123", None, top_k=5)

            assert len(results) == 2

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_hybrid_search_combines_scores(self, mock_qdrant, mock_openai):
        """같은 문서가 양쪽에서 나오면 점수 합산"""
        from hybrid_search import HybridSearchEngine

        mock_qdrant.return_value = MagicMock()
        mock_openai.return_value = MagicMock()

        engine = HybridSearchEngine()

        with patch.object(engine, '_entity_search') as mock_entity, \
             patch.object(engine, '_vector_search') as mock_vector:

            # 같은 doc_id가 양쪽에서 나옴
            mock_entity.return_value = [
                {"doc_id": "doc1", "score": 0.92, "payload": {"preview": "내용"}}
            ]
            mock_vector.return_value = [
                {"doc_id": "doc1", "score": 0.8, "payload": {"preview": "내용"}}
            ]

            # P1-4: mixed 쿼리 → Entity 50% + Vector 50%
            query_intent = {"query_type": "mixed", "entities": ["테스트"], "metadata_keywords": ["테스트"]}
            results = engine._hybrid_search("테스트", query_intent, "user123", None, top_k=5)

            # 점수 합산 확인: 0.92 * 0.5 + 0.8 * 0.5 = 0.86
            assert len(results) == 1
            assert results[0]["source"] == "hybrid"
            expected_score = 0.92 * 0.5 + 0.8 * 0.5
            assert abs(results[0]["score"] - expected_score) < 0.01


class TestSearchRouter:
    """search() 라우터 테스트"""

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_search_routes_entity_query(self, mock_qdrant, mock_openai):
        """entity 쿼리 → _entity_search 호출"""
        from hybrid_search import HybridSearchEngine

        mock_qdrant.return_value = MagicMock()
        mock_openai.return_value = MagicMock()

        engine = HybridSearchEngine()

        with patch.object(engine, '_entity_search') as mock_method:
            mock_method.return_value = []

            query_intent = {"query_type": "entity", "entities": ["홍길동"], "metadata_keywords": ["홍길동"]}
            engine.search("홍길동에 대해서", query_intent, "user123")

            mock_method.assert_called_once()

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_search_routes_concept_query(self, mock_qdrant, mock_openai):
        """concept 쿼리 → _vector_search 호출"""
        from hybrid_search import HybridSearchEngine

        mock_openai_client = MagicMock()
        mock_openai.return_value = mock_openai_client
        mock_embedding = MagicMock()
        mock_embedding.data = [MagicMock(embedding=[0.1] * 1536)]
        mock_openai_client.embeddings.create.return_value = mock_embedding

        mock_qdrant.return_value.search.return_value = []

        engine = HybridSearchEngine()

        with patch.object(engine, '_vector_search') as mock_method:
            mock_method.return_value = []

            query_intent = {"query_type": "concept", "entities": [], "concepts": ["USB"]}
            engine.search("USB 개발", query_intent, "user123")

            mock_method.assert_called_once()

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_search_routes_mixed_query(self, mock_qdrant, mock_openai):
        """mixed 쿼리 → _hybrid_search 호출"""
        from hybrid_search import HybridSearchEngine

        mock_qdrant.return_value = MagicMock()
        mock_openai.return_value = MagicMock()

        engine = HybridSearchEngine()

        with patch.object(engine, '_hybrid_search') as mock_method:
            mock_method.return_value = []

            query_intent = {"query_type": "mixed", "entities": ["홍길동"], "concepts": ["보험"]}
            engine.search("홍길동 보험", query_intent, "user123")

            mock_method.assert_called_once()


class TestEmbeddingTracking:
    """임베딩 응답 추적 테스트"""

    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_stores_last_embedding_response(self, mock_qdrant, mock_openai):
        """마지막 임베딩 응답 저장"""
        from hybrid_search import HybridSearchEngine

        mock_openai_client = MagicMock()
        mock_openai.return_value = mock_openai_client
        mock_embedding = MagicMock()
        mock_embedding.data = [MagicMock(embedding=[0.1] * 1536)]
        mock_embedding.usage = MagicMock(total_tokens=10)
        mock_openai_client.embeddings.create.return_value = mock_embedding

        mock_qdrant.return_value.search.return_value = []

        engine = HybridSearchEngine()
        engine._vector_search("테스트", "user123", None, top_k=5)

        # 응답 저장 확인
        assert engine.last_embedding_response is not None
        assert engine.last_embedding_response.usage.total_tokens == 10

    @patch('hybrid_search.send_error_log')
    @patch('hybrid_search.OpenAI')
    @patch('hybrid_search.QdrantClient')
    def test_clears_embedding_response_on_error(self, mock_qdrant, mock_openai, mock_error_log):
        """임베딩 오류 시 응답 None으로 설정"""
        from hybrid_search import HybridSearchEngine

        mock_openai_client = MagicMock()
        mock_openai.return_value = mock_openai_client
        mock_openai_client.embeddings.create.side_effect = Exception("API Error")

        engine = HybridSearchEngine()
        engine._vector_search("테스트", "user123", None, top_k=5)

        assert engine.last_embedding_response is None
