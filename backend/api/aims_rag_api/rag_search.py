# rag_search.py
import os
from typing import List, Dict, Optional, Any
from openai import OpenAI
from qdrant_client import QdrantClient, models
# 💡 T11 변경 사항 시작
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import requests
import json

# FastAPI 애플리케이션 인스턴스 생성
app = FastAPI()

# CORS는 nginx에서 처리하므로 여기서는 제거

# 💡 T11 변경 사항 시작 - 요청 및 응답 모델 정의
class SearchRequest(BaseModel):
    query: str
    mode: str = "OR"
    search_mode: str = "semantic"
    user_id: Optional[str] = None

class UnifiedSearchResponse(BaseModel):
    search_mode: str
    answer: Optional[str] = None
    search_results: List[Dict[str, Any]]

SMARTSEARCH_API_URL = "https://n8nd.giize.com/webhook/smartsearch"
# 💡 T11 변경 사항 끝

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

# 2. Qdrant 유사도 검색 함수 (사용자 필터 추가)
def search_qdrant(query_vector: List[float], user_id: Optional[str] = None, collection_name: str = "docembed", top_k: int = 5):
    if not query_vector:
        return []
    client = QdrantClient(host="localhost", port=6333, check_compatibility=False)
    try:
        # 사용자 ID 필터 조건 생성
        query_filter = None
        if user_id:
            query_filter = models.Filter(
                must=[
                    models.FieldCondition(
                        key="owner_id",
                        match=models.MatchValue(value=user_id)
                    )
                ]
            )

        search_result = client.search(
            collection_name=collection_name,
            query_vector=query_vector,
            query_filter=query_filter,
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
            max_tokens=500,
            temperature=0.1
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"❌ LLM 답변 생성 중 오류 발생: {e}"

@app.post("/search", response_model=UnifiedSearchResponse)
async def search_endpoint(request: SearchRequest):
    if request.search_mode == "keyword":
        # 키워드 검색 로직
        payload = {"query": request.query, "mode": request.mode, "user_id": request.user_id}
        try:
            response = requests.post(SMARTSEARCH_API_URL, json=payload)
            response.raise_for_status()

            # 응답 구조를 통일된 형식으로 변경
            raw_results = response.json()
            return UnifiedSearchResponse(
                search_mode="keyword",
                answer=None,
                search_results=raw_results
            )
        except requests.RequestException as e:
            raise HTTPException(status_code=500, detail=f"SmartSearch API 호출 오류: {e}")

    elif request.search_mode == "semantic":
        # 의미 검색 로직 (사용자 필터 적용)
        query_vector = embed_query(request.query)
        if not query_vector:
            raise HTTPException(status_code=500, detail="쿼리 임베딩 실패.")

        search_results = search_qdrant(query_vector, user_id=request.user_id)
        final_answer = generate_answer_with_llm(request.query, search_results)

        # 응답 구조를 통일된 형식으로 변경
        return UnifiedSearchResponse(
            search_mode="semantic",
            answer=final_answer,
            search_results=[{"id": res.id, "score": res.score, "payload": res.payload} for res in search_results]
        )
    else:
        raise HTTPException(status_code=400, detail="유효하지 않은 검색 모드입니다. 'keyword' 또는 'semantic'을 사용하세요.")

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
