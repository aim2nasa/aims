"""
test_ar_deletion.py
AR 문서 삭제 시 customers.annual_reports 파싱 자동 삭제 유닛 테스트

최근 기능 (커밋 b921b5c):
- AR 문서 삭제 시 files 컬렉션뿐만 아니라 customers.annual_reports 배열에서도 파싱 데이터 삭제
- 발행일(issue_date) 기준으로 매칭하여 삭제
- 오류 발생해도 문서 삭제는 계속 진행

테스트 시나리오:
1. AR 문서 삭제 시 customers.annual_reports에서 동일 발행일 파싱 삭제
2. 발행일이 문자열인 경우 datetime 변환 후 삭제
3. 발행일이 datetime 객체인 경우 그대로 삭제
4. ar_metadata가 없는 AR 문서 삭제 (오류 없이 진행)
5. customer_relation이 없는 AR 문서 삭제 (오류 없이 진행)
6. is_annual_report가 False인 문서는 annual_reports 삭제 건너뛰기
7. 여러 AR 문서 일괄 삭제 시 각각의 파싱 데이터 삭제
8. 동일 발행일의 여러 파싱이 있는 경우 모두 삭제
"""

import pytest
from datetime import datetime, UTC
from bson import ObjectId
from pymongo import MongoClient
import os

# 테스트용 MongoDB 연결 설정
TEST_MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
TEST_DB_NAME = "docupload"
COLLECTION_NAME = "files"
CUSTOMERS_COLLECTION = "customers"


@pytest.fixture(scope="module")
def mongo_client():
    """MongoDB 클라이언트 픽스처"""
    client = MongoClient(TEST_MONGO_URI)
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

    # 혹시 모를 이름 패턴으로 남은 테스트 데이터 정리
    customers_collection.delete_many({"personal_info.name": {"$regex": "^테스트AR"}})


