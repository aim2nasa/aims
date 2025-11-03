"""
test_cleanup_duplicates.py
중복 Annual Report 정리 기능 유닛 테스트 및 회귀 테스트

테스트 대상:
1. cleanup_duplicate_annual_reports() 함수 (db_writer.py)
2. POST /customers/{customer_id}/annual-reports/cleanup-duplicates 엔드포인트
3. 다양한 시나리오와 엣지 케이스
4. 데이터 무결성 회귀 테스트
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, MagicMock
from bson import ObjectId
from datetime import datetime, timedelta
import sys
import os

# 경로 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# MongoDB와 OpenAI 모킹
with patch('pymongo.MongoClient'):
    with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}):
        from main import app
        from services.db_writer import cleanup_duplicate_annual_reports

client = TestClient(app)


class TestCleanupDuplicatesFunction:
    """cleanup_duplicate_annual_reports() 함수 유닛 테스트"""

    def test_cleanup_multiple_duplicates_keeps_closest(self):
        """여러 중복 AR이 있을 때 가장 가까운 parsed_at을 가진 것만 유지"""
        # 테스트 데이터 준비
        customer_id = str(ObjectId())
        reference_linked_at = "2025-11-03T06:25:30.000Z"  # KST 15:25:30
        issue_date = "2025-08-29"

        # 3개의 중복 AR 생성 (동일 발행일, 다른 파싱일시)
        base_dt = datetime.fromisoformat(reference_linked_at.replace('Z', '+00:00'))
        reports = [
            {
                "issue_date": "2025-08-29T00:00:00Z",
                "parsed_at": (base_dt - timedelta(hours=5)).isoformat(),  # 5시간 차이
                "customer_name": "테스트고객",
                "fsr_name": "담당자1"
            },
            {
                "issue_date": "2025-08-29T00:00:00Z",
                "parsed_at": (base_dt - timedelta(minutes=30)).isoformat(),  # 30분 차이 ← 가장 가까움
                "customer_name": "테스트고객",
                "fsr_name": "담당자2"
            },
            {
                "issue_date": "2025-08-29T00:00:00Z",
                "parsed_at": (base_dt + timedelta(hours=2)).isoformat(),  # 2시간 차이
                "customer_name": "테스트고객",
                "fsr_name": "담당자3"
            }
        ]

        # Mock DB 설정
        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "annual_reports": reports
        }

        mock_customers.update_one.return_value = Mock(modified_count=1)

        # 함수 실행
        result = cleanup_duplicate_annual_reports(
            db=mock_db,
            customer_id=customer_id,
            issue_date=issue_date,
            reference_linked_at=reference_linked_at
        )

        # 검증
        assert result["success"] is True
        assert result["deleted_count"] == 2  # 3개 중 2개 삭제
        assert result["kept_report"]["fsr_name"] == "담당자2"  # 30분 차이가 가장 가까움

        # update_one 호출 검증
        mock_customers.update_one.assert_called_once()
        call_args = mock_customers.update_one.call_args
        kept_reports = call_args[0][1]["$set"]["annual_reports"]
        assert len(kept_reports) == 1
        assert kept_reports[0]["fsr_name"] == "담당자2"

    def test_cleanup_no_duplicates(self):
        """중복이 없으면 아무것도 삭제하지 않음"""
        customer_id = str(ObjectId())
        issue_date = "2025-08-29"
        reference_linked_at = "2025-11-03T06:25:30.000Z"

        # 단일 AR만 존재
        reports = [
            {
                "issue_date": "2025-08-29T00:00:00Z",
                "parsed_at": "2025-11-03T06:20:00.000Z",
                "customer_name": "테스트고객"
            }
        ]

        # Mock DB 설정
        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "annual_reports": reports
        }

        # 함수 실행
        result = cleanup_duplicate_annual_reports(
            db=mock_db,
            customer_id=customer_id,
            issue_date=issue_date,
            reference_linked_at=reference_linked_at
        )

        # 검증
        assert result["success"] is True
        assert result["deleted_count"] == 0
        assert "중복된 Annual Report가 없습니다" in result["message"]

        # update_one이 호출되지 않아야 함
        mock_customers.update_one.assert_not_called()

    def test_cleanup_preserves_different_issue_dates(self):
        """다른 발행일의 AR은 보존되어야 함"""
        customer_id = str(ObjectId())
        issue_date = "2025-08-29"
        reference_linked_at = "2025-11-03T06:25:30.000Z"

        # 다양한 발행일의 AR
        reports = [
            {
                "issue_date": "2025-08-29T00:00:00Z",
                "parsed_at": "2025-11-03T06:20:00.000Z",
                "customer_name": "테스트고객"
            },
            {
                "issue_date": "2025-08-29T00:00:00Z",
                "parsed_at": "2025-11-03T06:25:00.000Z",  # 가장 가까움
                "customer_name": "테스트고객"
            },
            {
                "issue_date": "2025-07-15T00:00:00Z",  # 다른 발행일
                "parsed_at": "2025-11-01T10:00:00.000Z",
                "customer_name": "테스트고객"
            },
            {
                "issue_date": "2025-09-10T00:00:00Z",  # 다른 발행일
                "parsed_at": "2025-11-02T12:00:00.000Z",
                "customer_name": "테스트고객"
            }
        ]

        # Mock DB 설정
        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "annual_reports": reports
        }

        mock_customers.update_one.return_value = Mock(modified_count=1)

        # 함수 실행
        result = cleanup_duplicate_annual_reports(
            db=mock_db,
            customer_id=customer_id,
            issue_date=issue_date,
            reference_linked_at=reference_linked_at
        )

        # 검증
        assert result["success"] is True
        assert result["deleted_count"] == 1  # 2025-08-29 중 1개만 삭제

        # 유지된 리포트 확인
        call_args = mock_customers.update_one.call_args
        kept_reports = call_args[0][1]["$set"]["annual_reports"]
        assert len(kept_reports) == 3  # 다른 발행일 2개 + 유지된 08-29 1개

        # 다른 발행일은 모두 보존되었는지 확인
        kept_issue_dates = [r["issue_date"].split('T')[0] for r in kept_reports]
        assert "2025-07-15" in kept_issue_dates
        assert "2025-09-10" in kept_issue_dates
        assert kept_issue_dates.count("2025-08-29") == 1

    def test_cleanup_invalid_customer_id(self):
        """유효하지 않은 customer_id는 ValueError 발생"""
        mock_db = MagicMock()

        with pytest.raises(ValueError, match="유효하지 않은 customer_id"):
            cleanup_duplicate_annual_reports(
                db=mock_db,
                customer_id="invalid-id",
                issue_date="2025-08-29",
                reference_linked_at="2025-11-03T06:25:30.000Z"
            )

    def test_cleanup_customer_not_found(self):
        """존재하지 않는 고객은 실패 반환"""
        customer_id = str(ObjectId())

        # Mock DB 설정
        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        mock_customers.find_one.return_value = None  # 고객 없음

        # 함수 실행
        result = cleanup_duplicate_annual_reports(
            db=mock_db,
            customer_id=customer_id,
            issue_date="2025-08-29",
            reference_linked_at="2025-11-03T06:25:30.000Z"
        )

        # 검증
        assert result["success"] is False
        assert "고객을 찾을 수 없습니다" in result["message"]
        assert result["deleted_count"] == 0

    def test_cleanup_invalid_reference_linked_at(self):
        """유효하지 않은 reference_linked_at은 ValueError 발생"""
        customer_id = str(ObjectId())

        # Mock DB 설정
        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "annual_reports": [
                {"issue_date": "2025-08-29", "parsed_at": "2025-11-03T06:20:00.000Z"},
                {"issue_date": "2025-08-29", "parsed_at": "2025-11-03T06:25:00.000Z"}  # 중복 추가
            ]
        }

        # 유효하지 않은 날짜 형식
        with pytest.raises(ValueError, match="유효하지 않은 reference_linked_at"):
            cleanup_duplicate_annual_reports(
                db=mock_db,
                customer_id=customer_id,
                issue_date="2025-08-29",
                reference_linked_at="invalid-date"
            )

    def test_cleanup_no_parsed_at_keeps_first(self):
        """parsed_at이 없는 경우 첫 번째 리포트 유지"""
        customer_id = str(ObjectId())
        issue_date = "2025-08-29"

        # parsed_at이 없는 중복 AR
        reports = [
            {
                "issue_date": "2025-08-29T00:00:00Z",
                "customer_name": "테스트고객1",
                "fsr_name": "첫번째"
            },
            {
                "issue_date": "2025-08-29T00:00:00Z",
                "customer_name": "테스트고객2",
                "fsr_name": "두번째"
            }
        ]

        # Mock DB 설정
        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "annual_reports": reports
        }

        mock_customers.update_one.return_value = Mock(modified_count=1)

        # 함수 실행
        result = cleanup_duplicate_annual_reports(
            db=mock_db,
            customer_id=customer_id,
            issue_date=issue_date,
            reference_linked_at="2025-11-03T06:25:30.000Z"
        )

        # 검증
        assert result["success"] is True
        assert result["deleted_count"] == 1
        assert result["kept_report"]["fsr_name"] == "첫번째"


class TestCleanupDuplicatesEndpoint:
    """POST /customers/{customer_id}/annual-reports/cleanup-duplicates 엔드포인트 테스트"""

    @patch('main.mongo_client')
    def test_endpoint_successful_cleanup(self, mock_mongo):
        """정상적인 정리 요청 성공"""
        customer_id = str(ObjectId())
        user_id = str(ObjectId())

        # Mock DB 설정
        mock_db = mock_mongo.__getitem__.return_value
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        # 고객 소유권 확인
        mock_customers.find_one.side_effect = [
            {  # 첫 번째 호출: 소유권 확인
                "_id": ObjectId(customer_id),
                "userId": ObjectId(user_id)
            },
            {  # 두 번째 호출: cleanup 함수 내부
                "_id": ObjectId(customer_id),
                "annual_reports": [
                    {
                        "issue_date": "2025-08-29T00:00:00Z",
                        "parsed_at": "2025-11-03T06:20:00.000Z",
                        "customer_name": "테스트1"
                    },
                    {
                        "issue_date": "2025-08-29T00:00:00Z",
                        "parsed_at": "2025-11-03T06:25:00.000Z",
                        "customer_name": "테스트2"
                    }
                ]
            }
        ]

        mock_customers.update_one.return_value = Mock(modified_count=1)

        # API 요청
        response = client.post(
            f"/customers/{customer_id}/annual-reports/cleanup-duplicates",
            json={
                "issue_date": "2025-08-29",
                "reference_linked_at": "2025-11-03T06:25:30.000Z"
            },
            headers={"x-user-id": user_id}
        )

        # 검증
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["deleted_count"] == 1

    @patch('main.mongo_client')
    def test_endpoint_missing_userId(self, mock_mongo):
        """userId가 없으면 401 에러"""
        customer_id = str(ObjectId())

        response = client.post(
            f"/customers/{customer_id}/annual-reports/cleanup-duplicates",
            json={
                "issue_date": "2025-08-29",
                "reference_linked_at": "2025-11-03T06:25:30.000Z"
                # userId 누락
            }
        )

        assert response.status_code == 400  # userId required

    @patch('main.mongo_client')
    def test_endpoint_unauthorized_customer(self, mock_mongo):
        """다른 사용자의 고객은 403 에러"""
        customer_id = str(ObjectId())
        user_id = str(ObjectId())
        other_user_id = str(ObjectId())

        # Mock DB 설정
        mock_db = mock_mongo.__getitem__.return_value
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        # 다른 userId 소유
        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "userId": ObjectId(other_user_id)
        }

        response = client.post(
            f"/customers/{customer_id}/annual-reports/cleanup-duplicates",
            json={
                "issue_date": "2025-08-29",
                "reference_linked_at": "2025-11-03T06:25:30.000Z"
            },
            headers={"x-user-id": user_id}
        )

        assert response.status_code == 404  # 고객을 찾을 수 없거나 권한 없음
        assert "고객을 찾을 수 없거나 접근 권한이 없습니다" in response.json()["detail"]

    @patch('main.mongo_client')
    def test_endpoint_customer_not_found(self, mock_mongo):
        """존재하지 않는 고객은 404 에러"""
        customer_id = str(ObjectId())
        user_id = str(ObjectId())

        # Mock DB 설정
        mock_db = mock_mongo.__getitem__.return_value
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        mock_customers.find_one.return_value = None  # 고객 없음

        response = client.post(
            f"/customers/{customer_id}/annual-reports/cleanup-duplicates",
            json={
                "issue_date": "2025-08-29",
                "reference_linked_at": "2025-11-03T06:25:30.000Z"
            },
            headers={"x-user-id": user_id}
        )

        assert response.status_code == 404
        assert "고객을 찾을 수 없거나 접근 권한이 없습니다" in response.json()["detail"]

    @patch('main.mongo_client')
    def test_endpoint_invalid_customer_id_format(self, mock_mongo):
        """잘못된 형식의 customer_id는 400 에러"""
        response = client.post(
            "/customers/invalid-id/annual-reports/cleanup-duplicates",
            json={
                "issue_date": "2025-08-29",
                "reference_linked_at": "2025-11-03T06:25:30.000Z"
            },
            headers={"x-user-id": str(ObjectId())}
        )

        assert response.status_code == 400


class TestCleanupRegressionTests:
    """데이터 무결성 회귀 테스트"""

    def test_cleanup_does_not_affect_other_customers(self):
        """한 고객의 정리가 다른 고객에 영향을 주지 않음"""
        customer1_id = str(ObjectId())
        customer2_id = str(ObjectId())

        # Mock DB 설정
        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        # Customer 1 데이터
        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer1_id),
            "annual_reports": [
                {"issue_date": "2025-08-29", "parsed_at": "2025-11-03T06:20:00.000Z"},
                {"issue_date": "2025-08-29", "parsed_at": "2025-11-03T06:25:00.000Z"}
            ]
        }

        mock_customers.update_one.return_value = Mock(modified_count=1)

        # Customer 1 정리
        cleanup_duplicate_annual_reports(
            db=mock_db,
            customer_id=customer1_id,
            issue_date="2025-08-29",
            reference_linked_at="2025-11-03T06:25:30.000Z"
        )

        # update_one이 customer1_id만 대상으로 호출되었는지 확인
        call_args = mock_customers.update_one.call_args
        assert call_args[0][0]["_id"] == ObjectId(customer1_id)

    def test_multiple_consecutive_cleanups(self):
        """연속된 정리 작업이 올바르게 동작"""
        customer_id = str(ObjectId())

        # Mock DB 설정
        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        # 첫 번째 정리: 2025-08-29
        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "annual_reports": [
                {"issue_date": "2025-08-29", "parsed_at": "2025-11-03T06:20:00.000Z"},
                {"issue_date": "2025-08-29", "parsed_at": "2025-11-03T06:25:00.000Z"},
                {"issue_date": "2025-07-15", "parsed_at": "2025-11-01T10:00:00.000Z"},
                {"issue_date": "2025-07-15", "parsed_at": "2025-11-01T10:30:00.000Z"}
            ]
        }

        mock_customers.update_one.return_value = Mock(modified_count=1)

        result1 = cleanup_duplicate_annual_reports(
            db=mock_db,
            customer_id=customer_id,
            issue_date="2025-08-29",
            reference_linked_at="2025-11-03T06:25:30.000Z"
        )

        assert result1["deleted_count"] == 1

        # 두 번째 정리: 2025-07-15
        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "annual_reports": [
                {"issue_date": "2025-08-29", "parsed_at": "2025-11-03T06:25:00.000Z"},
                {"issue_date": "2025-07-15", "parsed_at": "2025-11-01T10:00:00.000Z"},
                {"issue_date": "2025-07-15", "parsed_at": "2025-11-01T10:30:00.000Z"}
            ]
        }

        result2 = cleanup_duplicate_annual_reports(
            db=mock_db,
            customer_id=customer_id,
            issue_date="2025-07-15",
            reference_linked_at="2025-11-01T10:15:00.000Z"
        )

        assert result2["deleted_count"] == 1

        # 최종 상태: 각 발행일당 1개씩만 남아야 함
        final_call_args = mock_customers.update_one.call_args
        final_reports = final_call_args[0][1]["$set"]["annual_reports"]
        assert len(final_reports) == 2

    def test_cleanup_preserves_all_fields(self):
        """정리 후에도 유지된 리포트의 모든 필드가 보존됨"""
        customer_id = str(ObjectId())

        # 완전한 필드를 가진 AR
        complete_report = {
            "issue_date": "2025-08-29T00:00:00Z",
            "parsed_at": "2025-11-03T06:25:00.000Z",
            "customer_name": "테스트고객",
            "fsr_name": "담당자",
            "report_title": "2025년 8월 리포트",
            "additional_field": "추가 데이터",
            "nested": {
                "key": "value"
            }
        }

        reports = [
            {
                "issue_date": "2025-08-29T00:00:00Z",
                "parsed_at": "2025-11-03T06:20:00.000Z"
            },
            complete_report
        ]

        # Mock DB 설정
        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "annual_reports": reports
        }

        mock_customers.update_one.return_value = Mock(modified_count=1)

        # 정리 실행
        cleanup_duplicate_annual_reports(
            db=mock_db,
            customer_id=customer_id,
            issue_date="2025-08-29",
            reference_linked_at="2025-11-03T06:25:30.000Z"
        )

        # 유지된 리포트 확인
        call_args = mock_customers.update_one.call_args
        kept_reports = call_args[0][1]["$set"]["annual_reports"]
        kept_report = kept_reports[0]

        # 모든 필드가 보존되었는지 확인
        assert kept_report["customer_name"] == "테스트고객"
        assert kept_report["fsr_name"] == "담당자"
        assert kept_report["report_title"] == "2025년 8월 리포트"
        assert kept_report["additional_field"] == "추가 데이터"
        assert kept_report["nested"]["key"] == "value"
