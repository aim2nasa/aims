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

# 테스트 환경에서 ApiKeyMiddleware를 스킵하기 위해 RAG_API_KEY 제거
import os
os.environ.pop("RAG_API_KEY", None)

# OpenAI 클라이언트 생성을 모킹
with patch('query_analyzer.OpenAI'), patch('hybrid_search.OpenAI'), patch('rag_search.OpenAI'):
    import rag_search as _rag_module
    # 런타임에 RAG_API_KEY를 빈값으로 오버라이드 (미들웨어 스킵)
    _rag_module.RAG_API_KEY = ""
    # P4-5: 테스트 환경에서 Rate Limiting 비활성화 (충분히 높은 한도)
    _rag_module._RATE_LIMIT_MAX = 10000
    from rag_search import (
        app,
        embed_query,
        search_qdrant,
        generate_answer_with_llm,
        SearchRequest,
        UnifiedSearchResponse,
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

    @patch('rag_search._openai_client')
    def test_embed_query_success(self, mock_client):
        """쿼리 임베딩이 성공적으로 생성되어야 함"""
        # Mock 설정 (P2-5: 모듈 레벨 싱글턴 _openai_client를 직접 패치)
        mock_response = MagicMock()
        mock_response.data = [MagicMock(embedding=[0.1, 0.2, 0.3])]
        mock_client.embeddings.create.return_value = mock_response

        # 함수 실행 (튜플 반환: vector, response)
        result, response = embed_query("test query")

        # 검증
        assert result == [0.1, 0.2, 0.3]
        assert response is not None
        mock_client.embeddings.create.assert_called_once()
        call_args = mock_client.embeddings.create.call_args
        assert call_args.kwargs['input'] == "test query"
        assert call_args.kwargs['model'] == "text-embedding-3-small"

    @patch('rag_search._openai_client')
    def test_embed_query_failure(self, mock_client):
        """임베딩 실패 시 None을 반환해야 함"""
        # Mock 설정 - 에러 발생 (P2-5: 모듈 레벨 싱글턴 패치)
        mock_client.embeddings.create.side_effect = Exception("API Error")

        # 함수 실행 (튜플 반환: vector, response)
        result, response = embed_query("test query")

        # 검증
        assert result is None
        assert response is None


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
        result, response = generate_answer_with_llm("test query", [])
        assert result == "관련 문서를 찾을 수 없습니다."
        assert response is None

    @patch('rag_search._openai_client')
    @patch('rag_search.get_rag_model', return_value="gpt-4o-mini")
    def test_generate_answer_success(self, mock_model, mock_client):
        """LLM 답변 생성이 성공해야 함"""
        # Mock 설정 (P2-5: 모듈 레벨 싱글턴 _openai_client를 직접 패치)
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content="AI generated answer"))]
        mock_client.chat.completions.create.return_value = mock_response

        # 검색 결과 Mock (Dict 형태 - 하이브리드 검색 결과)
        search_results = [
            {
                "payload": {"preview": "테스트 내용 1", "original_name": "문서1.pdf"},
                "score": 0.95
            },
            {
                "payload": {"preview": "테스트 내용 2", "original_name": "문서2.pdf"},
                "score": 0.85
            }
        ]

        # 함수 실행 (튜플 반환: answer, response)
        result, response = generate_answer_with_llm("test query", search_results)

        # 검증
        assert result == "AI generated answer"
        assert response is not None
        mock_client.chat.completions.create.assert_called_once()
        call_args = mock_client.chat.completions.create.call_args
        assert call_args.kwargs['model'] == "gpt-4o-mini"
        assert call_args.kwargs['max_tokens'] == 4000
        assert call_args.kwargs['temperature'] == 0.0

    @patch('rag_search._openai_client')
    def test_generate_answer_failure(self, mock_client):
        """LLM 실패 시 에러 메시지를 반환해야 함"""
        # Mock 설정 - 에러 발생 (P2-5: 모듈 레벨 싱글턴 패치)
        mock_client.chat.completions.create.side_effect = Exception("API rate limit")

        # 검색 결과 Mock (Dict 형태 - 하이브리드 검색 결과)
        search_results = [
            {
                "payload": {"preview": "테스트 내용", "original_name": "문서.pdf"},
                "score": 0.95
            }
        ]

        # 함수 실행 (튜플 반환: answer, response)
        result, response = generate_answer_with_llm("test query", search_results)

        # 검증
        assert "LLM 답변 생성 중 오류 발생" in result
        assert response is None


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

    @patch('rag_search.check_credit_for_rag', return_value={"allowed": True, "reason": "test_bypass"})
    @patch('rag_search.reranker')
    @patch('rag_search.hybrid_engine')
    @patch('rag_search.query_analyzer')
    def test_semantic_search_success(self, mock_analyzer, mock_hybrid, mock_reranker, mock_credit):
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

        # Mock LLM answer generation (튜플 반환: answer, response)
        with patch('rag_search.generate_answer_with_llm') as mock_generate:
            mock_generate.return_value = ("AI generated answer", MagicMock())

            # API 호출 (P4-2: user_id 필수)
            response = client.post(
                "/search",
                json={"query": "test query", "search_mode": "semantic", "user_id": "aabbccddee1122334455ff00"}
            )

            # 검증
            assert response.status_code == 200
            data = response.json()
            assert data["search_mode"] == "semantic"
            assert data["answer"] == "AI generated answer"
            assert len(data["search_results"]) == 1

    @patch('rag_search.check_credit_for_rag', return_value={"allowed": True, "reason": "test_bypass"})
    @patch('rag_search.query_analyzer')
    def test_semantic_search_embedding_failure(self, mock_analyzer, mock_credit):
        """분석 실패 시 500 에러를 반환해야 함"""
        # Mock 설정 - 분석 중 에러 발생
        mock_analyzer.analyze.side_effect = Exception("Query analysis failed")

        # API 호출 (P4-2: user_id 필수)
        response = client.post(
            "/search",
            json={"query": "test query", "search_mode": "semantic", "user_id": "aabbccddee1122334455ff00"}
        )

        # 검증
        assert response.status_code == 500
        assert "검색 중 오류가 발생했습니다" in response.json()["detail"]

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

    @patch('rag_search.check_credit_for_rag', return_value={"allowed": True, "reason": "test_bypass"})
    @patch('rag_search.reranker')
    @patch('rag_search.hybrid_engine')
    @patch('rag_search.query_analyzer')
    def test_semantic_search_no_results(self, mock_analyzer, mock_hybrid, mock_reranker, mock_credit):
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

        # Mock LLM answer generation (튜플 반환: answer, response - 결과 없을 때 response는 None)
        with patch('rag_search.generate_answer_with_llm') as mock_generate:
            mock_generate.return_value = ("관련 문서를 찾을 수 없습니다.", None)

            # API 호출 (P4-2: user_id 필수)
            response = client.post(
                "/search",
                json={"query": "매우 특이한 질문", "search_mode": "semantic", "user_id": "aabbccddee1122334455ff00"}
            )

            # 검증
            assert response.status_code == 200
            data = response.json()
            assert data["answer"] == "관련 문서를 찾을 수 없습니다."
            assert data["search_results"] == []


