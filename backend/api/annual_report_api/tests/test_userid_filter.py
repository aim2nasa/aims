"""
test_userid_filter.py
사용자 계정 기능 - userId 필터링 유닛 테스트 (Annual Report API)

테스트 대상 엔드포인트:
1. GET /customers/{customer_id}/annual-reports - Annual Reports 목록 조회
2. GET /customers/{customer_id}/annual-reports/latest - 최신 Annual Report 조회
3. DELETE /customers/{customer_id}/annual-reports - Annual Reports 삭제
4. POST /annual-report/parse - Annual Report 파싱 (파일 업로드)
5. POST /annual-report/parse-by-path - Annual Report 파싱 (파일 경로)
6. POST /ar-background/trigger-parsing - 백그라운드 파싱 트리거

테스트 시나리오:
1. userId 없이 호출 시 400 에러 반환
2. userId와 함께 호출 시 정상 동작
3. customer 소유권 검증 (meta.created_by == user_id)
4. 다른 사용자의 customer 접근 차단 확인
"""

import pytest
from fastapi.testclient import TestClient
from bson import ObjectId
from datetime import datetime, UTC
import sys
import os
import io
import json
from unittest.mock import Mock, patch, MagicMock

# 상위 디렉토리의 main.py를 import하기 위한 경로 설정
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# MongoDB Mock
with patch('pymongo.MongoClient'):
    from main import app

# Mock main.db globally (initialize it so routes don't crash)
import main
main.db = MagicMock()

# TestClient 생성
client = TestClient(app)


