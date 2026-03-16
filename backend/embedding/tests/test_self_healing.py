# -*- coding: utf-8 -*-
"""
full_pipeline.py self-healing 로직 regression 테스트

테스트 대상:
- 1단계-B: overallStatus 불일치 수정 (completed/failed 케이스)
- 1.5단계: credit_pending 크레딧 재확인
- 1.6단계: OCR quota_check_error 자동 재시도

깨지면: self-healing이 동작하지 않아 불일치 문서가 영구 방치되거나,
       크레딧 충전 후 재처리/OCR 재시도가 불가능해짐
"""
import pytest
from unittest.mock import MagicMock, patch, call
from bson import ObjectId
from datetime import datetime, timezone


# ── 테스트용 상수 ──
TEST_DOC_ID_1 = ObjectId("507f1f77bcf86cd799439011")
TEST_DOC_ID_2 = ObjectId("507f1f77bcf86cd799439012")
TEST_OWNER_ID = "owner_test_001"
TEST_OWNER_ID_2 = "owner_test_002"


def _make_mock_collection():
    """테스트용 mock MongoDB collection 생성"""
    collection = MagicMock()
    collection.count_documents.return_value = 0
    collection.find.return_value = []
    collection.update_one.return_value = MagicMock(modified_count=1)
    collection.update_many.return_value = MagicMock(modified_count=0)
    return collection


def _run_pipeline_with_mock_collection(collection, extra_patches=None):
    """
    run_full_pipeline()을 mock collection으로 실행.
    2단계(임베딩 처리)는 count_documents가 0을 반환하여 자동 스킵됨.

    extra_patches: dict of {dotted_path: mock_value}
        예: {"full_pipeline.check_credit_for_embedding": mock_func}
    """
    import contextlib

    mock_client = MagicMock()
    mock_client.__getitem__ = MagicMock(return_value=MagicMock(
        __getitem__=MagicMock(return_value=collection)
    ))

    # 기본 패치: MongoClient만 mock
    patch_list = [
        patch("full_pipeline.MongoClient", return_value=mock_client),
    ]

    # 추가 패치 적용
    if extra_patches:
        for target, value in extra_patches.items():
            patch_list.append(patch(target, value))

    with contextlib.ExitStack() as stack:
        for p in patch_list:
            stack.enter_context(p)
        from full_pipeline import run_full_pipeline
        run_full_pipeline()


# ========================================
# 1단계-B: overallStatus 불일치 수정
# ========================================

class TestStage1B_OverallStatusFix:
    """
    status: "completed" + overallStatus != "completed" → overallStatus "completed"로 수정
    status: "failed" + overallStatus: "processing" → overallStatus "error"로 수정
    0건이면 로그 미출력
    """

    def test_completed_status_mismatch_is_fixed(self, capsys):
        """status=completed인데 overallStatus!=completed → overallStatus를 completed로 수정"""
        collection = _make_mock_collection()

        # count_documents 호출 순서:
        # 1단계: inconsistent_filter → 0
        # 1단계-B completed: os_completed_filter → 3
        # 1단계-B failed: os_failed_filter → 0
        # 2단계 query_filter → 0
        call_count = [0]
        count_returns = [0, 3, 0, 0]

        def side_effect_count(f):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(count_returns):
                return count_returns[idx]
            return 0

        collection.count_documents.side_effect = side_effect_count

        _run_pipeline_with_mock_collection(collection)

        # update_many가 overallStatus=completed로 호출되었는지 확인
        update_many_calls = collection.update_many.call_args_list
        # 1단계-B completed 수정 호출이 있어야 함
        found_completed_fix = False
        for c in update_many_calls:
            args, kwargs = c
            if len(args) >= 2:
                update_doc = args[1]
                if update_doc.get('$set', {}).get('overallStatus') == 'completed':
                    found_completed_fix = True
                    break

        assert found_completed_fix, "overallStatus=completed 수정 update_many가 호출되어야 합니다"

        captured = capsys.readouterr()
        assert "overallStatus 불일치(completed) 3건 수정" in captured.out

    def test_failed_status_mismatch_is_fixed(self, capsys):
        """status=failed + overallStatus=processing → overallStatus를 error로 수정"""
        collection = _make_mock_collection()

        # 1단계: 0, 1단계-B completed: 0, 1단계-B failed: 2, 2단계: 0
        call_count = [0]
        count_returns = [0, 0, 2, 0]

        def side_effect_count(f):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(count_returns):
                return count_returns[idx]
            return 0

        collection.count_documents.side_effect = side_effect_count

        _run_pipeline_with_mock_collection(collection)

        update_many_calls = collection.update_many.call_args_list
        found_error_fix = False
        for c in update_many_calls:
            args, kwargs = c
            if len(args) >= 2:
                update_doc = args[1]
                if update_doc.get('$set', {}).get('overallStatus') == 'error':
                    found_error_fix = True
                    break

        assert found_error_fix, "overallStatus=error 수정 update_many가 호출되어야 합니다"

        captured = capsys.readouterr()
        assert "overallStatus 불일치(failed→error) 2건 수정" in captured.out

    def test_no_mismatch_no_log(self, capsys):
        """불일치 0건이면 update_many 호출 안 하고 로그도 안 나옴"""
        collection = _make_mock_collection()

        # 모든 count_documents → 0
        collection.count_documents.return_value = 0

        _run_pipeline_with_mock_collection(collection)

        captured = capsys.readouterr()
        assert "overallStatus 불일치(completed)" not in captured.out
        assert "overallStatus 불일치(failed→error)" not in captured.out

        # update_many는 1단계에서도 호출하지 않아야 함 (모두 0건)
        # 단, 1단계 inconsistent도 0건이므로 update_many 호출 0회
        for c in collection.update_many.call_args_list:
            args, kwargs = c
            if len(args) >= 2:
                update_doc = args[1]
                # overallStatus 관련 수정이 없어야 함
                set_doc = update_doc.get('$set', {})
                assert set_doc.get('overallStatus') not in ('completed', 'error'), \
                    "0건일 때 update_many가 호출되면 안 됩니다"


