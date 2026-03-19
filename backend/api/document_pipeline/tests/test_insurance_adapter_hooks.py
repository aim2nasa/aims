"""
InsuranceDomainAdapter.on_stage_complete() 테스트

Phase 2-5: 각 stage별 반환값 검증.
후크는 액션을 반환할 뿐 직접 실행하지 않으므로 HTTP/DB mock 불필요.

실행: cd backend/api/document_pipeline && python -m pytest tests/test_insurance_adapter_hooks.py -v
"""
import pytest

from insurance.adapter import InsuranceDomainAdapter
from xpipe.adapter import Detection, HookResult, StageHookAction


# ========================================
# Fixtures
# ========================================

@pytest.fixture
def adapter():
    return InsuranceDomainAdapter()


@pytest.fixture
def sample_doc():
    """기본 문서 데이터"""
    return {
        "_id": "doc_001",
        "ownerId": "user_001",
        "customerId": "cust_001",
        "upload": {"originalName": "test.pdf"},
        "meta": {"mime": "application/pdf"},
        "status": "processing",
    }


@pytest.fixture
def ar_detection():
    """AR 감지 결과"""
    return Detection(
        doc_type="annual_report",
        confidence=1.0,
        metadata={
            "customer_name": "홍길동",
            "issue_date": "2026-01-15",
        },
    )


@pytest.fixture
def crs_detection():
    """CRS 감지 결과"""
    return Detection(
        doc_type="customer_review",
        confidence=1.0,
        metadata={
            "customer_name": "김철수",
            "product_name": "메트라이프 변액종합보험",
            "issue_date": "2026-02-10",
        },
    )


# ========================================
# 공통 동작 테스트
# ========================================

class TestOnStageCompleteCommon:
    """공통 동작 검증"""

    @pytest.mark.asyncio
    async def test_unknown_stage_returns_empty(self, adapter, sample_doc):
        """알 수 없는 stage → 빈 리스트"""
        result = await adapter.on_stage_complete("unknown_stage", sample_doc, {})
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_list_of_hook_results(self, adapter, sample_doc):
        """모든 반환값이 HookResult 인스턴스"""
        result = await adapter.on_stage_complete(
            "upload_complete", sample_doc,
            {"customer_id": "cust_001", "doc_id": "doc_001", "user_id": "user_001"},
        )
        assert isinstance(result, list)
        for item in result:
            assert isinstance(item, HookResult)


# ========================================
# upload_complete 테스트
# ========================================

class TestUploadComplete:
    """upload_complete 후크 테스트"""

    @pytest.mark.asyncio
    async def test_customer_connect_action(self, adapter, sample_doc):
        """고객 ID가 있으면 connect_document_to_customer 액션 반환"""
        context = {"customer_id": "cust_001", "doc_id": "doc_001", "user_id": "user_001"}
        result = await adapter.on_stage_complete("upload_complete", sample_doc, context)

        # TRIGGER_PROCESS (고객 연결) + NOTIFY (SSE 진행률)
        assert len(result) == 2

        connect = result[0]
        assert connect.action == StageHookAction.TRIGGER_PROCESS
        assert connect.payload["process"] == "connect_document_to_customer"
        assert connect.payload["customer_id"] == "cust_001"

    @pytest.mark.asyncio
    async def test_no_customer_id_skips_connect(self, adapter, sample_doc):
        """고객 ID 없으면 고객 연결 액션 없음 (SSE 알림만)"""
        # customerId를 doc에서도 제거
        doc = {**sample_doc, "customerId": None}
        context = {"doc_id": "doc_001", "user_id": "user_001"}
        result = await adapter.on_stage_complete("upload_complete", doc, context)

        # SSE 알림만
        assert len(result) == 1
        assert result[0].action == StageHookAction.NOTIFY

    @pytest.mark.asyncio
    async def test_sse_progress_notification(self, adapter, sample_doc):
        """업로드 완료 시 SSE 진행률 20% 알림"""
        context = {"doc_id": "doc_001", "user_id": "user_001"}
        doc = {**sample_doc, "customerId": None}
        result = await adapter.on_stage_complete("upload_complete", doc, context)

        sse = result[-1]  # 마지막이 SSE 알림
        assert sse.action == StageHookAction.NOTIFY
        assert sse.payload["event"] == "document-progress"
        assert sse.payload["progress"] == 20
        assert sse.payload["stage"] == "upload"

    @pytest.mark.asyncio
    async def test_customer_id_from_doc(self, adapter):
        """context에 customer_id 없으면 doc.customerId에서 가져옴"""
        doc = {"_id": "doc_002", "ownerId": "user_002", "customerId": "cust_from_doc"}
        context = {"doc_id": "doc_002", "user_id": "user_002"}
        result = await adapter.on_stage_complete("upload_complete", doc, context)

        connect = result[0]
        assert connect.payload["customer_id"] == "cust_from_doc"