class TestPaginationKeyword:
    """키워드 검색 페이지네이션 테스트"""

    def test_search_request_pagination_fields(self):
        """SearchRequest 모델에 페이지네이션 필드가 있어야 함"""
        request = SearchRequest(query="test", search_mode="keyword", top_k=10, offset=0)
        assert request.top_k == 10
        assert request.offset == 0

    def test_search_request_pagination_defaults(self):
        """SearchRequest 페이지네이션 기본값 테스트"""
        request = SearchRequest(query="test")
        assert request.top_k is None  # 기본값 (None = 전체 반환)
        assert request.offset == 0  # 기본값

    def test_unified_response_pagination_fields(self):
        """UnifiedSearchResponse에 페이지네이션 필드가 있어야 함"""
        response = UnifiedSearchResponse(
            search_mode="keyword",
            answer=None,
            search_results=[{"id": "1"}],
            total_count=20,
            has_more=True
        )
        assert response.total_count == 20
        assert response.has_more == True

    @patch('rag_search.requests.post')
    def test_keyword_pagination_first_page(self, mock_requests_post):
        """키워드 검색: 첫 페이지 (offset=0)"""
        # Mock - smartsearch 페이지네이션 응답 (page=1, total=20, total_pages=4)
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "results": [{"id": str(i)} for i in range(5)],
            "total": 20,
            "page": 1,
            "page_size": 5,
            "total_pages": 4
        }
        mock_response.raise_for_status = MagicMock()
        mock_requests_post.return_value = mock_response

        response = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 5, "offset": 0}
        )

        assert response.status_code == 200
        data = response.json()

        # 페이지네이션 필드 확인
        assert data["total_count"] == 20
        assert data["has_more"] == True  # page(1) < total_pages(4)
        assert len(data["search_results"]) == 5

    @patch('rag_search.requests.post')
    def test_keyword_pagination_second_page(self, mock_requests_post):
        """키워드 검색: 두 번째 페이지 (offset=5)"""
        # Mock - smartsearch 페이지네이션 응답 (page=2, total=20, total_pages=4)
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "results": [{"id": str(i)} for i in range(5, 10)],
            "total": 20,
            "page": 2,
            "page_size": 5,
            "total_pages": 4
        }
        mock_response.raise_for_status = MagicMock()
        mock_requests_post.return_value = mock_response

        response = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 5, "offset": 5}
        )

        assert response.status_code == 200
        data = response.json()

        # 페이지네이션 필드 확인
        assert data["total_count"] == 20
        assert data["has_more"] == True  # page(2) < total_pages(4)
        assert len(data["search_results"]) == 5
        # offset이 5이므로 id가 5~9여야 함
        assert data["search_results"][0]["id"] == "5"

    @patch('rag_search.requests.post')
    def test_keyword_pagination_last_page(self, mock_requests_post):
        """키워드 검색: 마지막 페이지 (offset=15)"""
        # Mock - smartsearch 페이지네이션 응답 (page=4, total=20, total_pages=4)
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "results": [{"id": str(i)} for i in range(15, 20)],
            "total": 20,
            "page": 4,
            "page_size": 5,
            "total_pages": 4
        }
        mock_response.raise_for_status = MagicMock()
        mock_requests_post.return_value = mock_response

        response = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 5, "offset": 15}
        )

        assert response.status_code == 200
        data = response.json()

        # 페이지네이션 필드 확인
        assert data["total_count"] == 20
        assert data["has_more"] == False  # page(4) < total_pages(4) = False
        assert len(data["search_results"]) == 5

    @patch('rag_search.requests.post')
    def test_keyword_pagination_exact_last(self, mock_requests_post):
        """키워드 검색: 정확히 마지막 (offset + len == total)"""
        # Mock - smartsearch 페이지네이션 응답 (page=2, total=10, total_pages=2)
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "results": [{"id": str(i)} for i in range(5, 10)],
            "total": 10,
            "page": 2,
            "page_size": 5,
            "total_pages": 2
        }
        mock_response.raise_for_status = MagicMock()
        mock_requests_post.return_value = mock_response

        response = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 5, "offset": 5}
        )

        assert response.status_code == 200
        data = response.json()

        # page(2) < total_pages(2) = False → has_more = False
        assert data["total_count"] == 10
        assert data["has_more"] == False

    @patch('rag_search.requests.post')
    def test_keyword_pagination_empty_results(self, mock_requests_post):
        """키워드 검색: 빈 결과"""
        # Mock - smartsearch 페이지네이션 응답 (빈 결과)
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "results": [],
            "total": 0,
            "page": 1,
            "page_size": 10,
            "total_pages": 0
        }
        mock_response.raise_for_status = MagicMock()
        mock_requests_post.return_value = mock_response

        response = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 10, "offset": 0}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["total_count"] == 0
        assert data["has_more"] == False  # page(1) < total_pages(0) = False
        assert len(data["search_results"]) == 0


