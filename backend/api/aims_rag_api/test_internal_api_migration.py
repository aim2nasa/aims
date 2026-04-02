"""
Internal API 마이그레이션 Regression 테스트

hybrid_search.py의 5개 메서드가 MongoDB 직접 접근에서
Internal HTTP API 호출로 전환된 후의 동작을 검증합니다.

테스트 항목:
1. _api_post 헬퍼: 성공/실패/타임아웃
2. _entity_search: filter 구조, customerId 처리, score 계산
3. resolve_customer_from_entities: exact/partial 매칭 우선순위
4. get_customer_relationships: 양방향 중복 제거, reverse_map, batch-names
5. _resolve_customer_doc_ids: 단일/복수 고객 filter 구조
6. _api_post 실패 시 graceful degradation
"""

import sys
import unittest
from unittest.mock import patch, MagicMock, PropertyMock

# ── 의존성 stub 주입 ──────────────────────────────────────────
# hybrid_search.py 가 import 하는 외부 모듈(qdrant_client, openai, system_logger)이
# 로컬 테스트 환경에 없을 수 있으므로, sys.modules에 가짜 모듈을 주입한다.
# 이렇게 하면 "from qdrant_client import QdrantClient, models" 등이
# 실제 패키지 없이도 성공한다.

_mock_qdrant = MagicMock()
_mock_openai = MagicMock()
_mock_logger = MagicMock()

sys.modules.setdefault("qdrant_client", _mock_qdrant)
sys.modules.setdefault("openai", _mock_openai)
sys.modules.setdefault("system_logger", _mock_logger)

# 이제 hybrid_search를 안전하게 import
from hybrid_search import HybridSearchEngine


def _make_engine():
    """mock된 의존성으로 HybridSearchEngine 인스턴스 생성"""
    with patch("hybrid_search.QdrantClient"), \
         patch("hybrid_search.OpenAI"):
        return HybridSearchEngine()


def _ok_response(data):
    """성공 응답 mock 생성 헬퍼"""
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {"success": True, "data": data}
    return resp


def _fail_response(status=500):
    """실패 응답 mock 생성 헬퍼"""
    resp = MagicMock()
    resp.status_code = status
    resp.text = "Server Error"
    return resp


# ═══════════════════════════════════════════════════════════════
# 1. _api_post 헬퍼
# ═══════════════════════════════════════════════════════════════
class TestApiPostHelper(unittest.TestCase):
    """_api_post 헬퍼 메서드 테스트"""

    def setUp(self):
        self.engine = _make_engine()

    @patch("hybrid_search.requests.post")
    def test_success_returns_data(self, mock_post):
        """성공 시 data 필드를 반환한다"""
        mock_post.return_value = _ok_response([{"_id": "doc1"}])

        result = self.engine._api_post("/internal/files/query", {"filter": {}})

        self.assertEqual(result, [{"_id": "doc1"}])
        mock_post.assert_called_once()

    @patch("hybrid_search.requests.post")
    def test_url_structure(self, mock_post):
        """URL이 aims_api_url + /api + path 구조로 구성된다"""
        mock_post.return_value = _ok_response([])

        self.engine._api_post("/internal/test/path", {})

        call_url = mock_post.call_args[0][0] if mock_post.call_args[0] else mock_post.call_args[1].get("url", "")
        self.assertTrue(call_url.endswith("/api/internal/test/path"))

    @patch("hybrid_search.requests.post")
    def test_http_error_returns_none(self, mock_post):
        """HTTP 500 시 None을 반환한다"""
        mock_post.return_value = _fail_response(500)

        result = self.engine._api_post("/internal/files/query", {"filter": {}})

        self.assertIsNone(result)

    @patch("hybrid_search.requests.post")
    def test_success_false_returns_none(self, mock_post):
        """success=False 시 None을 반환한다"""
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"success": False, "error": "bad request"}
        resp.text = '{"success": false}'
        mock_post.return_value = resp

        result = self.engine._api_post("/internal/files/query", {"filter": {}})

        self.assertIsNone(result)

    @patch("hybrid_search.requests.post")
    def test_timeout_returns_none(self, mock_post):
        """타임아웃 예외 시 None을 반환한다"""
        mock_post.side_effect = Exception("Connection timed out")

        result = self.engine._api_post("/internal/files/query", {"filter": {}})

        self.assertIsNone(result)

    @patch("hybrid_search.requests.post")
    def test_connection_error_returns_none(self, mock_post):
        """연결 오류 시 None을 반환한다"""
        mock_post.side_effect = ConnectionError("Connection refused")

        result = self.engine._api_post("/internal/files/query", {"filter": {}})

        self.assertIsNone(result)

    @patch("hybrid_search.requests.post")
    def test_headers_include_api_key(self, mock_post):
        """요청에 x-api-key, Content-Type 헤더가 포함된다"""
        self.engine.internal_api_key = "test-key-123"
        mock_post.return_value = _ok_response([])

        self.engine._api_post("/internal/test", {"foo": "bar"})

        headers = mock_post.call_args[1].get("headers", {})
        self.assertEqual(headers.get("x-api-key"), "test-key-123")
        self.assertEqual(headers.get("Content-Type"), "application/json")


