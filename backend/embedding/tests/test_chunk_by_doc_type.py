# -*- coding: utf-8 -*-
"""
문서 유형별 청킹 파라미터 분기 regression 테스트

배경: 모든 문서에 동일 chunk_size(1000)/overlap(200)을 적용하던 것을
문서 유형(is_annual_report, is_customer_review, document_type)에 따라 차별화.

우선순위: is_annual_report → is_customer_review → document_type → default

깨지면: 문서 유형별 청킹 파라미터가 올바르게 적용되지 않음
"""
import os
import sys
import importlib.util
import pytest
from unittest.mock import MagicMock, patch
from bson import ObjectId


TEST_DOC_ID = ObjectId("507f1f77bcf86cd799439100")
TEST_OWNER_ID = "owner_test_chunk"


# ── 실제 split_text_into_chunks 모듈 로드 (conftest mock 우회) ──
_src_path = os.path.join(os.path.dirname(__file__), "..", "split_text_into_chunks.py")
_spec = importlib.util.spec_from_file_location("_stc_real", _src_path)
_stc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_stc)

_resolve_chunk_params = _stc._resolve_chunk_params


# ═══════════════════════════════════════════════════════════════════
# Part 1: _resolve_chunk_params 단위 테스트 (우선순위 + 그룹핑)
# ═══════════════════════════════════════════════════════════════════

class TestResolveChunkParams:
    """_resolve_chunk_params 우선순위·그룹핑 검증"""

    # ── 우선순위 1: is_annual_report ──
    def test_ar_flag_returns_ar_crs_params(self):
        assert _resolve_chunk_params({'is_annual_report': True}) == (600, 100)

    def test_ar_flag_overrides_document_type(self):
        """is_annual_report가 document_type보다 우선"""
        meta = {'is_annual_report': True, 'document_type': 'policy'}
        assert _resolve_chunk_params(meta) == (600, 100)

    # ── 우선순위 2: is_customer_review ──
    def test_crs_flag_returns_ar_crs_params(self):
        assert _resolve_chunk_params({'is_customer_review': True}) == (600, 100)

    def test_crs_flag_overrides_document_type(self):
        """is_customer_review가 document_type보다 우선"""
        meta = {'is_customer_review': True, 'document_type': 'diagnosis'}
        assert _resolve_chunk_params(meta) == (600, 100)

    # ── 우선순위 3: document_type 그룹핑 ──

    # small (500, 100)
    def test_small_id_card(self):
        assert _resolve_chunk_params({'document_type': 'id_card'}) == (500, 100)

    def test_small_family_cert(self):
        assert _resolve_chunk_params({'document_type': 'family_cert'}) == (500, 100)

    def test_small_diagnosis(self):
        assert _resolve_chunk_params({'document_type': 'diagnosis'}) == (500, 100)

    def test_small_medical_receipt(self):
        assert _resolve_chunk_params({'document_type': 'medical_receipt'}) == (500, 100)

    # medium (800, 150)
    def test_medium_policy(self):
        assert _resolve_chunk_params({'document_type': 'policy'}) == (800, 150)

    def test_medium_application(self):
        assert _resolve_chunk_params({'document_type': 'application'}) == (800, 150)

    def test_medium_claim_form(self):
        assert _resolve_chunk_params({'document_type': 'claim_form'}) == (800, 150)

    # large (1200, 200)
    def test_large_plan_design(self):
        assert _resolve_chunk_params({'document_type': 'plan_design'}) == (1200, 200)

    def test_large_coverage_analysis(self):
        assert _resolve_chunk_params({'document_type': 'coverage_analysis'}) == (1200, 200)

    def test_large_corp_tax(self):
        assert _resolve_chunk_params({'document_type': 'corp_tax'}) == (1200, 200)

    # ar_crs via document_type (플래그 없이 document_type만으로도 동작)
    def test_ar_crs_via_document_type_annual_report(self):
        assert _resolve_chunk_params({'document_type': 'annual_report'}) == (600, 100)

    def test_ar_crs_via_document_type_customer_review(self):
        assert _resolve_chunk_params({'document_type': 'customer_review'}) == (600, 100)

    # default (1000, 200)
    def test_default_general(self):
        assert _resolve_chunk_params({'document_type': 'general'}) == (1000, 200)

    def test_default_unknown_type(self):
        assert _resolve_chunk_params({'document_type': 'some_future_type'}) == (1000, 200)

    def test_default_empty_meta(self):
        assert _resolve_chunk_params({}) == (1000, 200)

    def test_default_no_document_type_key(self):
        assert _resolve_chunk_params({'owner_id': 'abc'}) == (1000, 200)

    # ── 엣지 케이스 ──
    def test_false_ar_flag_falls_through(self):
        """is_annual_report=False는 우선순위 1에 해당하지 않음"""
        meta = {'is_annual_report': False, 'document_type': 'policy'}
        assert _resolve_chunk_params(meta) == (800, 150)

    def test_false_crs_flag_falls_through(self):
        """is_customer_review=False는 우선순위 2에 해당하지 않음"""
        meta = {'is_customer_review': False, 'document_type': 'diagnosis'}
        assert _resolve_chunk_params(meta) == (500, 100)


