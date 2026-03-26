# t8_full_pipeline.py
import os
import uuid
import requests
import redis
from typing import List, Dict
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime, timezone
from extract_text_from_mongo import extract_text_from_mongo
from split_text_into_chunks import split_text_into_chunks
from create_embeddings import create_embeddings_for_chunks, EmbeddingError
from save_to_qdrant import save_chunks_to_qdrant

# aims_api 토큰 로깅 설정
AIMS_API_BASE_URL = os.getenv("AIMS_API_URL", "http://localhost:3010")
TOKEN_LOGGING_URL = f"{AIMS_API_BASE_URL}/api/ai-usage/log"
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")
if not INTERNAL_API_KEY:
    raise RuntimeError("INTERNAL_API_KEY 환경변수가 설정되지 않았습니다. ~/.env.shared를 확인하세요.")

# 크레딧 체크 API 설정
CREDIT_CHECK_URL = f"{AIMS_API_BASE_URL}/api/internal/check-credit"

# 바이러스 스캔 트리거용 webhook 설정
PROCESSING_COMPLETE_WEBHOOK_URL = f"{AIMS_API_BASE_URL}/api/webhooks/document-processing-complete"
N8N_WEBHOOK_API_KEY = os.getenv("N8N_WEBHOOK_API_KEY")
if not N8N_WEBHOOK_API_KEY:
    raise RuntimeError("N8N_WEBHOOK_API_KEY 환경변수가 설정되지 않았습니다. ~/.env.shared를 확인하세요.")


def check_credit_for_embedding(owner_id: str, estimated_pages: int = 1) -> Dict:
    """
    임베딩 처리 전 크레딧 체크 (aims_api 내부 API 호출)

    Args:
        owner_id: 사용자 ID
        estimated_pages: 예상 페이지 수

    Returns:
        dict: {
            allowed: bool,
            reason: str,
            credits_remaining: int,
            days_until_reset: int,
            ...
        }

    @see docs/EMBEDDING_CREDIT_POLICY.md
    """
    try:
        response = requests.post(
            CREDIT_CHECK_URL,
            json={
                "user_id": owner_id,
                "estimated_pages": estimated_pages
            },
            headers={
                "Content-Type": "application/json",
                "x-api-key": INTERNAL_API_KEY
            },
            timeout=10
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"[CreditCheck] API 호출 실패 (fail-closed): {response.status_code}")
            # fail-closed: API 실패 시 처리 보류 (안전 우선)
            return {"allowed": False, "reason": "api_error_fallback"}

    except Exception as e:
        print(f"[CreditCheck] 오류 (fail-closed): {e}")
        # fail-closed: 오류 시 처리 보류 (aims_api 복구 후 자동 재처리)
        return {"allowed": False, "reason": "error_fallback", "error": str(e)}


def trigger_virus_scan(doc_id: str, owner_id: str) -> bool:
    """
    문서 처리 완료 webhook을 호출하여 바이러스 스캔을 트리거합니다.

    Args:
        doc_id: 문서 ID
        owner_id: 문서 소유자 ID

    Returns:
        bool: 성공 여부
    """
    try:
        payload = {
            "document_id": doc_id,
            "status": "completed",
            "owner_id": owner_id or "unknown"
        }

        headers = {
            "Content-Type": "application/json",
            "x-api-key": N8N_WEBHOOK_API_KEY
        }

        response = requests.post(
            PROCESSING_COMPLETE_WEBHOOK_URL,
            json=payload,
            headers=headers,
            timeout=10
        )

        if response.status_code == 200:
            print(f"[VirusScan] 스캔 트리거 성공: {doc_id}")
            return True
        else:
            print(f"[VirusScan] 스캔 트리거 실패: {response.status_code}")
            return False

    except Exception as e:
        print(f"[VirusScan] 스캔 트리거 오류: {e}")
        return False