# ========================================
# meta_extracted 테스트
# ========================================

class TestMetaExtracted:
    """meta_extracted 후크 테스트"""

    @pytest.mark.asyncio
    async def test_sse_progress_50(self, adapter, sample_doc):
        """메타 추출 완료 시 SSE 50% 알림"""
        context = {"doc_id": "doc_001", "user_id": "user_001"}
        result = await adapter.on_stage_complete("meta_extracted", sample_doc, context)

        assert len(result) == 1
        sse = result[0]
        assert sse.action == StageHookAction.NOTIFY
        assert sse.payload["progress"] == 50
        assert sse.payload["stage"] == "meta"
        assert sse.payload["event"] == "document-progress"


# ========================================
# ar_detected 테스트
# ========================================

class TestARDetected:
    """ar_detected 후크 테스트"""

    @pytest.mark.asyncio
    async def test_ar_status_update(self, adapter, sample_doc, ar_detection):
        """AR 감지 시 상태 업데이트 액션"""
        context = {
            "doc_id": "doc_001",
            "detection": ar_detection,
            "related_customer_id": "cust_rel_001",
            "display_name": "홍길동_AR_2026-01-15.pdf",
        }
        result = await adapter.on_stage_complete("ar_detected", sample_doc, context)

        # UPDATE_STATUS + NOTIFY + TRIGGER_PROCESS
        assert len(result) == 3

        status_update = result[0]
        assert status_update.action == StageHookAction.UPDATE_STATUS
        assert status_update.payload["fields"]["is_annual_report"] is True
        assert status_update.payload["fields"]["annual_report_status"] == "pending"
        assert status_update.payload["fields"]["displayName"] == "홍길동_AR_2026-01-15.pdf"
        assert status_update.payload["fields"]["ar_issue_date"] == "2026-01-15"
        assert status_update.payload["add_to_set"] == {"tags": "AR"}

    @pytest.mark.asyncio
    async def test_ar_sse_notification(self, adapter, sample_doc, ar_detection):
        """AR 감지 시 SSE ar-status-change 알림"""
        context = {
            "doc_id": "doc_001",
            "detection": ar_detection,
            "related_customer_id": "cust_rel_001",
        }
        result = await adapter.on_stage_complete("ar_detected", sample_doc, context)

        sse = result[1]
        assert sse.action == StageHookAction.NOTIFY
        assert sse.payload["event"] == "ar-status-change"
        assert sse.payload["customer_id"] == "cust_rel_001"
        assert sse.payload["status"] == "pending"

    @pytest.mark.asyncio
    async def test_ar_parsing_trigger(self, adapter, sample_doc, ar_detection):
        """AR 감지 시 파싱 트리거"""
        context = {
            "doc_id": "doc_001",
            "detection": ar_detection,
            "related_customer_id": "cust_rel_001",
        }
        result = await adapter.on_stage_complete("ar_detected", sample_doc, context)

        trigger = result[2]
        assert trigger.action == StageHookAction.TRIGGER_PROCESS
        assert trigger.payload["process"] == "ar_parsing"
        assert trigger.payload["doc_id"] == "doc_001"

    @pytest.mark.asyncio
    async def test_ar_no_customer_skips_sse(self, adapter, sample_doc, ar_detection):
        """고객 ID 없으면 SSE 알림 생략 (상태 업데이트 + 파싱 트리거만)"""
        context = {
            "doc_id": "doc_001",
            "detection": ar_detection,
            "related_customer_id": None,
        }
        result = await adapter.on_stage_complete("ar_detected", sample_doc, context)

        # UPDATE_STATUS + TRIGGER_PROCESS (SSE 없음)
        assert len(result) == 2
        assert result[0].action == StageHookAction.UPDATE_STATUS
        assert result[1].action == StageHookAction.TRIGGER_PROCESS

    @pytest.mark.asyncio
    async def test_ar_no_display_name(self, adapter, sample_doc, ar_detection):
        """display_name 없으면 필드에 포함하지 않음"""
        context = {
            "doc_id": "doc_001",
            "detection": ar_detection,
            "related_customer_id": None,
        }
        result = await adapter.on_stage_complete("ar_detected", sample_doc, context)

        fields = result[0].payload["fields"]
        assert "displayName" not in fields


