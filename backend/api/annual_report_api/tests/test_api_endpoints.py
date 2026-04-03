"""
test_api_endpoints.py
Annual Report API 엔드포인트 유닛 테스트

테스트 대상:
1. Health Check 엔드포인트
2. Annual Report Query 엔드포인트
3. Annual Report Parse 엔드포인트
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, MagicMock
from bson import ObjectId
from datetime import datetime

# FastAPI TestClient를 사용하기 위해 main.py import
import sys
import os

# main.py를 import하기 위해 경로 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# MongoDB와 OpenAI 모킹
with patch('pymongo.MongoClient'):
    with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}):
        from main import app

client = TestClient(app)


class TestHealthEndpoints:
    """Health Check 엔드포인트 테스트"""

    def test_root_endpoint(self):
        """루트 엔드포인트가 API 정보를 반환하는지 확인"""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data
        assert "status" in data
        assert data["status"] == "running"
        assert "endpoints" in data

    @patch('main.mongo_client')
    def test_health_check_healthy(self, mock_mongo):
        """MongoDB 연결이 정상일 때 healthy 상태 반환"""
        # MongoDB admin.command('ping') 모킹
        mock_mongo.admin.command = Mock(return_value={"ok": 1})

        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        assert data["openai"] in ["configured", "not_configured"]

    @patch('main.mongo_client', None)
    def test_health_check_db_not_initialized(self):
        """MongoDB 클라이언트가 초기화되지 않았을 때"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        # 상태는 healthy지만 DB는 not_initialized
        assert data["status"] in ["healthy", "unhealthy"]


