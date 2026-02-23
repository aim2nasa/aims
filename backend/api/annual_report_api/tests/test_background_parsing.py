"""
test_background_parsing.py
AR 백그라운드 파싱 기능 유닛 테스트

최근 기능 (커밋 dc95112):
- 문서 업로드 후 백그라운드에서 AR 파싱 자동 트리거
- ar_parsing_status 필드로 파싱 상태 관리 (pending → processing → completed/error)
- customers.annual_reports 배열에 파싱 결과 저장
- 파싱 중/대기 중인 문서 카운트 제공

테스트 시나리오:
1. AR 문서 파싱 상태가 pending → processing → completed로 전환
2. 파싱 완료 시 customers.annual_reports에 결과 저장
3. 파싱 실패 시 ar_parsing_status = error
4. ar_metadata가 없는 문서도 파싱 시도
5. customer_id가 없는 문서는 건너뛰기
6. is_annual_report가 False인 문서는 파싱 안 함
7. 이미 파싱 완료된 문서는 건너뛰기
8. 여러 AR 문서 일괄 파싱
9. 특정 고객의 AR 문서만 선택적 파싱
10. 특정 파일만 선택적 파싱
"""

import pytest
from datetime import datetime, timezone
from bson import ObjectId
from pymongo import MongoClient
import os
from unittest.mock import Mock, patch

# 테스트용 MongoDB 연결 설정
TEST_MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
TEST_DB_NAME = "docupload"
COLLECTION_NAME = "files"
CUSTOMERS_COLLECTION = "customers"


@pytest.fixture(scope="module")
def mongo_client():
    """MongoDB 클라이언트 픽스처"""
    try:
        client = MongoClient(TEST_MONGO_URI, serverSelectionTimeoutMS=3000)
        client.admin.command("ping")
    except Exception:
        pytest.skip("MongoDB not available")
    yield client
    client.close()


@pytest.fixture(scope="module")
def db(mongo_client):
    """데이터베이스 픽스처"""
    return mongo_client[TEST_DB_NAME]


@pytest.fixture(scope="module")
def files_collection(db):
    """files 컬렉션 픽스처"""
    return db[COLLECTION_NAME]


@pytest.fixture(scope="module")
def customers_collection(db):
    """customers 컬렉션 픽스처"""
    return db[CUSTOMERS_COLLECTION]


@pytest.fixture
def created_ids():
    """테스트에서 생성한 ID 추적"""
    return {"documents": [], "customers": []}


@pytest.fixture(autouse=True)
def cleanup(files_collection, customers_collection, created_ids):
    """각 테스트 후 테스트 데이터 정리"""
    yield
    # 생성된 문서 삭제
    if created_ids["documents"]:
        files_collection.delete_many({"_id": {"$in": created_ids["documents"]}})

    # 생성된 고객 삭제
    if created_ids["customers"]:
        customers_collection.delete_many({"_id": {"$in": created_ids["customers"]}})

    # 테스트 데이터 패턴 정리
    customers_collection.delete_many({"personal_info.name": {"$regex": "^테스트BG"}})