class TestPaginationSemantic:
    """시맨틱 검색 페이지네이션 테스트"""

    @patch('rag_search.check_credit_for_rag', return_value={"allowed": True, "reason": "test_bypass"})
    @patch('rag_search.reranker')
    @patch('rag_search.hybrid_engine')
    @patch('rag_search.query_analyzer')
    def test_semantic_pagination_first_page(self, mock_analyzer, mock_hybrid, mock_reranker, mock_credit):
        """시맨틱 검색: 첫 페이지 (offset=0)"""
        # Mock query analyzer
        mock_analyzer.analyze.return_value = {
            "query_type": "concept",
            "entities": [],
            "concepts": ["test"],
            "metadata_keywords": ["test"]
        }

        # Mock hybrid search - 20개 결과 반환
        mock_hybrid.search.return_value = [
            {"doc_id": f"doc{i}", "score": 0.9 - i * 0.01, "payload": {"preview": f"내용 {i}", "original_name": f"문서{i}.pdf"}}
            for i in range(20)
        ]

        # Mock reranker - 전체 재순위화
        mock_reranker.rerank.return_value = [
            {"doc_id": f"doc{i}", "score": 0.9 - i * 0.01, "rerank_score": 0.95 - i * 0.01, "payload": {"preview": f"내용 {i}", "original_name": f"문서{i}.pdf"}}
            for i in range(20)
        ]

        with patch('rag_search.generate_answer_with_llm') as mock_generate:
            mock_generate.return_value = ("AI 답변", MagicMock())

            response = client.post(
                "/search",
                json={"query": "test", "search_mode": "semantic", "top_k": 5, "offset": 0, "user_id": "aabbccddee1122334455ff00"}
            )

            assert response.status_code == 200
            data = response.json()

            # 페이지네이션 필드 확인
            assert data["total_count"] == 20
            assert data["has_more"] == True
            assert len(data["search_results"]) == 5

    @patch('rag_search.check_credit_for_rag', return_value={"allowed": True, "reason": "test_bypass"})
    @patch('rag_search.reranker')
    @patch('rag_search.hybrid_engine')
    @patch('rag_search.query_analyzer')
    def test_semantic_pagination_second_page(self, mock_analyzer, mock_hybrid, mock_reranker, mock_credit):
        """시맨틱 검색: 두 번째 페이지 (offset=5)"""
        mock_analyzer.analyze.return_value = {
            "query_type": "concept",
            "entities": [],
            "concepts": ["test"],
            "metadata_keywords": ["test"]
        }

        mock_hybrid.search.return_value = [
            {"doc_id": f"doc{i}", "score": 0.9 - i * 0.01, "payload": {"preview": f"내용 {i}", "original_name": f"문서{i}.pdf"}}
            for i in range(20)
        ]

        mock_reranker.rerank.return_value = [
            {"doc_id": f"doc{i}", "score": 0.9 - i * 0.01, "rerank_score": 0.95 - i * 0.01, "payload": {"preview": f"내용 {i}", "original_name": f"문서{i}.pdf"}}
            for i in range(20)
        ]

        with patch('rag_search.generate_answer_with_llm') as mock_generate:
            mock_generate.return_value = ("AI 답변", MagicMock())

            response = client.post(
                "/search",
                json={"query": "test", "search_mode": "semantic", "top_k": 5, "offset": 5, "user_id": "aabbccddee1122334455ff00"}
            )

            assert response.status_code == 200
            data = response.json()

            # 페이지네이션 필드 확인
            assert data["total_count"] == 20
            assert data["has_more"] == True  # 5+5 < 20
            assert len(data["search_results"]) == 5
            # offset이 5이므로 doc_id가 doc5~doc9여야 함
            assert data["search_results"][0]["doc_id"] == "doc5"

    @patch('rag_search.check_credit_for_rag', return_value={"allowed": True, "reason": "test_bypass"})
    @patch('rag_search.reranker')
    @patch('rag_search.hybrid_engine')
    @patch('rag_search.query_analyzer')
    def test_semantic_pagination_last_page(self, mock_analyzer, mock_hybrid, mock_reranker, mock_credit):
        """시맨틱 검색: 마지막 페이지"""
        mock_analyzer.analyze.return_value = {
            "query_type": "concept",
            "entities": [],
            "concepts": ["test"],
            "metadata_keywords": ["test"]
        }

        mock_hybrid.search.return_value = [
            {"doc_id": f"doc{i}", "score": 0.9 - i * 0.01, "payload": {"preview": f"내용 {i}", "original_name": f"문서{i}.pdf"}}
            for i in range(12)
        ]

        mock_reranker.rerank.return_value = [
            {"doc_id": f"doc{i}", "score": 0.9 - i * 0.01, "rerank_score": 0.95 - i * 0.01, "payload": {"preview": f"내용 {i}", "original_name": f"문서{i}.pdf"}}
            for i in range(12)
        ]

        with patch('rag_search.generate_answer_with_llm') as mock_generate:
            mock_generate.return_value = ("AI 답변", MagicMock())

            response = client.post(
                "/search",
                json={"query": "test", "search_mode": "semantic", "top_k": 5, "offset": 10, "user_id": "aabbccddee1122334455ff00"}
            )

            assert response.status_code == 200
            data = response.json()

            # 페이지네이션 필드 확인
            assert data["total_count"] == 12
            assert data["has_more"] == False  # 10+2 >= 12
            assert len(data["search_results"]) == 2  # 남은 것 2개

    @patch('rag_search.check_credit_for_rag', return_value={"allowed": True, "reason": "test_bypass"})
    @patch('rag_search.reranker')
    @patch('rag_search.hybrid_engine')
    @patch('rag_search.query_analyzer')
    def test_semantic_pagination_no_results(self, mock_analyzer, mock_hybrid, mock_reranker, mock_credit):
        """시맨틱 검색: 결과 없음"""
        mock_analyzer.analyze.return_value = {
            "query_type": "concept",
            "entities": [],
            "concepts": ["없는검색어"],
            "metadata_keywords": ["없는검색어"]
        }

        mock_hybrid.search.return_value = []
        mock_reranker.rerank.return_value = []

        with patch('rag_search.generate_answer_with_llm') as mock_generate:
            mock_generate.return_value = ("관련 문서를 찾을 수 없습니다.", None)

            response = client.post(
                "/search",
                json={"query": "없는검색어", "search_mode": "semantic", "top_k": 10, "offset": 0, "user_id": "aabbccddee1122334455ff00"}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["total_count"] == 0
            assert data["has_more"] == False
            assert len(data["search_results"]) == 0


class TestPaginationConsistency:
    """페이지네이션 일관성 테스트"""

    @patch('rag_search.requests.post')
    def test_keyword_total_count_consistency(self, mock_requests_post):
        """키워드 검색: total_count는 페이지와 관계없이 동일"""
        # 각 페이지별 smartsearch 페이지네이션 응답 mock (total=15, total_pages=3)
        def make_mock_response(results, page):
            resp = MagicMock()
            resp.json.return_value = {
                "results": results,
                "total": 15,
                "page": page,
                "page_size": 5,
                "total_pages": 3
            }
            resp.raise_for_status = MagicMock()
            return resp

        mock_requests_post.side_effect = [
            make_mock_response([{"id": str(i)} for i in range(5)], page=1),
            make_mock_response([{"id": str(i)} for i in range(5, 10)], page=2),
            make_mock_response([{"id": str(i)} for i in range(10, 15)], page=3),
        ]

        # 첫 페이지
        response1 = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 5, "offset": 0}
        )
        # 두 번째 페이지
        response2 = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 5, "offset": 5}
        )
        # 세 번째 페이지
        response3 = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 5, "offset": 10}
        )

        data1 = response1.json()
        data2 = response2.json()
        data3 = response3.json()

        # total_count는 모두 15여야 함
        assert data1["total_count"] == 15
        assert data2["total_count"] == 15
        assert data3["total_count"] == 15

    @patch('rag_search.requests.post')
    def test_keyword_no_duplicate_results(self, mock_requests_post):
        """키워드 검색: 페이지 간 결과 중복 없음"""
        # 각 페이지별 smartsearch 페이지네이션 응답 mock (total=10, total_pages=2)
        mock_resp1 = MagicMock()
        mock_resp1.json.return_value = {
            "results": [{"id": str(i)} for i in range(5)],
            "total": 10,
            "page": 1,
            "page_size": 5,
            "total_pages": 2
        }
        mock_resp1.raise_for_status = MagicMock()

        mock_resp2 = MagicMock()
        mock_resp2.json.return_value = {
            "results": [{"id": str(i)} for i in range(5, 10)],
            "total": 10,
            "page": 2,
            "page_size": 5,
            "total_pages": 2
        }
        mock_resp2.raise_for_status = MagicMock()

        mock_requests_post.side_effect = [mock_resp1, mock_resp2]

        # 첫 페이지
        response1 = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 5, "offset": 0}
        )
        # 두 번째 페이지
        response2 = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 5, "offset": 5}
        )

        data1 = response1.json()
        data2 = response2.json()

        ids1 = {r["id"] for r in data1["search_results"]}
        ids2 = {r["id"] for r in data2["search_results"]}

        # 중복 없어야 함
        assert ids1.isdisjoint(ids2)

    @patch('rag_search.requests.post')
    def test_keyword_has_more_boundary(self, mock_requests_post):
        """키워드 검색: has_more 경계 조건"""
        # 3번 호출 각각 다른 페이지네이션 응답
        # 호출1: page=1, page_size=3, total=10, total_pages=4 → has_more=True (1<4)
        mock_resp1 = MagicMock()
        mock_resp1.json.return_value = {
            "results": [{"id": str(i)} for i in range(3)],
            "total": 10,
            "page": 1,
            "page_size": 3,
            "total_pages": 4
        }
        mock_resp1.raise_for_status = MagicMock()

        # 호출2: page=2, page_size=5, total=10, total_pages=2 → has_more=False (2<2=False)
        mock_resp2 = MagicMock()
        mock_resp2.json.return_value = {
            "results": [{"id": str(i)} for i in range(5, 10)],
            "total": 10,
            "page": 2,
            "page_size": 5,
            "total_pages": 2
        }
        mock_resp2.raise_for_status = MagicMock()

        # 호출3: page=3, page_size=5, total=10, total_pages=2 → has_more=False (3<2=False), 빈 결과
        mock_resp3 = MagicMock()
        mock_resp3.json.return_value = {
            "results": [],
            "total": 10,
            "page": 3,
            "page_size": 5,
            "total_pages": 2
        }
        mock_resp3.raise_for_status = MagicMock()

        mock_requests_post.side_effect = [mock_resp1, mock_resp2, mock_resp3]

        # page(1) < total_pages(4) → has_more = True
        response1 = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 3, "offset": 0}
        )
        assert response1.json()["has_more"] == True

        # page(2) < total_pages(2) = False → has_more = False
        response2 = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 5, "offset": 5}
        )
        assert response2.json()["has_more"] == False

        # page(3) < total_pages(2) = False → has_more = False, 빈 결과
        response3 = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "top_k": 5, "offset": 10}
        )
        assert response3.json()["has_more"] == False
        assert len(response3.json()["search_results"]) == 0


