"""
test_document_deletion.py
문서 삭제 시 고객 참조 자동 정리 유닛 테스트

테스트 시나리오:
1. 1:1 관계 - 한 문서를 한 명의 고객이 참조
2. 1:N 관계 - 한 문서를 여러 명의 고객이 참조
3. 참조 없는 문서 삭제
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
    customers_collection.delete_many({"personal_info.name": {"$regex": "^테스트고객"}})


class TestDocumentDeletionOneToOne:
    """1:1 관계 - 한 문서를 한 명의 고객이 참조"""

    def test_delete_document_removes_customer_reference(
        self, files_collection, customers_collection, created_ids
    ):
        """문서 삭제 시 해당 고객의 documents 배열에서 참조 제거"""
        # Given: 문서와 고객 생성
        document_id = ObjectId()
        customer_id = ObjectId()

        # ID 추적
        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "upload": {
                "destPath": "/tmp/test-file.pdf",
                "uploaded_at": datetime.now(UTC)
            },
            "meta": {
                "mime": "application/pdf",
                "size_bytes": 1024
            }
        })

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {
                "name": "테스트고객1"
            },
            "documents": [
                {
                    "document_id": document_id,
                    "relationship": "annual_report",
                    "upload_date": datetime.now(UTC),
                    "notes": ""
                }
            ],
            "meta": {
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC)
            }
        })

        # When: 문서 삭제 로직 실행 (고객 참조 정리 포함)
        # 1. 고객 참조 정리
        customers_update_result = customers_collection.update_many(
            {"documents.document_id": document_id},
            {
                "$pull": {"documents": {"document_id": document_id}},
                "$set": {"meta.updated_at": datetime.now(UTC)}
            }
        )

        # 2. 문서 삭제
        files_collection.delete_one({"_id": document_id})

        # Then: 검증
        # 1. 고객 참조가 업데이트되었는지 확인
        assert customers_update_result.modified_count == 1

        # 2. 고객의 documents 배열이 비어있는지 확인
        customer = customers_collection.find_one({"_id": customer_id})
        assert customer["documents"] == []

        # 3. 문서가 삭제되었는지 확인
        document = files_collection.find_one({"_id": document_id})
        assert document is None

    def test_delete_document_without_reference(
        self, files_collection, customers_collection, created_ids
    ):
        """참조가 없는 문서 삭제 시 오류 없이 정상 처리"""
        # Given: 고객 참조가 없는 문서
        document_id = ObjectId()

        # ID 추적
        created_ids["documents"].append(document_id)

        files_collection.insert_one({
            "_id": document_id,
            "upload": {
                "destPath": "/tmp/test-file-no-ref.pdf",
                "uploaded_at": datetime.now(UTC)
            }
        })

        # When: 문서 삭제 로직 실행
        customers_update_result = customers_collection.update_many(
            {"documents.document_id": document_id},
            {
                "$pull": {"documents": {"document_id": document_id}},
                "$set": {"meta.updated_at": datetime.now(UTC)}
            }
        )

        files_collection.delete_one({"_id": document_id})

        # Then: 검증
        # 1. 업데이트된 고객이 없음 (0명)
        assert customers_update_result.modified_count == 0

        # 2. 문서는 정상적으로 삭제됨
        document = files_collection.find_one({"_id": document_id})
        assert document is None


class TestDocumentDeletionOneToMany:
    """1:N 관계 - 한 문서를 여러 명의 고객이 참조"""

    def test_delete_document_removes_all_customer_references(
        self, files_collection, customers_collection, created_ids
    ):
        """문서 삭제 시 모든 고객의 documents 배열에서 참조 제거"""
        # Given: 하나의 문서를 3명의 고객이 참조
        document_id = ObjectId()
        customer1_id = ObjectId()
        customer2_id = ObjectId()
        customer3_id = ObjectId()

        # ID 추적
        created_ids["documents"].append(document_id)
        created_ids["customers"].extend([customer1_id, customer2_id, customer3_id])

        files_collection.insert_one({
            "_id": document_id,
            "upload": {
                "destPath": "/tmp/test-shared-file.pdf",
                "uploaded_at": datetime.now(UTC)
            }
        })

        upload_date = datetime.now(UTC)

        customers_collection.insert_many([
            {
                "_id": customer1_id,
                "personal_info": {"name": "테스트고객A"},
                "documents": [
                    {
                        "document_id": document_id,
                        "relationship": "annual_report",
                        "upload_date": upload_date,
                        "notes": ""
                    }
                ],
                "meta": {
                    "created_at": datetime.now(UTC),
                    "updated_at": datetime.now(UTC)
                }
            },
            {
                "_id": customer2_id,
                "personal_info": {"name": "테스트고객B"},
                "documents": [
                    {
                        "document_id": document_id,
                        "relationship": "contract",
                        "upload_date": upload_date,
                        "notes": ""
                    }
                ],
                "meta": {
                    "created_at": datetime.now(UTC),
                    "updated_at": datetime.now(UTC)
                }
            },
            {
                "_id": customer3_id,
                "personal_info": {"name": "테스트고객C"},
                "documents": [
                    {
                        "document_id": document_id,
                        "relationship": "claim",
                        "upload_date": upload_date,
                        "notes": ""
                    }
                ],
                "meta": {
                    "created_at": datetime.now(UTC),
                    "updated_at": datetime.now(UTC)
                }
            }
        ])

        # When: 문서 삭제 로직 실행
        customers_update_result = customers_collection.update_many(
            {"documents.document_id": document_id},
            {
                "$pull": {"documents": {"document_id": document_id}},
                "$set": {"meta.updated_at": datetime.now(UTC)}
            }
        )

        files_collection.delete_one({"_id": document_id})

        # Then: 검증
        # 1. 3명의 고객이 모두 업데이트되었는지 확인
        assert customers_update_result.modified_count == 3

        # 2. 각 고객의 documents 배열이 비어있는지 확인
        customer1 = customers_collection.find_one({"_id": customer1_id})
        customer2 = customers_collection.find_one({"_id": customer2_id})
        customer3 = customers_collection.find_one({"_id": customer3_id})

        assert customer1["documents"] == []
        assert customer2["documents"] == []
        assert customer3["documents"] == []

        # 3. 문서가 삭제되었는지 확인
        document = files_collection.find_one({"_id": document_id})
        assert document is None

    def test_delete_one_document_keeps_other_references(
        self, files_collection, customers_collection, created_ids
    ):
        """여러 문서를 참조하는 고객에서 특정 문서만 제거"""
        # Given: 한 고객이 2개의 문서를 참조, 그 중 1개만 삭제
        document1_id = ObjectId()
        document2_id = ObjectId()
        customer_id = ObjectId()

        # ID 추적
        created_ids["documents"].extend([document1_id, document2_id])
        created_ids["customers"].append(customer_id)

        files_collection.insert_many([
            {
                "_id": document1_id,
                "upload": {"destPath": "/tmp/test-doc1.pdf", "uploaded_at": datetime.now(UTC)}
            },
            {
                "_id": document2_id,
                "upload": {"destPath": "/tmp/test-doc2.pdf", "uploaded_at": datetime.now(UTC)}
            }
        ])

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트고객"},
            "documents": [
                {
                    "document_id": document1_id,
                    "relationship": "annual_report",
                    "upload_date": datetime.now(UTC),
                    "notes": ""
                },
                {
                    "document_id": document2_id,
                    "relationship": "contract",
                    "upload_date": datetime.now(UTC),
                    "notes": ""
                }
            ],
            "meta": {
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC)
            }
        })

        # When: document1만 삭제
        customers_collection.update_many(
            {"documents.document_id": document1_id},
            {
                "$pull": {"documents": {"document_id": document1_id}},
                "$set": {"meta.updated_at": datetime.now(UTC)}
            }
        )

        files_collection.delete_one({"_id": document1_id})

        # Then: 검증
        customer = customers_collection.find_one({"_id": customer_id})

        # 1. documents 배열에 document2만 남아있는지 확인
        assert len(customer["documents"]) == 1
        assert customer["documents"][0]["document_id"] == document2_id
        assert customer["documents"][0]["relationship"] == "contract"

        # 2. document1은 삭제되고 document2는 남아있는지 확인
        doc1 = files_collection.find_one({"_id": document1_id})
        doc2 = files_collection.find_one({"_id": document2_id})
        assert doc1 is None
        assert doc2 is not None

    def test_delete_document_with_many_customers(
        self, files_collection, customers_collection, created_ids
    ):
        """10명 이상의 고객이 참조하는 문서 삭제 (대량 처리)"""
        # Given: 하나의 문서를 10명의 고객이 참조
        document_id = ObjectId()
        customer_count = 10
        customer_ids = []

        # ID 추적
        created_ids["documents"].append(document_id)

        files_collection.insert_one({
            "_id": document_id,
            "upload": {
                "destPath": "/tmp/test-large-ref.pdf",
                "uploaded_at": datetime.now(UTC)
            }
        })

        customers = []
        for i in range(customer_count):
            customer_id = ObjectId()
            customer_ids.append(customer_id)
            created_ids["customers"].append(customer_id)  # ID 추적
            customers.append({
                "_id": customer_id,
                "personal_info": {"name": f"테스트고객{i + 1}"},
                "documents": [
                    {
                        "document_id": document_id,
                        "relationship": "annual_report",
                        "upload_date": datetime.now(UTC),
                        "notes": ""
                    }
                ],
                "meta": {
                    "created_at": datetime.now(UTC),
                    "updated_at": datetime.now(UTC)
                }
            })

        customers_collection.insert_many(customers)

        # When: 문서 삭제 로직 실행
        customers_update_result = customers_collection.update_many(
            {"documents.document_id": document_id},
            {
                "$pull": {"documents": {"document_id": document_id}},
                "$set": {"meta.updated_at": datetime.now(UTC)}
            }
        )

        files_collection.delete_one({"_id": document_id})

        # Then: 검증
        # 1. 10명의 고객이 모두 업데이트되었는지 확인
        assert customers_update_result.modified_count == customer_count

        # 2. 모든 고객의 documents 배열이 비어있는지 확인
        updated_customers = list(customers_collection.find({
            "_id": {"$in": customer_ids}
        }))

        for customer in updated_customers:
            assert customer["documents"] == []

        # 3. 문서가 삭제되었는지 확인
        document = files_collection.find_one({"_id": document_id})
        assert document is None


class TestMetaUpdatedAt:
    """meta.updated_at 갱신 확인"""

    def test_meta_updated_at_is_refreshed(
        self, files_collection, customers_collection, created_ids
    ):
        """고객 참조 정리 시 meta.updated_at이 갱신되는지 확인"""
        # Given: 문서와 고객 생성 (초기 updated_at 설정)
        document_id = ObjectId()
        customer_id = ObjectId()
        initial_update_time = datetime(2025, 1, 1, 0, 0, 0)

        # ID 추적
        created_ids["documents"].append(document_id)
        created_ids["customers"].append(customer_id)

        files_collection.insert_one({
            "_id": document_id,
            "upload": {"destPath": "/tmp/test-file.pdf", "uploaded_at": datetime.now(UTC)}
        })

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트고객"},
            "documents": [
                {
                    "document_id": document_id,
                    "relationship": "annual_report",
                    "upload_date": datetime.now(UTC),
                    "notes": ""
                }
            ],
            "meta": {
                "created_at": initial_update_time,
                "updated_at": initial_update_time
            }
        })

        # When: 문서 삭제 로직 실행
        customers_collection.update_many(
            {"documents.document_id": document_id},
            {
                "$pull": {"documents": {"document_id": document_id}},
                "$set": {"meta.updated_at": datetime.now(UTC)}
            }
        )

        files_collection.delete_one({"_id": document_id})

        # Then: 검증
        customer = customers_collection.find_one({"_id": customer_id})

        # meta.updated_at이 갱신되었는지 확인
        assert customer["meta"]["updated_at"] > initial_update_time
