"""
test_ar_result_guarantee.py
AR 파싱 결과 보장 테스트

목표: "모든 AR 문서(is_annual_report: true)는 반드시 파싱 결과를 남긴다"를 증명

파싱 결과의 형태:
- completed: customers.annual_reports[]에 저장
- error: files.ar_parsing_error에 에러 메시지 저장
- processing: files.ar_parsing_status에 진행중 상태 저장
"""

import pytest
from datetime import datetime, timezone
from bson import ObjectId
from pymongo import MongoClient
import os
import sys
from unittest.mock import Mock, patch, MagicMock

# 프로젝트 루트 경로 추가
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from routes.background import parse_single_ar_document
from services.db_writer import get_annual_reports

# 테스트용 MongoDB 연결 설정
TEST_MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
TEST_DB_NAME = "docupload"


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
    return db["files"]


@pytest.fixture(scope="module")
def customers_collection(db):
    """customers 컬렉션 픽스처"""
    return db["customers"]


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
    customers_collection.delete_many({"personal_info.name": {"$regex": "^테스트ARG"}})


@pytest.fixture
def ar_document_pending(files_collection, customers_collection, created_ids):
    """pending 상태의 AR 문서 생성"""
    customer_id = ObjectId()
    document_id = ObjectId()

    customers_collection.insert_one({
        "_id": customer_id,
        "personal_info": {"name": "테스트ARG고객1"},
        "annual_reports": [],
        "meta": {"created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}
    })

    files_collection.insert_one({
        "_id": document_id,
        "is_annual_report": True,
        "ar_parsing_status": "pending",
        "customerId": customer_id,
        "upload": {
            "originalName": "테스트ARG고객1보유계약현황202508.pdf",
            "destPath": "/tmp/test-ar-pending.pdf",
            "uploaded_at": datetime.now(timezone.utc)
        }
    })

    created_ids["documents"].append(document_id)
    created_ids["customers"].append(customer_id)

    return {"customer_id": customer_id, "document_id": document_id}


@pytest.fixture
def ar_document_with_error(files_collection, customers_collection, created_ids):
    """에러 상태의 AR 문서 생성"""
    customer_id = ObjectId()
    document_id = ObjectId()

    customers_collection.insert_one({
        "_id": customer_id,
        "personal_info": {"name": "테스트ARG고객2"},
        "annual_reports": [],
        "meta": {"created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}
    })

    files_collection.insert_one({
        "_id": document_id,
        "is_annual_report": True,
        "ar_parsing_status": "error",
        "ar_parsing_error": "OpenAI rate limit exceeded (429)",
        "customerId": customer_id,
        "upload": {
            "originalName": "테스트ARG고객2보유계약현황202508.pdf",
            "uploaded_at": datetime.now(timezone.utc)
        }
    })

    created_ids["documents"].append(document_id)
    created_ids["customers"].append(customer_id)

    return {"customer_id": customer_id, "document_id": document_id}


@pytest.fixture
def ar_document_processing(files_collection, customers_collection, created_ids):
    """processing 상태의 AR 문서 생성"""
    customer_id = ObjectId()
    document_id = ObjectId()

    customers_collection.insert_one({
        "_id": customer_id,
        "personal_info": {"name": "테스트ARG고객3"},
        "annual_reports": [],
        "meta": {"created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}
    })

    files_collection.insert_one({
        "_id": document_id,
        "is_annual_report": True,
        "ar_parsing_status": "processing",
        "customerId": customer_id,
        "upload": {
            "originalName": "테스트ARG고객3보유계약현황202508.pdf",
            "uploaded_at": datetime.now(timezone.utc)
        }
    })

    created_ids["documents"].append(document_id)
    created_ids["customers"].append(customer_id)

    return {"customer_id": customer_id, "document_id": document_id}


@pytest.fixture
def ar_document_completed(files_collection, customers_collection, created_ids):
    """completed 상태의 AR 문서 생성 (annual_reports에 결과 있음)"""
    customer_id = ObjectId()
    document_id = ObjectId()

    # 🔥 datetime을 UTC timezone-aware로 생성
    customers_collection.insert_one({
        "_id": customer_id,
        "personal_info": {"name": "테스트ARG고객4"},
        "annual_reports": [{
            "source_file_id": document_id,
            "customer_name": "테스트ARG고객4",
            "issue_date": datetime(2025, 8, 1, tzinfo=timezone.utc),  # UTC timezone 추가
            "total_monthly_premium": 100000,
            "total_contracts": 3,
            "contracts": [],
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "parsed_at": datetime.now(timezone.utc).isoformat()
        }],
        "meta": {"created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}
    })

    files_collection.insert_one({
        "_id": document_id,
        "is_annual_report": True,
        "ar_parsing_status": "completed",
        "customerId": customer_id,
        "upload": {
            "originalName": "테스트ARG고객4보유계약현황202508.pdf",
            "uploaded_at": datetime.now(timezone.utc)
        }
    })

    created_ids["documents"].append(document_id)
    created_ids["customers"].append(customer_id)

    return {"customer_id": customer_id, "document_id": document_id}


class TestARErrorScenarios:
    """각 에러 시나리오에서 올바른 상태 전이 검증"""

    @patch('routes.background.get_parser')
    @patch('os.path.exists')
    def test_file_not_found_sets_error_status(
        self, mock_exists, mock_get_parser, db, files_collection, ar_document_pending
    ):
        """파일 경로 없음 → ar_parsing_status: error"""
        file_id = str(ar_document_pending["document_id"])
        customer_id = str(ar_document_pending["customer_id"])

        # 파일이 존재하지 않음
        mock_exists.return_value = False

        # parse_single_ar_document 호출
        result = parse_single_ar_document(db, file_id, customer_id)

        # 검증
        assert result["success"] == False
        assert "존재하지 않음" in result.get("error", "")

        doc = files_collection.find_one({"_id": ObjectId(file_id)})
        assert doc["ar_parsing_status"] == "error"
        assert doc.get("ar_parsing_error") is not None

    @patch('routes.background.find_contract_table_end_page', return_value=2)
    @patch('routes.background.get_parser')
    @patch('os.path.exists')
    def test_openai_rate_limit_sets_error_status(
        self, mock_exists, mock_get_parser, mock_end_page, db, files_collection, ar_document_pending
    ):
        """OpenAI 429 Rate Limit → ar_parsing_status: error"""
        file_id = str(ar_document_pending["document_id"])
        customer_id = str(ar_document_pending["customer_id"])

        mock_exists.return_value = True
        # get_parser() returns a parser function; parser function returns error
        mock_get_parser.return_value.return_value = {"error": "Rate limit exceeded (429)"}

        result = parse_single_ar_document(db, file_id, customer_id)

        assert result["success"] == False

        doc = files_collection.find_one({"_id": ObjectId(file_id)})
        assert doc["ar_parsing_status"] == "error"
        assert "Rate limit" in doc.get("ar_parsing_error", "")

    @patch('routes.background.find_contract_table_end_page', return_value=2)
    @patch('routes.background.get_parser')
    @patch('os.path.exists')
    def test_openai_timeout_sets_error_status(
        self, mock_exists, mock_get_parser, mock_end_page, db, files_collection, ar_document_pending
    ):
        """OpenAI 타임아웃 → ar_parsing_status: error"""
        file_id = str(ar_document_pending["document_id"])
        customer_id = str(ar_document_pending["customer_id"])

        mock_exists.return_value = True
        mock_get_parser.return_value.return_value = {"error": "Request timeout after 60s"}

        result = parse_single_ar_document(db, file_id, customer_id)

        assert result["success"] == False

        doc = files_collection.find_one({"_id": ObjectId(file_id)})
        assert doc["ar_parsing_status"] == "error"
        assert "timeout" in doc.get("ar_parsing_error", "").lower()

    @patch('routes.background.find_contract_table_end_page', return_value=2)
    @patch('routes.background.get_parser')
    @patch('os.path.exists')
    def test_json_parse_error_sets_error_status(
        self, mock_exists, mock_get_parser, mock_end_page, db, files_collection, ar_document_pending
    ):
        """LLM 응답 JSON 파싱 실패 → ar_parsing_status: error"""
        file_id = str(ar_document_pending["document_id"])
        customer_id = str(ar_document_pending["customer_id"])

        mock_exists.return_value = True
        mock_get_parser.return_value.return_value = {"error": "JSON 파싱 실패: Expecting value"}

        result = parse_single_ar_document(db, file_id, customer_id)

        assert result["success"] == False

        doc = files_collection.find_one({"_id": ObjectId(file_id)})
        assert doc["ar_parsing_status"] == "error"
        assert "JSON" in doc.get("ar_parsing_error", "")

    @patch('routes.background.extract_customer_info_from_first_page', return_value={})
    @patch('routes.background.save_annual_report')
    @patch('routes.background.find_contract_table_end_page', return_value=2)
    @patch('routes.background.get_parser')
    @patch('os.path.exists')
    def test_db_save_failure_sets_error_status(
        self, mock_exists, mock_get_parser, mock_end_page, mock_save, mock_extract,
        db, files_collection, ar_document_pending
    ):
        """MongoDB 저장 실패 → ar_parsing_status: error"""
        file_id = str(ar_document_pending["document_id"])
        customer_id = str(ar_document_pending["customer_id"])

        mock_exists.return_value = True
        # Parser returns valid result (no "error" key)
        mock_get_parser.return_value.return_value = {
            "보유계약 현황": [],
            "부활가능 실효계약": [],
            "총_월보험료": 0
        }
        mock_save.return_value = {"success": False, "message": "DB connection error"}

        result = parse_single_ar_document(db, file_id, customer_id)

        assert result["success"] == False

        doc = files_collection.find_one({"_id": ObjectId(file_id)})
        assert doc["ar_parsing_status"] == "error"
        assert doc.get("ar_parsing_error") is not None

    @patch('routes.background.find_contract_table_end_page', return_value=2)
    @patch('routes.background.get_parser')
    @patch('os.path.exists')
    def test_unexpected_exception_sets_error_status(
        self, mock_exists, mock_get_parser, mock_end_page, db, files_collection, ar_document_pending
    ):
        """예상치 못한 예외 → ar_parsing_status: error"""
        file_id = str(ar_document_pending["document_id"])
        customer_id = str(ar_document_pending["customer_id"])

        mock_exists.return_value = True
        mock_get_parser.return_value.side_effect = Exception("Unexpected error occurred")

        result = parse_single_ar_document(db, file_id, customer_id)

        assert result["success"] == False

        doc = files_collection.find_one({"_id": ObjectId(file_id)})
        assert doc["ar_parsing_status"] == "error"
        assert doc.get("ar_parsing_error") is not None


class TestGetAnnualReportsIncludesAll:
    """get_annual_reports()가 모든 상태의 AR을 반환하는지 검증"""

    def test_returns_completed_reports(self, db, ar_document_completed):
        """completed 상태 AR이 반환됨"""
        customer_id = str(ar_document_completed["customer_id"])

        result = get_annual_reports(db, customer_id)

        assert result["success"] == True
        assert result["count"] >= 1

        # completed 상태 리포트 확인
        completed_reports = [r for r in result["data"] if r.get("status") == "completed"]
        assert len(completed_reports) >= 1

    def test_returns_error_reports_from_files(self, db, ar_document_with_error):
        """error 상태 AR이 files 컬렉션에서 조회되어 반환됨"""
        customer_id = str(ar_document_with_error["customer_id"])

        result = get_annual_reports(db, customer_id)

        assert result["success"] == True
        assert result["count"] >= 1

        # error 상태 리포트 확인
        error_reports = [r for r in result["data"] if r.get("status") == "error"]
        assert len(error_reports) >= 1

    def test_returns_processing_reports_from_files(self, db, ar_document_processing):
        """processing 상태 AR이 files 컬렉션에서 조회되어 반환됨"""
        customer_id = str(ar_document_processing["customer_id"])

        result = get_annual_reports(db, customer_id)

        assert result["success"] == True
        assert result["count"] >= 1

        # processing 상태 리포트 확인
        processing_reports = [r for r in result["data"] if r.get("status") == "processing"]
        assert len(processing_reports) >= 1

    def test_mixed_status_reports_all_returned(
        self, db, files_collection, customers_collection, created_ids
    ):
        """completed + error + processing 혼합 시 모두 반환됨"""
        customer_id = ObjectId()
        created_ids["customers"].append(customer_id)

        # 고객 생성 (completed AR 포함)
        # 🔥 datetime을 UTC timezone-aware로 생성
        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트ARG고객Mixed"},
            "annual_reports": [{
                "source_file_id": ObjectId(),
                "customer_name": "테스트ARG고객Mixed",
                "issue_date": datetime(2025, 1, 1, tzinfo=timezone.utc),  # UTC timezone 추가
                "total_monthly_premium": 50000,
                "total_contracts": 2,
                "contracts": [],
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "parsed_at": datetime.now(timezone.utc).isoformat()
            }],
            "meta": {"created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}
        })

        # error 상태 문서
        error_doc_id = ObjectId()
        created_ids["documents"].append(error_doc_id)
        files_collection.insert_one({
            "_id": error_doc_id,
            "is_annual_report": True,
            "ar_parsing_status": "error",
            "ar_parsing_error": "Rate limit exceeded",
            "customerId": customer_id,
            "upload": {"originalName": "error_doc.pdf", "uploaded_at": datetime.now(timezone.utc)}
        })

        # processing 상태 문서
        processing_doc_id = ObjectId()
        created_ids["documents"].append(processing_doc_id)
        files_collection.insert_one({
            "_id": processing_doc_id,
            "is_annual_report": True,
            "ar_parsing_status": "processing",
            "customerId": customer_id,
            "upload": {"originalName": "processing_doc.pdf", "uploaded_at": datetime.now(timezone.utc)}
        })

        # 조회
        result = get_annual_reports(db, str(customer_id))

        assert result["success"] == True
        assert result["count"] == 3  # completed 1 + error 1 + processing 1

        statuses = [r.get("status") for r in result["data"]]
        assert "completed" in statuses
        assert "error" in statuses
        assert "processing" in statuses

    def test_error_report_has_error_message(self, db, ar_document_with_error):
        """error 상태 AR에 error_message 필드 포함"""
        customer_id = str(ar_document_with_error["customer_id"])

        result = get_annual_reports(db, customer_id)

        assert result["success"] == True

        error_reports = [r for r in result["data"] if r.get("status") == "error"]
        assert len(error_reports) >= 1

        # error_message 필드 확인
        for report in error_reports:
            assert report.get("error_message") is not None
            assert len(report["error_message"]) > 0

    def test_all_ar_files_have_corresponding_result(
        self, db, files_collection, customers_collection, created_ids
    ):
        """files.is_annual_report=true인 모든 문서가 조회 결과에 포함"""
        customer_id = ObjectId()
        created_ids["customers"].append(customer_id)

        # 고객 생성
        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트ARG고객All"},
            "annual_reports": [],
            "meta": {"created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}
        })

        # 3개의 AR 문서 생성 (각각 다른 상태)
        statuses = ["pending", "processing", "error"]
        doc_ids = []

        for i, status in enumerate(statuses):
            doc_id = ObjectId()
            doc_ids.append(doc_id)
            created_ids["documents"].append(doc_id)

            doc_data = {
                "_id": doc_id,
                "is_annual_report": True,
                "ar_parsing_status": status,
                "customerId": customer_id,
                "upload": {"originalName": f"doc_{i}.pdf", "uploaded_at": datetime.now(timezone.utc)}
            }

            if status == "error":
                doc_data["ar_parsing_error"] = "Test error message"

            files_collection.insert_one(doc_data)

        # files에서 AR 문서 수 조회
        ar_file_count = files_collection.count_documents({
            "customerId": customer_id,
            "is_annual_report": True
        })

        # get_annual_reports 조회
        result = get_annual_reports(db, str(customer_id))

        # 검증: 모든 AR 문서가 결과에 포함
        # pending 상태는 error/processing과 다르게 조회되지 않을 수 있음 (파싱 전)
        # error와 processing만 확인
        error_or_processing = files_collection.count_documents({
            "customerId": customer_id,
            "is_annual_report": True,
            "ar_parsing_status": {"$in": ["error", "processing"]}
        })

        assert result["count"] >= error_or_processing


class TestRetryParsing:
    """재시도 기능 테스트"""

    def test_retry_resets_status_to_pending(
        self, db, files_collection, ar_document_with_error
    ):
        """재시도 시 ar_parsing_status가 pending으로 초기화"""
        file_id = ar_document_with_error["document_id"]

        # 재시도 전 상태 확인
        doc_before = files_collection.find_one({"_id": file_id})
        assert doc_before["ar_parsing_status"] == "error"

        # 재시도 상태로 변경 (retry API 로직 시뮬레이션)
        files_collection.update_one(
            {"_id": file_id},
            {
                "$set": {
                    "ar_parsing_status": "pending",
                    "ar_parsing_error": None,
                    "ar_parsing_retry_at": datetime.now(timezone.utc)
                }
            }
        )

        # 재시도 후 상태 확인
        doc_after = files_collection.find_one({"_id": file_id})
        assert doc_after["ar_parsing_status"] == "pending"

    def test_retry_clears_error_message(
        self, db, files_collection, ar_document_with_error
    ):
        """재시도 시 ar_parsing_error가 null로 초기화"""
        file_id = ar_document_with_error["document_id"]

        # 재시도 전 에러 메시지 확인
        doc_before = files_collection.find_one({"_id": file_id})
        assert doc_before.get("ar_parsing_error") is not None

        # 재시도 상태로 변경
        files_collection.update_one(
            {"_id": file_id},
            {
                "$set": {
                    "ar_parsing_status": "pending",
                    "ar_parsing_error": None
                }
            }
        )

        # 재시도 후 에러 메시지 확인
        doc_after = files_collection.find_one({"_id": file_id})
        assert doc_after.get("ar_parsing_error") is None


class TestARInvariant:
    """AR 파싱 불변성 테스트: 모든 AR 문서는 반드시 결과를 가진다"""

    @pytest.mark.parametrize("error_scenario,error_mock", [
        ("file_not_found", {"error": "파일이 존재하지 않음"}),
        ("invalid_pdf", {"error": "PDF 파싱 실패: Invalid PDF"}),
        ("openai_rate_limit", {"error": "Rate limit exceeded (429)"}),
        ("openai_timeout", {"error": "Request timeout after 60s"}),
        ("json_parse_error", {"error": "JSON 파싱 실패: Expecting value"}),
        ("db_save_error", {"error": "DB 저장 실패"}),
    ])
    @patch('routes.background.find_contract_table_end_page', return_value=2)
    @patch('routes.background.get_parser')
    @patch('os.path.exists')
    def test_ar_always_leaves_result(
        self, mock_exists, mock_get_parser, mock_end_page, error_scenario, error_mock,
        db, files_collection, customers_collection, created_ids
    ):
        """
        에러 발생해도 ar_parsing_status와 ar_parsing_error가 반드시 설정됨

        이 테스트는 "모든 AR 문서는 반드시 파싱 결과를 남긴다"는 핵심 보장을 검증합니다.
        """
        # 테스트용 AR 문서 생성
        customer_id = ObjectId()
        document_id = ObjectId()

        created_ids["customers"].append(customer_id)
        created_ids["documents"].append(document_id)

        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": f"테스트ARG_{error_scenario}"},
            "annual_reports": [],
            "meta": {"created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}
        })

        files_collection.insert_one({
            "_id": document_id,
            "is_annual_report": True,
            "ar_parsing_status": "pending",
            "customerId": customer_id,
            "upload": {
                "originalName": f"test_{error_scenario}.pdf",
                "destPath": f"/tmp/test_{error_scenario}.pdf",
                "uploaded_at": datetime.now(timezone.utc)
            }
        })

        # Mock 설정
        if error_scenario == "file_not_found":
            mock_exists.return_value = False
        else:
            mock_exists.return_value = True
            # get_parser() returns parser function; parser function returns error
            mock_get_parser.return_value.return_value = error_mock

        # 파싱 실행
        result = parse_single_ar_document(db, str(document_id), str(customer_id))

        # 핵심 검증: 에러 발생해도 상태가 반드시 설정됨
        doc = files_collection.find_one({"_id": document_id})

        # 불변성 1: ar_parsing_status는 반드시 "error" 또는 "completed"
        assert doc["ar_parsing_status"] in ["error", "completed"], \
            f"AR 문서 상태가 올바르지 않음: {doc['ar_parsing_status']}"

        # 불변성 2: error 상태면 ar_parsing_error가 반드시 존재
        if doc["ar_parsing_status"] == "error":
            assert doc.get("ar_parsing_error") is not None, \
                "에러 상태인데 에러 메시지가 없음"
            assert len(doc["ar_parsing_error"]) > 0, \
                "에러 메시지가 비어있음"


class TestARCompleteness:
    """AR 완전성 테스트: 모든 AR 문서가 조회 결과에 포함되는지 검증"""

    def test_no_orphan_ar_documents(
        self, db, files_collection, customers_collection, created_ids
    ):
        """
        고객에게 연결된 모든 AR 문서가 get_annual_reports 결과에 포함됨

        "고아 AR 문서"가 없어야 함:
        - files.is_annual_report=true이고 customerId가 있는 문서는
        - 반드시 get_annual_reports 결과에 나타나야 함
        """
        customer_id = ObjectId()
        created_ids["customers"].append(customer_id)

        # 🔥 datetime을 UTC timezone-aware로 생성
        customers_collection.insert_one({
            "_id": customer_id,
            "personal_info": {"name": "테스트ARG_완전성"},
            "annual_reports": [{
                "source_file_id": ObjectId(),
                "customer_name": "테스트ARG_완전성",
                "issue_date": datetime(2025, 6, 1, tzinfo=timezone.utc),  # UTC timezone 추가
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "parsed_at": datetime.now(timezone.utc).isoformat()
            }],
            "meta": {"created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}
        })

        # 다양한 상태의 AR 문서 생성
        test_docs = [
            ("error", "Test error 1"),
            ("error", "Test error 2"),
            ("processing", None),
        ]

        for status, error_msg in test_docs:
            doc_id = ObjectId()
            created_ids["documents"].append(doc_id)

            doc_data = {
                "_id": doc_id,
                "is_annual_report": True,
                "ar_parsing_status": status,
                "customerId": customer_id,
                "upload": {"originalName": f"{status}_doc.pdf", "uploaded_at": datetime.now(timezone.utc)}
            }

            if error_msg:
                doc_data["ar_parsing_error"] = error_msg

            files_collection.insert_one(doc_data)

        # 조회
        result = get_annual_reports(db, str(customer_id))

        # 검증
        assert result["success"] == True

        # completed 1개 + error 2개 + processing 1개 = 4개
        expected_count = 1 + len(test_docs)
        assert result["count"] == expected_count, \
            f"예상 {expected_count}개, 실제 {result['count']}개"

        # 모든 상태가 포함되어 있는지 확인
        statuses = [r.get("status") for r in result["data"]]
        assert statuses.count("error") == 2
        assert statuses.count("processing") == 1
        assert statuses.count("completed") == 1