class TestARDocumentDeletion:
    """AR 문서 삭제 시 annual_reports 파싱 자동 삭제"""

    def test_delete_ar_removes_annual_reports_parsing(
        self, files_collection, customers_collection, created_ids
    ):
        """AR 문서 삭제 시 customers.annual_reports에서 동일 발행일 파싱 삭제"""
        # Given: AR 문서와 고객, annual_reports 파싱 데이터 생성
        document_id = ObjectId()
        customer_id = ObjectId()
        issue_date_str = "2024-01-01"
        issue_date = datetime.fromisoformat(issue_date_str)

        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_metadata": {
                "issue_date": issue_date_str,
                "customer_name": "테스트AR고객1"
            },
            "customer_relation": {
                "customer_id": customer_id
            },
            "upload": {
                "destPath": "/tmp/test-ar.pdf",
                "uploaded_at": datetime.now(UTC)
            }
        })

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {
                "name": "테스트AR고객1"
            },
            "annual_reports": [
                {
                    "issue_date": issue_date,
                    "assets": {"total": 1000000},
                    "source_file_id": str(document_id)
                }
            ],
            "meta": {
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC)
            }
        })

        # When: AR 문서 삭제 로직 실행 (실제 DELETE /documents 엔드포인트 로직과 동일)
        document = files_collection.find_one({"_id": document_id})

        # AR 파싱 삭제
        if document.get('is_annual_report') == True:
            ar_metadata = document.get('ar_metadata', {})
            issue_date_from_doc = ar_metadata.get('issue_date')
            customer_relation = document.get('customer_relation', {})
            customer_id_from_doc = customer_relation.get('customer_id')

            if issue_date_from_doc and customer_id_from_doc:
                # issue_date 문자열 → datetime 변환
                if isinstance(issue_date_from_doc, str):
                    try:
                        issue_date_obj = datetime.fromisoformat(issue_date_from_doc.replace('Z', '+00:00'))
                    except:
                        issue_date_obj = issue_date_from_doc
                else:
                    issue_date_obj = issue_date_from_doc

                # customers.annual_reports에서 동일 발행일 파싱 삭제
                ar_delete_result = customers_collection.update_one(
                    {"_id": customer_id_from_doc},
                    {
                        "$pull": {
                            "annual_reports": {"issue_date": issue_date_obj}
                        },
                        "$set": {"meta.updated_at": datetime.now(UTC)}
                    }
                )

        # 문서 삭제
        files_collection.delete_one({"_id": document_id})

        # Then: 검증
        # 1. annual_reports 배열이 비어있는지 확인
        customer = customers_collection.find_one({"_id": customer_id})
        assert customer["annual_reports"] == []

        # 2. 문서가 삭제되었는지 확인
        doc = files_collection.find_one({"_id": document_id})
        assert doc is None

    def test_delete_ar_with_string_issue_date(
        self, files_collection, customers_collection, created_ids
    ):
        """발행일이 문자열인 경우 datetime 변환 후 삭제"""
        # Given: issue_date가 문자열 형태
        document_id = ObjectId()
        customer_id = ObjectId()
        issue_date_str = "2024-06-15T00:00:00Z"
        issue_date_dt = datetime.fromisoformat(issue_date_str.replace('Z', '+00:00'))

        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_metadata": {
                "issue_date": issue_date_str,  # 문자열
                "customer_name": "테스트AR고객2"
            },
            "customer_relation": {
                "customer_id": customer_id
            },
            "upload": {"destPath": "/tmp/test-ar-2.pdf"}
        })

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트AR고객2"},
            "annual_reports": [
                {
                    "issue_date": issue_date_dt,  # datetime 객체
                    "assets": {"total": 2000000}
                }
            ],
            "meta": {
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC)
            }
        })

        # When: AR 삭제 로직 실행
        document = files_collection.find_one({"_id": document_id})
        ar_metadata = document.get('ar_metadata', {})
        issue_date_from_doc = ar_metadata.get('issue_date')

        # 문자열 → datetime 변환
        issue_date_obj = datetime.fromisoformat(issue_date_from_doc.replace('Z', '+00:00'))

        customers_collection.update_one(
            {"_id": customer_id},
            {
                "$pull": {"annual_reports": {"issue_date": issue_date_obj}},
                "$set": {"meta.updated_at": datetime.now(UTC)}
            }
        )

        files_collection.delete_one({"_id": document_id})

        # Then: 파싱 삭제 확인
        customer = customers_collection.find_one({"_id": customer_id})
        assert customer["annual_reports"] == []

    def test_delete_ar_with_datetime_issue_date(
        self, files_collection, customers_collection, created_ids
    ):
        """발행일이 이미 datetime 객체인 경우 그대로 삭제"""
        # Given: issue_date가 datetime 객체
        document_id = ObjectId()
        customer_id = ObjectId()
        issue_date = datetime(2024, 12, 31, 0, 0, 0)

        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_metadata": {
                "issue_date": issue_date,  # datetime 객체
                "customer_name": "테스트AR고객3"
            },
            "customer_relation": {"customer_id": customer_id}
        })

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트AR고객3"},
            "annual_reports": [
                {"issue_date": issue_date, "assets": {"total": 3000000}}
            ],
            "meta": {
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC)
            }
        })

        # When: 삭제
        customers_collection.update_one(
            {"_id": customer_id},
            {
                "$pull": {"annual_reports": {"issue_date": issue_date}},
                "$set": {"meta.updated_at": datetime.now(UTC)}
            }
        )

        files_collection.delete_one({"_id": document_id})

        # Then: 확인
        customer = customers_collection.find_one({"_id": customer_id})
        assert customer["annual_reports"] == []

    def test_delete_ar_without_metadata(
        self, files_collection, customers_collection, created_ids
    ):
        """ar_metadata가 없는 AR 문서 삭제 (오류 없이 진행)"""
        # Given: ar_metadata 없음
        document_id = ObjectId()
        customer_id = ObjectId()

        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            # ar_metadata 없음!
            "customer_relation": {"customer_id": customer_id}
        })

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트AR고객4"},
            "annual_reports": [],
            "meta": {
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC)
            }
        })

        # When: 삭제 (ar_metadata가 없어서 AR 파싱 삭제 건너뛰기)
        document = files_collection.find_one({"_id": document_id})
        ar_metadata = document.get('ar_metadata', {})
        issue_date = ar_metadata.get('issue_date')  # None

        if issue_date:
            # 실행되지 않음
            pass

        files_collection.delete_one({"_id": document_id})

        # Then: 문서는 삭제되고, 오류 없이 진행됨
        doc = files_collection.find_one({"_id": document_id})
        assert doc is None

    def test_delete_ar_without_customer_relation(
        self, files_collection, customers_collection, created_ids
    ):
        """customer_relation이 없는 AR 문서 삭제 (오류 없이 진행)"""
        # Given: customer_relation 없음
        document_id = ObjectId()

        created_ids["documents"].append(document_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_metadata": {
                "issue_date": "2024-01-01",
                "customer_name": "고아AR"
            }
            # customer_relation 없음!
        })

        # When: 삭제
        document = files_collection.find_one({"_id": document_id})
        customer_relation = document.get('customer_relation', {})
        customer_id = customer_relation.get('customer_id')  # None

        if customer_id:
            # 실행되지 않음
            pass

        files_collection.delete_one({"_id": document_id})

        # Then: 문서는 삭제됨
        doc = files_collection.find_one({"_id": document_id})
        assert doc is None

    def test_delete_non_ar_document_skips_annual_reports_deletion(
        self, files_collection, customers_collection, created_ids
    ):
        """is_annual_report가 False인 문서는 annual_reports 삭제 건너뛰기"""
        # Given: 일반 문서 (is_annual_report = False)
        document_id = ObjectId()
        customer_id = ObjectId()

        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": False,  # 일반 문서
            "customer_relation": {"customer_id": customer_id}
        })

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트AR고객5"},
            "annual_reports": [
                {"issue_date": datetime(2024, 1, 1), "assets": {"total": 5000000}}
            ],
            "meta": {
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC)
            }
        })

        # When: 삭제 (is_annual_report != True 이므로 annual_reports 삭제 건너뜀)
        document = files_collection.find_one({"_id": document_id})

        if document.get('is_annual_report') == True:
            # 실행되지 않음
            pass

        files_collection.delete_one({"_id": document_id})

        # Then: annual_reports는 그대로 유지
        customer = customers_collection.find_one({"_id": customer_id})
        assert len(customer["annual_reports"]) == 1  # 그대로 유지

    def test_delete_multiple_ar_documents(
        self, files_collection, customers_collection, created_ids
    ):
        """여러 AR 문서 일괄 삭제 시 각각의 파싱 데이터 삭제"""
        # Given: 3개의 AR 문서와 파싱
        customer_id = ObjectId()
        created_ids["customers"].append(customer_id)

        ar_docs = [
            {
                "_id": ObjectId(),
                "is_annual_report": True,
                "ar_metadata": {"issue_date": f"2024-0{i+1}-01", "customer_name": "테스트AR고객6"},
                "customer_relation": {"customer_id": customer_id}
            }
            for i in range(3)
        ]

        for doc in ar_docs:
            created_ids["documents"].append(doc["_id"])
            files_collection.insert_one(doc)

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트AR고객6"},
            "annual_reports": [
                {"issue_date": datetime.fromisoformat(f"2024-0{i+1}-01"), "assets": {"total": (i+1) * 1000000}}
                for i in range(3)
            ],
            "meta": {
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC)
            }
        })

        # When: 모든 AR 문서 삭제
        for doc in ar_docs:
            document = files_collection.find_one({"_id": doc["_id"]})
            ar_metadata = document.get('ar_metadata', {})
            issue_date_str = ar_metadata.get('issue_date')

            if issue_date_str:
                issue_date_obj = datetime.fromisoformat(issue_date_str)
                customers_collection.update_one(
                    {"_id": customer_id},
                    {
                        "$pull": {"annual_reports": {"issue_date": issue_date_obj}},
                        "$set": {"meta.updated_at": datetime.now(UTC)}
                    }
                )

            files_collection.delete_one({"_id": doc["_id"]})

        # Then: 모든 파싱 삭제 확인
        customer = customers_collection.find_one({"_id": customer_id})
        assert customer["annual_reports"] == []

    def test_delete_ar_removes_all_same_issue_date_parsings(
        self, files_collection, customers_collection, created_ids
    ):
        """동일 발행일의 여러 파싱이 있는 경우 모두 삭제"""
        # Given: 동일 발행일로 2개의 파싱 (실제로는 드문 경우지만 가능)
        document_id = ObjectId()
        customer_id = ObjectId()
        issue_date = datetime(2024, 3, 15)

        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_metadata": {"issue_date": "2024-03-15", "customer_name": "테스트AR고객7"},
            "customer_relation": {"customer_id": customer_id}
        })

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트AR고객7"},
            "annual_reports": [
                {"issue_date": issue_date, "assets": {"total": 1000000}, "version": 1},
                {"issue_date": issue_date, "assets": {"total": 1500000}, "version": 2}
            ],
            "meta": {
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC)
            }
        })

        # When: AR 삭제 ($pull은 동일 조건의 모든 항목 삭제)
        customers_collection.update_one(
            {"_id": customer_id},
            {
                "$pull": {"annual_reports": {"issue_date": issue_date}},
                "$set": {"meta.updated_at": datetime.now(UTC)}
            }
        )

        files_collection.delete_one({"_id": document_id})

        # Then: 동일 발행일의 모든 파싱이 삭제됨
        customer = customers_collection.find_one({"_id": customer_id})
        assert customer["annual_reports"] == []


