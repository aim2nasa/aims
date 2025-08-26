# t8_full_pipeline.py
import os
from typing import List, Dict
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime, timezone, timedelta   # ✅ timezone, timedelta 추가
from extract_text_from_mongo import extract_text_from_mongo
from split_text_into_chunks import split_text_into_chunks
from create_embeddings import create_embeddings_for_chunks
from save_to_qdrant import save_chunks_to_qdrant

# ✅ KST 타임존 정의
KST = timezone(timedelta(hours=9))

def run_full_pipeline(mongo_uri: str = 'mongodb://tars:27017/', db_name: str = 'docupload', collection_name: str = 'files'):
    """
    MongoDB의 모든 문서를 대상으로 임베딩 파이프라인을 실행합니다.
    """
    try:
        client = MongoClient(mongo_uri)
        db = client[db_name]
        collection = db[collection_name]

        # docembed.status 필드가 없고 full_text가 있는 문서를 찾습니다.
        # (meta.full_text, ocr.full_text, text.full_text 중 하나라도 있으면)
        query_filter = {
            '$or': [
                {'meta.full_text': {'$exists': True}},
                {'ocr.full_text': {'$exists': True}},
                {'text.full_text': {'$exists': True}}
            ],
            'docembed.status': {'$exists': False}
        }
        documents_to_process = collection.find(query_filter)
        total_docs = collection.count_documents(query_filter)
        
        print(f"총 {total_docs}개의 문서를 처리할 준비가 완료되었습니다.")

        for doc_data in documents_to_process:
            doc_id = str(doc_data['_id'])
            print(f"\n--- 문서 ID: {doc_id} 처리 시작 ---")

            try:
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
                
                if not full_text:
                    print(f"!!! 문서 ID: {doc_id}에서 full_text를 찾을 수 없습니다 !!!")
                    continue
                    
                print(f"텍스트 소스: {text_source}.full_text (길이: {len(full_text)})")
                
                # 1단계: 로딩 및 청크 생성
                chunks = split_text_into_chunks(full_text, {
                    'doc_id': doc_id,
                    'original_name': doc_data.get('upload', {}).get('originalName') or doc_data.get('originalName'),
                    'uploaded_at': doc_data.get('upload', {}).get('uploaded_at') or doc_data.get('uploaded_at'),
                    'mime': doc_data.get('meta', {}).get('mime'),
                    'text_source': text_source  # 텍스트 소스 정보 추가
                })

                # 2단계: 임베딩 생성
                embedded_chunks = create_embeddings_for_chunks(chunks)

                # 3단계: Qdrant에 저장
                if embedded_chunks:
                    save_chunks_to_qdrant(embedded_chunks, collection_name="docembed")
                
                # 4단계: MongoDB에 처리 상태 업데이트
                collection.update_one(
                    {'_id': ObjectId(doc_id)},
                    {'$set': {
                        'docembed': {
                            'status': 'done',
                            'dims': 1536,
                            'chunks': len(embedded_chunks),
                            'text_source': text_source,  # 텍스트 소스 기록
                            'updated_at': datetime.now(KST).isoformat()
                        }
                    }}
                )
                print(f"--- 문서 ID: {doc_id} 처리 완료 및 MongoDB 상태 업데이트 ---")
            except Exception as e:
                print(f"!!! 문서 ID: {doc_id} 처리 중 오류 발생: {e} !!!")
                # 오류 발생 시 MongoDB에 상태 기록
                collection.update_one(
                    {'_id': ObjectId(doc_id)},
                    {'$set': {
                        'docembed': {
                            'status': 'failed',
                            'error_message': str(e),
                            'failed_at': datetime.now(KST).isoformat()
                        }
                    }}
                )

    except Exception as e:
        print(f"전체 파이프라인 실행 중 심각한 오류 발생: {e}")

if __name__ == '__main__':
    run_full_pipeline()
