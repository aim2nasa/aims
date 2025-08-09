# search_query.py
import os
from openai import OpenAI
from typing import List, Dict

def embed_query(query_text: str) -> List[float]:
    """
    검색 쿼리 텍스트를 OpenAI 임베딩 모델을 사용하여 벡터로 변환합니다.

    :param query_text: 검색할 텍스트 쿼리.
    :return: 쿼리 임베딩 벡터.
    """
    try:
        client = OpenAI()
        response = client.embeddings.create(
            input=query_text,
            model="text-embedding-3-small", # T8과 동일한 모델 사용
            encoding_format="float"
        )
        print("쿼리 임베딩 생성 완료!")
        return response.data[0].embedding
    except Exception as e:
        print(f"쿼리 임베딩 중 오류 발생: {e}")
        return None

if __name__ == '__main__':
    test_query = "2025년 2월 퇴직연금 부담금 내역서"
    query_vector = embed_query(test_query)
    
    if query_vector:
        print("\n--- 생성된 쿼리 벡터 ---")
        print(f"쿼리: '{test_query}'")
        print(f"벡터 (일부): {query_vector[:5]}...")
        print(f"벡터 차원: {len(query_vector)}")