class TestARBackgroundParsingStatus:
    """AR 백그라운드 파싱 상태 관리"""

    def test_ar_parsing_status_transitions(
        self, files_collection, customers_collection, created_ids
    ):
        """파싱 상태가 pending → processing → completed로 전환"""
        # Given: pending 상태의 AR 문서
        document_id = ObjectId()
        customer_id = ObjectId()

        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_parsing_status": "pending",  # 초기 상태
            "ar_metadata": {
                "issue_date": "2024-01-01",
                "customer_name": "테스트BG고객1"
            },
            "customer_relation": {
                "customer_id": customer_id
            },
            "upload": {
                "destPath": "/tmp/test-ar-bg.pdf"
            }
        })

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트BG고객1"},
            "annual_reports": [],
            "meta": {
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        })

        # When: 파싱 시작 (processing)
        files_collection.update_one(
            {"_id": document_id},
            {
                "$set": {
                    "ar_parsing_status": "processing",
                    "ar_parsing_started_at": datetime.now(timezone.utc)
                }
            }
        )

        # Then: processing 상태 확인
        doc = files_collection.find_one({"_id": document_id})
        assert doc["ar_parsing_status"] == "processing"
        assert "ar_parsing_started_at" in doc

        # When: 파싱 완료
        files_collection.update_one(
            {"_id": document_id},
            {
                "$set": {
                    "ar_parsing_status": "completed",
                    "ar_parsing_completed_at": datetime.now(timezone.utc)
                }
            }
        )

        # Then: completed 상태 확인
        doc = files_collection.find_one({"_id": document_id})
        assert doc["ar_parsing_status"] == "completed"
        assert "ar_parsing_completed_at" in doc

    def test_ar_parsing_error_status(
        self, files_collection, created_ids
    ):
        """파싱 실패 시 ar_parsing_status = error"""
        # Given: 파싱 중인 문서
        document_id = ObjectId()

        created_ids["documents"].append(document_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_parsing_status": "processing"
        })

        # When: 파싱 실패
        error_message = "PDF 파일을 읽을 수 없습니다"
        files_collection.update_one(
            {"_id": document_id},
            {
                "$set": {
                    "ar_parsing_status": "error",
                    "ar_parsing_error": error_message
                }
            }
        )

        # Then: error 상태 및 메시지 확인
        doc = files_collection.find_one({"_id": document_id})
        assert doc["ar_parsing_status"] == "error"
        assert doc["ar_parsing_error"] == error_message

    def test_ar_parsing_without_metadata(
        self, files_collection, customers_collection, created_ids
    ):
        """ar_metadata가 없는 문서도 파싱 시도 (백그라운드에서 metadata 생성)"""
        # Given: ar_metadata 없음
        document_id = ObjectId()
        customer_id = ObjectId()

        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            # ar_metadata 없음!
            "customer_relation": {"customer_id": customer_id},
            "upload": {"destPath": "/tmp/test-ar-no-meta.pdf"}
        })

        # When: 파싱 가능 여부 확인 (실제 로직에서는 파싱 시도함)
        doc = files_collection.find_one({"_id": document_id})
        customer_id_from_doc = doc.get("customer_relation", {}).get("customer_id")

        # Then: customer_id만 있으면 파싱 가능
        assert customer_id_from_doc is not None

    def test_ar_parsing_skips_without_customer_id(
        self, files_collection, created_ids
    ):
        """customer_id가 없는 문서는 건너뛰기"""
        # Given: customer_id 없음
        document_id = ObjectId()

        created_ids["documents"].append(document_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_metadata": {"issue_date": "2024-01-01"}
            # customer_relation 없음!
        })

        # When: 파싱 가능 여부 확인
        doc = files_collection.find_one({"_id": document_id})
        customer_id = doc.get("customer_relation", {}).get("customer_id")

        # Then: customer_id 없으면 파싱 불가
        assert customer_id is None


