"""
Internal API 클라이언트 regression 테스트

대상: services/internal_api.py
- get_customer_name: 단건 고객명 조회
- get_customer_names_batch: 배치 고객명+타입 조회
"""
import unittest
from unittest.mock import patch, AsyncMock, MagicMock
import httpx


class TestGetCustomerName(unittest.IsolatedAsyncioTestCase):
    """get_customer_name 단건 조회 테스트"""

    def _mock_settings(self):
        """공통 settings mock 생성"""
        settings = MagicMock()
        settings.AIMS_API_URL = "http://test:3010"
        settings.INTERNAL_API_KEY = "test-key"
        return settings

    @patch("services.internal_api.get_settings")
    @patch("services.internal_api.httpx.AsyncClient")
    async def test_성공_고객명_반환(self, mock_client_cls, mock_get_settings):
        """200 + success=true → 고객명 반환"""
        mock_get_settings.return_value = self._mock_settings()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "success": True,
            "data": {"name": "홍길동", "customerType": "individual"}
        }
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_cls.return_value = mock_client

        from services.internal_api import get_customer_name
        result = await get_customer_name("customer123")

        self.assertEqual(result, "홍길동")
        mock_client.get.assert_called_once()
        call_args = mock_client.get.call_args
        self.assertIn("customer123", call_args[0][0])
        self.assertEqual(call_args[1]["headers"]["x-api-key"], "test-key")

    @patch("services.internal_api.get_settings")
    @patch("services.internal_api.httpx.AsyncClient")
    async def test_500_응답시_None_반환(self, mock_client_cls, mock_get_settings):
        """500 응답 → None 반환"""
        mock_get_settings.return_value = self._mock_settings()

        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_cls.return_value = mock_client

        from services.internal_api import get_customer_name
        result = await get_customer_name("customer123")

        self.assertIsNone(result)

    @patch("services.internal_api.get_settings")
    @patch("services.internal_api.httpx.AsyncClient")
    async def test_타임아웃시_None_반환(self, mock_client_cls, mock_get_settings):
        """httpx.TimeoutException → None 반환"""
        mock_get_settings.return_value = self._mock_settings()

        mock_client = AsyncMock()
        mock_client.get.side_effect = httpx.TimeoutException("timeout")
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_cls.return_value = mock_client

        from services.internal_api import get_customer_name
        result = await get_customer_name("customer123")

        self.assertIsNone(result)

    @patch("services.internal_api.get_settings")
    @patch("services.internal_api.httpx.AsyncClient")
    async def test_연결_오류시_None_반환(self, mock_client_cls, mock_get_settings):
        """httpx.ConnectError → None 반환"""
        mock_get_settings.return_value = self._mock_settings()

        mock_client = AsyncMock()
        mock_client.get.side_effect = httpx.ConnectError("connection refused")
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_cls.return_value = mock_client

        from services.internal_api import get_customer_name
        result = await get_customer_name("customer123")

        self.assertIsNone(result)

    @patch("services.internal_api.get_settings")
    @patch("services.internal_api.httpx.AsyncClient")
    async def test_data_null일때_None_반환(self, mock_client_cls, mock_get_settings):
        """200 + success=true + data=null → None 반환"""
        mock_get_settings.return_value = self._mock_settings()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "success": True,
            "data": None
        }
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_cls.return_value = mock_client

        from services.internal_api import get_customer_name
        result = await get_customer_name("customer123")

        self.assertIsNone(result)


class TestGetCustomerNamesBatch(unittest.IsolatedAsyncioTestCase):
    """get_customer_names_batch 배치 조회 테스트"""

    def _mock_settings(self):
        """공통 settings mock 생성"""
        settings = MagicMock()
        settings.AIMS_API_URL = "http://test:3010"
        settings.INTERNAL_API_KEY = "test-key"
        return settings

    @patch("services.internal_api.get_settings")
    @patch("services.internal_api.httpx.AsyncClient")
    async def test_성공_배치_조회(self, mock_client_cls, mock_get_settings):
        """200 + success=true → names/types dict 반환"""
        mock_get_settings.return_value = self._mock_settings()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "success": True,
            "data": {
                "names": {"id1": "홍길동", "id2": "김철수"},
                "types": {"id1": "individual", "id2": "corporate"}
            }
        }
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_cls.return_value = mock_client

        from services.internal_api import get_customer_names_batch
        result = await get_customer_names_batch(["id1", "id2"])

        self.assertEqual(result["names"]["id1"], "홍길동")
        self.assertEqual(result["names"]["id2"], "김철수")
        self.assertEqual(result["types"]["id1"], "individual")
        mock_client.post.assert_called_once()

    @patch("services.internal_api.get_settings")
    @patch("services.internal_api.httpx.AsyncClient")
    async def test_빈_목록_전달(self, mock_client_cls, mock_get_settings):
        """빈 리스트 전달 → 정상 호출 (서버에서 빈 dict 반환)"""
        mock_get_settings.return_value = self._mock_settings()

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "success": True,
            "data": {"names": {}, "types": {}}
        }
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_cls.return_value = mock_client

        from services.internal_api import get_customer_names_batch
        result = await get_customer_names_batch([])

        self.assertEqual(result["names"], {})
        self.assertEqual(result["types"], {})

    @patch("services.internal_api.get_settings")
    @patch("services.internal_api.httpx.AsyncClient")
    async def test_500_응답시_빈_dict_반환(self, mock_client_cls, mock_get_settings):
        """500 응답 → {"names": {}, "types": {}} 반환"""
        mock_get_settings.return_value = self._mock_settings()

        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_cls.return_value = mock_client

        from services.internal_api import get_customer_names_batch
        result = await get_customer_names_batch(["id1"])

        self.assertEqual(result, {"names": {}, "types": {}})

    @patch("services.internal_api.get_settings")
    @patch("services.internal_api.httpx.AsyncClient")
    async def test_네트워크_오류시_빈_dict_반환(self, mock_client_cls, mock_get_settings):
        """네트워크 오류 → {"names": {}, "types": {}} 반환"""
        mock_get_settings.return_value = self._mock_settings()

        mock_client = AsyncMock()
        mock_client.post.side_effect = httpx.ConnectError("connection refused")
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client_cls.return_value = mock_client

        from services.internal_api import get_customer_names_batch
        result = await get_customer_names_batch(["id1"])

        self.assertEqual(result, {"names": {}, "types": {}})


if __name__ == "__main__":
    unittest.main()
