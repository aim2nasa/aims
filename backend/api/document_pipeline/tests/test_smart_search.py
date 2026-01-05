"""
Tests for SmartSearch Router
Document Search Handler - Replaces n8n SmartSearch workflow

Tests cover:
- Keyword search (OR mode)
- Keyword search (AND mode)
- ID search
- Customer filter
- Empty results
- Pagination
- Error handling
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from bson import ObjectId


class TestSmartSearchKeyword:
    """키워드 검색 테스트"""

    @pytest.mark.asyncio
    async def test_keyword_search_or_mode(self, client):
        """키워드 검색 - OR 모드 (기본)"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            # Mock cursor with results
            mock_results = [
                {
                    "_id": ObjectId("507f1f77bcf86cd799439011"),
                    "ownerId": "test_user_123",
                    "upload": {"originalName": "보험계약서.pdf"},
                    "meta": {"summary": "보험 관련 문서"}
                },
                {
                    "_id": ObjectId("507f1f77bcf86cd799439012"),
                    "ownerId": "test_user_123",
                    "upload": {"originalName": "청구서.pdf"},
                    "meta": {"summary": "청구 관련 문서"}
                }
            ]

            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(return_value=mock_results)

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            response = await client.post(
                "/webhook/smartsearch",
                json={
                    "query": "보험 청구",
                    "user_id": "test_user_123",
                    "mode": "OR"
                }
            )

            assert response.status_code == 200
            data = response.json()

            assert len(data) == 2
            # ObjectId should be converted to string
            assert isinstance(data[0]["_id"], str)

    @pytest.mark.asyncio
    async def test_keyword_search_and_mode(self, client):
        """키워드 검색 - AND 모드"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            mock_results = [
                {
                    "_id": ObjectId("507f1f77bcf86cd799439013"),
                    "ownerId": "test_user_123",
                    "meta": {"full_text": "보험 청구 문서입니다"}
                }
            ]

            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(return_value=mock_results)

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            response = await client.post(
                "/webhook/smartsearch",
                json={
                    "query": "보험 청구",
                    "user_id": "test_user_123",
                    "mode": "AND"  # 모든 키워드 포함
                }
            )

            assert response.status_code == 200
            data = response.json()

            assert len(data) == 1

    @pytest.mark.asyncio
    async def test_single_keyword_search(self, client):
        """단일 키워드 검색"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            mock_results = [
                {
                    "_id": ObjectId("507f1f77bcf86cd799439014"),
                    "ownerId": "test_user_123",
                    "meta": {"full_text": "계약서 내용"}
                }
            ]

            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(return_value=mock_results)

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            response = await client.post(
                "/webhook/smartsearch",
                json={
                    "query": "계약서",
                    "user_id": "test_user_123"
                }
            )

            assert response.status_code == 200
            data = response.json()

            assert len(data) == 1


class TestSmartSearchById:
    """ID 검색 테스트"""

    @pytest.mark.asyncio
    async def test_search_by_id(self, client):
        """문서 ID로 검색"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            doc_id = "507f1f77bcf86cd799439015"
            mock_results = [
                {
                    "_id": ObjectId(doc_id),
                    "ownerId": "test_user_123",
                    "upload": {"originalName": "specific_doc.pdf"},
                    "meta": {"summary": "특정 문서"}
                }
            ]

            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(return_value=mock_results)

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            response = await client.post(
                "/webhook/smartsearch",
                json={
                    "id": doc_id,
                    "user_id": "test_user_123"
                }
            )

            assert response.status_code == 200
            data = response.json()

            assert len(data) == 1
            assert data[0]["_id"] == doc_id

    @pytest.mark.asyncio
    async def test_search_by_invalid_id(self, client):
        """잘못된 ID 형식"""
        response = await client.post(
            "/webhook/smartsearch",
            json={
                "id": "invalid_object_id",
                "user_id": "test_user_123"
            }
        )

        assert response.status_code == 200
        data = response.json()

        # Invalid ID returns empty array
        assert data == []


class TestSmartSearchWithCustomer:
    """고객 필터 테스트"""

    @pytest.mark.asyncio
    async def test_search_with_customer_id(self, client):
        """고객 ID로 필터링"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            customer_id = "507f1f77bcf86cd799439016"
            mock_results = [
                {
                    "_id": ObjectId("507f1f77bcf86cd799439017"),
                    "ownerId": "test_user_123",
                    "customerId": ObjectId(customer_id),
                    "meta": {"summary": "고객 문서"}
                }
            ]

            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(return_value=mock_results)

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            response = await client.post(
                "/webhook/smartsearch",
                json={
                    "query": "문서",
                    "user_id": "test_user_123",
                    "customer_id": customer_id
                }
            )

            assert response.status_code == 200
            data = response.json()

            assert len(data) == 1
            # customerId should be converted to string
            assert data[0]["customerId"] == customer_id

    @pytest.mark.asyncio
    async def test_search_id_with_customer_filter(self, client):
        """ID 검색 + 고객 필터"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            doc_id = "507f1f77bcf86cd799439018"
            customer_id = "507f1f77bcf86cd799439019"

            mock_results = [
                {
                    "_id": ObjectId(doc_id),
                    "ownerId": "test_user_123",
                    "customerId": ObjectId(customer_id),
                    "meta": {"summary": "특정 고객의 특정 문서"}
                }
            ]

            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(return_value=mock_results)

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            response = await client.post(
                "/webhook/smartsearch",
                json={
                    "id": doc_id,
                    "user_id": "test_user_123",
                    "customer_id": customer_id
                }
            )

            assert response.status_code == 200
            data = response.json()

            assert len(data) == 1


class TestSmartSearchEmpty:
    """빈 결과 테스트"""

    @pytest.mark.asyncio
    async def test_no_query_returns_empty(self, client):
        """쿼리 없으면 빈 결과"""
        response = await client.post(
            "/webhook/smartsearch",
            json={
                "query": "",
                "user_id": "test_user_123"
            }
        )

        assert response.status_code == 200
        data = response.json()

        assert data == []

    @pytest.mark.asyncio
    async def test_whitespace_only_query(self, client):
        """공백만 있는 쿼리"""
        response = await client.post(
            "/webhook/smartsearch",
            json={
                "query": "   ",
                "user_id": "test_user_123"
            }
        )

        assert response.status_code == 200
        data = response.json()

        assert data == []

    @pytest.mark.asyncio
    async def test_no_matching_results(self, client):
        """매칭 결과 없음"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(return_value=[])  # No results

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            response = await client.post(
                "/webhook/smartsearch",
                json={
                    "query": "존재하지않는키워드",
                    "user_id": "test_user_123"
                }
            )

            assert response.status_code == 200
            data = response.json()

            assert data == []