# ========================================
# crs_detected 테스트
# ========================================

class TestCRSDetected:
    """crs_detected 후크 테스트"""

    @pytest.mark.asyncio
    async def test_crs_status_update(self, adapter, sample_doc, crs_detection):
        """CRS 감지 시 상태 업데이트 액션"""
        context = {
            "doc_id": "doc_001",
            "detection": crs_detection,
            "related_customer_id": "cust_rel_002",
            "display_name": "김철수_CRS_메트라이프 변액종합보험_2026-02-10.pdf",
        }
        result = await adapter.on_stage_complete("crs_detected", sample_doc, context)

        # UPDATE_STATUS + NOTIFY
        assert len(result) == 2

        status_update = result[0]
        assert status_update.action == StageHookAction.UPDATE_STATUS
        assert status_update.payload["fields"]["is_customer_review"] is True
        assert status_update.payload["fields"]["customer_review_status"] == "pending"
        assert status_update.payload["add_to_set"] == {"tags": "CRS"}

    @pytest.mark.asyncio
    async def test_crs_sse_notification(self, adapter, sample_doc, crs_detection):
        """CRS 감지 시 SSE cr-status-change 알림"""
        context = {
            "doc_id": "doc_001",
            "detection": crs_detection,
            "related_customer_id": "cust_rel_002",
        }
        result = await adapter.on_stage_complete("crs_detected", sample_doc, context)

        sse = result[1]
        assert sse.action == StageHookAction.NOTIFY
        assert sse.payload["event"] == "cr-status-change"
        assert sse.payload["customer_id"] == "cust_rel_002"

    @pytest.mark.asyncio
    async def test_crs_no_customer_skips_sse(self, adapter, sample_doc, crs_detection):
        """고객 ID 없으면 SSE 알림 생략"""
        context = {
            "doc_id": "doc_001",
            "detection": crs_detection,
            "related_customer_id": None,
        }
        result = await adapter.on_stage_complete("crs_detected", sample_doc, context)

        # UPDATE_STATUS만
        assert len(result) == 1
        assert result[0].action == StageHookAction.UPDATE_STATUS


# ========================================
# embedding_complete 테스트
# ========================================

class TestEmbeddingComplete:
    """embedding_complete 후크 테스트"""

    @pytest.mark.asyncio
    async def test_display_name_and_virus_scan(self, adapter):
        """일반 문서: displayName 생성 + 바이러스 스캔"""
        doc = {
            "_id": "doc_003",
            "ownerId": "user_001",
            "status": "completed",
            # displayName 없음, AR/CRS 아님
        }
        context = {"doc_id": "doc_003", "owner_id": "user_001"}
        result = await adapter.on_stage_complete("embedding_complete", doc, context)

        # TRIGGER_PROCESS (displayName) + TRIGGER_PROCESS (바이러스 스캔)
        assert len(result) == 2

        dn = result[0]
        assert dn.action == StageHookAction.TRIGGER_PROCESS
        assert dn.payload["process"] == "generate_display_name"

        vs = result[1]
        assert vs.action == StageHookAction.TRIGGER_PROCESS
        assert vs.payload["process"] == "virus_scan"

    @pytest.mark.asyncio
    async def test_ar_doc_skips_display_name(self, adapter):
        """AR 문서는 displayName 생성 스킵 (바이러스 스캔만)"""
        doc = {
            "_id": "doc_004",
            "ownerId": "user_001",
            "is_annual_report": True,
            "displayName": "홍길동_AR_2026-01-15.pdf",
            "tags": ["AR"],
        }
        context = {"doc_id": "doc_004", "owner_id": "user_001"}
        result = await adapter.on_stage_complete("embedding_complete", doc, context)

        # 바이러스 스캔만
        assert len(result) == 1
        assert result[0].payload["process"] == "virus_scan"

    @pytest.mark.asyncio
    async def test_crs_doc_skips_display_name(self, adapter):
        """CRS 문서는 displayName 생성 스킵"""
        doc = {
            "_id": "doc_005",
            "ownerId": "user_001",
            "is_customer_review": True,
            "tags": ["CRS"],
        }
        context = {"doc_id": "doc_005", "owner_id": "user_001"}
        result = await adapter.on_stage_complete("embedding_complete", doc, context)

        assert len(result) == 1
        assert result[0].payload["process"] == "virus_scan"

    @pytest.mark.asyncio
    async def test_already_has_display_name(self, adapter):
        """이미 displayName이 있으면 생성 스킵"""
        doc = {
            "_id": "doc_006",
            "ownerId": "user_001",
            "displayName": "기존 표시명",
        }
        context = {"doc_id": "doc_006", "owner_id": "user_001"}
        result = await adapter.on_stage_complete("embedding_complete", doc, context)

        assert len(result) == 1
        assert result[0].payload["process"] == "virus_scan"

    @pytest.mark.asyncio
    async def test_ar_tag_without_flag(self, adapter):
        """is_annual_report 없이 tags에 AR만 있어도 displayName 스킵"""
        doc = {
            "_id": "doc_007",
            "ownerId": "user_001",
            "tags": ["AR"],
        }
        context = {"doc_id": "doc_007", "owner_id": "user_001"}
        result = await adapter.on_stage_complete("embedding_complete", doc, context)

        assert len(result) == 1
        assert result[0].payload["process"] == "virus_scan"

    @pytest.mark.asyncio
    async def test_no_owner_skips_display_name(self, adapter):
        """owner_id 없으면 displayName 생성 스킵"""
        doc = {"_id": "doc_008"}
        context = {"doc_id": "doc_008"}
        result = await adapter.on_stage_complete("embedding_complete", doc, context)

        # 바이러스 스캔만 (owner_id 없어도 빈 문자열이 들어감)
        # owner_id가 falsy이면 displayName 스킵
        processes = [r.payload.get("process") for r in result]
        assert "generate_display_name" not in processes
        assert "virus_scan" in processes


