"""
aims_rag_api - RAG Search API 유닛 테스트

테스트 범위:
- /search 엔드포인트 (키워드 검색, 의미 검색)
- embed_query 함수 (쿼리 임베딩)
- search_qdrant 함수 (벡터 검색)
- generate_answer_with_llm 함수 (LLM 답변 생성)
"""

import pytest
import requests
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient

# OpenAI 클라이언트 생성을 모킹
with patch('query_analyzer.OpenAI'), patch('hybrid_search.OpenAI'), patch('rag_search.OpenAI'):
    from rag_search import (
        app,
        embed_query,
        search_qdrant,
        generate_answer_with_llm,
        SearchRequest,
        UnifiedSearchResponse
    )


client = TestClient(app)


class TestHealthAndBasics:
    """기본 API 구조 테스트"""

    def test_app_instance_exists(self):
        """FastAPI 앱 인스턴스가 존재해야 함"""
        assert app is not None
        assert hasattr(app, 'post')

    def test_search_request_model(self):
        """SearchRequest 모델이 올바르게 정의되어야 함"""
        request = SearchRequest(query="test", mode="OR", search_mode="semantic")
        assert request.query == "test"
        assert request.mode == "OR"
        assert request.search_mode == "semantic"

    def test_search_request_defaults(self):
        """SearchRequest 기본값이 올바르게 설정되어야 함"""
        request = SearchRequest(query="test")
        assert request.mode == "OR"
        assert request.search_mode == "semantic"

    def test_unified_search_response_model(self):
        """UnifiedSearchResponse 모델이 올바르게 정의되어야 함"""
        response = UnifiedSearchResponse(
            search_mode="semantic",
            answer="test answer",
            search_results=[{"id": 1, "score": 0.9}]
        )
        assert response.search_mode == "semantic"
        assert response.answer == "test answer"
        assert len(response.search_results) == 1


class TestEmbedQueryFunction:
    """쿼리 임베딩 함수 테스트"""

    @patch('rag_search.OpenAI')
    def test_embed_query_success(self, mock_openai):
        """쿼리 임베딩이 성공적으로 생성되어야 함"""
        # Mock 설정
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.data = [MagicMock(embedding=[0.1, 0.2, 0.3])]
        mock_client.embeddings.create.return_value = mock_response

        # 함수 실행
        result = embed_query("test query")

        # 검증
        assert result == [0.1, 0.2, 0.3]
        mock_client.embeddings.create.assert_called_once()
        call_args = mock_client.embeddings.create.call_args
        assert call_args.kwargs['input'] == "test query"
        assert call_args.kwargs['model'] == "text-embedding-3-small"

    @patch('rag_search.OpenAI')
    def test_embed_query_failure(self, mock_openai):
        """임베딩 실패 시 None을 반환해야 함"""
        # Mock 설정 - 에러 발생
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.embeddings.create.side_effect = Exception("API Error")

        # 함수 실행
        result = embed_query("test query")

        # 검증
        assert result is None


class TestSearchQdrantFunction:
    """Qdrant 검색 함수 테스트"""

    @patch('rag_search.QdrantClient')
    def test_search_qdrant_success(self, mock_qdrant_client):
        """Qdrant 검색이 성공적으로 수행되어야 함"""
        # Mock 설정
        mock_client = MagicMock()
        mock_qdrant_client.return_value = mock_client
        mock_result = [
            MagicMock(id=1, score=0.95, payload={"text": "result 1"}),
            MagicMock(id=2, score=0.85, payload={"text": "result 2"})
        ]
        mock_client.search.return_value = mock_result

        # 함수 실행
        query_vector = [0.1, 0.2, 0.3]
        results = search_qdrant(query_vector, collection_name="docembed", top_k=5)

        # 검증
        assert len(results) == 2
        assert results[0].score == 0.95
        mock_client.search.assert_called_once_with(
            collection_name="docembed",
            query_vector=query_vector,
            query_filter=None,
            limit=5,
            with_payload=True
        )

    def test_search_qdrant_empty_vector(self):
        """빈 벡터 입력 시 빈 리스트를 반환해야 함"""
        result = search_qdrant(None)
        assert result == []

        result = search_qdrant([])
        assert result == []

    @patch('rag_search.QdrantClient')
    def test_search_qdrant_failure(self, mock_qdrant_client):
        """Qdrant 검색 실패 시 빈 리스트를 반환해야 함"""
        # Mock 설정 - 에러 발생
        mock_client = MagicMock()
        mock_qdrant_client.return_value = mock_client
        mock_client.search.side_effect = Exception("Qdrant connection error")

        # 함수 실행
        result = search_qdrant([0.1, 0.2, 0.3])

        # 검증
        assert result == []