# ═══════════════════════════════════════════════════════════════
# 2. _entity_search
# ═══════════════════════════════════════════════════════════════
class TestEntitySearch(unittest.TestCase):
    """_entity_search: filter 구조, customerId 처리, score 계산"""

    def setUp(self):
        self.engine = _make_engine()

    @patch("hybrid_search.requests.post")
    def test_basic_search_returns_results(self, mock_post):
        """기본 entity 검색: 결과를 반환하고 score가 0~1 범위이다"""
        mock_post.return_value = _ok_response([
            {
                "_id": "doc1",
                "upload": {"originalName": "곽승철_보험증권.pdf", "mimeType": "application/pdf", "uploaded_at": "2026-01-01"},
                "meta": {"full_text": "곽승철 님의 보험 증권입니다", "tags": ["보험"], "summary": "보험증권"},
                "ocr": {"tags": [], "summary": ""}
            }
        ])

        query_intent = {"query_type": "entity", "entities": ["곽승철"], "metadata_keywords": ["곽승철"]}
        results = self.engine._entity_search(query_intent, "user1", None, 5)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["doc_id"], "doc1")
        # Sigmoid 정규화 → 0~1 범위
        self.assertGreater(results[0]["score"], 0)
        self.assertLessEqual(results[0]["score"], 1.0)

    @patch("hybrid_search.requests.post")
    def test_single_customer_filter(self, mock_post):
        """단일 고객: customerId가 filter에 직접 값으로 포함된다"""
        mock_post.return_value = _ok_response([])

        query_intent = {"query_type": "entity", "entities": ["보험"], "metadata_keywords": ["보험"]}
        self.engine._entity_search(query_intent, "user1", ["cust1"], 5)

        call_body = mock_post.call_args[1]["json"]
        self.assertEqual(call_body["filter"]["customerId"], "cust1")

    @patch("hybrid_search.requests.post")
    def test_multiple_customer_filter_uses_in(self, mock_post):
        """복수 고객: $in 연산자가 사용된다"""
        mock_post.return_value = _ok_response([])

        query_intent = {"query_type": "entity", "entities": ["보험"], "metadata_keywords": ["보험"]}
        self.engine._entity_search(query_intent, "user1", ["cust1", "cust2"], 5)

        call_body = mock_post.call_args[1]["json"]
        self.assertEqual(call_body["filter"]["customerId"], {"$in": ["cust1", "cust2"]})

    @patch("hybrid_search.requests.post")
    def test_empty_entities_returns_empty(self, mock_post):
        """entities가 비어있으면 API 호출 없이 빈 결과를 반환한다"""
        query_intent = {"query_type": "entity", "entities": [], "metadata_keywords": []}
        results = self.engine._entity_search(query_intent, "user1", None, 5)

        self.assertEqual(results, [])
        mock_post.assert_not_called()

    @patch("hybrid_search.requests.post")
    def test_results_sorted_by_score_desc(self, mock_post):
        """검색 결과는 score 내림차순으로 정렬된다"""
        mock_post.return_value = _ok_response([
            {
                "_id": "doc_low",
                "upload": {"originalName": "기타문서.pdf", "mimeType": "application/pdf"},
                "meta": {"full_text": "보험 관련", "tags": [], "summary": ""},
                "ocr": {"tags": [], "summary": ""}
            },
            {
                "_id": "doc_high",
                "upload": {"originalName": "보험_증권.pdf", "mimeType": "application/pdf"},
                "meta": {"full_text": "보험 보험 보험 보험 보험", "tags": ["보험"], "summary": "보험증권"},
                "ocr": {"tags": ["보험"], "summary": "보험 요약"}
            }
        ])

        query_intent = {"query_type": "entity", "entities": ["보험"], "metadata_keywords": ["보험"]}
        results = self.engine._entity_search(query_intent, "user1", None, 5)

        self.assertEqual(len(results), 2)
        self.assertGreaterEqual(results[0]["score"], results[1]["score"])


