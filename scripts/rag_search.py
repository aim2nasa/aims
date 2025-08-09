# rag_search.py
import os
from typing import List, Dict
from openai import OpenAI
from qdrant_client import QdrantClient, models

# 1. 쿼리 임베딩 함수 (이전 단계와 동일)
def embed_query(query_text: str) -> List[float]:
    client = OpenAI()
    try:
        response = client.embeddings.create(
            input=query_text,
            model="text-embedding-3-small",
            encoding_format="float"
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"❌ 쿼리 임베딩 중 오류 발생: {e}")
        return None

# 2. Qdrant 유사도 검색 함수 (이전 단계와 동일)
def search_qdrant(query_vector: List[float], collection_name: str = "docembed", top_k: int = 5):
    if not query_vector:
        return []
    client = QdrantClient(url="http://localhost:6333", check_compatibility=False)
    try:
        search_result = client.search(
            collection_name=collection_name,
            query_vector=query_vector,
            limit=top_k,
            with_payload=True
        )
        return search_result
    except Exception as e:
        print(f"❌ Qdrant 검색 중 오류 발생: {e}")
        return []

# 3. LLM을 사용하여 답변 생성하는 함수 (새로운 기능)
def generate_answer_with_llm(query: str, search_results: List[Dict]) -> str:
    if not search_results:
        return "관련 문서를 찾을 수 없습니다."

    # 검색 결과를 바탕으로 컨텍스트 생성
    context = ""
    for i, result in enumerate(search_results):
        preview = result.payload.get('preview', '')
        original_name = result.payload.get('original_name', '알 수 없는 문서')
        context += f"--- 문서 조각 {i+1} (출처: {original_name}) ---\n{preview}\n\n"

    # LLM에게 전달할 시스템 프롬프트 및 사용자 프롬프트 구성
    messages = [
        {"role": "system", "content": "너는 AI 자동화 솔루션 전문가로, 주어진 문서 내용을 바탕으로 사용자의 질문에 대해 친절하고 명확하게 답변해야 해. 문서 내용에 없는 정보는 절대 추가하거나 추측해서는 안 돼."},
        {"role": "user", "content": f"다음 문서를 참고해서 질문에 답해줘. 질문: '{query}'\n\n문서:\n{context}"}
    ]

    try:
        client = OpenAI()
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",  # 답변 생성에 적합한 모델 사용
            messages=messages,
            max_tokens=500
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"❌ LLM 답변 생성 중 오류 발생: {e}"

# 4. 전체 실행 로직
if __name__ == '__main__':
    test_query = "2025년 2월 퇴직연금 부담금 내역에 대해 알려줘"
    print(f"🔎 질문: '{test_query}'")

    # 1단계: 쿼리 임베딩
    query_vector = embed_query(test_query)

    # 2단계: Qdrant 유사도 검색
    search_results = search_qdrant(query_vector)

    # 3단계: 검색 결과와 LLM을 사용해 답변 생성
    final_answer = generate_answer_with_llm(test_query, search_results)

    print("\n--- 최종 답변 ---")
    print(final_answer)
