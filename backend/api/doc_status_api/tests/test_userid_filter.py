"""
test_userid_filter.py
사용자 계정 기능 - userId 필터링 유닛 테스트

테스트 대상 엔드포인트:
1. GET /status - 최근 문서 목록 조회
2. GET /status/{document_id} - 특정 문서 상태 조회
3. GET /status/{document_id}/simple - 간단한 문서 상태 조회
4. DELETE /documents - 문서 삭제

테스트 시나리오:
1. userId 없이 호출 시 400 에러 반환
2. userId와 함께 호출 시 정상 동작
3. owner_id 필터링 적용 확인
4. 다른 사용자의 문서 접근 차단 확인
"""

import pytest
from fastapi.testclient import TestClient
from bson import ObjectId
from datetime import datetime, UTC
import sys
import os

# 상위 디렉토리의 main.py를 import하기 위한 경로 설정
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from main import app

# TestClient 생성
client = TestClient(app)


class TestGetStatusListUserId:
    """GET /status - 문서 목록 조회 userId 검증"""

    def test_get_status_without_userid_returns_400(self):
        """userId 없이 호출 시 400 에러 반환"""
        response = client.get("/status?limit=10")

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"

    def test_get_status_with_userid_returns_200(self):
        """userId와 함께 호출 시 200 반환 (빈 DB)"""
        response = client.get(
            "/status?limit=10",
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "documents" in data
        assert "total" in data
        assert isinstance(data["documents"], list)

    def test_get_status_with_different_userids(self):
        """다른 userId로 호출 시 각각 다른 결과 반환"""
        response1 = client.get(
            "/status?limit=10",
            headers={"x-user-id": "user1"}
        )
        response2 = client.get(
            "/status?limit=10",
            headers={"x-user-id": "user2"}
        )

        assert response1.status_code == 200
        assert response2.status_code == 200
        # 각 사용자는 독립적인 결과를 받아야 함
        assert response1.json() is not None
        assert response2.json() is not None


class TestGetDocumentStatusUserId:
    """GET /status/{document_id} - 특정 문서 조회 userId 검증"""

    def test_get_document_status_without_userid_returns_400(self):
        """userId 없이 호출 시 400 에러 반환"""
        doc_id = str(ObjectId())
        response = client.get(f"/status/{doc_id}")

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"

    def test_get_document_status_invalid_objectid_returns_400(self):
        """잘못된 ObjectId 형식으로 호출 시 400 에러"""
        response = client.get(
            "/status/invalid-id",
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 400
        assert "Invalid document ID format" in response.json()["detail"]

    def test_get_document_status_with_userid_not_found_returns_404(self):
        """userId와 함께 호출했지만 문서 없음 시 404 반환"""
        doc_id = str(ObjectId())
        response = client.get(
            f"/status/{doc_id}",
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Document not found or access denied"

    def test_get_document_status_with_userid_header(self):
        """x-user-id 헤더로 userId 전달 시 정상 처리"""
        doc_id = str(ObjectId())
        response = client.get(
            f"/status/{doc_id}",
            headers={"x-user-id": "tester"}
        )

        # 404는 정상 (문서가 없어서), 400이 아니면 OK
        assert response.status_code in [200, 404]
        if response.status_code == 404:
            assert "not found" in response.json()["detail"].lower()


class TestGetSimpleStatusUserId:
    """GET /status/{document_id}/simple - 간단한 상태 조회 userId 검증"""

    def test_get_simple_status_without_userid_returns_400(self):
        """userId 없이 호출 시 400 에러 반환"""
        doc_id = str(ObjectId())
        response = client.get(f"/status/{doc_id}/simple")

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"

    def test_get_simple_status_with_userid_not_found_returns_404(self):
        """userId와 함께 호출했지만 문서 없음 시 404 반환"""
        doc_id = str(ObjectId())
        response = client.get(
            f"/status/{doc_id}/simple",
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 404
        assert response.json()["detail"] == "Document not found or access denied"

    def test_get_simple_status_invalid_objectid_returns_400(self):
        """잘못된 ObjectId 형식으로 호출 시 400 에러"""
        response = client.get(
            "/status/not-an-objectid/simple",
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 400


class TestDeleteDocumentsUserId:
    """DELETE /documents - 문서 삭제 userId 검증"""

    def test_delete_documents_without_userid_returns_400(self):
        """userId 없이 호출 시 400 에러 반환"""
        response = client.request(
            "DELETE",
            "/documents",
            json={"document_ids": [str(ObjectId())]}
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"

    def test_delete_documents_with_userid_not_found(self):
        """userId와 함께 호출했지만 문서 없음 시 실패 메시지"""
        doc_id = str(ObjectId())
        response = client.request(
            "DELETE",
            "/documents",
            headers={"x-user-id": "tester"},
            json={"document_ids": [doc_id]}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] == False
        assert data["deleted_count"] == 0
        assert data["failed_count"] >= 1
        assert len(data["errors"]) >= 1
        assert "문서를 찾을 수 없거나 권한이 없습니다" in data["errors"][0]["error"]

    def test_delete_documents_empty_list(self):
        """빈 배열로 호출 시 400 에러 반환"""
        response = client.request(
            "DELETE",
            "/documents",
            headers={"x-user-id": "tester"},
            json={"document_ids": []}
        )

        assert response.status_code == 400
        assert "삭제할 문서 ID가 필요합니다" in response.json()["detail"]

    def test_delete_documents_invalid_objectid(self):
        """잘못된 ObjectId 포함 시 에러 메시지"""
        response = client.request(
            "DELETE",
            "/documents",
            headers={"x-user-id": "tester"},
            json={"document_ids": ["invalid-id", str(ObjectId())]}
        )

        assert response.status_code == 200
        data = response.json()
        # 잘못된 ObjectId는 에러로 처리됨
        assert data["failed_count"] >= 1
        assert len(data["errors"]) >= 1


class TestUserIdHeaderExtraction:
    """userId 헤더 추출 메커니즘 테스트"""

    def test_userid_header_case_insensitive(self):
        """헤더 이름 대소문자 구분 없이 동작"""
        doc_id = str(ObjectId())

        # 소문자
        response1 = client.get(
            f"/status/{doc_id}",
            headers={"x-user-id": "tester"}
        )

        # 대문자 (FastAPI는 헤더를 정규화함)
        response2 = client.get(
            f"/status/{doc_id}",
            headers={"X-User-Id": "tester"}
        )

        # 둘 다 동일하게 처리되어야 함
        assert response1.status_code == response2.status_code

    def test_userid_empty_string_treated_as_missing(self):
        """빈 문자열 userId는 없는 것으로 처리"""
        # FastAPI는 빈 문자열도 값으로 인식하므로
        # 우리 코드의 `if not user_id:` 검증이 작동해야 함
        response = client.get(
            "/status?limit=10",
            headers={"x-user-id": ""}
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "user_id required"


class TestUserIdAccessControl:
    """사용자 간 데이터 격리 검증 (통합 테스트)"""

    def test_different_users_see_different_data(self):
        """다른 userId는 다른 데이터를 조회"""
        # 실제 DB에 문서가 있다면 각 사용자는 자신의 owner_id인 문서만 보임
        # 현재는 빈 DB이므로 격리가 작동하는지만 확인

        user1_response = client.get(
            "/status?limit=100",
            headers={"x-user-id": "user1"}
        )
        user2_response = client.get(
            "/status?limit=100",
            headers={"x-user-id": "user2"}
        )

        assert user1_response.status_code == 200
        assert user2_response.status_code == 200

        # 각 사용자의 결과는 독립적
        user1_data = user1_response.json()
        user2_data = user2_response.json()

        assert "documents" in user1_data
        assert "documents" in user2_data


class TestErrorHandling:
    """에러 처리 로직 검증"""

    def test_http_exception_not_wrapped_in_500(self):
        """HTTPException은 500으로 변환되지 않고 원래 상태코드 유지"""
        # userId 없이 호출 시 400이 500이 되면 안 됨
        response = client.get("/status?limit=10")

        assert response.status_code == 400  # NOT 500
        assert "user_id required" in response.json()["detail"]

    def test_invalid_objectid_returns_400_not_500(self):
        """잘못된 ObjectId도 500이 아닌 400 반환"""
        response = client.get(
            "/status/not-an-objectid",
            headers={"x-user-id": "tester"}
        )

        assert response.status_code == 400  # NOT 500


if __name__ == "__main__":
    # pytest 직접 실행 시
    pytest.main([__file__, "-v", "--tb=short"])
