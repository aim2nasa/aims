import os
from qdrant_client import QdrantClient, models
from typing import List, Dict
import uuid

# 1, 2단계 스크립트 임포트
from extract_text_from_mongo import extract_text_from_mongo
from split_text_into_chunks import split_text_into_chunks
from create_embeddings import create_embeddings_for_chunks


def _deterministic_uuid(chunk_id: str) -> str:
    """
    chunk_id로부터 결정적 UUID를 생성합니다.
    동일 chunk_id는 항상 동일 UUID를 반환하므로,
    재처리 시 기존 포인트를 자연스럽게 덮어씁니다.
    """
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"aims.docembed.{chunk_id}"))


def delete_doc_chunks(client: QdrantClient, doc_id: str, collection_name: str = "docembed") -> int:
    """
    특정 문서의 기존 청크를 Qdrant에서 삭제합니다.
    재처리 시 중복 방지를 위해 저장 전 호출합니다.

    Returns:
        1: 삭제 성공, 0: 삭제 실패
    """
    try:
        # doc_id 기반 필터로 해당 문서의 모든 청크 삭제
        result = client.delete(
            collection_name=collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="doc_id",
                            match=models.MatchValue(value=doc_id)
                        )
                    ]
                )
            ),
            wait=True
        )
        print(f"[Qdrant] 문서 {doc_id}의 기존 청크 삭제 완료")
        return 1  # 성공
    except Exception as e:
        print(f"[Qdrant] 기존 청크 삭제 중 오류 (무시하고 계속): {e}")
        return 0


def save_chunks_to_qdrant(chunks: List[Dict], qdrant_url: str = "http://localhost:6333", collection_name: str = "docembed"):
    """
    임베딩된 청크 데이터를 Qdrant에 저장합니다.
    저장 전 해당 문서의 기존 청크를 삭제하여 중복을 방지합니다.
    """
    if not chunks:
        print("저장할 청크 데이터가 없습니다.")
        return

    client = QdrantClient(url=qdrant_url, check_compatibility=False)

    # 기존 청크 삭제 (재처리 시 중복 방지)
    doc_ids = set(chunk.get('doc_id') for chunk in chunks if chunk.get('doc_id'))
    for doc_id in doc_ids:
        delete_doc_chunks(client, doc_id, collection_name)

    points = []
    for chunk in chunks:
        # chunk_id 기반 결정적 UUID — 동일 청크는 항상 동일 ID
        chunk_id = chunk.get('chunk_id', '')
        point_id = _deterministic_uuid(chunk_id)

        # 기존의 chunk_id는 페이로드에 저장하여 정보를 보존합니다.
        # owner_id, customer_id도 자동으로 포함됩니다 (extract_text_from_mongo에서 추출)
        payload = {
            key: value for key, value in chunk.items() if key not in ['text', 'embedding']
        }
        payload['chunk_id'] = chunk_id
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
