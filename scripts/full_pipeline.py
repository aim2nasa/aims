# t8_full_pipeline.py
import os
from typing import List, Dict
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime
from extract_text_from_mongo import extract_text_from_mongo
from split_text_into_chunks import split_text_into_chunks
from create_embeddings import create_embeddings_for_chunks
from save_to_qdrant import save_chunks_to_qdrant

def run_full_pipeline(mongo_uri: str = 'mongodb://localhost:27017/', db_name: str = 'docupload', collection_name: str = 'files'):
    """
    MongoDB의 모든 문서를 대상으로 임베딩 파이프라인을 실행합니다.
    """
    try:
        client = MongoClient(mongo_uri)
        db = client[db_name]
        collection = db[collection_name]

        # docembed.status 필드가 없는 문서를 찾습니다.
        query_filter = {'ocr.full_text': {'$exists': True}, 'docembed.status': {'$exists': False}}
        documents_to_process = collection.find(query_filter)
        total_docs = collection.count_documents(query_filter)
        
        print(f"총 {total_docs}개의 문서를 처리할 준비가 완료되었습니다.")

        for doc_data in documents_to_process:
            doc_id = str(doc_data['_id'])
            print(f"\n--- 문서 ID: {doc_id} 처리 시작 ---")

            try:
                # 1단계: 로딩 및 청크 생성
                chunks = split_text_into_chunks(doc_data['ocr']['full_text'], {
                    'doc_id': doc_id,
                    'original_name': doc_data.get('originalName'),
                    'uploaded_at': doc_data.get('uploaded_at'),
                    'mime': doc_data.get('meta', {}).get('mime')
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
                            'updated_at': datetime.utcnow().isoformat()
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
                            'failed_at': datetime.utcnow().isoformat()
                        }
                    }}
                )

    except Exception as e:
        print(f"전체 파이프라인 실행 중 심각한 오류 발생: {e}")

if __name__ == '__main__':
    run_full_pipeline()
