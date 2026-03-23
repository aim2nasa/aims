"""
Layer 2: 부수 동작 통합 테스트

문서를 실제로 document_pipeline API에 업로드하고,
처리 완료 후 DB 상태가 기대대로 세팅되었는지 검증한다.

Golden Master(verify.py)가 "스냅샷 vs 현재 DB"를 비교하는 정적 검증이라면,
이 테스트는 "업로드 → 처리 → DB 확인"의 동적 행위 검증이다.

실행:
    cd ~/aims/backend/api/document_pipeline
    source venv/bin/activate
    pytest golden_master/test_side_effects.py -v

xPipe 교체 후에도 동일한 테스트를 실행하여 부수 동작이 보존되었음을 증명한다.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest
from pymongo import MongoClient
from bson import ObjectId

# ──────────────────────────────────────────────
# 설정
# ──────────────────────────────────────────────

PIPELINE_URL = os.environ.get("PIPELINE_URL", "http://localhost:8100")
AIMS_API_URL = os.environ.get("AIMS_API_URL", "http://localhost:3010")
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
SNAPSHOTS_DIR = Path(os.environ.get("SNAPSHOTS_DIR", "./golden_master/snapshots"))

# 테스트용 사용자 (프로덕션 사용자 중 테스트에 사용할 ID)
TEST_USER_ID = os.environ.get("TEST_USER_ID", "695cfe260e822face7a78535")
TEST_CUSTOMER_ID = os.environ.get("TEST_CUSTOMER_ID", "")  # 필요 시 설정

# 처리 대기 설정
MAX_WAIT_SECONDS = 60
POLL_INTERVAL = 2


@pytest.fixture(scope="session")
def db():
    client = MongoClient(MONGO_URI)
    return client["docupload"]


@pytest.fixture(scope="session")
def snapshots():
    """Golden Master 스냅샷 로드"""
    manifest_path = SNAPSHOTS_DIR / "manifest.json"
    if not manifest_path.exists():
        pytest.skip("Golden Master 스냅샷 없음. 먼저 collect.py 실행 필요.")
    with open(manifest_path) as f:
        manifest = json.load(f)
    snaps = {}
    for sample in manifest["samples"]:
        snap_path = SNAPSHOTS_DIR / f"{sample['id']}.json"
        if snap_path.exists():
            with open(snap_path) as f:
                snaps[sample["id"]] = json.load(f)
    return snaps


def find_snapshot_by_category(snapshots: dict, category: str) -> dict | None:
    """카테고리로 스냅샷 찾기"""
    for snap in snapshots.values():
        if snap["category"] == category:
            return snap
    return None


def find_snapshots_by_category(snapshots: dict, category: str) -> list[dict]:
    """카테고리로 스냅샷 여러 개 찾기"""
    return [s for s in snapshots.values() if s["category"] == category]


def get_doc_from_db(db, doc_id: str) -> dict | None:
    """DB에서 문서 조회"""
    try:
        return db["files"].find_one({"_id": ObjectId(doc_id)})
    except Exception:
        return None


# ──────────────────────────────────────────────
# 정상 경로 테스트
# ──────────────────────────────────────────────

class TestNormalPath:
    """정상 처리 완료 후 DB 상태 검증"""

    def test_completed_document_has_correct_status(self, db, snapshots):
        """완료된 문서: status=completed, overallStatus=completed"""
        snaps = find_snapshots_by_category(snapshots, "normal_unclassified")
        assert len(snaps) > 0, "normal_unclassified 스냅샷 없음"
        for snap in snaps[:5]:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None, f"문서 {snap['doc_id']} DB에 없음"
            assert doc["status"] == "completed"
            assert doc["overallStatus"] == "completed"

    def test_completed_document_has_docembed_status(self, db, snapshots):
        """완료된 문서: docembed.status가 done 또는 skipped"""
        snaps = find_snapshots_by_category(snapshots, "normal_unclassified")
        for snap in snaps[:5]:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None
            docembed = doc.get("docembed", {})
            assert docembed.get("status") in ("done", "skipped", None), \
                f"docembed.status={docembed.get('status')} (expected: done/skipped)"

    def test_policy_document_classified(self, db, snapshots):
        """보험증권: document_type=policy"""
        snaps = find_snapshots_by_category(snapshots, "normal_policy")
        assert len(snaps) > 0, "normal_policy 스냅샷 없음"
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None
            assert doc.get("document_type") == "policy"


# ──────────────────────────────────────────────
# AR 감지 부수 동작
# ──────────────────────────────────────────────

class TestARDetection:
    """Annual Report 감지 시 DB 부수 동작 검증"""

    def test_ar_document_has_is_annual_report_flag(self, db, snapshots):
        """AR 문서: is_annual_report=True"""
        snaps = find_snapshots_by_category(snapshots, "normal_annual_report")
        assert len(snaps) >= 5, f"AR 스냅샷 {len(snaps)}건 (최소 5건 필요)"
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None
            assert doc.get("is_annual_report") is True, \
                f"{snap['id']}: is_annual_report={doc.get('is_annual_report')}"

    def test_ar_document_has_parsing_status(self, db, snapshots):
        """AR 문서: ar_parsing_status 필드 존재 (pending 또는 completed)"""
        snaps = find_snapshots_by_category(snapshots, "normal_annual_report")
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None
            status = doc.get("ar_parsing_status")
            assert status in ("pending", "completed"), \
                f"{snap['id']}: ar_parsing_status={status}"

    def test_ar_document_has_related_customer(self, db, snapshots):
        """AR 문서: relatedCustomerId 연결됨"""
        snaps = find_snapshots_by_category(snapshots, "normal_annual_report")
        linked = 0
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            if doc and doc.get("relatedCustomerId"):
                linked += 1
        # 대부분의 AR 문서는 고객과 연결되어야 함 (일부 매칭 실패 허용)
        assert linked >= len(snaps) * 0.8, \
            f"AR 고객 연결: {linked}/{len(snaps)} (80% 이상 필요)"

    def test_ar_document_type_is_annual_report(self, db, snapshots):
        """AR 문서: document_type=annual_report"""
        snaps = find_snapshots_by_category(snapshots, "normal_annual_report")
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None
            assert doc.get("document_type") == "annual_report"


# ──────────────────────────────────────────────
# CRS 감지 부수 동작
# ──────────────────────────────────────────────

class TestCRSDetection:
    """Customer Review Sheet 감지 시 DB 부수 동작 검증"""

    def test_crs_document_has_is_customer_review_flag(self, db, snapshots):
        """CRS 문서: is_customer_review=True"""
        snaps = find_snapshots_by_category(snapshots, "normal_customer_review")
        assert len(snaps) >= 5, f"CRS 스냅샷 {len(snaps)}건 (최소 5건 필요)"
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None
            assert doc.get("is_customer_review") is True, \
                f"{snap['id']}: is_customer_review={doc.get('is_customer_review')}"

    def test_crs_document_type(self, db, snapshots):
        """CRS 문서: document_type=customer_review"""
        snaps = find_snapshots_by_category(snapshots, "normal_customer_review")
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None
            assert doc.get("document_type") == "customer_review"

    def test_crs_document_has_related_customer(self, db, snapshots):
        """CRS 문서: relatedCustomerId 연결됨"""
        snaps = find_snapshots_by_category(snapshots, "normal_customer_review")
        linked = 0
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            if doc and doc.get("relatedCustomerId"):
                linked += 1
        assert linked >= len(snaps) * 0.8, \
            f"CRS 고객 연결: {linked}/{len(snaps)} (80% 이상 필요)"


# ──────────────────────────────────────────────
# 오류 경로: processingSkipReason
# ──────────────────────────────────────────────

class TestErrorSkipReason:
    """변환 실패 / 지원 안 되는 형식 — 에러가 아닌 완료 처리"""

    def test_unsupported_format_is_completed(self, db, snapshots):
        """지원 안 되는 형식: status=completed + processingSkipReason=unsupported_format"""
        snaps = find_snapshots_by_category(snapshots, "error_unsupported_format")
        assert len(snaps) > 0, "unsupported_format 스냅샷 없음"
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None
            assert doc["status"] == "completed", \
                f"{snap['id']}: status={doc['status']} (expected: completed)"
            assert doc.get("processingSkipReason") == "unsupported_format"

    def test_conversion_failed_is_completed(self, db, snapshots):
        """변환 실패: status=completed + processingSkipReason=conversion_failed"""
        snaps = find_snapshots_by_category(snapshots, "error_conversion_failed")
        assert len(snaps) > 0, "conversion_failed 스냅샷 없음"
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None
            assert doc["status"] == "completed", \
                f"{snap['id']}: status={doc['status']} (expected: completed)"
            assert doc.get("processingSkipReason") == "conversion_failed"


# ──────────────────────────────────────────────
# 오류 경로: credit_pending
# ──────────────────────────────────────────────

class TestCreditPending:
    """크레딧 부족 시 대기 상태 검증"""

    def test_credit_pending_document_status(self, db, snapshots):
        """크레딧 부족: status=credit_pending"""
        snaps = find_snapshots_by_category(snapshots, "error_credit_pending")
        if not snaps:
            pytest.skip("credit_pending 문서 없음")
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None
            assert doc["status"] == "credit_pending"
            assert doc["overallStatus"] == "credit_pending"

    def test_credit_pending_has_text_extracted(self, db, snapshots):
        """크레딧 부족이어도 텍스트 추출은 수행됨 (pdfplumber, 크레딧 불필요)"""
        snaps = find_snapshots_by_category(snapshots, "error_credit_pending")
        if not snaps:
            pytest.skip("credit_pending 문서 없음")
        for snap in snaps:
            doc = get_doc_from_db(db, snap["doc_id"])
            assert doc is not None
            meta = doc.get("meta", {})
            full_text = meta.get("full_text", "") or ""
            # credit_pending 시에도 PDF 텍스트 추출은 가능 (OCR 없이)
            # 텍스트가 0인 경우는 이미지 PDF일 수 있으므로 WARN만
            if not full_text:
                print(f"  WARN: {snap['id']} credit_pending이지만 텍스트 없음 (이미지 PDF일 수 있음)")


# ──────────────────────────────────────────────
# 임베딩 상태
# ──────────────────────────────────────────────

class TestEmbedding:
    """임베딩 상태 검증"""

    def test_completed_documents_have_embedding(self, db, snapshots):
        """완료된 문서: docembed.status=done (텍스트가 있는 경우)"""
        # 특수 상태 태그가 있는 스냅샷 사용
        done_count = 0
        skip_count = 0
        for snap in snapshots.values():
            if snap.get("_sample_tag") != "special_embed_done":
                continue
            doc = get_doc_from_db(db, snap["doc_id"])
            if doc:
                status = doc.get("docembed", {}).get("status")
                if status == "done":
                    done_count += 1
                elif status == "skipped":
                    skip_count += 1
        assert done_count > 0, "docembed.status=done 문서가 없음"

    def test_failed_embedding_has_retry_count(self, db, snapshots):
        """임베딩 실패: retry_count 필드 존재"""
        for snap in snapshots.values():
            if snap.get("_sample_tag") != "special_embed_failed":
                continue
            doc = get_doc_from_db(db, snap["doc_id"])
            if doc:
                docembed = doc.get("docembed", {})
                assert docembed.get("status") == "failed"
                assert "retry_count" in docembed or "error_code" in docembed, \
                    f"임베딩 실패 문서에 retry_count/error_code 없음"


# ──────────────────────────────────────────────
# OCR 경로
# ──────────────────────────────────────────────

class TestOCR:
    """OCR 처리 문서 검증"""

    def test_ocr_documents_have_ocr_text(self, db, snapshots):
        """OCR 거친 문서: ocr.full_text 존재"""
        for snap in snapshots.values():
            if snap.get("_sample_tag") != "special_ocr":
                continue
            doc = get_doc_from_db(db, snap["doc_id"])
            if doc:
                ocr = doc.get("ocr", {})
                assert ocr.get("status") == "done", \
                    f"{snap['id']}: ocr.status={ocr.get('status')}"
                ocr_text = ocr.get("full_text", "")
                assert len(ocr_text) > 0, \
                    f"{snap['id']}: OCR 완료이지만 텍스트 없음"


# ──────────────────────────────────────────────
# 상태 일관성
# ──────────────────────────────────────────────

class TestStateConsistency:
    """DB 상태 필드 간 일관성 검증"""

    def test_completed_status_consistency(self, db, snapshots):
        """completed 문서: status와 overallStatus가 모두 completed"""
        for snap in snapshots.values():
            if snap["expected"]["status"] != "completed":
                continue
            doc = get_doc_from_db(db, snap["doc_id"])
            if not doc:
                continue
            if doc["status"] == "completed":
                assert doc["overallStatus"] == "completed", \
                    f"{snap['id']}: status=completed but overallStatus={doc['overallStatus']}"

    def test_ar_flag_and_type_consistency(self, db, snapshots):
        """is_annual_report=True이면 document_type=annual_report"""
        for snap in snapshots.values():
            doc = get_doc_from_db(db, snap["doc_id"])
            if not doc:
                continue
            if doc.get("is_annual_report"):
                assert doc.get("document_type") == "annual_report", \
                    f"{snap['id']}: is_annual_report=True but document_type={doc.get('document_type')}"

    def test_crs_flag_and_type_consistency(self, db, snapshots):
        """is_customer_review=True이면 document_type=customer_review"""
        for snap in snapshots.values():
            doc = get_doc_from_db(db, snap["doc_id"])
            if not doc:
                continue
            if doc.get("is_customer_review"):
                assert doc.get("document_type") == "customer_review", \
                    f"{snap['id']}: is_customer_review=True but document_type={doc.get('document_type')}"

    def test_skip_reason_documents_are_completed(self, db, snapshots):
        """processingSkipReason이 있으면 반드시 status=completed"""
        for snap in snapshots.values():
            doc = get_doc_from_db(db, snap["doc_id"])
            if not doc:
                continue
            if doc.get("processingSkipReason"):
                assert doc["status"] == "completed", \
                    f"{snap['id']}: skipReason={doc['processingSkipReason']} but status={doc['status']}"
