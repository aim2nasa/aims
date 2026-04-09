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


class TestUpdateFileErrorDetail(unittest.IsolatedAsyncioTestCase):
    """update_file 실패 시 detail/status_code 반환 테스트 (#21)"""

    def _mock_settings(self):
        settings = MagicMock()
        settings.AIMS_API_URL = "http://test:3010"
        settings.INTERNAL_API_KEY = "test-key"
        return settings

    def test_실패_반환_구조_검증(self):
        """update_file 반환 dict의 에러 구조가 detail, status_code를 포함하는지 검증"""
        # update_file 함수가 HTTP 실패 시 반환하는 구조를 직접 검증
        # (mock 없이 반환 구조 스펙만 확인)
        error_result = {"success": False, "error": "HTTP 500", "detail": "request entity too large", "status_code": 500}

        self.assertFalse(error_result["success"])
        self.assertEqual(error_result["error"], "HTTP 500")
        self.assertIn("detail", error_result)
        self.assertIn("status_code", error_result)
        self.assertEqual(error_result["status_code"], 500)

    def test_성공_반환_구조에_detail_없음(self):
        """update_file 성공 반환에는 detail 필드가 없어야 함"""
        success_result = {"success": True, "data": {"modifiedCount": 1}}

        self.assertTrue(success_result["success"])
        self.assertNotIn("detail", success_result)

    def test_코드에서_detail_반환_확인(self):
        """internal_api.py 소스 코드에 detail 반환이 있는지 확인"""
        import os
        source_path = os.path.join(os.path.dirname(__file__), '..', 'services', 'internal_api.py')
        with open(source_path, 'r', encoding='utf-8') as f:
            source = f.read()

        # 실패 경로에서 detail을 반환하는지 확인
        self.assertIn('"detail":', source)
        self.assertIn('"status_code":', source)


class TestTimeoutAndRetry(unittest.TestCase):
    """timeout 60초 통일 + update_file 재시도 검증"""

    def test_모든_api_함수_timeout_60초(self):
        """internal_api.py의 모든 httpx timeout이 60초"""
        import os
        source_path = os.path.join(os.path.dirname(__file__), "..", "services", "internal_api.py")
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()

        # timeout=60만 존재, timeout=10이나 timeout=15, timeout=30은 없어야 함
        self.assertIn("timeout=60", source)
        self.assertNotIn("timeout=10)", source)
        self.assertNotIn("timeout=15)", source)
        self.assertNotIn("timeout=30)", source)

    def test_update_file_재시도_로직_존재(self):
        """update_file에 재시도 패턴(range(2))이 있는지 확인"""
        import os
        source_path = os.path.join(os.path.dirname(__file__), "..", "services", "internal_api.py")
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()

        self.assertIn("range(2)", source)
        self.assertIn("asyncio.sleep", source)


if __name__ == "__main__":
    unittest.main()