# ═══════════════════════════════════════════════════════════════
# 3. resolve_customer_from_entities
# ═══════════════════════════════════════════════════════════════
class TestResolveCustomerFromEntities(unittest.TestCase):
    """exact/partial 매칭 우선순위, 단건 확정 로직"""

    def setUp(self):
        self.engine = _make_engine()

    @patch("hybrid_search.requests.post")
    def test_exact_match_priority(self, mock_post):
        """정확 매칭이 부분 매칭보다 우선한다"""
        mock_post.return_value = _ok_response({"customerId": "exact-cust-id"})

        result = self.engine.resolve_customer_from_entities(["곽승철"], "user1")

        self.assertEqual(result, "exact-cust-id")
        # exact 모드로 호출되었는지 확인
        first_call_body = mock_post.call_args_list[0][1]["json"]
        self.assertEqual(first_call_body["mode"], "exact")

    @patch("hybrid_search.requests.post")
    def test_partial_match_fallback(self, mock_post):
        """정확 매칭 실패 시 부분 매칭으로 fallback, 단건일 때 확정"""
        # exact: 매칭 없음
        exact_resp = _ok_response({"customerId": None})
        # partial: 단건 매칭
        partial_resp = _ok_response({
            "candidates": [{"customerId": "partial-cust-id", "customerName": "곽승철"}]
        })
        mock_post.side_effect = [exact_resp, partial_resp]

        result = self.engine.resolve_customer_from_entities(["곽승"], "user1")

        self.assertEqual(result, "partial-cust-id")

    @patch("hybrid_search.requests.post")
    def test_partial_match_multiple_candidates_returns_none(self, mock_post):
        """부분 매칭 결과가 2건 이상이면 None (모호함 방지)"""
        exact_resp = _ok_response({"customerId": None})
        partial_resp = _ok_response({
            "candidates": [
                {"customerId": "cust1", "customerName": "곽승철"},
                {"customerId": "cust2", "customerName": "곽승민"}
            ]
        })
        mock_post.side_effect = [exact_resp, partial_resp]

        result = self.engine.resolve_customer_from_entities(["곽승"], "user1")

        self.assertIsNone(result)

    @patch("hybrid_search.requests.post")
    def test_short_entity_skips_partial(self, mock_post):
        """1글자 엔터티는 부분 매칭을 건너뛴다"""
        mock_post.return_value = _ok_response({"customerId": None})

        result = self.engine.resolve_customer_from_entities(["곽"], "user1")

        self.assertIsNone(result)
        # exact 1회만 호출 (partial 건너뜀)
        self.assertEqual(mock_post.call_count, 1)

    @patch("hybrid_search.requests.post")
    def test_empty_entities_returns_none(self, mock_post):
        """빈 엔터티 리스트는 API 호출 없이 None"""
        result = self.engine.resolve_customer_from_entities([], "user1")

        self.assertIsNone(result)
        mock_post.assert_not_called()


