# search_qdrant.py
import os
from typing import List, Dict
from openai import OpenAI
from qdrant_client import QdrantClient, models

# 1. 쿼리를 임베딩하는 함수 (이전 단계에서 작성한 것)
def embed_query(query_text: str) -> List[float]:
    """
    검색 쿼리 텍스트를 OpenAI 임베딩 모델을 사용하여 벡터로 변환합니다.
    """
    try:
        client = OpenAI()
        response = client.embeddings.create(
            input=query_text,
            model="text-embedding-3-small",
            encoding_format="float"
        )
        print("✔ 쿼리 임베딩 생성 완료!")
        return response.data[0].embedding
    except Exception as e:
        print(f"❌ 쿼리 임베딩 중 오류 발생: {e}")
        return None

# 2. Qdrant에서 유사도 검색을 수행하는 함수
def search_qdrant(query_vector: List[float], collection_name: str = "docembed", top_k: int = 5):
    """
    임베딩된 쿼리 벡터를 사용하여 Qdrant에서 유사한 문서를 검색합니다.

    :param query_vector: 검색할 쿼리 임베딩 벡터.
    :param collection_name: 검색 대상 Qdrant 컬렉션 이름.
    :param top_k: 반환할 상위 결과의 개수.
    :return: 검색 결과 리스트.
    """
    if not query_vector:
        print("❌ 쿼리 벡터가 없어 검색을 진행할 수 없습니다.")
        return []

    client = QdrantClient(url="http://localhost:6333", check_compatibility=False)
    
    try:
        search_result = client.search(
            collection_name=collection_name,
            query_vector=query_vector,
            limit=top_k, # 상위 N개 결과 반환
            with_payload=True # 메타데이터(payload) 포함
        )
        print(f"✔ Qdrant에서 상위 {top_k}개 결과 검색 완료!")
        return search_result
    except Exception as e:
        print(f"❌ Qdrant 검색 중 오류 발생: {e}")
        return []

# 3. 전체 실행 로직
if __name__ == '__main__':
    test_query = "2025년 2월 퇴직연금 부담금 내역서"
    
    # 쿼리 임베딩
    query_vector = embed_query(test_query)
    
    # Qdrant 검색
    search_results = search_qdrant(query_vector)
    
    if search_results:
        print("\n--- 검색 결과 ---")
        for i, result in enumerate(search_results):
            print(f"** {i+1}. 유사도 점수: {result.score:.4f} **")
            print(f" - 문서명: {result.payload.get('original_name')}")
            print(f" - 청크 ID: {result.payload.get('chunk_id')}")
            print(f" - 미리보기: {result.payload.get('preview', '')[:80]}...")
            print("-" * 20)
    else:
        print("검색 결과가 없습니다.")
