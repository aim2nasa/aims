# -*- coding: utf-8 -*-
"""
customer_id가 청킹 메타데이터에 정상 전달되는지 검증하는 regression 테스트

배경: full_pipeline.py에서 split_text_into_chunks 호출 시 customer_id를
meta dict에 포함하지 않아 Qdrant 페이로드에 고객 ID가 저장되지 않는 버그 발견.

깨지면: Qdrant에 고객 ID가 저장되지 않아 고객별 문서 검색 격리 불가
"""
import pytest
from unittest.mock import MagicMock, patch, call
from bson import ObjectId


TEST_DOC_ID = ObjectId("507f1f77bcf86cd799439099")
TEST_OWNER_ID = "owner_test_cid"
TEST_CUSTOMER_ID = "customer_test_001"


def _make_doc_with_customer(customer_id=TEST_CUSTOMER_ID):
    """customer_relation이 있는 테스트 문서 생성"""
    return {
        '_id': TEST_DOC_ID,
        'ownerId': TEST_OWNER_ID,
        'meta': {'full_text': '보험 계약서 내용입니다. ' * 100},
        'ocr': {'page_count': 1},
        'upload': {
            'originalName': '계약서.pdf',
            'uploaded_at': '2026-03-21T00:00:00Z',
        },
        'customer_relation': {'customer_id': customer_id},
        'docembed': {'status': 'pending'},
        'status': 'pending',
        'overallStatus': 'pending',
    }


def _make_doc_without_customer():
    """customer_relation이 없는 테스트 문서 생성"""
    doc = _make_doc_with_customer()
    del doc['customer_relation']
    return doc


def _run_pipeline_capture_chunks(doc):
    """
    full_pipeline을 실행하되 split_text_into_chunks 호출 시
    전달되는 meta dict를 캡처한다.
    """
    import contextlib

    mock_collection = MagicMock()
    # 1단계: self-healing 스킵 (count_documents=0)
    # 1.5단계: credit_pending 스킵 (find=[])
    # 2단계: 처리 대상 문서 1건
    mock_collection.count_documents.side_effect = [0, 0, 0, 0, 1]
    mock_collection.find.side_effect = [[], [], iter([doc])]
    mock_collection.update_one.return_value = MagicMock(modified_count=1)

    mock_client = MagicMock()
    mock_client.__getitem__ = MagicMock(return_value=MagicMock(
        __getitem__=MagicMock(return_value=mock_collection)
    ))

    captured_meta = {}

    def mock_split(text, meta, **kwargs):
        captured_meta.update(meta)
        return []  # 빈 청크 반환하여 이후 단계 스킵

    patches = [
        patch("full_pipeline.MongoClient", return_value=mock_client),
        patch("full_pipeline.check_credit_for_embedding",
              return_value={"allowed": True, "credits_remaining": 100}),
        patch("full_pipeline.split_text_into_chunks", side_effect=mock_split),
        patch("full_pipeline.trigger_virus_scan", return_value=True),
    ]

    with contextlib.ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)

        from full_pipeline import run_full_pipeline
        run_full_pipeline()

    return captured_meta


class TestCustomerIdInChunks:
    """customer_id 전달 regression 테스트"""

    def test_customer_id_included_in_meta(self):
        """customer_relation이 있는 문서 → meta에 customer_id 포함"""
        doc = _make_doc_with_customer("customer_abc_123")
        meta = _run_pipeline_capture_chunks(doc)

        assert 'customer_id' in meta, \
            "split_text_into_chunks에 전달되는 meta에 customer_id가 없습니다"
        assert meta['customer_id'] == "customer_abc_123", \
            f"customer_id가 올바르지 않습니다: {meta['customer_id']}"

    def test_customer_id_none_when_no_relation(self):
        """customer_relation이 없는 문서 → customer_id는 None"""
        doc = _make_doc_without_customer()
        meta = _run_pipeline_capture_chunks(doc)

        assert 'customer_id' in meta, \
            "customer_relation이 없어도 customer_id 키는 존재해야 합니다"
        assert meta['customer_id'] is None, \
            f"customer_relation이 없을 때 customer_id는 None이어야 합니다: {meta['customer_id']}"

    def test_doc_id_and_owner_id_also_present(self):
        """기존 필드(doc_id, owner_id)도 함께 전달되는지 확인"""
        doc = _make_doc_with_customer()
        meta = _run_pipeline_capture_chunks(doc)

        assert meta.get('doc_id') == str(TEST_DOC_ID)
        assert meta.get('owner_id') == TEST_OWNER_ID