class TestSmartSearchQueryBuilding:
    """쿼리 생성 검증 테스트"""

    @pytest.mark.asyncio
    async def test_or_mode_query_structure(self, client):
        """OR 모드 쿼리 구조 검증"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(return_value=[])

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            await client.post(
                "/webhook/smartsearch",
                json={
                    "query": "보험 계약",
                    "user_id": "test_user_123",
                    "mode": "OR"
                }
            )

            # Verify find was called
            mock_collection.find.assert_called_once()

            # Get the query that was passed
            call_args = mock_collection.find.call_args
            query = call_args[0][0]

            # OR 모드: $and 안에 $or가 있어야 함
            assert "$and" in query
            conditions = query["$and"]

            # ownerId 조건 확인
            owner_condition = next((c for c in conditions if "ownerId" in c), None)
            assert owner_condition is not None
            assert owner_condition["ownerId"] == "test_user_123"

    @pytest.mark.asyncio
    async def test_and_mode_query_structure(self, client):
        """AND 모드 쿼리 구조 검증"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(return_value=[])

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            await client.post(
                "/webhook/smartsearch",
                json={
                    "query": "보험 계약 청구",
                    "user_id": "test_user_123",
                    "mode": "AND"
                }
            )

            mock_collection.find.assert_called_once()
            call_args = mock_collection.find.call_args
            query = call_args[0][0]

            # AND 모드: 각 키워드마다 $or 조건
            assert "$and" in query


class TestSmartSearchErrors:
    """에러 처리 테스트"""

    @pytest.mark.asyncio
    async def test_mongodb_error(self, client):
        """MongoDB 오류 처리"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            mock_collection = MagicMock()
            mock_collection.find.side_effect = Exception("MongoDB connection error")
            mock_mongo.get_collection.return_value = mock_collection

            response = await client.post(
                "/webhook/smartsearch",
                json={
                    "query": "테스트",
                    "user_id": "test_user_123"
                }
            )

            assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_regex_special_characters(self, client):
        """정규식 특수문자 처리"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(return_value=[])

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            # 정규식 특수문자가 포함된 검색어
            response = await client.post(
                "/webhook/smartsearch",
                json={
                    "query": "test.*+?()[]{}",
                    "user_id": "test_user_123"
                }
            )

            # 에러 없이 처리되어야 함 (특수문자 이스케이프)
            assert response.status_code == 200


class TestSmartSearchResponseFormat:
    """응답 형식 테스트"""

    @pytest.mark.asyncio
    async def test_objectid_conversion(self, client):
        """ObjectId -> String 변환 확인"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            doc_id = ObjectId()
            customer_id = ObjectId()

            mock_results = [
                {
                    "_id": doc_id,
                    "ownerId": "test_user_123",
                    "customerId": customer_id,
                    "meta": {"summary": "테스트"}
                }
            ]

            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(return_value=mock_results)

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            response = await client.post(
                "/webhook/smartsearch",
                json={
                    "query": "테스트",
                    "user_id": "test_user_123"
                }
            )

            assert response.status_code == 200
            data = response.json()

            # ObjectId가 문자열로 변환되어야 함
            assert data[0]["_id"] == str(doc_id)
            assert data[0]["customerId"] == str(customer_id)

    @pytest.mark.asyncio
    async def test_result_limit(self, client):
        """결과 수 제한 (100개)"""
        with patch("routers.smart_search.MongoService") as mock_mongo:

            # 100개 이상의 결과
            mock_results = [
                {
                    "_id": ObjectId(),
                    "ownerId": "test_user_123",
                    "meta": {"summary": f"문서 {i}"}
                }
                for i in range(150)
            ]

            mock_cursor = MagicMock()
            # to_list(length=100)으로 제한됨
            mock_cursor.to_list = AsyncMock(return_value=mock_results[:100])

            mock_collection = MagicMock()
            mock_collection.find.return_value = mock_cursor
            mock_mongo.get_collection.return_value = mock_collection

            response = await client.post(
                "/webhook/smartsearch",
                json={
                    "query": "문서",
                    "user_id": "test_user_123"
                }
            )

            assert response.status_code == 200
            data = response.json()

            # 최대 100개로 제한
            assert len(data) <= 100