# ========================================
# 1.5단계: credit_pending 크레딧 재확인
# ========================================

class TestStage15_CreditPendingRecheck:
    """
    credit_pending 문서 감지 → 크레딧 체크 API 호출
    크레딧 충분 → pending 전환 + reprocessed_from_credit_pending 플래그
    크레딧 부족 → 유지
    전환 발생 시에만 로그 출력
    """

    def test_credit_sufficient_transitions_to_pending(self, capsys):
        """크레딧 충분 → pending 전환, reprocessed_from_credit_pending=True"""
        collection = _make_mock_collection()

        # 1단계/1단계-B: 모두 0건
        # credit_pending find: 문서 1건 반환
        # 1.6단계: 0건
        # 2단계: 0건
        call_count = [0]
        count_returns = [0, 0, 0, 0]

        def side_effect_count(f):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(count_returns):
                return count_returns[idx]
            return 0

        collection.count_documents.side_effect = side_effect_count

        credit_pending_doc = {
            '_id': TEST_DOC_ID_1,
            'ownerId': TEST_OWNER_ID,
            'status': 'credit_pending',
            'overallStatus': 'credit_pending',
            'ocr': {'page_count': 3}
        }

        find_call_count = [0]

        def side_effect_find(f):
            idx = find_call_count[0]
            find_call_count[0] += 1
            if idx == 0:
                # credit_pending_filter → 문서 1건
                return [credit_pending_doc]
            elif idx == 1:
                # ocr_quota_error_filter → 0건
                return []
            else:
                # 2단계 → 빈 iterator
                return iter([])

        collection.find.side_effect = side_effect_find

        mock_credit_check = MagicMock(return_value={
            'allowed': True,
            'credits_remaining': 50
        })

        _run_pipeline_with_mock_collection(collection, extra_patches={
            "full_pipeline.check_credit_for_embedding": mock_credit_check
        })

        # check_credit_for_embedding이 호출되었는지 확인
        mock_credit_check.assert_called_once_with(TEST_OWNER_ID, 3)

        # update_one으로 pending 전환 확인
        update_one_calls = collection.update_one.call_args_list
        found_pending_transition = False
        for c in update_one_calls:
            args, kwargs = c
            if len(args) >= 2:
                filter_doc = args[0]
                update_doc = args[1]
                if (filter_doc.get('_id') == TEST_DOC_ID_1 and
                        update_doc.get('$set', {}).get('status') == 'pending' and
                        update_doc.get('$set', {}).get('docembed.reprocessed_from_credit_pending') is True):
                    found_pending_transition = True
                    # $unset도 확인
                    assert 'credit_pending_since' in update_doc.get('$unset', {}), \
                        "credit_pending_since가 $unset되어야 합니다"
                    break

        assert found_pending_transition, "크레딧 충분 시 pending으로 전환되어야 합니다"

        captured = capsys.readouterr()
        assert "1건 pending 전환" in captured.out

    def test_credit_insufficient_stays_pending(self, capsys):
        """크레딧 부족 → credit_pending 유지, 전환 로그 미출력"""
        collection = _make_mock_collection()

        call_count = [0]
        count_returns = [0, 0, 0, 0]

        def side_effect_count(f):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(count_returns):
                return count_returns[idx]
            return 0

        collection.count_documents.side_effect = side_effect_count

        credit_pending_doc = {
            '_id': TEST_DOC_ID_1,
            'ownerId': TEST_OWNER_ID,
            'status': 'credit_pending',
            'ocr': {'page_count': 1}
        }

        find_call_count = [0]

        def side_effect_find(f):
            idx = find_call_count[0]
            find_call_count[0] += 1
            if idx == 0:
                return [credit_pending_doc]
            elif idx == 1:
                return []
            else:
                return iter([])

        collection.find.side_effect = side_effect_find

        mock_credit_check = MagicMock(return_value={
            'allowed': False,
            'credits_remaining': 0,
            'reason': 'insufficient_credits'
        })

        _run_pipeline_with_mock_collection(collection, extra_patches={
            "full_pipeline.check_credit_for_embedding": mock_credit_check
        })

        # update_one이 credit_pending 문서에 대해 호출되지 않아야 함
        for c in collection.update_one.call_args_list:
            args, kwargs = c
            if len(args) >= 2 and args[0].get('_id') == TEST_DOC_ID_1:
                pytest.fail("크레딧 부족 시 update_one이 호출되면 안 됩니다")

        captured = capsys.readouterr()
        assert "pending 전환" not in captured.out

    def test_no_credit_pending_docs(self, capsys):
        """credit_pending 문서 0건 → 크레딧 체크 호출 안 함"""
        collection = _make_mock_collection()

        collection.count_documents.return_value = 0
        collection.find.return_value = []

        mock_credit_check = MagicMock()

        _run_pipeline_with_mock_collection(collection, extra_patches={
            "full_pipeline.check_credit_for_embedding": mock_credit_check
        })

        mock_credit_check.assert_not_called()

        captured = capsys.readouterr()
        assert "CreditRecheck" not in captured.out

    def test_credit_check_cached_per_owner(self, capsys):
        """동일 owner의 여러 문서 → 크레딧 체크 1회만 호출"""
        collection = _make_mock_collection()

        call_count = [0]
        count_returns = [0, 0, 0, 0]

        def side_effect_count(f):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(count_returns):
                return count_returns[idx]
            return 0

        collection.count_documents.side_effect = side_effect_count

        # 동일 owner의 문서 2건
        docs = [
            {'_id': TEST_DOC_ID_1, 'ownerId': TEST_OWNER_ID, 'status': 'credit_pending', 'ocr': {'page_count': 1}},
            {'_id': TEST_DOC_ID_2, 'ownerId': TEST_OWNER_ID, 'status': 'credit_pending', 'ocr': {'page_count': 2}},
        ]

        find_call_count = [0]

        def side_effect_find(f):
            idx = find_call_count[0]
            find_call_count[0] += 1
            if idx == 0:
                return docs
            elif idx == 1:
                return []
            else:
                return iter([])

        collection.find.side_effect = side_effect_find

        mock_credit_check = MagicMock(return_value={'allowed': True, 'credits_remaining': 100})

        _run_pipeline_with_mock_collection(collection, extra_patches={
            "full_pipeline.check_credit_for_embedding": mock_credit_check
        })

        # 동일 owner → 1회만 호출
        assert mock_credit_check.call_count == 1

        # 2건 모두 전환
        captured = capsys.readouterr()
        assert "2건 pending 전환" in captured.out