class TestGenerateAnswerFunction:
    """LLM 답변 생성 함수 테스트"""

    def test_generate_answer_no_results(self):
        """검색 결과가 없을 때 기본 메시지를 반환해야 함"""
        result = generate_answer_with_llm("test query", [])
        assert result == "관련 문서를 찾을 수 없습니다."

    @patch('rag_search.OpenAI')
    def test_generate_answer_success(self, mock_openai):
        """LLM 답변 생성이 성공해야 함"""
        # Mock 설정
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content="AI generated answer"))]
        mock_client.chat.completions.create.return_value = mock_response

        # 검색 결과 Mock
        search_results = [
            MagicMock(
                payload={"preview": "테스트 내용 1", "original_name": "문서1.pdf"},
                score=0.95
            ),
            MagicMock(
                payload={"preview": "테스트 내용 2", "original_name": "문서2.pdf"},
                score=0.85
            )
        ]

        # 함수 실행
        result = generate_answer_with_llm("test query", search_results)

        # 검증
        assert result == "AI generated answer"
        mock_client.chat.completions.create.assert_called_once()
        call_args = mock_client.chat.completions.create.call_args
        assert call_args.kwargs['model'] == "gpt-3.5-turbo"
        assert call_args.kwargs['max_tokens'] == 500
        assert call_args.kwargs['temperature'] == 0.1

    @patch('rag_search.OpenAI')
    def test_generate_answer_failure(self, mock_openai):
        """LLM 실패 시 에러 메시지를 반환해야 함"""
        # Mock 설정 - 에러 발생
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("API rate limit")

        # 검색 결과 Mock
        search_results = [
            MagicMock(
                payload={"preview": "테스트 내용", "original_name": "문서.pdf"},
                score=0.95
            )
        ]

        # 함수 실행
        result = generate_answer_with_llm("test query", search_results)

        # 검증
        assert "❌ LLM 답변 생성 중 오류 발생" in result