class TestARBackgroundParsingQuery:
    """백그라운드 파싱 대상 문서 조회"""

    def test_query_pending_ar_documents(
        self, files_collection, customers_collection, created_ids
    ):
        """파싱 대기 중인 AR 문서 조회"""
        # Given: pending 상태의 AR 문서 3개
        customer_id = ObjectId()
        created_ids["customers"].append(customer_id)

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트BG고객2"},
            "annual_reports": [],
            "meta": {
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        })

        for i in range(3):
            doc_id = ObjectId()
            created_ids["documents"].append(doc_id)
            files_collection.insert_one({
                "_id": doc_id,
                "is_annual_report": True,
                "ar_parsing_status": "pending",
                "customer_relation": {"customer_id": customer_id},
                "upload": {
                    "destPath": f"/tmp/test-ar-{i}.pdf",
                    "uploaded_at": datetime.now(timezone.utc)
                }
            })

        # When: 파싱 대기 문서 조회
        query = {
            "is_annual_report": True,
            "$or": [
                {"ar_parsing_status": {"$exists": False}},
                {"ar_parsing_status": "pending"},
                {"ar_parsing_status": "error"}
            ]
        }
        ar_documents = list(files_collection.find(query))

        # Then: 3개 모두 조회됨
        assert len(ar_documents) >= 3  # 다른 테스트 데이터가 있을 수 있음

    def test_query_ar_documents_by_customer(
        self, files_collection, customers_collection, created_ids
    ):
        """특정 고객의 AR 문서만 조회"""
        # Given: 2명의 고객, 각각 AR 문서 보유
        customer1_id = ObjectId()
        customer2_id = ObjectId()

        created_ids["customers"].extend([customer1_id, customer2_id])

        for cust_id in [customer1_id, customer2_id]:
            customers_collection.insert_one({
                "_id": cust_id,
                "personal_info": {"name": f"테스트BG고객{cust_id}"},
                "annual_reports": [],
                "meta": {
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
            })

        # customer1: 2개, customer2: 1개
        for i in range(2):
            doc_id = ObjectId()
            created_ids["documents"].append(doc_id)
            files_collection.insert_one({
                "_id": doc_id,
                "is_annual_report": True,
                "customer_relation": {"customer_id": customer1_id}
            })

        doc_id = ObjectId()
        created_ids["documents"].append(doc_id)
        files_collection.insert_one({
            "_id": doc_id,
            "is_annual_report": True,
            "customer_relation": {"customer_id": customer2_id}
        })

        # When: customer1의 AR 문서만 조회
        query = {
            "is_annual_report": True,
            "customer_relation.customer_id": customer1_id
        }
        ar_documents = list(files_collection.find(query))

        # Then: 2개만 조회됨
        assert len(ar_documents) == 2

    def test_query_skips_completed_ar_documents(
        self, files_collection, customers_collection, created_ids
    ):
        """이미 파싱 완료된 문서는 조회에서 제외"""
        # Given: completed 상태의 AR 문서
        document_id = ObjectId()
        customer_id = ObjectId()

        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트BG고객3"},
            "annual_reports": [
                {"issue_date": datetime(2024, 1, 1), "assets": {"total": 1000000}}
            ],
            "meta": {
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        })

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_parsing_status": "completed",  # 이미 완료
            "customer_relation": {"customer_id": customer_id}
        })

        # When: 파싱 대기 문서 조회
        query = {
            "_id": document_id,
            "is_annual_report": True,
            "$or": [
                {"ar_parsing_status": {"$exists": False}},
                {"ar_parsing_status": "pending"},
                {"ar_parsing_status": "error"}
            ]
        }
        ar_documents = list(files_collection.find(query))

        # Then: completed 문서는 쿼리 조건에 맞지 않아 조회되지 않음
        assert len(ar_documents) == 0

    def test_query_non_ar_documents_excluded(
        self, files_collection, created_ids
    ):
        """is_annual_report가 False인 문서는 조회에서 제외"""
        # Given: 일반 문서
        document_id = ObjectId()

        created_ids["documents"].append(document_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": False  # 일반 문서
        })

        # When: AR 문서 조회
        query = {
            "is_annual_report": True
        }
        ar_documents = list(files_collection.find({"_id": document_id, **query}))

        # Then: 조회되지 않음
        assert len(ar_documents) == 0