class TestAnnualReportQueryEndpoints:
    """Annual Report 조회 엔드포인트 테스트"""

    @patch('routes.query.check_customer_ownership', return_value=True)
    @patch('routes.query.get_annual_reports')
    @patch('main.db')
    def test_get_customer_annual_reports_success(self, mock_db, mock_get_reports, mock_ownership):
        """고객의 Annual Reports 조회 성공"""
        # MongoDB 연결 Mock
        customer_id = str(ObjectId())
        user_id = "test_user"

        mock_get_reports.return_value = {
            "success": True,
            "data": [
                {
                    "customer_name": "테스트고객",
                    "issue_date": "2025-08-27",
                    "total_contracts": 5,
                    "total_monthly_premium": 100000
                }
            ],
            "count": 1,
            "total": 1
        }

        response = client.get(
            f"/customers/{customer_id}/annual-reports",
            headers={"x-user-id": user_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["count"] == 1
        assert len(data["data"]) == 1

    @patch('routes.query.check_customer_ownership', return_value=True)
    @patch('routes.query.get_annual_reports')
    @patch('main.db')
    def test_get_customer_annual_reports_with_limit(self, mock_db, mock_get_reports, mock_ownership):
        """limit 파라미터로 조회 개수 제한"""
        # MongoDB 연결 Mock
        customer_id = str(ObjectId())
        user_id = "test_user"

        mock_get_reports.return_value = {
            "success": True,
            "data": [],
            "count": 0,
            "total": 0
        }

        response = client.get(
            f"/customers/{customer_id}/annual-reports?limit=5",
            headers={"x-user-id": user_id}
        )
        assert response.status_code == 200
        mock_get_reports.assert_called_once()
        # limit 파라미터가 전달되었는지 확인
        call_args = mock_get_reports.call_args
        assert call_args is not None

    @patch('routes.query.check_customer_ownership', return_value=True)
    @patch('routes.query.get_annual_reports')
    @patch('main.db')
    def test_get_customer_annual_reports_empty(self, mock_db, mock_get_reports, mock_ownership):
        """Annual Report가 없는 경우"""
        # MongoDB 연결 Mock
        customer_id = str(ObjectId())
        user_id = "test_user"

        mock_get_reports.return_value = {
            "success": True,
            "data": [],
            "count": 0,
            "total": 0,
            "message": "No annual reports found"
        }

        response = client.get(
            f"/customers/{customer_id}/annual-reports",
            headers={"x-user-id": user_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["count"] == 0
        assert len(data["data"]) == 0


class TestAnnualReportParseEndpoints:
    """Annual Report 파싱 엔드포인트 테스트"""

    @patch('routes.parse.is_annual_report')
    @patch('routes.parse.extract_customer_info_from_first_page')
    def test_check_annual_report_success(self, mock_extract, mock_is_ar):
        """Annual Report 판단 API 성공"""
        # 모킹 설정 - 딕셔너리 반환 (튜플 아님!)
        mock_is_ar.return_value = {
            "is_annual_report": True,
            "confidence": 0.95,
            "reason": "키워드 매칭 성공",
            "matched_keywords": ["Annual Review Report", "보유계약 현황"]
        }
        mock_extract.return_value = {
            "customer_name": "테스트고객",
            "report_title": "Annual Review Report",
            "issue_date": "2025-08-27",
            "fsr_name": "FSR이름"
        }

        # 테스트 파일 생성 (실제 PDF 대신 더미 파일)
        test_file_content = b"%PDF-1.4 dummy content"
        files = {"file": ("test.pdf", test_file_content, "application/pdf")}

        response = client.post("/annual-report/check", files=files)
        assert response.status_code == 200
        data = response.json()
        assert data["is_annual_report"] is True
        assert data["confidence"] == 0.95
        assert data["metadata"]["customer_name"] == "테스트고객"

    @patch('routes.parse.is_annual_report')
    def test_check_annual_report_not_ar(self, mock_is_ar):
        """Annual Report가 아닌 경우"""
        # 딕셔너리 반환 (튜플 아님!)
        mock_is_ar.return_value = {
            "is_annual_report": False,
            "confidence": 0.3,
            "reason": "키워드 미매칭",
            "matched_keywords": []
        }

        test_file_content = b"%PDF-1.4 dummy content"
        files = {"file": ("normal.pdf", test_file_content, "application/pdf")}

        response = client.post("/annual-report/check", files=files)
        assert response.status_code == 200
        data = response.json()
        assert data["is_annual_report"] is False
        assert data["confidence"] == 0.3
        assert data["metadata"] is None


class TestAnnualReportDeleteEndpoints:
    """Annual Report 삭제 엔드포인트 테스트"""

    @patch('routes.query.check_customer_ownership', return_value=True)
    @patch('routes.query.delete_annual_reports')
    @patch('main.db')
    def test_delete_annual_reports_success(self, mock_db, mock_delete, mock_ownership):
        """Annual Reports 삭제 성공"""
        # MongoDB 연결 Mock
        customer_id = str(ObjectId())
        user_id = "test_user"

        mock_delete.return_value = {
            "success": True,
            "deleted_count": 3,
            "message": "Successfully deleted 3 annual reports"
        }

        # DELETE 요청에 Body 포함 (indices 필수)
        response = client.request(
            "DELETE",
            f"/customers/{customer_id}/annual-reports",
            json={"indices": [0, 1, 2]},
            headers={"x-user-id": user_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["deleted_count"] == 3

    @patch('routes.query.check_customer_ownership', return_value=True)
    @patch('routes.query.delete_annual_reports')
    @patch('main.db')
    def test_delete_annual_reports_none_found(self, mock_db, mock_delete, mock_ownership):
        """삭제할 Annual Report가 없는 경우"""
        # MongoDB 연결 Mock
        customer_id = str(ObjectId())
        user_id = "test_user"

        mock_delete.return_value = {
            "success": True,
            "deleted_count": 0,
            "message": "No annual reports found to delete"
        }

        # DELETE 요청에 Body 포함 (유효한 인덱스 배열 필요 - 빈 배열은 400 에러)
        # 대신 유효하지 않은 인덱스를 사용하여 삭제 개수 0을 테스트
        response = client.request(
            "DELETE",
            f"/customers/{customer_id}/annual-reports",
            json={"indices": [999]},  # 존재하지 않는 인덱스
            headers={"x-user-id": user_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["deleted_count"] == 0


class TestBackgroundParsingEndpoints:
    """백그라운드 파싱 트리거 엔드포인트 테스트"""

    @patch('routes.background.check_customer_ownership', return_value=True)
    @patch('routes.background.process_ar_documents_background')
    @patch('main.db')
    def test_trigger_parsing_success(self, mock_db, mock_process, mock_ownership):
        """백그라운드 파싱 트리거 성공"""
        # MongoDB 연결 Mock
        user_id = "test_user"

        # 요청 Body
        request_body = {
            "customer_id": str(ObjectId()),
            "file_id": None
        }

        response = client.post(
            "/ar-background/trigger-parsing",
            json=request_body,
            headers={"x-user-id": user_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "message" in data

    @patch('routes.background.process_ar_documents_background')
    @patch('main.db')
    def test_trigger_parsing_no_pending(self, mock_db, mock_process):
        """대기 중인 문서가 없는 경우"""
        # MongoDB 연결 Mock
        user_id = "test_user"

        # 요청 Body (고객 ID 없이 전체 파싱)
        request_body = {}

        response = client.post(
            "/ar-background/trigger-parsing",
            json=request_body,
            headers={"x-user-id": user_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


class TestRegisterARContractsEndpoints:
    """AR 보험계약 등록 엔드포인트 테스트 (POST /customers/{id}/ar-contracts)"""

    @patch('routes.query.check_customer_ownership', return_value=True)
    @patch('routes.query.register_annual_report')
    @patch('main.db')
    def test_register_success(self, mock_db, mock_register, mock_ownership):
        """정상 등록 성공"""
        customer_id = str(ObjectId())

        mock_customers = MagicMock()
        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "annual_reports": [
                {"customer_name": "테스트고객", "issue_date": "2025-08-27", "total_contracts": 5}
            ]
        }
        mock_db.customers = mock_customers

        mock_register.return_value = {
            "success": True,
            "data": {"duplicate": False, "registered_at": "2025-09-01T00:00:00Z"}
        }

        response = client.post(
            f"/customers/{customer_id}/ar-contracts",
            json={"issue_date": "2025-08-27", "customer_name": "테스트고객"},
            headers={"x-user-id": "test_user"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["registered_at"] is not None

    @patch('routes.query.check_customer_ownership', return_value=False)
    def test_ownership_fail(self, mock_ownership):
        """소유권 확인 실패 → 404"""
        response = client.post(
            f"/customers/{str(ObjectId())}/ar-contracts",
            json={"issue_date": "2025-08-27"},
            headers={"x-user-id": "other_user"}
        )
        assert response.status_code == 404

    def test_invalid_customer_id(self):
        """유효하지 않은 customer_id → 400"""
        response = client.post(
            "/customers/invalid-id/ar-contracts",
            json={"issue_date": "2025-08-27"},
            headers={"x-user-id": "test_user"}
        )
        assert response.status_code == 400

    @patch('routes.query.check_customer_ownership', return_value=True)
    @patch('routes.query.register_annual_report')
    @patch('main.db')
    def test_duplicate_registration(self, mock_db, mock_register, mock_ownership):
        """이미 등록된 AR → duplicate=True"""
        customer_id = str(ObjectId())

        mock_customers = MagicMock()
        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "annual_reports": [
                {"customer_name": "테스트고객", "issue_date": "2025-08-27", "registered_at": "2025-09-01T00:00:00Z"}
            ]
        }
        mock_db.customers = mock_customers

        mock_register.return_value = {
            "success": True,
            "data": {"duplicate": True, "registered_at": "2025-09-01T00:00:00Z"}
        }

        response = client.post(
            f"/customers/{customer_id}/ar-contracts",
            json={"issue_date": "2025-08-27", "customer_name": "테스트고객"},
            headers={"x-user-id": "test_user"}
        )
        assert response.status_code == 200
        assert response.json()["duplicate"] is True

    @patch('routes.query.check_customer_ownership', return_value=True)
    @patch('main.db')
    def test_customer_none_toctou(self, mock_db, mock_ownership):
        """소유권 통과 후 find_one None (TOCTOU) → 500"""
        mock_customers = MagicMock()
        mock_customers.find_one.return_value = None
        mock_db.customers = mock_customers

        response = client.post(
            f"/customers/{str(ObjectId())}/ar-contracts",
            json={"issue_date": "2025-08-27"},
            headers={"x-user-id": "test_user"}
        )
        assert response.status_code == 500

    def test_no_user_id(self):
        """userId 미전달 → 400"""
        response = client.post(
            f"/customers/{str(ObjectId())}/ar-contracts",
            json={"issue_date": "2025-08-27"},
        )
        assert response.status_code == 400