def log_token_usage(user_id: str, doc_id: str, token_usage: Dict) -> bool:
    """
    aims_api에 토큰 사용량을 로깅합니다.

    Args:
        user_id: 문서 소유자 ID
        doc_id: 문서 ID
        token_usage: 토큰 사용량 정보

    Returns:
        bool: 로깅 성공 여부
    """
    try:
        payload = {
            "user_id": user_id or "system",
            "source": "doc_embedding",
            "model": token_usage.get("model", "text-embedding-3-small"),
            "prompt_tokens": token_usage.get("prompt_tokens", 0),
            "completion_tokens": token_usage.get("completion_tokens", 0),
            "total_tokens": token_usage.get("total_tokens", 0),
            "request_id": str(uuid.uuid4()),
            "metadata": {
                "document_id": doc_id,
                "workflow": "full_pipeline"
            }
        }

        headers = {
            "Content-Type": "application/json",
            "x-api-key": INTERNAL_API_KEY
        }

        response = requests.post(
            TOKEN_LOGGING_URL,
            json=payload,
            headers=headers,
            timeout=5
        )

        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                print(f"[TokenLog] 임베딩 토큰 로깅 완료: {token_usage.get('total_tokens', 0)} tokens")
                return True

        print(f"[TokenLog] 토큰 로깅 실패: {response.status_code}")
        return False

    except requests.exceptions.RequestException as e:
        print(f"[TokenLog] API 호출 오류: {e}")
        return False
    except Exception as e:
        print(f"[TokenLog] 예상치 못한 오류: {e}")
        return False

