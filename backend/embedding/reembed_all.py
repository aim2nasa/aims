"""
기존 임베딩 문서 전체를 새 청킹 파라미터로 재처리하는 스크립트

대상: docembed.status == "done" 인 문서 전체
처리: 텍스트 추출 → 청킹(유형별 파라미터) → 임베딩 → Qdrant 저장
Qdrant: doc_id 기준 기존 청크 삭제 후 재저장 (save_to_qdrant.py 내장)

⚠️ OpenAI 임베딩 API 호출이 문서 수만큼 발생하므로 크레딧 확인 후 실행!

사용법:
    cd /home/rossi/aims/backend/embedding
    python reembed_all.py              # 전체 재처리
    python reembed_all.py --dry-run    # 대상 문서 수만 확인 (API 호출 없음)
"""
import os
import sys
import argparse
from typing import List, Dict
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime, timezone

from split_text_into_chunks import split_text_into_chunks
from create_embeddings import create_embeddings_for_chunks, EmbeddingError
from save_to_qdrant import save_chunks_to_qdrant

# aims_api 토큰 로깅
AIMS_API_BASE_URL = os.getenv("AIMS_API_URL", "http://localhost:3010")
TOKEN_LOGGING_URL = f"{AIMS_API_BASE_URL}/api/ai-usage/log"
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")


def log_token_usage(user_id: str, doc_id: str, token_usage: Dict) -> bool:
    """aims_api에 토큰 사용량 로깅"""
    import requests
    import uuid
    try:
        response = requests.post(
            TOKEN_LOGGING_URL,
            json={
                "user_id": user_id or "system",
                "source": "doc_embedding_reembed",
                "model": token_usage.get("model", "text-embedding-3-small"),
                "prompt_tokens": token_usage.get("prompt_tokens", 0),
                "completion_tokens": 0,
                "total_tokens": token_usage.get("total_tokens", 0),
                "request_id": str(uuid.uuid4()),
                "metadata": {"document_id": doc_id, "workflow": "reembed_all"}
            },
            headers={"Content-Type": "application/json", "x-api-key": INTERNAL_API_KEY},
            timeout=5
        )
        return response.status_code == 200
    except Exception:
        return False


def extract_full_text(doc: dict) -> tuple:
    """문서에서 full_text와 소스를 추출 (full_pipeline.py 동일 로직)"""
    if doc.get('meta', {}).get('full_text'):
        return doc['meta']['full_text'], 'meta'
    if doc.get('ocr', {}).get('full_text'):
        return doc['ocr']['full_text'], 'ocr'
    if doc.get('text', {}).get('full_text'):
        return doc['text']['full_text'], 'text'
    return None, None


def build_chunk_meta(doc: dict, doc_id: str, text_source: str) -> dict:
    """청킹에 전달할 메타데이터 구성 (full_pipeline.py 동일 구조)"""
    return {
        'doc_id': doc_id,
        'original_name': doc.get('upload', {}).get('originalName') or doc.get('originalName'),
        'owner_id': doc.get('ownerId'),
        'customer_id': doc.get('customer_relation', {}).get('customer_id'),
        'uploaded_at': doc.get('upload', {}).get('uploaded_at') or doc.get('uploaded_at'),
        'mime': doc.get('meta', {}).get('mime'),
        'text_source': text_source,
        'is_annual_report': doc.get('is_annual_report', False),
        'is_customer_review': doc.get('is_customer_review', False),
        'document_type': doc.get('document_type', 'general'),
    }


