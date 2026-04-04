"""
E2E Pipeline Tests — 실제 인프라(MongoDB+Redis) 환경 검증

conftest.py를 사용하지 않는 독립 테스트 (서버 직접 실행 가능).
HTTP + pymongo만으로 파이프라인 상태를 검증합니다.

실행:
    # 서버에서 직접 실행
    ssh rossi@100.110.215.65 'cd ~/aims && python3 -m pytest backend/api/document_pipeline/tests/e2e/ -v -s'

회귀 기준선 (2026-03-19 Phase 0 측정):
- 처리 성공률: 100% (2117/2118)
- 분류 정확도: 91.8% (M6 GT 기준)
- 분류 커버리지: 51.5% (general/null 제외)
- AR: 711건, CRS: 402건
- failed: 0건
"""
import os

import pytest

PIPELINE_URL = os.environ.get("PIPELINE_URL", "http://localhost:8100")
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://tars:27017/docupload")


# ========================================
# 1. Health Check
# ========================================

class TestHealthCheck:

    def test_health(self):
        import requests
        r = requests.get(f"{PIPELINE_URL}/health", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"

    def test_deep_health(self):
        import requests
        r = requests.get(f"{PIPELINE_URL}/health/deep", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"

    def test_queue_status(self):
        import requests
        r = requests.get(f"{PIPELINE_URL}/queue/status", timeout=10)
        assert r.status_code == 200


# ========================================
# 2. 회귀 기준선 검증
# ========================================

class TestRegressionBaseline:

    @pytest.fixture(scope="class")
    def stats(self):
        from pymongo import MongoClient
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client.get_default_database()
        files = db.files

        total = files.count_documents({})
        completed = files.count_documents({"status": "completed"})
        failed = files.count_documents({"status": "failed"})
        classified = files.count_documents({
            "document_type": {"$exists": True, "$nin": ["general", None]}
        })
        general = files.count_documents({"document_type": "general"})
        ar = files.count_documents({"is_annual_report": True})
        crs = files.count_documents({"is_customer_review": True})

        client.close()

        return {
            "total": total,
            "completed": completed,
            "failed": failed,
            "classified": classified,
            "general": general,
            "ar": ar,
            "crs": crs,
            "success_rate": completed / total * 100 if total > 0 else 0,
            "coverage": classified / total * 100 if total > 0 else 0,
        }

    def test_success_rate_gte_99(self, stats):
        """처리 성공률 ≥ 99%"""
        assert stats["success_rate"] >= 99.0, \
            f"성공률 {stats['success_rate']:.1f}% < 99%"

    def test_no_failed(self, stats):
        """failed 문서 0건"""
        assert stats["failed"] == 0, f"failed {stats['failed']}건"

    def test_classification_coverage_gte_45(self, stats):
        """분류 커버리지 ≥ 45% (기준선: 51.5%, general/null 제외)"""
        assert stats["coverage"] >= 45.0, \
            f"커버리지 {stats['coverage']:.1f}% < 45%"

    def test_ar_gte_500(self, stats):
        """AR 문서 ≥ 500건 (기준선: 711)"""
        assert stats["ar"] >= 500, f"AR {stats['ar']}건 < 500"

    def test_crs_gte_300(self, stats):
        """CRS 문서 ≥ 300건 (기준선: 402)"""
        assert stats["crs"] >= 300, f"CRS {stats['crs']}건 < 300"

    def test_print_baseline(self, stats):
        """기준선 수치 출력"""
        print(f"\n{'='*50}")
        print("  Phase 0 회귀 기준선")
        print(f"{'='*50}")
        print(f"  총 문서:       {stats['total']}")
        print(f"  완료/실패:     {stats['completed']} / {stats['failed']}")
        print(f"  성공률:        {stats['success_rate']:.1f}%")
        print(f"  분류 커버리지:  {stats['coverage']:.1f}%")
        print(f"  AR/CRS:        {stats['ar']} / {stats['crs']}")
        print("  분류 정확도:    91.8% (M6 GT)")
        print(f"{'='*50}")


# ========================================
# 3. API 스모크 테스트
# ========================================

class TestApiSmoke:

    def test_shadow_status(self):
        import requests
        r = requests.get(f"{PIPELINE_URL}/shadow/status", timeout=10)
        assert r.status_code == 200