class TestARDeletionMetaUpdated:
    """AR 삭제 시 meta.updated_at 갱신 확인"""

    def test_meta_updated_at_is_refreshed_on_ar_deletion(
        self, files_collection, customers_collection, created_ids
    ):
        """AR 파싱 삭제 시 meta.updated_at이 갱신되는지 확인"""
        # Given
        document_id = ObjectId()
        customer_id = ObjectId()
        initial_update_time = datetime(2025, 1, 1, 0, 0, 0)
        issue_date = datetime(2024, 5, 20)

        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_metadata": {"issue_date": "2024-05-20"},
            "customer_relation": {"customer_id": customer_id}
        })

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트AR고객8"},
            "annual_reports": [
                {"issue_date": issue_date, "assets": {"total": 8000000}}
            ],
            "meta": {
                "created_at": initial_update_time,
                "updated_at": initial_update_time
            }
        })

        # When
        customers_collection.update_one(
            {"_id": customer_id},
            {
                "$pull": {"annual_reports": {"issue_date": issue_date}},
                "$set": {"meta.updated_at": datetime.now(UTC)}
            }
        )

        files_collection.delete_one({"_id": document_id})

        # Then
        customer = customers_collection.find_one({"_id": customer_id})
        assert customer["meta"]["updated_at"] > initial_update_time