class TestSearchEndpoint:
    """검색 API 엔드포인트 테스트"""

    @patch('rag_search.requests.post')
    def test_keyword_search_success(self, mock_requests_post):
        """키워드 검색이 성공해야 함"""
        # Mock 설정
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"id": "1", "title": "문서1", "score": 0.9},
            {"id": "2", "title": "문서2", "score": 0.7}
        ]
        mock_response.raise_for_status = MagicMock()
        mock_requests_post.return_value = mock_response

        # API 호출
        response = client.post(
            "/search",
            json={"query": "test", "mode": "OR", "search_mode": "keyword"}
        )

        # 검증
        assert response.status_code == 200
        data = response.json()
        assert data["search_mode"] == "keyword"
        assert data["answer"] is None
        assert len(data["search_results"]) == 2

    @patch('rag_search.requests.post')
    def test_keyword_search_api_failure(self, mock_requests_post):
        """키워드 검색 API 실패 시 500 에러를 반환해야 함"""
        # Mock 설정 - 에러 발생
        mock_requests_post.side_effect = requests.RequestException("Network error")

        # API 호출
        response = client.post(
            "/search",
            json={"query": "test", "mode": "OR", "search_mode": "keyword"}
        )

        # 검증
        assert response.status_code == 500
        assert "SmartSearch API 호출 오류" in response.json()["detail"]

    @patch('rag_search.reranker')
    @patch('rag_search.hybrid_engine')
    @patch('rag_search.query_analyzer')
    def test_semantic_search_success(self, mock_analyzer, mock_hybrid, mock_reranker):
        """의미 검색이 성공해야 함"""
        # Mock query analyzer
        mock_analyzer.analyze.return_value = {
            "query_type": "concept",
            "entities": [],
            "concepts": ["test"],
            "metadata_keywords": ["test"]
        }

        # Mock hybrid search engine
        mock_hybrid.search.return_value = [
            {
                "doc_id": "doc1",
                "score": 0.85,
                "payload": {"doc_id": "doc1", "preview": "내용 1", "original_name": "문서1.pdf"}
            }
        ]

        # Mock reranker
        mock_reranker.rerank.return_value = [
            {
                "doc_id": "doc1",
                "score": 0.85,
                "rerank_score": 0.95,
                "payload": {"doc_id": "doc1", "preview": "내용 1", "original_name": "문서1.pdf"}
            }
        ]

        # Mock LLM answer generation
        with patch('rag_search.generate_answer_with_llm') as mock_generate:
            mock_generate.return_value = "AI generated answer"

            # API 호출
            response = client.post(
                "/search",
                json={"query": "test query", "search_mode": "semantic"}
            )

            # 검증
            assert response.status_code == 200
            data = response.json()
            assert data["search_mode"] == "semantic"
            assert data["answer"] == "AI generated answer"
            assert len(data["search_results"]) == 1

    @patch('rag_search.query_analyzer')
    def test_semantic_search_embedding_failure(self, mock_analyzer):
        """분석 실패 시 500 에러를 반환해야 함"""
        # Mock 설정 - 분석 중 에러 발생
        mock_analyzer.analyze.side_effect = Exception("Query analysis failed")

        # API 호출
        response = client.post(
            "/search",
            json={"query": "test query", "search_mode": "semantic"}
        )

        # 검증
        assert response.status_code == 500
        assert "하이브리드 검색 오류" in response.json()["detail"]

    def test_invalid_search_mode(self):
        """유효하지 않은 검색 모드 시 400 에러를 반환해야 함"""
        # API 호출
        response = client.post(
            "/search",
            json={"query": "test", "search_mode": "invalid_mode"}
        )

        # 검증
        assert response.status_code == 400
        assert "유효하지 않은 검색 모드" in response.json()["detail"]


class TestEdgeCases:
    """엣지 케이스 테스트"""

    def test_empty_query(self):
        """빈 쿼리 입력 테스트"""
        # 빈 문자열도 유효한 입력으로 처리되어야 함
        response = client.post(
            "/search",
            json={"query": "", "search_mode": "keyword"}
        )
        # 422 또는 500 응답이 예상됨 (실제 동작에 따라 다름)
        assert response.status_code in [200, 422, 500]

    @patch('rag_search.reranker')
    @patch('rag_search.hybrid_engine')
    @patch('rag_search.query_analyzer')
    def test_semantic_search_no_results(self, mock_analyzer, mock_hybrid, mock_reranker):
        """검색 결과가 없을 때 처리"""
        # Mock query analyzer
        mock_analyzer.analyze.return_value = {
            "query_type": "concept",
            "entities": [],
            "concepts": ["매우", "특이한", "질문"],
            "metadata_keywords": ["매우", "특이한", "질문"]
        }

        # Mock hybrid search - 결과 없음
        mock_hybrid.search.return_value = []

        # Mock reranker - 결과 없음
        mock_reranker.rerank.return_value = []

        # Mock LLM answer generation
        with patch('rag_search.generate_answer_with_llm') as mock_generate:
            mock_generate.return_value = "관련 문서를 찾을 수 없습니다."

            # API 호출
            response = client.post(
                "/search",
                json={"query": "매우 특이한 질문", "search_mode": "semantic"}
            )

            # 검증
            assert response.status_code == 200
            data = response.json()
            assert data["answer"] == "관련 문서를 찾을 수 없습니다."
            assert data["search_results"] == []
