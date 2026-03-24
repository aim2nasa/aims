"""Characterization tests: InsuranceDomainAdapter 동작 스냅샷

실행: cd d:\\aims\\backend\\api\\document_pipeline && python -m pytest xpipe/tests/test_char_adapter_snapshot.py -v

InsuranceDomainAdapter의 classification_config 구조, AR/CRS 감지 결과,
on_stage_complete 반환 구조를 "있는 그대로" 캡처한다.
"""
from __future__ import annotations

import pytest

from insurance.adapter import (
    InsuranceDomainAdapter,
    INSURANCE_CATEGORIES,
    VALID_DOCUMENT_TYPES,
    SYSTEM_ONLY_TYPES,
    _detect_ar_pattern,
    _detect_crs_pattern,
)
from xpipe.adapter import (
    ClassificationConfig,
    Detection,
    HookResult,
    StageHookAction,
)


@pytest.fixture
def adapter():
    return InsuranceDomainAdapter()


class TestClassificationConfigSnapshot:
    """get_classification_config() 반환 구조 스냅샷"""

    @pytest.mark.asyncio
    async def test_config_type(self, adapter):
        """ClassificationConfig 인스턴스 반환"""
        config = await adapter.get_classification_config()
        assert isinstance(config, ClassificationConfig)

    @pytest.mark.asyncio
    async def test_categories_count(self, adapter):
        """카테고리 23개 (INSURANCE_CATEGORIES와 동일)"""
        config = await adapter.get_classification_config()
        assert len(config.categories) == 23
        assert len(config.categories) == len(INSURANCE_CATEGORIES)

    @pytest.mark.asyncio
    async def test_valid_types_matches_constant(self, adapter):
        """valid_types가 VALID_DOCUMENT_TYPES와 일치 (sorted)"""
        config = await adapter.get_classification_config()
        assert set(config.valid_types) == VALID_DOCUMENT_TYPES

    @pytest.mark.asyncio
    async def test_extra_contains_system_prompt(self, adapter):
        """extra에 system_prompt와 system_only_types 포함"""
        config = await adapter.get_classification_config()
        assert "system_prompt" in config.extra
        assert "system_only_types" in config.extra
        assert config.extra["system_only_types"] == SYSTEM_ONLY_TYPES


class TestARDetectionSnapshot:
    """AR (Annual Review Report) 감지 결과 구조 스냅샷"""

    def test_ar_pattern_match(self):
        """AR 필수 + 선택 키워드가 있으면 Detection 반환"""
        text = (
            "홍길동 고객님\n"
            "Annual Review Report\n"
            "보유계약 현황\n"
            "MetLife\n"
            "발행일: 2025년 03월 15일"
        )
        result = _detect_ar_pattern(text)

        assert result is not None
        assert isinstance(result, Detection)
        assert result.doc_type == "annual_report"
        assert result.confidence == 1.0
        assert result.metadata["customer_name"] == "홍길동"
        assert result.metadata["issue_date"] == "2025-03-15"

    def test_ar_pattern_no_match(self):
        """AR 키워드가 없으면 None"""
        result = _detect_ar_pattern("일반 문서 내용입니다.")
        assert result is None


class TestCRSDetectionSnapshot:
    """CRS (Customer Review Service) 감지 결과 구조 스냅샷"""

    def test_crs_pattern_match(self):
        """CRS 필수 + 선택 키워드가 있으면 Detection 반환"""
        text = (
            "홍길동 고객님\n"
            "Customer Review Service\n"
            "메트라이프 변액보험\n"
            "발행일: 2025년 06월 20일"
        )
        result = _detect_crs_pattern(text)

        assert result is not None
        assert isinstance(result, Detection)
        assert result.doc_type == "customer_review"
        assert result.confidence == 1.0
        assert result.metadata["customer_name"] == "홍길동"

    def test_crs_pattern_no_match(self):
        """CRS 키워드가 없으면 None"""
        result = _detect_crs_pattern("보험증권 내용")
        assert result is None


class TestOnStageCompleteSnapshot:
    """on_stage_complete() 반환 구조 스냅샷"""

    @pytest.mark.asyncio
    async def test_upload_complete_returns_hook_results(self, adapter):
        """upload_complete 단계: TRIGGER_PROCESS + NOTIFY 반환"""
        doc = {"_id": "doc1", "ownerId": "user1"}
        context = {"customer_id": "cust1", "doc_id": "doc1", "user_id": "user1"}
        results = await adapter.on_stage_complete("upload_complete", doc, context)

        assert len(results) == 2
        assert all(isinstance(r, HookResult) for r in results)

        # 첫 번째: 고객 문서 연결 트리거
        assert results[0].action == StageHookAction.TRIGGER_PROCESS
        assert results[0].payload["process"] == "connect_document_to_customer"

        # 두 번째: SSE 진행률 알림
        assert results[1].action == StageHookAction.NOTIFY
        assert results[1].payload["progress"] == 20

    @pytest.mark.asyncio
    async def test_unknown_stage_returns_empty(self, adapter):
        """알 수 없는 stage 이름이면 빈 리스트 반환"""
        results = await adapter.on_stage_complete("unknown_stage", {}, {})
        assert results == []

    @pytest.mark.asyncio
    async def test_pre_embedding_credit_insufficient(self, adapter):
        """pre_embedding: 크레딧 부족 시 UPDATE_STATUS + SKIP_REMAINING"""
        doc = {"_id": "doc1", "ownerId": "user1"}
        context = {
            "doc_id": "doc1",
            "owner_id": "user1",
            "credit_check_result": {
                "allowed": False,
                "credits_remaining": 0,
                "credit_quota": 100,
                "days_until_reset": 5,
                "estimated_credits": 3,
            },
        }
        results = await adapter.on_stage_complete("pre_embedding", doc, context)

        assert len(results) == 2
        assert results[0].action == StageHookAction.UPDATE_STATUS
        assert results[0].payload["fields"]["status"] == "credit_pending"
        assert results[1].action == StageHookAction.SKIP_REMAINING
        assert results[1].payload["reason"] == "credit_insufficient"

    @pytest.mark.asyncio
    async def test_pre_embedding_reprocessed_skips(self, adapter):
        """pre_embedding: reprocessed_from_credit_pending이면 빈 리스트"""
        doc = {"_id": "doc1", "ownerId": "user1"}
        context = {
            "reprocessed_from_credit_pending": True,
        }
        results = await adapter.on_stage_complete("pre_embedding", doc, context)
        assert results == []
