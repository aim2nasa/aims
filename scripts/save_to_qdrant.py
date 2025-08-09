import os
from qdrant_client import QdrantClient, models
from typing import List, Dict
import uuid

# 1, 2단계 스크립트 임포트
from extract_text_from_mongo import extract_text_from_mongo
from split_text_into_chunks import split_text_into_chunks
from create_embeddings import create_embeddings_for_chunks

def save_chunks_to_qdrant(chunks: List[Dict], qdrant_url: str = "http://localhost:6333", collection_name: str = "docembed"):
    """
    임베딩된 청크 데이터를 Qdrant에 저장합니다.
    """
    if not chunks:
        print("저장할 청크 데이터가 없습니다.")
        return

    # UserWarning: Qdrant client version 1.15.1 is incompatible with server version 1.9.0.
    # 이 경고는 클라이언트와 서버 버전이 맞지 않아 발생합니다. 
    # Qdrant 서버를 최신 버전으로 업데이트하는 것을 권장합니다.
    client = QdrantClient(url=qdrant_url, check_compatibility=False)
    
    points = []
    for chunk in chunks:
        # T8 가이드와 달리, Qdrant 구버전 호환을 위해 UUID를 포인트 ID로 사용
        point_id = str(uuid.uuid4())
        
        # 기존의 chunk_id는 페이로드에 저장하여 정보를 보존합니다.
        payload = {
            key: value for key, value in chunk.items() if key not in ['text', 'embedding']
        }
        payload['chunk_id'] = chunk['chunk_id']  # chunk_id를 페이로드에 명시적으로 추가
        payload['preview'] = chunk['text'][:240]

        points.append(
            models.PointStruct(
                id=point_id,
                vector=chunk['embedding'],
                payload=payload
            )
        )

    try:
        operation_info = client.upsert(
            collection_name=collection_name,
            wait=True,
            points=points
        )
        print(f"총 {len(points)}개의 포인트가 Qdrant에 성공적으로 upsert되었습니다.")
        print(f"Operation Info: {operation_info.status}")
    except Exception as e:
        print(f"Qdrant에 데이터 저장 중 오류 발생: {e}")

if __name__ == '__main__':
    test_doc_id = '68942319c401f1f64004e23e'
    doc_data = extract_text_from_mongo(test_doc_id)
    if doc_data:
        chunks = split_text_into_chunks(doc_data['text'], doc_data['meta'])
        if chunks:
            embedded_chunks = create_embeddings_for_chunks(chunks)
            if embedded_chunks:
                save_chunks_to_qdrant(embedded_chunks)