def run_reembed(dry_run: bool = False):
    mongo_uri = os.getenv("MONGO_URI", "mongodb://tars:27017/")
    db_name = os.getenv("MONGO_DB", "docupload")

    client = MongoClient(mongo_uri)
    collection = client[db_name]["files"]

    # 대상: docembed.status == "done"
    query = {'docembed.status': 'done'}
    total = collection.count_documents(query)

    print(f"[ReEmbed] 대상 문서: {total}건")

    if dry_run:
        # 유형별 분포 표시
        pipeline = [
            {'$match': query},
            {'$group': {
                '_id': {
                    '$cond': [
                        {'$eq': ['$is_annual_report', True]}, 'annual_report',
                        {'$cond': [
                            {'$eq': ['$is_customer_review', True]}, 'customer_review',
                            {'$ifNull': ['$document_type', 'general']}
                        ]}
                    ]
                },
                'count': {'$sum': 1}
            }},
            {'$sort': {'count': -1}}
        ]
        print("\n[유형별 분포]")
        for row in collection.aggregate(pipeline):
            print(f"  {row['_id']}: {row['count']}건")
        print(f"\n[DRY-RUN] API 호출 없이 종료합니다.")
        return

    if total == 0:
        print("[ReEmbed] 재처리 대상 없음. 종료.")
        return

    # 처리
    succeeded = 0
    skipped = 0
    failed_docs: List[Dict] = []
    total_tokens_used = 0

    docs = collection.find(query)

    for idx, doc in enumerate(docs, 1):
        doc_id = str(doc['_id'])
        original_name = doc.get('upload', {}).get('originalName', '(unknown)')

        try:
            # 텍스트 추출
            full_text, text_source = extract_full_text(doc)
            if not full_text or not full_text.strip():
                print(f"  [{idx}/{total}] SKIP (텍스트 없음): {doc_id} — {original_name}")
                skipped += 1
                continue

            # 청킹 (유형별 파라미터 자동 적용)
            meta = build_chunk_meta(doc, doc_id, text_source)
            chunks = split_text_into_chunks(full_text, meta)

            if not chunks:
                print(f"  [{idx}/{total}] SKIP (청크 0개): {doc_id} — {original_name}")
                skipped += 1
                continue

            # 임베딩
            embedded_chunks, token_usage = create_embeddings_for_chunks(chunks)
            tokens = token_usage.get('total_tokens', 0)
            total_tokens_used += tokens

            # 토큰 로깅
            owner_id = doc.get('ownerId')
            if tokens > 0:
                log_token_usage(owner_id, doc_id, token_usage)

            # Qdrant 저장 (기존 청크 자동 삭제 후 upsert)
            if embedded_chunks:
                save_chunks_to_qdrant(embedded_chunks, collection_name="docembed")

            # MongoDB 상태 업데이트
            collection.update_one(
                {'_id': ObjectId(doc_id)},
                {'$set': {
                    'docembed': {
                        'status': 'done',
                        'dims': 1536,
                        'chunks': len(embedded_chunks),
                        'text_source': text_source,
                        'updated_at': datetime.now(timezone.utc).isoformat(),
                        'reembedded_at': datetime.now(timezone.utc).isoformat(),
                    },
                }}
            )

            doc_type = meta.get('document_type', 'general')
            if meta.get('is_annual_report'):
                doc_type = 'annual_report'
            elif meta.get('is_customer_review'):
                doc_type = 'customer_review'

            print(f"  [{idx}/{total}] OK: {doc_id} — {original_name} "
                  f"(type={doc_type}, chunks={len(embedded_chunks)}, tokens={tokens})")
            succeeded += 1

        except EmbeddingError as e:
            print(f"  [{idx}/{total}] FAIL (EmbeddingError): {doc_id} — {e.message}")
            failed_docs.append({'doc_id': doc_id, 'name': original_name, 'error': e.message})
            if e.error_code == 'OPENAI_QUOTA_EXCEEDED':
                print(f"\n⚠️ OpenAI 크레딧 소진! 중단합니다. (처리 완료: {succeeded}/{total})")
                break
        except Exception as e:
            print(f"  [{idx}/{total}] FAIL: {doc_id} — {e}")
            failed_docs.append({'doc_id': doc_id, 'name': original_name, 'error': str(e)})

    # 결과 요약
    print(f"\n{'='*60}")
    print(f"[ReEmbed 완료]")
    print(f"  전체: {total}건")
    print(f"  성공: {succeeded}건")
    print(f"  스킵: {skipped}건 (텍스트 없음/청크 0개)")
    print(f"  실패: {len(failed_docs)}건")
    print(f"  총 토큰: {total_tokens_used:,}")
    print(f"{'='*60}")

    if failed_docs:
        print(f"\n[실패 목록]")
        for f in failed_docs:
            print(f"  - {f['doc_id']} ({f['name']}): {f['error']}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="기존 임베딩 문서 전체 재처리")
    parser.add_argument('--dry-run', action='store_true', help="대상 문서 수만 확인 (API 호출 없음)")
    args = parser.parse_args()
    run_reembed(dry_run=args.dry_run)
