"""
test_cr_duplicate_check.py
Customer Review 중복 체크 기능 유닛 테스트

테스트 대상:
1. save_customer_review() 함수의 중복 체크 로직 (db_writer.py)
2. 중복 판단 기준: contractor_name + policy_number + product_name + issue_date 4가지 모두 일치

테스트 시나리오:
- 4가지 필드 모두 일치 → 중복으로 건너뜀
- 1개라도 다르면 → 새로 저장
- 필드가 없는 경우 → 중복 체크 건너뜀 (저장 진행)
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from bson import ObjectId
from datetime import datetime, timezone
import sys
import os

# 경로 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# MongoDB와 OpenAI 모킹
with patch('pymongo.MongoClient'):
    with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}):
        from services.db_writer import save_customer_review


class TestCRDuplicateCheck:
    """save_customer_review() 중복 체크 유닛 테스트"""

    def _create_mock_db(self, customer_id: str, existing_reviews: list):
        """테스트용 Mock DB 생성"""
        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "customer_reviews": existing_reviews
        }
        mock_customers.update_one.return_value = Mock(modified_count=1)

        return mock_db, mock_customers

    def test_duplicate_all_four_fields_match(self):
        """4가지 필드 모두 일치하면 중복으로 건너뜀"""
        customer_id = str(ObjectId())

        # 기존 CR 데이터
        existing_reviews = [
            {
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": datetime(2025, 9, 9, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0011423761"}
            }
        ]

        mock_db, mock_customers = self._create_mock_db(customer_id, existing_reviews)

        # 동일한 데이터로 저장 시도
        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09"
            }
        )

        # 검증: 중복으로 건너뜀
        assert result["success"] is True
        assert result.get("duplicate") is True
        assert "이미 동일한 Customer Review가 존재합니다" in result["message"]

        # update_one이 호출되지 않아야 함 (저장 안 함)
        mock_customers.update_one.assert_not_called()

    def test_not_duplicate_different_contractor(self):
        """계약자가 다르면 중복이 아님"""
        customer_id = str(ObjectId())

        existing_reviews = [
            {
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": datetime(2025, 9, 9, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0011423761"}
            }
        ]

        mock_db, mock_customers = self._create_mock_db(customer_id, existing_reviews)

        # 다른 계약자로 저장 시도
        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": "김철수",  # 다른 계약자
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09"
            }
        )

        # 검증: 새로 저장됨
        assert result["success"] is True
        assert result.get("duplicate") is not True
        mock_customers.update_one.assert_called_once()

    def test_not_duplicate_different_policy_number(self):
        """증권번호가 다르면 중복이 아님"""
        customer_id = str(ObjectId())

        existing_reviews = [
            {
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": datetime(2025, 9, 9, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0011423761"}
            }
        ]

        mock_db, mock_customers = self._create_mock_db(customer_id, existing_reviews)

        # 다른 증권번호로 저장 시도
        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423762"},  # 다른 증권번호
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09"
            }
        )

        # 검증: 새로 저장됨
        assert result["success"] is True
        assert result.get("duplicate") is not True
        mock_customers.update_one.assert_called_once()

    def test_not_duplicate_different_product_name(self):
        """상품명이 다르면 중복이 아님"""
        customer_id = str(ObjectId())

        existing_reviews = [
            {
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": datetime(2025, 9, 9, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0011423761"}
            }
        ]

        mock_db, mock_customers = self._create_mock_db(customer_id, existing_reviews)

        # 다른 상품명으로 저장 시도
        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": "고영자",
                "product_name": "무) 골드플랜 변액연금보험",  # 다른 상품명
                "issue_date": "2025-09-09"
            }
        )

        # 검증: 새로 저장됨
        assert result["success"] is True
        assert result.get("duplicate") is not True
        mock_customers.update_one.assert_called_once()

    def test_not_duplicate_different_issue_date(self):
        """발행일이 다르면 중복이 아님"""
        customer_id = str(ObjectId())

        existing_reviews = [
            {
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": datetime(2025, 9, 9, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0011423761"}
            }
        ]

        mock_db, mock_customers = self._create_mock_db(customer_id, existing_reviews)

        # 다른 발행일로 저장 시도
        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-10-09"  # 다른 발행일
            }
        )

        # 검증: 새로 저장됨
        assert result["success"] is True
        assert result.get("duplicate") is not True
        mock_customers.update_one.assert_called_once()

    def test_skip_duplicate_check_when_missing_fields(self):
        """필드가 하나라도 없으면 중복 체크 건너뜀 (저장 진행)"""
        customer_id = str(ObjectId())

        existing_reviews = [
            {
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": datetime(2025, 9, 9, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0011423761"}
            }
        ]

        mock_db, mock_customers = self._create_mock_db(customer_id, existing_reviews)

        # contractor_name 누락
        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                # contractor_name 없음
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09"
            }
        )

        # 검증: 중복 체크 건너뛰고 저장됨
        assert result["success"] is True
        assert result.get("duplicate") is not True
        mock_customers.update_one.assert_called_once()

    def test_duplicate_with_iso_string_issue_date(self):
        """기존 issue_date가 ISO 문자열 형식일 때도 중복 체크 동작"""
        customer_id = str(ObjectId())

        # issue_date가 ISO 문자열인 경우
        existing_reviews = [
            {
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09T00:00:00+00:00",  # ISO 문자열
                "contract_info": {"policy_number": "0011423761"}
            }
        ]

        mock_db, mock_customers = self._create_mock_db(customer_id, existing_reviews)

        # 동일한 데이터로 저장 시도
        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09"
            }
        )

        # 검증: 중복으로 건너뜀
        assert result["success"] is True
        assert result.get("duplicate") is True
        mock_customers.update_one.assert_not_called()

    def test_multiple_existing_reviews_finds_duplicate(self):
        """여러 기존 리뷰 중에서 중복 찾기"""
        customer_id = str(ObjectId())

        existing_reviews = [
            {
                "contractor_name": "김철수",
                "product_name": "무) 다른상품",
                "issue_date": datetime(2025, 8, 1, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0011111111"}
            },
            {
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": datetime(2025, 9, 9, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0011423761"}
            },
            {
                "contractor_name": "박영희",
                "product_name": "무) 또다른상품",
                "issue_date": datetime(2025, 7, 15, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0022222222"}
            }
        ]

        mock_db, mock_customers = self._create_mock_db(customer_id, existing_reviews)

        # 두 번째 기존 리뷰와 동일한 데이터로 저장 시도
        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09"
            }
        )

        # 검증: 중복으로 건너뜀
        assert result["success"] is True
        assert result.get("duplicate") is True
        mock_customers.update_one.assert_not_called()

    def test_no_existing_reviews_saves_new(self):
        """기존 리뷰가 없으면 새로 저장"""
        customer_id = str(ObjectId())

        mock_db, mock_customers = self._create_mock_db(customer_id, [])  # 빈 리스트

        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09"
            }
        )

        # 검증: 새로 저장됨
        assert result["success"] is True
        assert result.get("duplicate") is not True
        mock_customers.update_one.assert_called_once()


class TestCRDuplicateCheckEdgeCases:
    """엣지 케이스 테스트"""

    def _create_mock_db(self, customer_id: str, existing_reviews: list):
        """테스트용 Mock DB 생성"""
        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers

        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "customer_reviews": existing_reviews
        }
        mock_customers.update_one.return_value = Mock(modified_count=1)

        return mock_db, mock_customers

    def test_empty_string_vs_none(self):
        """빈 문자열과 None 구분"""
        customer_id = str(ObjectId())

        existing_reviews = [
            {
                "contractor_name": "",  # 빈 문자열
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": datetime(2025, 9, 9, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0011423761"}
            }
        ]

        mock_db, mock_customers = self._create_mock_db(customer_id, existing_reviews)

        # contractor_name이 None인 경우 (중복 체크 건너뜀)
        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": None,  # None
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09"
            }
        )

        # 검증: contractor_name이 None이면 중복 체크 건너뜀 → 저장됨
        assert result["success"] is True
        assert result.get("duplicate") is not True
        mock_customers.update_one.assert_called_once()

    def test_whitespace_in_fields(self):
        """필드에 공백이 있는 경우"""
        customer_id = str(ObjectId())

        existing_reviews = [
            {
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": datetime(2025, 9, 9, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0011423761"}
            }
        ]

        mock_db, mock_customers = self._create_mock_db(customer_id, existing_reviews)

        # 공백이 포함된 이름 (다른 것으로 취급)
        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": "고영자 ",  # 끝에 공백
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09"
            }
        )

        # 검증: 공백이 있으면 다른 것으로 취급 → 새로 저장됨
        assert result["success"] is True
        assert result.get("duplicate") is not True
        mock_customers.update_one.assert_called_once()

    def test_customer_not_found(self):
        """존재하지 않는 고객"""
        customer_id = str(ObjectId())

        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers
        mock_customers.find_one.return_value = None  # 고객 없음

        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09"
            }
        )

        # 검증: 실패
        assert result["success"] is False
        assert "고객을 찾을 수 없습니다" in result["message"]

    def test_invalid_customer_id(self):
        """유효하지 않은 customer_id"""
        mock_db = MagicMock()

        with pytest.raises(ValueError, match="유효하지 않은 customer_id"):
            save_customer_review(
                db=mock_db,
                customer_id="invalid-id",
                report_data={
                    "contract_info": {"policy_number": "0011423761"},
                    "premium_info": {},
                    "fund_allocations": [],
                    "total_accumulated_amount": 19336631,
                    "fund_count": 2
                },
                metadata={
                    "contractor_name": "고영자",
                    "product_name": "무) 실버플랜 변액유니버셜V보험",
                    "issue_date": "2025-09-09"
                }
            )


class TestCRDuplicateCheckSummary:
    """중복 시 반환되는 summary 검증"""

    def test_duplicate_summary_contains_all_four_fields(self):
        """중복 시 summary에 4가지 필드 모두 포함"""
        customer_id = str(ObjectId())

        existing_reviews = [
            {
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": datetime(2025, 9, 9, tzinfo=timezone.utc),
                "contract_info": {"policy_number": "0011423761"}
            }
        ]

        mock_db = MagicMock()
        mock_customers = MagicMock()
        mock_db.__getitem__.return_value = mock_customers
        mock_customers.find_one.return_value = {
            "_id": ObjectId(customer_id),
            "customer_reviews": existing_reviews
        }

        result = save_customer_review(
            db=mock_db,
            customer_id=customer_id,
            report_data={
                "contract_info": {"policy_number": "0011423761"},
                "premium_info": {},
                "fund_allocations": [],
                "total_accumulated_amount": 19336631,
                "fund_count": 2
            },
            metadata={
                "contractor_name": "고영자",
                "product_name": "무) 실버플랜 변액유니버셜V보험",
                "issue_date": "2025-09-09"
            }
        )

        # 검증: summary에 4가지 필드 모두 포함
        assert result["success"] is True
        assert result.get("duplicate") is True
        summary = result["summary"]
        assert summary["contractor_name"] == "고영자"
        assert summary["policy_number"] == "0011423761"
        assert summary["product_name"] == "무) 실버플랜 변액유니버셜V보험"
        assert summary["issue_date"] == "2025-09-09"
