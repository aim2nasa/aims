# api_server.py
import os
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

# T9에서 구현한 핵심 로직을 가져옵니다.
from rag_search import embed_query, search_qdrant, generate_answer_with_llm

# FastAPI 앱 인스턴스 생성
app = FastAPI()

# 요청 바디를 위한 Pydantic 모델 정의
class QueryRequest(BaseModel):
    query: str

# 응답 바디를 위한 Pydantic 모델 정의 (선택 사항이지만 좋은 습관)
class SearchResponse(BaseModel):
    answer: str
    source_documents: Optional[List[Dict[str, Any]]] = None

# 헬스 체크 엔드포인트
@app.get("/health")
def health_check():
    return {"status": "ok"}

# 검색 엔드포인트
@app.post("/search", response_model=SearchResponse)
def search_endpoint(request: QueryRequest):
    """
    사용자의 쿼리를 받아 RAG 기반 검색 결과를 반환합니다.
    """
    try:
        # 1. 쿼리 임베딩
        query_vector = embed_query(request.query)
        if not query_vector:
            raise HTTPException(status_code=500, detail="Failed to embed query.")

        # 2. Qdrant 유사도 검색
        search_results = search_qdrant(query_vector)
        if not search_results:
            return SearchResponse(answer="관련 문서를 찾을 수 없습니다.")

        # 3. LLM을 사용해 최종 답변 생성
        final_answer = generate_answer_with_llm(request.query, search_results)
        
        # 소스 문서 메타데이터 추출
        source_docs = [
            {
                "original_name": res.payload.get('original_name'),
                "chunk_id": res.payload.get('chunk_id'),
                "score": res.score
            }
            for res in search_results
        ]

        return SearchResponse(answer=final_answer, source_documents=source_docs)

    except Exception as e:
        print(f"Error processing search request: {e}")
        raise HTTPException(status_code=500, detail="Internal server error.")

if __name__ == '__main__':
    # 로컬 환경에서 실행 시
    uvicorn.run(app, host="0.0.0.0", port=8000)
