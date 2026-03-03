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

    def _make_engine(self, mock_mongo, mock_qdrant, mock_openai):
        """Mock된 HybridSearchEngine 생성"""
        with patch('hybrid_search.MongoClient') as mc, \
             patch('hybrid_search.QdrantClient') as qc, \
             patch('hybrid_search.OpenAI') as oc:
            mc.return_value.__getitem__ = Mock(return_value=mock_mongo)
            engine = HybridSearchEngine.__new__(HybridSearchEngine)
            engine.mongo_client = mc.return_value
            engine.db = mock_mongo
            engine.collection = mock_mongo["files"]
            engine.qdrant_client = mock_qdrant
            engine.openai_client = mock_openai
            engine.last_embedding_response = None
            return engine

    def test_exact_match_priority(self):
        """정확 매칭이 우선되어야 함"""
        mock_db = MagicMock()
        mock_coll = MagicMock()
        mock_db.__getitem__ = Mock(return_value=mock_coll)

        # 정확 매칭 성공
        from bson import ObjectId
        customer_id = ObjectId()
        mock_coll.find_one.return_value = {"_id": customer_id, "personal_info": {"name": "캐치업코리아"}}

        engine = self._make_engine(mock_db, MagicMock(), MagicMock())
        result = engine.resolve_customer_from_entities(["캐치업코리아"], "user1")

        assert result == str(customer_id)
        # find_one이 호출되었고 find(부분 매칭)는 호출되지 않아야 함
        mock_coll.find_one.assert_called_once()
        mock_coll.find.assert_not_called()
        print("✅ 정확 매칭 우선 테스트 통과")

    def test_partial_match_single_result(self):
        """부분 매칭: 1건 → 자동 매칭"""
        mock_db = MagicMock()
        mock_coll = MagicMock()
        mock_db.__getitem__ = Mock(return_value=mock_coll)

        from bson import ObjectId
        customer_id = ObjectId()

        # 정확 매칭 실패
        mock_coll.find_one.return_value = None
        # 부분 매칭: 1건 발견
        mock_cursor = MagicMock()
        mock_cursor.limit.return_value = [{"_id": customer_id, "personal_info": {"name": "캐치업코리아"}}]
        mock_coll.find.return_value = mock_cursor

        engine = self._make_engine(mock_db, MagicMock(), MagicMock())
        result = engine.resolve_customer_from_entities(["캐치업"], "user1")

        assert result == str(customer_id)
        print("✅ 부분 매칭 단건 테스트 통과")

    def test_partial_match_multiple_results_no_match(self):
        """부분 매칭: 2건 이상 → 매칭 안 함"""
        mock_db = MagicMock()
        mock_coll = MagicMock()
        mock_db.__getitem__ = Mock(return_value=mock_coll)

        from bson import ObjectId

        # 정확 매칭 실패
        mock_coll.find_one.return_value = None
        # 부분 매칭: 2건 발견 (모호함)
        mock_cursor = MagicMock()
        mock_cursor.limit.return_value = [
            {"_id": ObjectId(), "personal_info": {"name": "이승준"}},
            {"_id": ObjectId(), "personal_info": {"name": "이승호"}}
        ]
        mock_coll.find.return_value = mock_cursor

        engine = self._make_engine(mock_db, MagicMock(), MagicMock())
        result = engine.resolve_customer_from_entities(["이승"], "user1")

        assert result is None
        print("✅ 부분 매칭 다건 미매칭 테스트 통과")

    def test_partial_match_min_length(self):
        """1글자 엔터티는 부분 매칭 스킵"""
        mock_db = MagicMock()
        mock_coll = MagicMock()
        mock_db.__getitem__ = Mock(return_value=mock_coll)

        # 정확 매칭 실패
        mock_coll.find_one.return_value = None

        engine = self._make_engine(mock_db, MagicMock(), MagicMock())
        result = engine.resolve_customer_from_entities(["김"], "user1")

        assert result is None
        # find(부분 매칭)가 호출되지 않아야 함
        mock_coll.find.assert_not_called()
        print("✅ 1글자 부분 매칭 스킵 테스트 통과")

    def test_user_id_isolation(self):
        """부분 매칭에서도 user_id 격리 필터 유지"""
        mock_db = MagicMock()
        mock_coll = MagicMock()
        mock_db.__getitem__ = Mock(return_value=mock_coll)

        # 정확 매칭 실패
        mock_coll.find_one.return_value = None
        # 부분 매칭 호출 시 빈 결과
        mock_cursor = MagicMock()
        mock_cursor.limit.return_value = []
        mock_coll.find.return_value = mock_cursor

        engine = self._make_engine(mock_db, MagicMock(), MagicMock())
        engine.resolve_customer_from_entities(["캐치업"], "user1")

        # find 호출 시 meta.created_by 필터가 포함되어야 함
        call_args = mock_coll.find.call_args
        query_filter = call_args[0][0]
        assert query_filter["meta.created_by"] == "user1"
        assert query_filter["meta.status"] == "active"
        print("✅ 부분 매칭 user_id 격리 테스트 통과")

    def test_empty_entities(self):
        """빈 엔터티 리스트 → None 반환"""
        mock_db = MagicMock()
        engine = self._make_engine(mock_db, MagicMock(), MagicMock())

        assert engine.resolve_customer_from_entities([], "user1") is None
        assert engine.resolve_customer_from_entities(None, "user1") is None
        print("✅ 빈 엔터티 테스트 통과")


class TestGetCustomerRelationships:
    """고객 관계 조회 테스트 (소유자 격리 포함)"""

    def _make_engine(self, mock_db):
        """Mock된 HybridSearchEngine 생성"""
        with patch('hybrid_search.MongoClient'), \
             patch('hybrid_search.QdrantClient'), \
             patch('hybrid_search.OpenAI'):
            engine = HybridSearchEngine.__new__(HybridSearchEngine)
            engine.db = mock_db
            engine.collection = mock_db["files"]
            engine.last_embedding_response = None
            return engine

    def test_owner_isolation_in_relationships(self):
        """관계 조회 시 meta.created_by 필터 포함 확인"""
        mock_db = MagicMock()
        mock_rel_coll = MagicMock()
        mock_cust_coll = MagicMock()

        def getitem(name):
            if name == "customer_relationships":
                return mock_rel_coll
            return mock_cust_coll

        mock_db.__getitem__ = Mock(side_effect=getitem)

        from bson import ObjectId
        cust_id = str(ObjectId())

        mock_cust_coll.find_one.return_value = {"_id": ObjectId(cust_id), "personal_info": {"name": "캐치업코리아"}}
        mock_rel_coll.find.return_value = []  # 관계 없음

        engine = self._make_engine(mock_db)
        engine.get_customer_relationships(cust_id, "user1")

        # customer_relationships 쿼리에 meta.created_by가 포함되어야 함
        call_args = mock_rel_coll.find.call_args
        query_filter = call_args[0][0]
        assert query_filter.get("meta.created_by") == "user1"
        print("✅ 관계 조회 소유자 격리 테스트 통과")


# 실제 검색 테스트는 MongoDB, Qdrant 연결이 필요하므로
# 통합 테스트로 별도 진행 (서버 배포 후 테스트)

if __name__ == '__main__':
    # pytest 실행
    pytest.main([__file__, "-v", "-s"])