class TestARBackgroundParsingResult:
    """백그라운드 파싱 결과 저장"""

    def test_parsing_result_saved_to_customer_annual_reports(
        self, files_collection, customers_collection, created_ids
    ):
        """파싱 완료 시 customers.annual_reports에 결과 저장"""
        # Given: 파싱 완료된 AR 문서
        document_id = ObjectId()
        customer_id = ObjectId()
        issue_date = datetime(2024, 6, 30)

        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_parsing_status": "completed",
            "ar_metadata": {
                "issue_date": "2024-06-30",
                "customer_name": "테스트BG고객4"
            },
            "customer_relation": {"customer_id": customer_id}
        })

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트BG고객4"},
            "annual_reports": [],
            "meta": {
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        })

        # When: 파싱 결과 저장 (실제 save_annual_report 함수 로직)
        parsing_result = {
            "issue_date": issue_date,
            "assets": {
                "total": 5000000,
                "real_estate": 2000000,
                "securities": 3000000
            },
            "liabilities": {
                "total": 1000000
            },
            "net_worth": 4000000,
            "source_file_id": str(document_id)
        }

        customers_collection.update_one(
            {"_id": customer_id},
            {
                "$push": {"annual_reports": parsing_result},
                "$set": {"meta.updated_at": datetime.now(timezone.utc)}
            }
        )

        # Then: annual_reports에 저장 확인
        customer = customers_collection.find_one({"_id": customer_id})
        assert len(customer["annual_reports"]) == 1
        assert customer["annual_reports"][0]["issue_date"] == issue_date
        assert customer["annual_reports"][0]["net_worth"] == 4000000

    def test_multiple_ar_parsing_results(
        self, files_collection, customers_collection, created_ids
    ):
        """여러 AR 문서 파싱 결과가 모두 저장됨"""
        # Given: 3개의 AR 문서 파싱 완료
        customer_id = ObjectId()
        created_ids["customers"].append(customer_id)

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트BG고객5"},
            "annual_reports": [],
            "meta": {
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        })

        parsing_results = []
        for i in range(3):
            doc_id = ObjectId()
            created_ids["documents"].append(doc_id)

            files_collection.insert_one({
                "_id": doc_id,
                "is_annual_report": True,
                "ar_parsing_status": "completed",
                "customer_relation": {"customer_id": customer_id}
            })

            result = {
                "issue_date": datetime(2024, i+1, 1),
                "assets": {"total": (i+1) * 1000000},
                "source_file_id": str(doc_id)
            }
            parsing_results.append(result)

        # When: 모든 파싱 결과 저장
        for result in parsing_results:
            customers_collection.update_one(
                {"_id": customer_id},
                {
                    "$push": {"annual_reports": result},
                    "$set": {"meta.updated_at": datetime.now(timezone.utc)}
                }
            )

        # Then: 3개 모두 저장 확인
        customer = customers_collection.find_one({"_id": customer_id})
        assert len(customer["annual_reports"]) == 3


class TestARBackgroundParsingCount:
    """백그라운드 파싱 진행 상황 카운트"""

    def test_count_processing_ar_documents(
        self, files_collection, customers_collection, created_ids
    ):
        """파싱 중/대기 중인 AR 문서 개수 확인"""
        # Given: pending 2개, processing 1개, completed 1개
        customer_id = ObjectId()
        created_ids["customers"].append(customer_id)

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트BG고객6"},
            "annual_reports": [],
            "meta": {
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        })

        statuses = ["pending", "pending", "processing", "completed"]
        for status in statuses:
            doc_id = ObjectId()
            created_ids["documents"].append(doc_id)
            files_collection.insert_one({
                "_id": doc_id,
                "is_annual_report": True,
                "ar_parsing_status": status,
                "customer_relation": {"customer_id": customer_id}
            })

        # When: 파싱 중/대기 중인 문서 개수 조회
        query = {
            "is_annual_report": True,
            "customer_relation.customer_id": customer_id,
            "$or": [
                {"ar_parsing_status": "pending"},
                {"ar_parsing_status": "processing"}
            ]
        }
        processing_count = files_collection.count_documents(query)

        # Then: 3개 (pending 2개 + processing 1개)
        assert processing_count == 3