# ═══════════════════════════════════════════════════════════════════
# Part 2: full_pipeline.py → split_text_into_chunks meta 전달 검증
# ═══════════════════════════════════════════════════════════════════

def _make_doc(document_type=None, is_ar=False, is_crs=False):
    """테스트 문서 생성"""
    doc = {
        '_id': TEST_DOC_ID,
        'ownerId': TEST_OWNER_ID,
        'meta': {'full_text': '테스트 문서 내용. ' * 200},
        'ocr': {'page_count': 1},
        'upload': {
            'originalName': '테스트.pdf',
            'uploaded_at': '2026-03-21T00:00:00Z',
        },
        'docembed': {'status': 'pending'},
        'status': 'pending',
        'overallStatus': 'pending',
    }
    if document_type:
        doc['meta']['document_type'] = document_type
    if is_ar:
        doc['is_annual_report'] = True
    if is_crs:
        doc['is_customer_review'] = True
    return doc


def _run_pipeline_capture_meta(doc):
    """full_pipeline 실행하여 split_text_into_chunks에 전달되는 meta 캡처"""
    import contextlib

    mock_collection = MagicMock()
    mock_collection.count_documents.side_effect = [0, 0, 0, 0, 1]
    mock_collection.find.side_effect = [[], [], iter([doc])]
    mock_collection.update_one.return_value = MagicMock(modified_count=1)

    mock_client = MagicMock()
    mock_client.__getitem__ = MagicMock(return_value=MagicMock(
        __getitem__=MagicMock(return_value=mock_collection)
    ))

    captured = {}

    def mock_split(text, meta, **kwargs):
        captured.update(meta)
        return []

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

    return captured


class TestPipelinePassesDocTypeFields:
    """full_pipeline → split_text_into_chunks에 유형 필드 전달 검증"""

    def test_ar_doc_passes_is_annual_report(self):
        meta = _run_pipeline_capture_meta(_make_doc(is_ar=True))
        assert meta['is_annual_report'] is True

    def test_crs_doc_passes_is_customer_review(self):
        meta = _run_pipeline_capture_meta(_make_doc(is_crs=True))
        assert meta['is_customer_review'] is True

    def test_general_doc_passes_document_type(self):
        meta = _run_pipeline_capture_meta(_make_doc(document_type='policy'))
        assert meta['document_type'] == 'policy'

    def test_no_type_defaults_to_general(self):
        meta = _run_pipeline_capture_meta(_make_doc())
        assert meta['document_type'] == 'general'

    def test_ar_doc_also_has_document_type(self):
        """AR 문서도 document_type 필드는 전달 (meta.document_type 값)"""
        meta = _run_pipeline_capture_meta(_make_doc(document_type='insurance_etc', is_ar=True))
        assert meta['is_annual_report'] is True
        assert meta['document_type'] == 'insurance_etc'

    def test_false_flags_passed_for_normal_doc(self):
        """일반 문서는 is_annual_report=False, is_customer_review=False"""
        meta = _run_pipeline_capture_meta(_make_doc(document_type='diagnosis'))
        assert meta['is_annual_report'] is False
        assert meta['is_customer_review'] is False