# ═══════════════════════════════════════════════════════════════
# 4. get_customer_relationships
# ═══════════════════════════════════════════════════════════════
class TestGetCustomerRelationships(unittest.TestCase):
    """양방향 관계 중복 제거, reverse_map 적용, batch-names 호출"""

    def setUp(self):
        self.engine = _make_engine()

    @patch("hybrid_search.requests.post")
    def test_basic_relationship_lookup(self, mock_post):
        """기본 관계 조회: 이름, 타입, 카테고리가 올바르게 매핑된다"""
        # 1차: relationships/by-customer
        rel_resp = _ok_response([
            {
                "_id": "rel1",
                "relationship_info": {
                    "from_customer_id": "cust_main",
                    "to_customer_id": "cust_spouse",
                    "relationship_type": "spouse",
                    "relationship_category": "family"
                },
                "meta": {}
            }
        ])
        # 2차: customers/batch-names
        names_resp = _ok_response({"names": {"cust_main": "곽승철", "cust_spouse": "김영희"}})
        mock_post.side_effect = [rel_resp, names_resp]

        result = self.engine.get_customer_relationships("cust_main", "user1")

        self.assertEqual(result["customer_name"], "곽승철")
        self.assertEqual(len(result["relationships"]), 1)
        self.assertEqual(result["relationships"][0]["name"], "김영희")
        self.assertEqual(result["relationships"][0]["type"], "배우자")
        self.assertEqual(result["relationships"][0]["category"], "family")
        self.assertIn("cust_spouse", result["related_customer_ids"])

    @patch("hybrid_search.requests.post")
    def test_reverse_relationship_type(self, mock_post):
        """역방향 관계: reverse_map이 적용되어 올바른 라벨이 표시된다"""
        # cust_child가 기준 → parent 레코드의 역방향 = child("자녀")
        rel_resp = _ok_response([
            {
                "_id": "rel1",
                "relationship_info": {
                    "from_customer_id": "cust_parent",
                    "to_customer_id": "cust_child",
                    "relationship_type": "parent",
                    "relationship_category": "family"
                },
                "meta": {}
            }
        ])
        names_resp = _ok_response({"names": {"cust_child": "곽지민", "cust_parent": "곽승철"}})
        mock_post.side_effect = [rel_resp, names_resp]

        result = self.engine.get_customer_relationships("cust_child", "user1")

        self.assertEqual(result["customer_name"], "곽지민")
        self.assertEqual(result["relationships"][0]["type"], "자녀")
        self.assertEqual(result["relationships"][0]["name"], "곽승철")

    @patch("hybrid_search.requests.post")
    def test_bidirectional_duplicate_removal(self, mock_post):
        """양방향 레코드 중복 제거: 같은 상대방은 한 번만"""
        rel_resp = _ok_response([
            {
                "_id": "rel1",
                "relationship_info": {
                    "from_customer_id": "cust_a", "to_customer_id": "cust_b",
                    "relationship_type": "spouse", "relationship_category": "family"
                },
                "meta": {}
            },
            {
                "_id": "rel2",
                "relationship_info": {
                    "from_customer_id": "cust_b", "to_customer_id": "cust_a",
                    "relationship_type": "spouse", "relationship_category": "family"
                },
                "meta": {}
            }
        ])
        names_resp = _ok_response({"names": {"cust_a": "곽승철", "cust_b": "김영희"}})
        mock_post.side_effect = [rel_resp, names_resp]

        result = self.engine.get_customer_relationships("cust_a", "user1")

        self.assertEqual(len(result["relationships"]), 1)
        self.assertEqual(result["relationships"][0]["name"], "김영희")

    @patch("hybrid_search.requests.post")
    def test_empty_relationships(self, mock_post):
        """관계 없는 고객: 빈 relationships와 customer_name만 반환"""
        rel_resp = _ok_response([])
        names_resp = _ok_response({"names": {"cust_alone": "홍길동"}})
        mock_post.side_effect = [rel_resp, names_resp]

        result = self.engine.get_customer_relationships("cust_alone", "user1")

        self.assertEqual(result["customer_name"], "홍길동")
        self.assertEqual(result["relationships"], [])
        self.assertEqual(result["related_customer_ids"], [])