class TestSecurityP4:
    """P4 보안 강화 테스트"""

    def test_semantic_search_requires_user_id(self):
        """P4-2: semantic 검색 시 user_id가 없으면 403"""
        response = client.post(
            "/search",
            json={"query": "test query", "search_mode": "semantic"}
        )
        assert response.status_code == 403
        assert response.json()["detail"]["error"] == "user_id_required"

    def test_semantic_search_rejects_empty_user_id(self):
        """P4-2: semantic 검색 시 빈 user_id면 403"""
        response = client.post(
            "/search",
            json={"query": "test query", "search_mode": "semantic", "user_id": ""}
        )
        assert response.status_code == 403
        assert response.json()["detail"]["error"] == "user_id_required"

    def test_semantic_search_rejects_anonymous(self):
        """P4-2: semantic 검색 시 anonymous user_id면 403"""
        response = client.post(
            "/search",
            json={"query": "test query", "search_mode": "semantic", "user_id": "anonymous"}
        )
        assert response.status_code == 403
        assert response.json()["detail"]["error"] == "user_id_required"

    def test_semantic_search_rejects_invalid_user_id_format(self):
        """P4-1: 유효하지 않은 user_id 형식 거부"""
        # 너무 짧은 ID
        response = client.post(
            "/search",
            json={"query": "test query", "search_mode": "semantic", "user_id": "abc123"}
        )
        assert response.status_code == 403
        assert response.json()["detail"]["error"] == "invalid_user_id"

    def test_semantic_search_rejects_non_hex_user_id(self):
        """P4-1: 16진수가 아닌 user_id 거부"""
        response = client.post(
            "/search",
            json={"query": "test query", "search_mode": "semantic", "user_id": "zzzzzzzzzzzzzzzzzzzzzzzz"}
        )
        assert response.status_code == 403
        assert response.json()["detail"]["error"] == "invalid_user_id"

    def test_semantic_search_rejects_injection_user_id(self):
        """P4-1: SQL/NoSQL 인젝션 시도 거부"""
        response = client.post(
            "/search",
            json={"query": "test query", "search_mode": "semantic", "user_id": '{"$gt":""}'}
        )
        assert response.status_code == 403
        assert response.json()["detail"]["error"] == "invalid_user_id"

    @patch('rag_search.requests.post')
    def test_keyword_search_allows_no_user_id(self, mock_requests_post):
        """키워드 검색은 user_id 없이도 동작 (SmartSearch 프록시)"""
        mock_response = MagicMock()
        mock_response.json.return_value = [{"id": "1"}]
        mock_response.raise_for_status = MagicMock()
        mock_requests_post.return_value = mock_response

        response = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword"}
        )
        assert response.status_code == 200

    @patch('rag_search.requests.post')
    def test_keyword_search_rejects_invalid_user_id(self, mock_requests_post):
        """키워드 검색에서도 user_id가 있으면 형식 검증"""
        response = client.post(
            "/search",
            json={"query": "test", "search_mode": "keyword", "user_id": "not-valid-id"}
        )
        assert response.status_code == 403

    @patch('rag_search.check_credit_for_rag', return_value={"allowed": True, "reason": "test_bypass"})
    @patch('rag_search.reranker')
    @patch('rag_search.hybrid_engine')
    @patch('rag_search.query_analyzer')
    def test_semantic_search_accepts_valid_objectid(self, mock_analyzer, mock_hybrid, mock_reranker, mock_credit):
        """P4-1: 유효한 ObjectId 형식 user_id는 허용"""
        mock_analyzer.analyze.return_value = {
            "query_type": "concept", "entities": [], "concepts": ["test"], "metadata_keywords": ["test"]
        }
        mock_hybrid.search.return_value = []
        mock_reranker.rerank.return_value = []

        with patch('rag_search.generate_answer_with_llm') as mock_generate:
            mock_generate.return_value = ("답변", None)
            response = client.post(
                "/search",
                json={"query": "test", "search_mode": "semantic", "user_id": "69ae12aff0e011bda4cbffc3"}
            )
            assert response.status_code == 200