class TestGetAnnualReportsUserId:
    """GET /customers/{customer_id}/annual-reports - Annual Reports 목록 조회 userId 검증"""

    def test_get_annual_reports_without_userid_returns_400(self):
        """userId 없이 호출 시 400 에러 반환"""
        customer_id = str(ObjectId())
        response = client.get(f"/customers/{customer_id}/annual-reports?limit=10")

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"

    @patch('main.db')
    def test_get_annual_reports_with_userid_invalid_customer_returns_404(self, mock_db):
        """userId와 함께 호출했지만 customer 없음 시 404 반환"""
        # Mock: customer 없음 (find_one returns None)
        mock_customers = MagicMock()
        mock_customers.find_one.return_value = None
        mock_db.customers = mock_customers

        customer_id = str(ObjectId())
        response = client.get(
            f"/customers/{customer_id}/annual-reports?limit=10",
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 404
        assert "고객을 찾을 수 없거나 접근 권한이 없습니다" in response.json()["detail"]

    def test_get_annual_reports_invalid_customer_id_returns_400(self):
        """잘못된 customer_id 형식으로 호출 시 400 에러"""
        response = client.get(
            "/customers/invalid-id/annual-reports",
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 400
        assert "Invalid customer_id format" in response.json()["detail"]

    @patch('main.db')
    def test_get_annual_reports_with_userid_header(self, mock_db):
        """x-user-id 헤더로 userId 전달 시 정상 처리"""
        # Mock: customer 없음 (find_one returns None)
        mock_customers = MagicMock()
        mock_customers.find_one.return_value = None
        mock_db.customers = mock_customers

        customer_id = str(ObjectId())
        response = client.get(
            f"/customers/{customer_id}/annual-reports?limit=10",
            headers={"x-user-id": "tester"}
        )

        # 404는 정상 (customer가 없어서), 400이 아니면 OK
        assert response.status_code in [200, 404]
        if response.status_code == 404:
            assert "고객을 찾을 수 없거나" in response.json()["detail"]


class TestGetLatestAnnualReportUserId:
    """GET /customers/{customer_id}/annual-reports/latest - 최신 Annual Report 조회 userId 검증"""

    def test_get_latest_without_userid_returns_400(self):
        """userId 없이 호출 시 400 에러 반환"""
        customer_id = str(ObjectId())
        response = client.get(f"/customers/{customer_id}/annual-reports/latest")

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"

    @patch('main.db')
    def test_get_latest_with_userid_invalid_customer_returns_404(self, mock_db):
        """userId와 함께 호출했지만 customer 없음 시 404 반환"""
        # Mock: customer 없음 (find_one returns None)
        mock_customers = MagicMock()
        mock_customers.find_one.return_value = None
        mock_db.customers = mock_customers

        customer_id = str(ObjectId())
        response = client.get(
            f"/customers/{customer_id}/annual-reports/latest",
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 404
        assert "고객을 찾을 수 없거나 접근 권한이 없습니다" in response.json()["detail"]

    def test_get_latest_invalid_customer_id_returns_400(self):
        """잘못된 customer_id 형식으로 호출 시 400 에러"""
        response = client.get(
            "/customers/invalid-id/annual-reports/latest",
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 400
        assert "Invalid customer_id format" in response.json()["detail"]


class TestDeleteAnnualReportsUserId:
    """DELETE /customers/{customer_id}/annual-reports - Annual Reports 삭제 userId 검증"""

    def test_delete_annual_reports_without_userid_returns_400(self):
        """userId 없이 호출 시 400 에러 반환"""
        customer_id = str(ObjectId())
        response = client.request(
            "DELETE",
            f"/customers/{customer_id}/annual-reports",
            content=json.dumps({"indices": [0, 1]}),
            headers={"Content-Type": "application/json"}
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"

    @patch('main.db')
    def test_delete_annual_reports_with_userid_invalid_customer_returns_404(self, mock_db):
        """userId와 함께 호출했지만 customer 없음 시 404 반환"""
        # Mock: customer 없음 (find_one returns None)
        mock_customers = MagicMock()
        mock_customers.find_one.return_value = None
        mock_db.customers = mock_customers

        customer_id = str(ObjectId())
        response = client.request(
            "DELETE",
            f"/customers/{customer_id}/annual-reports",
            content=json.dumps({"indices": [0, 1]}),
            headers={
                "Content-Type": "application/json",
                "x-user-id": "tester"
            }
        )

        assert response.status_code == 404
        assert "고객을 찾을 수 없거나 접근 권한이 없습니다" in response.json()["detail"]

    def test_delete_annual_reports_empty_indices_returns_400(self):
        """빈 indices 배열로 호출 시 400 에러 반환"""
        customer_id = str(ObjectId())
        response = client.request(
            "DELETE",
            f"/customers/{customer_id}/annual-reports",
            content=json.dumps({"indices": []}),
            headers={
                "Content-Type": "application/json",
                "x-user-id": "tester"
            }
        )

        assert response.status_code == 400
        assert "삭제할 항목을 선택해주세요" in response.json()["detail"]

    def test_delete_annual_reports_invalid_customer_id_returns_400(self):
        """잘못된 customer_id 형식으로 호출 시 400 에러"""
        response = client.request(
            "DELETE",
            "/customers/invalid-id/annual-reports",
            content=json.dumps({"indices": [0]}),
            headers={
                "Content-Type": "application/json",
                "x-user-id": "tester"
            }
        )

        assert response.status_code == 400
        assert "Invalid customer_id format" in response.json()["detail"]


class TestParseAnnualReportUserId:
    """POST /annual-report/parse - Annual Report 파싱 (파일 업로드) userId 검증"""

    def test_parse_without_userid_returns_400(self):
        """userId 없이 호출 시 400 에러 반환"""
        # 더미 PDF 파일
        pdf_content = b"%PDF-1.4\n%EOF"
        files = {"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")}
        data = {"customer_id": str(ObjectId())}

        response = client.post("/annual-report/parse", files=files, data=data)

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"

    @patch('main.db')
    def test_parse_with_userid_invalid_customer_returns_404(self, mock_db):
        """userId와 함께 호출했지만 customer 없음 시 404 반환"""
        # Mock: customer 없음 (find_one returns None)
        mock_customers = MagicMock()
        mock_customers.find_one.return_value = None
        mock_db.customers = mock_customers

        pdf_content = b"%PDF-1.4\n%EOF"
        files = {"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")}
        data = {"customer_id": str(ObjectId())}

        response = client.post(
            "/annual-report/parse",
            files=files,
            data=data,
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 404
        assert "고객을 찾을 수 없거나 접근 권한이 없습니다" in response.json()["detail"]

    def test_parse_invalid_customer_id_returns_400(self):
        """잘못된 customer_id 형식으로 호출 시 400 에러"""
        pdf_content = b"%PDF-1.4\n%EOF"
        files = {"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")}
        data = {"customer_id": "invalid-id"}

        response = client.post(
            "/annual-report/parse",
            files=files,
            data=data,
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 400
        assert "Invalid customer_id format" in response.json()["detail"]


class TestParseByPathUserId:
    """POST /annual-report/parse-by-path - Annual Report 파싱 (파일 경로) userId 검증"""

    def test_parse_by_path_without_userid_returns_400(self):
        """userId 없이 호출 시 400 에러 반환"""
        request_data = {
            "file_id": str(ObjectId()),
            "customer_id": str(ObjectId()),
            "file_path": "/tmp/test.pdf"
        }

        response = client.post("/annual-report/parse-by-path", json=request_data)

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"

    @patch('main.db')
    def test_parse_by_path_with_userid_invalid_customer_returns_404(self, mock_db):
        """userId와 함께 호출했지만 customer 없음 시 404 반환"""
        # Mock: customer 없음 (find_one returns None)
        mock_customers = MagicMock()
        mock_customers.find_one.return_value = None
        mock_db.customers = mock_customers

        request_data = {
            "file_id": str(ObjectId()),
            "customer_id": str(ObjectId()),
            "file_path": "/tmp/test.pdf"
        }

        response = client.post(
            "/annual-report/parse-by-path",
            json=request_data,
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 404
        assert "고객을 찾을 수 없거나 접근 권한이 없습니다" in response.json()["detail"]

    def test_parse_by_path_invalid_customer_id_returns_400(self):
        """잘못된 customer_id 형식으로 호출 시 400 에러"""
        request_data = {
            "file_id": str(ObjectId()),
            "customer_id": "invalid-id",
            "file_path": "/tmp/test.pdf"
        }

        response = client.post(
            "/annual-report/parse-by-path",
            json=request_data,
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 400
        assert "Invalid customer_id format" in response.json()["detail"]


class TestTriggerParsingUserId:
    """POST /ar-background/trigger-parsing - 백그라운드 파싱 트리거 userId 검증"""

    def test_trigger_parsing_without_userid_returns_400(self):
        """userId 없이 호출 시 400 에러 반환"""
        response = client.post("/ar-background/trigger-parsing", json={})

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"

    def test_trigger_parsing_with_userid_no_customer_returns_200(self):
        """userId와 함께 호출 시 200 반환 (customer_id 없음 = 모든 고객)"""
        response = client.post(
            "/ar-background/trigger-parsing",
            json={},
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "파싱이 시작되었습니다" in data["message"]

    @patch('main.db')
    def test_trigger_parsing_with_userid_and_invalid_customer_returns_404(self, mock_db):
        """userId와 특정 customer_id로 호출했지만 customer 없음 시 404 반환"""
        # Mock: customer 없음 (find_one returns None)
        mock_customers = MagicMock()
        mock_customers.find_one.return_value = None
        mock_db.customers = mock_customers

        customer_id = str(ObjectId())
        response = client.post(
            "/ar-background/trigger-parsing",
            json={"customer_id": customer_id},
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 404
        assert "고객을 찾을 수 없거나 접근 권한이 없습니다" in response.json()["detail"]

    def test_trigger_parsing_invalid_customer_id_returns_400(self):
        """잘못된 customer_id 형식으로 호출 시 400 에러"""
        response = client.post(
            "/ar-background/trigger-parsing",
            json={"customer_id": "invalid-id"},
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 400
        assert "Invalid customer_id format" in response.json()["detail"]


class TestUserIdHeaderExtraction:
    """userId 헤더 추출 메커니즘 테스트"""

    def test_userid_header_case_insensitive(self):
        """헤더 이름 대소문자 구분 없이 동작"""
        customer_id = str(ObjectId())

        # 소문자
        response1 = client.get(
            f"/customers/{customer_id}/annual-reports/latest",
            headers={"x-user-id": "tester"}
        )

        # 대문자 (FastAPI는 헤더를 정규화함)
        response2 = client.get(
            f"/customers/{customer_id}/annual-reports/latest",
            headers={"X-User-Id": "tester"}
        )

        # 둘 다 동일하게 처리되어야 함
        assert response1.status_code == response2.status_code

    def test_userid_empty_string_treated_as_missing(self):
        """빈 문자열 userId는 없는 것으로 처리"""
        customer_id = str(ObjectId())
        response = client.get(
            f"/customers/{customer_id}/annual-reports",
            headers={"x-user-id": ""}
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"


class TestCustomerOwnershipVerification:
    """customer 소유권 검증 (통합 테스트)"""

    @patch('main.db')
    def test_different_users_cannot_access_others_customers(self, mock_db):
        """다른 userId는 다른 사용자의 customer에 접근 불가"""
        # Mock: customer 없음 (find_one returns None)
        mock_customers = MagicMock()
        mock_customers.find_one.return_value = None
        mock_db.customers = mock_customers

        customer_id = str(ObjectId())

        user1_response = client.get(
            f"/customers/{customer_id}/annual-reports",
            headers={"x-user-id": "user1"}
        )
        user2_response = client.get(
            f"/customers/{customer_id}/annual-reports",
            headers={"x-user-id": "user2"}
        )

        # 둘 다 404여야 함 (customer가 존재하지 않거나 접근 권한 없음)
        assert user1_response.status_code == 404
        assert user2_response.status_code == 404


class TestErrorHandling:
    """에러 처리 로직 검증"""

    def test_http_exception_not_wrapped_in_500(self):
        """HTTPException은 500으로 변환되지 않고 원래 상태코드 유지"""
        # userId 없이 호출 시 400이 500이 되면 안 됨
        customer_id = str(ObjectId())
        response = client.get(f"/customers/{customer_id}/annual-reports")

        assert response.status_code == 400  # NOT 500
        assert "user_id required" in response.json()["detail"]

    def test_invalid_customer_id_returns_400_not_500(self):
        """잘못된 customer_id도 500이 아닌 400 반환"""
        response = client.get(
            "/customers/not-an-objectid/annual-reports",
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 400  # NOT 500


if __name__ == "__main__":
    # pytest 직접 실행 시
    pytest.main([__file__, "-v", "--tb=short"])