# ═══════════════════════════════════════════════════════════════
# 5. _resolve_customer_doc_ids
# ═══════════════════════════════════════════════════════════════
class TestResolveCustomerDocIds(unittest.TestCase):
    """단일/복수 고객 filter 구조"""

    def setUp(self):
        self.engine = _make_engine()

    @patch("hybrid_search.requests.post")
    def test_single_customer_filter(self, mock_post):
        """단일 고객: customerId가 직접 값으로 설정된다"""
        mock_post.return_value = _ok_response([{"_id": "doc1"}, {"_id": "doc2"}])

        result = self.engine._resolve_customer_doc_ids("user1", ["cust1"])

        self.assertEqual(result, ["doc1", "doc2"])
        call_body = mock_post.call_args[1]["json"]
        self.assertEqual(call_body["filter"]["customerId"], "cust1")
        self.assertEqual(call_body["filter"]["ownerId"], "user1")

    @patch("hybrid_search.requests.post")
    def test_multiple_customer_filter_uses_in(self, mock_post):
        """복수 고객: $in 연산자가 사용된다"""
        mock_post.return_value = _ok_response([{"_id": "doc1"}, {"_id": "doc2"}, {"_id": "doc3"}])

        result = self.engine._resolve_customer_doc_ids("user1", ["cust1", "cust2"])

        self.assertEqual(result, ["doc1", "doc2", "doc3"])
        call_body = mock_post.call_args[1]["json"]
        self.assertEqual(call_body["filter"]["customerId"], {"$in": ["cust1", "cust2"]})

    @patch("hybrid_search.requests.post")
    def test_projection_includes_id_only(self, mock_post):
        """projection에 _id만 포함되어 최소 데이터만 전송한다"""
        mock_post.return_value = _ok_response([])

        self.engine._resolve_customer_doc_ids("user1", ["cust1"])

        call_body = mock_post.call_args[1]["json"]
        self.assertEqual(call_body["projection"], {"_id": 1})

    @patch("hybrid_search.requests.post")
    def test_api_failure_returns_empty(self, mock_post):
        """API 실패 시 빈 리스트를 반환한다"""
        mock_post.return_value = _fail_response(500)

        result = self.engine._resolve_customer_doc_ids("user1", ["cust1"])

        self.assertEqual(result, [])


# ═══════════════════════════════════════════════════════════════
# 6. Graceful Degradation (_api_post 실패 시)
# ═══════════════════════════════════════════════════════════════
class TestGracefulDegradation(unittest.TestCase):
    """_api_post 실패(None) 시 각 메서드가 빈 결과를 반환"""

    def setUp(self):
        self.engine = _make_engine()

    @patch("hybrid_search.requests.post")
    def test_entity_search_api_failure(self, mock_post):
        """_entity_search: API 실패 → 빈 리스트"""
        mock_post.return_value = _fail_response()

        query_intent = {"query_type": "entity", "entities": ["곽승철"], "metadata_keywords": ["곽승철"]}
        results = self.engine._entity_search(query_intent, "user1", None, 5)

        self.assertEqual(results, [])

    @patch("hybrid_search.requests.post")
    def test_resolve_customer_api_failure(self, mock_post):
        """resolve_customer_from_entities: API 실패 → None"""
        mock_post.return_value = _fail_response()

        result = self.engine.resolve_customer_from_entities(["곽승철"], "user1")

        self.assertIsNone(result)

    @patch("hybrid_search.requests.post")
    def test_get_relationships_api_failure(self, mock_post):
        """get_customer_relationships: API 실패 → 빈 결과 구조"""
        mock_post.return_value = _fail_response()

        result = self.engine.get_customer_relationships("cust1", "user1")

        self.assertEqual(result["customer_name"], "")
        self.assertEqual(result["relationships"], [])
        self.assertEqual(result["related_customer_ids"], [])

    @patch("hybrid_search.requests.post")
    def test_resolve_doc_ids_api_failure(self, mock_post):
        """_resolve_customer_doc_ids: API 실패 → 빈 리스트"""
        mock_post.return_value = _fail_response()

        result = self.engine._resolve_customer_doc_ids("user1", ["cust1"])

        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()