def run_full_pipeline(mongo_uri: str = 'mongodb://tars:27017/', db_name: str = 'docupload', collection_name: str = 'files'):
    """
    MongoDB의 모든 문서를 대상으로 임베딩 파이프라인을 실행합니다.
    """
    try:
        client = MongoClient(mongo_uri)
        db = client[db_name]
        collection = db[collection_name]

        # 1단계: 불일치 상태 자동 수정
        # docembed.status가 done/skipped인데 overallStatus 또는 status가 completed가 아닌 경우 수정
        inconsistent_filter = {
            '$and': [
                {'$or': [
                    {'docembed.status': 'done'},
                    {'docembed.status': 'skipped'}
                ]},
                {'$or': [
                    {'overallStatus': {'$ne': 'completed'}},
                    {'status': {'$ne': 'completed'}}
                ]}
            ]
        }
        inconsistent_count = collection.count_documents(inconsistent_filter)
        if inconsistent_count > 0:
            print(f"[FIX] 불일치 상태 문서 {inconsistent_count}개 수정 중...")
            collection.update_many(
                inconsistent_filter,
                {'$set': {
                    'status': 'completed',
                    'overallStatus': 'completed',
                    'overallStatusUpdatedAt': datetime.now(timezone.utc)
                }}
            )
            print(f"[FIX] 불일치 상태 수정 완료")

        # 1단계-B: overallStatus 불일치 자동 수정
        # status: "completed" + overallStatus가 레거시 불일치 상태 → overallStatus를 "completed"로 수정
        # ⚠️ embed_pending, embedding은 정상 상태이므로 제외 (임베딩 크론 대기/처리 중)
        os_completed_filter = {
            'status': 'completed',
            'overallStatus': {'$nin': ['completed', 'embed_pending', 'embedding', 'credit_pending']}
        }
        os_completed_count = collection.count_documents(os_completed_filter)
        if os_completed_count > 0:
            collection.update_many(
                os_completed_filter,
                {'$set': {
                    'overallStatus': 'completed',
                    'overallStatusUpdatedAt': datetime.now(timezone.utc)
                }}
            )
            print(f"[FIX] overallStatus 불일치(completed) {os_completed_count}건 수정")

        # status: "failed" + overallStatus: "processing" → overallStatus를 "error"로 수정
        os_failed_filter = {
            'status': 'failed',
            'overallStatus': 'processing'
        }
        os_failed_count = collection.count_documents(os_failed_filter)
        if os_failed_count > 0:
            collection.update_many(
                os_failed_filter,
                {'$set': {
                    'overallStatus': 'error',
                    'overallStatusUpdatedAt': datetime.now(timezone.utc)
                }}
            )
            print(f"[FIX] overallStatus 불일치(failed→error) {os_failed_count}건 수정")

        # 1.5단계: credit_pending 문서 크레딧 재확인
        # 크레딧 충전(티어 변경, 보너스, 월 리셋 등) 후 자동 재처리 대상 탐색
        credit_pending_filter = {
            '$or': [
                {'status': 'credit_pending'},
                {'overallStatus': 'credit_pending'},
                {'docembed.status': 'credit_pending'}
            ]
        }
        credit_pending_docs = list(collection.find(credit_pending_filter))

        if credit_pending_docs:
            # 사용자별로 그룹화하여 크레딧 체크 (동일 사용자 1회만 호출)
            owner_credit_cache = {}  # owner_id -> allowed (bool)
            transitioned = 0
            still_pending = 0

            for cp_doc in credit_pending_docs:
                cp_owner = cp_doc.get('ownerId')
                if not cp_owner:
                    continue

                # 캐시된 결과 사용
                if cp_owner not in owner_credit_cache:
                    estimated_pages = cp_doc.get('ocr', {}).get('page_count', 1) or 1
                    credit_result = check_credit_for_embedding(cp_owner, estimated_pages)
                    owner_credit_cache[cp_owner] = credit_result.get('allowed', False)

                if owner_credit_cache[cp_owner]:
                    # 크레딧 충분 → pending으로 전환 (2단계에서 자동 처리)
                    collection.update_one(
                        {'_id': cp_doc['_id']},
                        {
                            '$set': {
                                'status': 'pending',
                                'overallStatus': 'pending',
                                'docembed.status': 'pending',
                                'docembed.reprocessed_from_credit_pending': True,
                                'docembed.reprocessed_at': datetime.now(timezone.utc).isoformat(),
                                'progressStage': 'queued',
                                'progressMessage': '크레딧 확인 후 자동 재처리 대기'
                            },
                            '$unset': {
                                'credit_pending_since': '',
                                'credit_pending_info': '',
                                'docembed.credit_pending_since': '',
                                'docembed.credit_info': ''
                            }
                        }
                    )
                    transitioned += 1
                else:
                    still_pending += 1

            if transitioned > 0:
                print(f"[CreditRecheck] credit_pending {len(credit_pending_docs)}건 중 {transitioned}건 pending 전환")

        # 1.6단계: OCR quota_check_error 자동 재시도
        # OCR 쿼터 체크 API 일시적 오류로 실패한 문서를 재처리
        ocr_quota_error_filter = {
            'ocr.status': 'quota_exceeded',
            'ocr.quota_message': {'$regex': 'quota_check_error'}
        }
        ocr_quota_error_docs = list(collection.find(ocr_quota_error_filter))

        if ocr_quota_error_docs:
            # 사용자별로 그룹화하여 API 정상 여부 확인
            owner_api_status_cache = {}  # owner_id -> bool (API 정상 여부)
            requeued = 0
            redis_client = None

            try:
                redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)

                for oqe_doc in ocr_quota_error_docs:
                    oqe_owner = oqe_doc.get('ownerId')
                    if not oqe_owner:
                        continue

                    # 캐시된 결과 사용
                    if oqe_owner not in owner_api_status_cache:
                        credit_result = check_credit_for_embedding(oqe_owner, 1)
                        reason = credit_result.get('reason', '')
                        # API가 정상 응답했으면 (allowed/not allowed 무관) True
                        # API 오류(api_error_fallback, error_fallback)면 False
                        owner_api_status_cache[oqe_owner] = reason not in ('api_error_fallback', 'error_fallback')

                    if not owner_api_status_cache[oqe_owner]:
                        continue  # API 아직 오류 → 다음 크론에서 재시도

                    # Redis 스트림에 OCR 작업 재추가
                    doc_id = str(oqe_doc['_id'])
                    file_path = oqe_doc.get('upload', {}).get('destPath', '')
                    original_name = oqe_doc.get('upload', {}).get('originalName', '') or oqe_doc.get('originalName', '')
                    queued_at = datetime.now(timezone.utc).isoformat()

                    if not file_path:
                        continue  # 파일 경로 없으면 스킵

                    try:
                        redis_client.xadd('ocr_stream', {
                            'file_id': doc_id,
                            'file_path': file_path,
                            'doc_id': doc_id,
                            'owner_id': oqe_owner,
                            'queued_at': queued_at,
                            'original_name': original_name
                        })

                        # MongoDB 상태 리셋
                        collection.update_one(
                            {'_id': oqe_doc['_id']},
                            {
                                '$set': {
                                    'status': 'pending',
                                    'overallStatus': 'pending',
                                    'ocr.status': 'queued',
                                    'ocr.queued_at': queued_at,
                                    'progressStage': 'ocr',
                                    'progressMessage': 'OCR 재시도 대기',
                                    'stages.ocr.status': 'pending',
                                    'stages.ocr.message': 'OCR 재시도 대기',
                                    'stages.ocr.timestamp': queued_at
                                },
                                '$unset': {
                                    'ocr.quota_message': ''
                                }
                            }
                        )
                        requeued += 1
                    except Exception as redis_err:
                        print(f"[OCR-Retry] Redis 큐 추가 실패: {doc_id}, error={redis_err}")
            except Exception as redis_conn_err:
                print(f"[OCR-Retry] Redis 연결 실패: {redis_conn_err}")
            finally:
                if redis_client:
                    redis_client.close()

            skipped = len(ocr_quota_error_docs) - requeued
            if requeued > 0 or skipped > 0:
                print(f"[OCR-Retry] quota_check_error {len(ocr_quota_error_docs)}건: {requeued}건 재시도, {skipped}건 API오류로 대기")

        # 2단계: full_text가 있고, 임베딩이 아직 완료되지 않은 문서를 찾습니다.
        # - docembed.status가 없거나 'pending'인 경우: 신규 처리 대상
        # - docembed.status가 'failed'이고 retry_count < 3인 경우: 재시도 대상
        query_filter = {
            '$and': [
                {'$or': [
                    {'meta.full_text': {'$exists': True}},
                    {'ocr.full_text': {'$exists': True}},
                    {'text.full_text': {'$exists': True}}
                ]},
                {'$or': [
                    {'docembed.status': {'$exists': False}},
                    {'docembed.status': 'pending'},
                    {'$and': [
                        {'docembed.status': 'failed'},
                        {'$or': [
                            {'docembed.retry_count': {'$exists': False}},
                            {'docembed.retry_count': {'$lt': 3}}
                        ]}
                    ]}
                ]}
            ]
        }
        documents_to_process = collection.find(query_filter)
        total_docs = collection.count_documents(query_filter)
        
        print(f"총 {total_docs}개의 문서를 처리할 준비가 완료되었습니다.")

        for doc_data in documents_to_process:
            doc_id = str(doc_data['_id'])
            owner_id = doc_data.get('ownerId')
            print(f"\n--- 문서 ID: {doc_id} 처리 시작 ---")

            try:
                # 🔴 크레딧 체크 (EMBEDDING_CREDIT_POLICY.md 참조)
                # ⭐ reprocessed_from_credit_pending 플래그가 있으면 크레딧 체크 스킵
                # (grantBonusCredits에서 이미 크레딧 충분 여부 확인 후 pending으로 변경한 문서)
                is_reprocessed = doc_data.get('docembed', {}).get('reprocessed_from_credit_pending', False)

                if is_reprocessed:
                    print(f"[CREDIT_SKIP] 문서 ID: {doc_id} - 크레딧 충전 후 재처리 문서 (체크 스킵)")
                else:
                    # 예상 페이지 수 (ocr.page_count 또는 기본 1)
                    estimated_pages = doc_data.get('ocr', {}).get('page_count', 1) or 1
                    credit_check = check_credit_for_embedding(owner_id, estimated_pages)

                    if not credit_check.get('allowed', False):
                        # 크레딧 부족: credit_pending 상태로 변경
                        print(f"[CREDIT_PENDING] 문서 ID: {doc_id} - 크레딧 부족 (남은: {credit_check.get('credits_remaining', 0)}, 필요: {credit_check.get('estimated_credits', 0)})")
                        collection.update_one(
                            {'_id': ObjectId(doc_id)},
                            {'$set': {
                                'docembed': {
                                    'status': 'credit_pending',
                                    'credit_pending_since': datetime.now(timezone.utc).isoformat(),
                                    'credit_info': {
                                        'credits_remaining': credit_check.get('credits_remaining', 0),
                                        'credit_quota': credit_check.get('credit_quota', 0),
                                        'days_until_reset': credit_check.get('days_until_reset', 0),
                                        'estimated_credits': credit_check.get('estimated_credits', 0)
                                    }
                                },
                                'status': 'credit_pending',
                                'overallStatus': 'credit_pending',
                                'overallStatusUpdatedAt': datetime.now(timezone.utc)
                            }}
                        )
                        continue  # 다음 문서로

                # full_text 추출 (우선순위: meta.full_text > ocr.full_text > text.full_text)
                full_text = None
                text_source = None

                if doc_data.get('meta', {}).get('full_text'):
                    full_text = doc_data['meta']['full_text']
                    text_source = 'meta'
                elif doc_data.get('ocr', {}).get('full_text'):
                    full_text = doc_data['ocr']['full_text']
                    text_source = 'ocr'
                elif doc_data.get('text', {}).get('full_text'):
                    full_text = doc_data['text']['full_text']
                    text_source = 'text'

                # 텍스트가 없거나 비어있으면 임베딩 스킵 (완료로 처리)
                if not full_text or (isinstance(full_text, str) and len(full_text.strip()) == 0):
                    print(f"[SKIP] 문서 ID: {doc_id} - 텍스트 없음 또는 비어있음 (임베딩 건너뜀)")
                    collection.update_one(
                        {'_id': ObjectId(doc_id)},
                        {'$set': {
                            'docembed': {
                                'status': 'skipped',
                                'skip_reason': 'no_text',
                                'chunks': 0,
                                'updated_at': datetime.now(timezone.utc).isoformat()
                            },
                            'status': 'completed',
                            'overallStatus': 'completed',
                            'overallStatusUpdatedAt': datetime.now(timezone.utc),
                            'progress': 100,
                            'progressStage': 'complete',
                            'progressMessage': '처리 완료'
                        }}
                    )
                    # 🔵 displayName 자동 생성 (임베딩 스킵이라도 시도)
                    owner_id = doc_data.get('ownerId')
                    if not doc_data.get("displayName") and owner_id:
                        is_ar = doc_data.get("is_annual_report", False)
                        is_crs = doc_data.get("is_customer_review", False)
                        tags = doc_data.get("tags", [])
                        is_ar_crs = is_ar or is_crs or ("AR" in (tags or [])) or ("CRS" in (tags or []))
                        if not is_ar_crs:
                            try:
                                dp_url = os.getenv("DOCUMENT_PIPELINE_URL", "http://localhost:8100")
                                dn_resp = requests.post(
                                    f"{dp_url}/webhook/batch-display-names",
                                    json={"document_ids": [doc_id], "user_id": owner_id, "force_regenerate": False},
                                    headers={"Content-Type": "application/json"},
                                    timeout=15  # 배치 1건 기준 충분, 루프 블로킹 최소화
                                )
                                if dn_resp.status_code == 200:
                                    print(f"[DisplayName] 자동 생성 완료 (스킵 문서): {doc_id}")
                            except Exception as dn_err:
                                print(f"[DisplayName] 자동 생성 실패 (계속 진행): {doc_id}, error={dn_err}")

                    # 바이러스 스캔 트리거 (임베딩 스킵이라도 완료 처리)
                    trigger_virus_scan(doc_id, owner_id)
                    continue

                print(f"텍스트 소스: {text_source}.full_text (길이: {len(full_text)})")

                # overallStatus: embedding (임베딩 생성 중)
                collection.update_one(
                    {'_id': ObjectId(doc_id)},
                    {'$set': {
                        'overallStatus': 'embedding',
                        'overallStatusUpdatedAt': datetime.now(timezone.utc)
                    }}
                )

                # 1단계: 로딩 및 청크 생성
                chunks = split_text_into_chunks(full_text, {
                    'doc_id': doc_id,
                    'original_name': doc_data.get('upload', {}).get('originalName') or doc_data.get('originalName'),
                    'owner_id': doc_data.get('ownerId'),
                    'customer_id': doc_data.get('customer_relation', {}).get('customer_id'),
                    'uploaded_at': doc_data.get('upload', {}).get('uploaded_at') or doc_data.get('uploaded_at'),
                    'mime': doc_data.get('meta', {}).get('mime'),
                    'text_source': text_source,
                    'is_annual_report': doc_data.get('is_annual_report', False),
                    'is_customer_review': doc_data.get('is_customer_review', False),
                    'document_type': doc_data.get('meta', {}).get('document_type', 'general'),
                })

                # 2단계: 임베딩 생성 (토큰 사용량 포함)
                owner_id = doc_data.get('ownerId')
                embedded_chunks, token_usage = create_embeddings_for_chunks(chunks)

                # 토큰 사용량 로깅
                if token_usage.get('total_tokens', 0) > 0:
                    log_token_usage(owner_id, doc_id, token_usage)

                # 3단계: Qdrant에 저장
                if embedded_chunks:
                    save_chunks_to_qdrant(embedded_chunks, collection_name="docembed")
                
                # 4단계: MongoDB에 처리 상태 업데이트 (임베딩 완료 = 전체 완료)
                collection.update_one(
                    {'_id': ObjectId(doc_id)},
                    {'$set': {
                        'docembed': {
                            'status': 'done',
                            'dims': 1536,
                            'chunks': len(embedded_chunks),
                            'text_source': text_source,  # 텍스트 소스 기록
                            'updated_at': datetime.now(timezone.utc).isoformat()
                        },
                        'status': 'completed',  # 임베딩 완료 = 전체 처리 완료
                        'overallStatus': 'completed',
                        'overallStatusUpdatedAt': datetime.now(timezone.utc),
                        'progress': 100,
                        'progressStage': 'complete',
                        'progressMessage': '처리 완료'
                    }}
                )
                print(f"--- 문서 ID: {doc_id} 처리 완료 (status+overallStatus: completed) ---")

                # 🔵 displayName 자동 생성 (없는 비-AR/CRS 문서만)
                if not doc_data.get("displayName"):
                    is_ar = doc_data.get("is_annual_report", False)
                    is_crs = doc_data.get("is_customer_review", False)
                    tags = doc_data.get("tags", [])
                    is_ar_crs = is_ar or is_crs or ("AR" in (tags or [])) or ("CRS" in (tags or []))

                    if not is_ar_crs and owner_id:
                        try:
                            dp_url = os.getenv("DOCUMENT_PIPELINE_URL", "http://localhost:8100")
                            dn_resp = requests.post(
                                f"{dp_url}/webhook/batch-display-names",
                                json={"document_ids": [doc_id], "user_id": owner_id, "force_regenerate": False},
                                headers={"Content-Type": "application/json"},
                                timeout=30
                            )
                            if dn_resp.status_code == 200:
                                dn_result = dn_resp.json()
                                print(f"[DisplayName] 자동 생성 완료: {doc_id}, summary={dn_result.get('summary', {})}")
                            else:
                                print(f"[DisplayName] API 응답 에러: {doc_id}, status={dn_resp.status_code}")
                        except Exception as dn_err:
                            print(f"[DisplayName] 자동 생성 실패 (계속 진행): {doc_id}, error={dn_err}")

                # 바이러스 스캔 트리거 (임베딩 완료 후 자동 스캔)
                trigger_virus_scan(doc_id, owner_id)
            except EmbeddingError as e:
                # OpenAI API 크레딧 소진 등 명확한 임베딩 에러
                prev_retry = doc_data.get('docembed', {}).get('retry_count', 0)
                print(f"!!! 문서 ID: {doc_id} 임베딩 에러: [{e.error_code}] {e.message} (retry: {prev_retry + 1}) !!!")
                collection.update_one(
                    {'_id': ObjectId(doc_id)},
                    {'$set': {
                        'docembed.status': 'failed',
                        'docembed.error_code': e.error_code,
                        'docembed.error_message': e.message,
                        'docembed.failed_at': datetime.now(timezone.utc).isoformat(),
                        'docembed.retry_count': prev_retry + 1,
                        'status': 'failed',
                        'overallStatus': 'error',
                        'overallStatusUpdatedAt': datetime.now(timezone.utc)
                    }}
                )
                # 크레딧 소진 시 전체 파이프라인 중단
                if e.error_code == 'OPENAI_QUOTA_EXCEEDED':
                    print(f"\n⚠️ OpenAI 크레딧 소진! 파이프라인을 중단합니다.")
                    print(f"   충전 페이지: https://platform.openai.com/account/billing")
                    break
            except Exception as e:
                prev_retry = doc_data.get('docembed', {}).get('retry_count', 0)
                print(f"!!! 문서 ID: {doc_id} 처리 중 오류 발생: {e} (retry: {prev_retry + 1}) !!!")
                collection.update_one(
                    {'_id': ObjectId(doc_id)},
                    {'$set': {
                        'docembed.status': 'failed',
                        'docembed.error_code': 'UNKNOWN',
                        'docembed.error_message': str(e),
                        'docembed.failed_at': datetime.now(timezone.utc).isoformat(),
                        'docembed.retry_count': prev_retry + 1,
                        'status': 'failed',
                        'overallStatus': 'error',
                        'overallStatusUpdatedAt': datetime.now(timezone.utc)
                    }}
                )

    except Exception as e:
        print(f"전체 파이프라인 실행 중 심각한 오류 발생: {e}")

if __name__ == '__main__':
    run_full_pipeline()