# ========================================
# pre_embedding 테스트
# ========================================

class TestPreEmbedding:
    """pre_embedding 후크 테스트"""

    @pytest.mark.asyncio
    async def test_credit_check_request(self, adapter, sample_doc):
        """크레딧 체크 결과 없으면 체크 요청 액션 반환"""
        context = {"doc_id": "doc_001", "owner_id": "user_001", "estimated_pages": 5}
        result = await adapter.on_stage_complete("pre_embedding", sample_doc, context)

        assert len(result) == 1
        check = result[0]
        assert check.action == StageHookAction.TRIGGER_PROCESS
        assert check.payload["process"] == "check_credit"
        assert check.payload["estimated_pages"] == 5

    @pytest.mark.asyncio
    async def test_credit_allowed(self, adapter, sample_doc):
        """크레딧 충분하면 빈 리스트 (추가 액션 없음)"""
        context = {
            "doc_id": "doc_001",
            "owner_id": "user_001",
            "credit_check_result": {"allowed": True, "credits_remaining": 100},
        }
        result = await adapter.on_stage_complete("pre_embedding", sample_doc, context)
        assert result == []

    @pytest.mark.asyncio
    async def test_credit_insufficient(self, adapter, sample_doc):
        """크레딧 부족 시 UPDATE_STATUS + SKIP_REMAINING"""
        context = {
            "doc_id": "doc_001",
            "owner_id": "user_001",
            "credit_check_result": {
                "allowed": False,
                "credits_remaining": 0,
                "credit_quota": 100,
                "days_until_reset": 15,
                "estimated_credits": 5,
            },
        }
        result = await adapter.on_stage_complete("pre_embedding", sample_doc, context)

        assert len(result) == 2

        # 상태 업데이트
        status = result[0]
        assert status.action == StageHookAction.UPDATE_STATUS
        assert status.payload["fields"]["status"] == "credit_pending"
        assert status.payload["fields"]["overallStatus"] == "credit_pending"
        credit_info = status.payload["fields"]["docembed.credit_info"]
        assert credit_info["credits_remaining"] == 0
        assert credit_info["estimated_credits"] == 5

        # 이후 단계 스킵
        skip = result[1]
        assert skip.action == StageHookAction.SKIP_REMAINING
        assert skip.payload["reason"] == "credit_insufficient"

    @pytest.mark.asyncio
    async def test_reprocessed_skips_credit_check(self, adapter, sample_doc):
        """credit_pending에서 재처리된 문서는 크레딧 체크 스킵"""
        context = {
            "doc_id": "doc_001",
            "owner_id": "user_001",
            "reprocessed_from_credit_pending": True,
        }
        result = await adapter.on_stage_complete("pre_embedding", sample_doc, context)
        assert result == []

    @pytest.mark.asyncio
    async def test_default_estimated_pages(self, adapter, sample_doc):
        """estimated_pages 미지정 시 기본값 1"""
        context = {"doc_id": "doc_001", "owner_id": "user_001"}
        result = await adapter.on_stage_complete("pre_embedding", sample_doc, context)

        assert len(result) == 1
        assert result[0].payload["estimated_pages"] == 1