# ========================================
# 1.6단계: OCR quota_check_error 자동 재시도
# ========================================

class TestStage16_OcrQuotaErrorRetry:
    """
    ocr.status=quota_exceeded + quota_message에 quota_check_error 포함 감지
    API 정상 → Redis ocr_stream에 XADD + MongoDB 상태 리셋
    API 오류 → 건드리지 않음
    Redis 연결 실패 시 안전 처리
    """

    def test_api_ok_requeues_to_redis(self, capsys):
        """API 정상 응답 → Redis XADD + MongoDB 상태 리셋"""
        collection = _make_mock_collection()

        call_count = [0]
        count_returns = [0, 0, 0, 0]

        def side_effect_count(f):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(count_returns):
                return count_returns[idx]
            return 0

        collection.count_documents.side_effect = side_effect_count

        ocr_error_doc = {
            '_id': TEST_DOC_ID_1,
            'ownerId': TEST_OWNER_ID,
            'ocr': {
                'status': 'quota_exceeded',
                'quota_message': 'quota_check_error: connection timeout'
            },
            'upload': {
                'destPath': '/data/files/test.pdf',
                'originalName': 'test.pdf'
            }
        }

        find_call_count = [0]

        def side_effect_find(f):
            idx = find_call_count[0]
            find_call_count[0] += 1
            if idx == 0:
                # credit_pending → 0건
                return []
            elif idx == 1:
                # ocr_quota_error → 1건
                return [ocr_error_doc]
            else:
                return iter([])

        collection.find.side_effect = side_effect_find

        # API 정상 응답 (allowed 여부 무관, reason이 에러가 아닌 것이 중요)
        mock_credit_check = MagicMock(return_value={
            'allowed': True,
            'reason': 'has_credits'
        })

        mock_redis = MagicMock()
        mock_redis_class = MagicMock(return_value=mock_redis)

        _run_pipeline_with_mock_collection(collection, extra_patches={
            "full_pipeline.check_credit_for_embedding": mock_credit_check,
            "full_pipeline.redis.Redis": mock_redis_class,
        })

        # Redis XADD 호출 확인
        mock_redis.xadd.assert_called_once()
        xadd_args = mock_redis.xadd.call_args
        assert xadd_args[0][0] == 'ocr_stream'
        xadd_data = xadd_args[0][1]
        assert xadd_data['file_id'] == str(TEST_DOC_ID_1)
        assert xadd_data['file_path'] == '/data/files/test.pdf'
        assert xadd_data['owner_id'] == TEST_OWNER_ID
        assert xadd_data['original_name'] == 'test.pdf'

        # MongoDB 상태 리셋 확인
        found_reset = False
        for c in collection.update_one.call_args_list:
            args, kwargs = c
            if len(args) >= 2:
                filter_doc = args[0]
                update_doc = args[1]
                if (filter_doc.get('_id') == TEST_DOC_ID_1 and
                        update_doc.get('$set', {}).get('ocr.status') == 'queued' and
                        update_doc.get('$set', {}).get('status') == 'pending'):
                    found_reset = True
                    # quota_message가 $unset 되어야 함
                    assert 'ocr.quota_message' in update_doc.get('$unset', {}), \
                        "ocr.quota_message가 $unset되어야 합니다"
                    break

        assert found_reset, "API 정상 시 MongoDB 상태가 리셋되어야 합니다"

        captured = capsys.readouterr()
        assert "1건 재시도" in captured.out

        # Redis close 확인
        mock_redis.close.assert_called_once()

    def test_api_error_skips_document(self, capsys):
        """API 오류 → 문서를 건드리지 않음"""
        collection = _make_mock_collection()

        call_count = [0]
        count_returns = [0, 0, 0, 0]

        def side_effect_count(f):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(count_returns):
                return count_returns[idx]
            return 0

        collection.count_documents.side_effect = side_effect_count

        ocr_error_doc = {
            '_id': TEST_DOC_ID_1,
            'ownerId': TEST_OWNER_ID,
            'ocr': {
                'status': 'quota_exceeded',
                'quota_message': 'quota_check_error: timeout'
            },
            'upload': {
                'destPath': '/data/files/test.pdf',
                'originalName': 'test.pdf'
            }
        }

        find_call_count = [0]

        def side_effect_find(f):
            idx = find_call_count[0]
            find_call_count[0] += 1
            if idx == 0:
                return []
            elif idx == 1:
                return [ocr_error_doc]
            else:
                return iter([])

        collection.find.side_effect = side_effect_find

        # API 오류 (api_error_fallback)
        mock_credit_check = MagicMock(return_value={
            'allowed': False,
            'reason': 'api_error_fallback'
        })

        mock_redis = MagicMock()
        mock_redis_class = MagicMock(return_value=mock_redis)

        _run_pipeline_with_mock_collection(collection, extra_patches={
            "full_pipeline.check_credit_for_embedding": mock_credit_check,
            "full_pipeline.redis.Redis": mock_redis_class,
        })

        # Redis XADD 호출되지 않아야 함
        mock_redis.xadd.assert_not_called()

        # MongoDB update_one도 이 문서에 대해 호출되지 않아야 함
        for c in collection.update_one.call_args_list:
            args, kwargs = c
            if len(args) >= 2 and args[0].get('_id') == TEST_DOC_ID_1:
                pytest.fail("API 오류 시 MongoDB를 건드리면 안 됩니다")

        captured = capsys.readouterr()
        # 0건 재시도, 1건 API오류로 대기
        assert "API오류로 대기" in captured.out

    def test_no_quota_error_docs(self, capsys):
        """대상 문서 0건 → Redis 연결도 안 함"""
        collection = _make_mock_collection()

        collection.count_documents.return_value = 0
        collection.find.return_value = []

        mock_redis_class = MagicMock()

        _run_pipeline_with_mock_collection(collection, extra_patches={
            "full_pipeline.redis.Redis": mock_redis_class,
        })

        # Redis 인스턴스 생성 자체가 안 되어야 함
        mock_redis_class.assert_not_called()

        captured = capsys.readouterr()
        assert "OCR-Retry" not in captured.out

    def test_redis_connection_failure_safe(self, capsys):
        """Redis 연결 실패 → 에러 로그만 출력하고 안전하게 종료"""
        collection = _make_mock_collection()

        call_count = [0]
        count_returns = [0, 0, 0, 0]

        def side_effect_count(f):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(count_returns):
                return count_returns[idx]
            return 0

        collection.count_documents.side_effect = side_effect_count

        ocr_error_doc = {
            '_id': TEST_DOC_ID_1,
            'ownerId': TEST_OWNER_ID,
            'ocr': {
                'status': 'quota_exceeded',
                'quota_message': 'quota_check_error: server error'
            },
            'upload': {'destPath': '/data/files/test.pdf', 'originalName': 'test.pdf'}
        }

        find_call_count = [0]

        def side_effect_find(f):
            idx = find_call_count[0]
            find_call_count[0] += 1
            if idx == 0:
                return []
            elif idx == 1:
                return [ocr_error_doc]
            else:
                return iter([])

        collection.find.side_effect = side_effect_find

        mock_credit_check = MagicMock(return_value={
            'allowed': True,
            'reason': 'has_credits'
        })

        # Redis 생성 시 예외 발생
        mock_redis_class = MagicMock(side_effect=ConnectionError("Redis 서버 연결 불가"))

        _run_pipeline_with_mock_collection(collection, extra_patches={
            "full_pipeline.check_credit_for_embedding": mock_credit_check,
            "full_pipeline.redis.Redis": mock_redis_class,
        })

        # 예외가 발생하지 않고 안전하게 종료
        captured = capsys.readouterr()
        assert "Redis 연결 실패" in captured.out

        # MongoDB도 건드리지 않음
        for c in collection.update_one.call_args_list:
            args, kwargs = c
            if len(args) >= 2 and args[0].get('_id') == TEST_DOC_ID_1:
                pytest.fail("Redis 연결 실패 시 MongoDB를 건드리면 안 됩니다")

    def test_missing_file_path_skips_doc(self, capsys):
        """파일 경로가 없는 문서 → 스킵"""
        collection = _make_mock_collection()

        call_count = [0]
        count_returns = [0, 0, 0, 0]

        def side_effect_count(f):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(count_returns):
                return count_returns[idx]
            return 0

        collection.count_documents.side_effect = side_effect_count

        # upload.destPath 없는 문서
        ocr_error_doc = {
            '_id': TEST_DOC_ID_1,
            'ownerId': TEST_OWNER_ID,
            'ocr': {
                'status': 'quota_exceeded',
                'quota_message': 'quota_check_error: timeout'
            },
            'upload': {}  # destPath 없음
        }

        find_call_count = [0]

        def side_effect_find(f):
            idx = find_call_count[0]
            find_call_count[0] += 1
            if idx == 0:
                return []
            elif idx == 1:
                return [ocr_error_doc]
            else:
                return iter([])

        collection.find.side_effect = side_effect_find

        mock_credit_check = MagicMock(return_value={
            'allowed': True,
            'reason': 'has_credits'
        })

        mock_redis = MagicMock()
        mock_redis_class = MagicMock(return_value=mock_redis)

        _run_pipeline_with_mock_collection(collection, extra_patches={
            "full_pipeline.check_credit_for_embedding": mock_credit_check,
            "full_pipeline.redis.Redis": mock_redis_class,
        })

        # Redis XADD 호출되지 않아야 함 (파일 경로 없으므로)
        mock_redis.xadd.assert_not_called()
