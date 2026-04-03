# test_hybrid_search.py
"""
하이브리드 검색 시스템 단위 테스트

테스트 케이스:
1. 개체명 쿼리 (entity): "곽승철에 대해서"
2. 개념 쿼리 (concept): "USB Firmware 개발"
3. 혼합 쿼리 (mixed): "곽승철의 USB 개발 경험"
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from hybrid_search import HybridSearchEngine


class TestQueryAnalyzer:
    """쿼리 분석기 테스트"""

    @patch('query_analyzer.OpenAI')
    def test_entity_query(self, mock_openai):
        """개체명 쿼리 테스트"""
        # Mock OpenAI response
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content='{"query_type": "entity", "entities": ["곽승철"], "concepts": [], "metadata_keywords": ["곽승철"]}'))]
        mock_client.chat.completions.create.return_value = mock_response

        from query_analyzer import QueryAnalyzer
        analyzer = QueryAnalyzer()
        query = "곽승철에 대해서"
        result = analyzer.analyze(query)

        assert result["query_type"] == "entity"
        assert "곽승철" in result["entities"]
        assert len(result["metadata_keywords"]) > 0
        print(f"✅ 개체명 쿼리 테스트 통과: {result}")

    @patch('query_analyzer.OpenAI')
    def test_concept_query(self, mock_openai):
        """개념 쿼리 테스트"""
        # Mock OpenAI response
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content='{"query_type": "concept", "entities": [], "concepts": ["USB", "Firmware", "드라이버", "소프트웨어", "개발"], "metadata_keywords": ["USB", "Firmware", "드라이버", "소프트웨어", "개발"]}'))]
        mock_client.chat.completions.create.return_value = mock_response

        from query_analyzer import QueryAnalyzer
        analyzer = QueryAnalyzer()
        query = "USB Firmware 드라이버 소프트웨어 개발"
        result = analyzer.analyze(query)

        assert result["query_type"] == "concept"
        assert len(result["concepts"]) > 0
        assert "USB" in result["metadata_keywords"] or "USB" in result["concepts"]
        print(f"✅ 개념 쿼리 테스트 통과: {result}")

    @patch('query_analyzer.OpenAI')
    def test_mixed_query(self, mock_openai):
        """혼합 쿼리 테스트"""
        # Mock OpenAI response
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content='{"query_type": "mixed", "entities": ["김보성"], "concepts": ["보험", "계약", "정보"], "metadata_keywords": ["김보성", "보험", "계약", "정보"]}'))]
        mock_client.chat.completions.create.return_value = mock_response

        from query_analyzer import QueryAnalyzer
        analyzer = QueryAnalyzer()
        query = "김보성님의 보험 계약 정보"
        result = analyzer.analyze(query)

        assert result["query_type"] in ["mixed", "entity"]  # mixed 또는 entity 모두 허용
        assert len(result["metadata_keywords"]) > 0
        print(f"✅ 혼합 쿼리 테스트 통과: {result}")

    @patch('query_analyzer.OpenAI')
    def test_error_handling(self, mock_openai):
        """오류 처리 테스트"""
        # Mock OpenAI response - 빈 쿼리도 처리
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content='{"query_type": "concept", "entities": [], "concepts": [], "metadata_keywords": []}'))]
        mock_client.chat.completions.create.return_value = mock_response

        from query_analyzer import QueryAnalyzer
        analyzer = QueryAnalyzer()
        query = ""
        result = analyzer.analyze(query)

        # 빈 쿼리도 기본 concept으로 처리되어야 함
        assert result["query_type"] is not None
        print(f"✅ 오류 처리 테스트 통과: {result}")


class TestResolveCustomerFromEntities:
    """고객명 자동 매칭 테스트 (정확 매칭 + 부분 매칭)"""

    def _make_engine(self):
        """Mock된 HybridSearchEngine 생성 (Internal API 방식)"""
        with patch('hybrid_search.QdrantClient'), \
             patch('hybrid_search.OpenAI'):
            engine = HybridSearchEngine.__new__(HybridSearchEngine)
            engine.aims_api_url = "http://localhost:3010"
            engine.internal_api_key = "test-key"
            engine.qdrant_client = MagicMock()
            engine.openai_client = MagicMock()
            engine.last_embedding_response = None
            return engine

    def test_exact_match_priority(self):
        """정확 매칭이 우선되어야 함"""
        from bson import ObjectId
        customer_id = str(ObjectId())

        engine = self._make_engine()

        # _api_post mock: 정확 매칭 시 customerId 반환
        def mock_api_post(path, body):
            if path == "/internal/customers/resolve-by-name" and body.get("mode") == "exact":
                return {"customerId": customer_id}
            return None

        with patch.object(engine, '_api_post', side_effect=mock_api_post) as mock_api:
            result = engine.resolve_customer_from_entities(["캐치업코리아"], "user1")

            assert result == customer_id
            # 정확 매칭 성공 시 1번만 호출 (부분 매칭 호출 없음)
            assert mock_api.call_count == 1
            print("✅ 정확 매칭 우선 테스트 통과")

    def test_partial_match_single_result(self):
        """부분 매칭: 1건 → 자동 매칭"""
        from bson import ObjectId
        customer_id = str(ObjectId())

        engine = self._make_engine()

        def mock_api_post(path, body):
            if path == "/internal/customers/resolve-by-name":
                if body.get("mode") == "exact":
                    return {"customerId": None}  # 정확 매칭 실패
                elif body.get("mode") == "partial":
                    return {"candidates": [{"customerId": customer_id, "customerName": "캐치업코리아"}]}
            return None

        with patch.object(engine, '_api_post', side_effect=mock_api_post):
            result = engine.resolve_customer_from_entities(["캐치업"], "user1")

            assert result == customer_id
            print("✅ 부분 매칭 단건 테스트 통과")

    def test_partial_match_multiple_results_no_match(self):
        """부분 매칭: 2건 이상 → 매칭 안 함"""
        from bson import ObjectId

        engine = self._make_engine()

        def mock_api_post(path, body):
            if path == "/internal/customers/resolve-by-name":
                if body.get("mode") == "exact":
                    return {"customerId": None}
                elif body.get("mode") == "partial":
                    return {"candidates": [
                        {"customerId": str(ObjectId()), "customerName": "이승준"},
                        {"customerId": str(ObjectId()), "customerName": "이승호"}
                    ]}
            return None

        with patch.object(engine, '_api_post', side_effect=mock_api_post):
            result = engine.resolve_customer_from_entities(["이승"], "user1")

            assert result is None
            print("✅ 부분 매칭 다건 미매칭 테스트 통과")

    def test_partial_match_min_length(self):
        """1글자 엔터티는 부분 매칭 스킵"""
        engine = self._make_engine()

        def mock_api_post(path, body):
            if path == "/internal/customers/resolve-by-name":
                if body.get("mode") == "exact":
                    return {"customerId": None}
            return None

        with patch.object(engine, '_api_post', side_effect=mock_api_post) as mock_api:
            result = engine.resolve_customer_from_entities(["김"], "user1")

            assert result is None
            # exact 1번 호출, partial은 호출되지 않아야 함 (1글자이므로)
            calls = [c for c in mock_api.call_args_list if c[0][1].get("mode") == "partial"]
            assert len(calls) == 0
            print("✅ 1글자 부분 매칭 스킵 테스트 통과")

    def test_user_id_isolation(self):
        """부분 매칭에서도 user_id 격리 필터 유지"""
        engine = self._make_engine()

        def mock_api_post(path, body):
            if path == "/internal/customers/resolve-by-name":
                if body.get("mode") == "exact":
                    return {"customerId": None}
                elif body.get("mode") == "partial":
                    return {"candidates": []}
            return None

        with patch.object(engine, '_api_post', side_effect=mock_api_post) as mock_api:
            engine.resolve_customer_from_entities(["캐치업"], "user1")

            # partial 호출 시 userId가 전달되어야 함
            partial_calls = [c for c in mock_api.call_args_list if c[0][1].get("mode") == "partial"]
            assert len(partial_calls) == 1
            assert partial_calls[0][0][1]["userId"] == "user1"
            print("✅ 부분 매칭 user_id 격리 테스트 통과")

    def test_empty_entities(self):
        """빈 엔터티 리스트 → None 반환"""
        engine = self._make_engine()

        assert engine.resolve_customer_from_entities([], "user1") is None
        assert engine.resolve_customer_from_entities(None, "user1") is None
        print("✅ 빈 엔터티 테스트 통과")


class TestGetCustomerRelationships:
    """고객 관계 조회 테스트 (소유자 격리 포함)"""

    def _make_engine(self):
        """Mock된 HybridSearchEngine 생성 (Internal API 방식)"""
        with patch('hybrid_search.QdrantClient'), \
             patch('hybrid_search.OpenAI'):
            engine = HybridSearchEngine.__new__(HybridSearchEngine)
            engine.aims_api_url = "http://localhost:3010"
            engine.internal_api_key = "test-key"
            engine.qdrant_client = MagicMock()
            engine.openai_client = MagicMock()
            engine.last_embedding_response = None
            return engine

    def test_owner_isolation_in_relationships(self):
        """관계 조회 시 userId 필터가 Internal API로 전달 확인"""
        from bson import ObjectId
        cust_id = str(ObjectId())

        engine = self._make_engine()

        def mock_api_post(path, body):
            if path == "/internal/relationships/by-customer":
                # userId가 전달되었는지 확인
                assert body.get("userId") == "user1"
                return []  # 관계 없음
            elif path == "/internal/customers/batch-names":
                return {"names": {cust_id: "캐치업코리아"}}
            return None

        with patch.object(engine, '_api_post', side_effect=mock_api_post) as mock_api:
            engine.get_customer_relationships(cust_id, "user1")

            # /internal/relationships/by-customer 호출 시 userId 포함 확인
            rel_calls = [c for c in mock_api.call_args_list if c[0][0] == "/internal/relationships/by-customer"]
            assert len(rel_calls) == 1
            assert rel_calls[0][0][1]["userId"] == "user1"
            print("✅ 관계 조회 소유자 격리 테스트 통과")


# 실제 검색 테스트는 MongoDB, Qdrant 연결이 필요하므로
# 통합 테스트로 별도 진행 (서버 배포 후 테스트)

if __name__ == '__main__':
    # pytest 실행
    pytest.main([__file__, "-v", "-s"])
