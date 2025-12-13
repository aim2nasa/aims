# rag_search.py
import os
import time
from typing import List, Dict, Optional, Any
from openai import OpenAI
from qdrant_client import QdrantClient, models
# 💡 T11 변경 사항 시작
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import requests
import json

# 🔥 Phase 1: 하이브리드 검색 추가
from query_analyzer import QueryAnalyzer
from hybrid_search import HybridSearchEngine

# 🔥 Phase 2: Cross-Encoder 재순위화 추가
from reranker import SearchReranker

# 🔥 Phase 3: 검색 품질 모니터링 추가
from search_logger import SearchLogger
from quality_analyzer import QualityAnalyzer
from alert_system import AlertSystem

# 🔥 Phase 4: AI 토큰 사용량 추적 추가
from token_tracker import TokenTracker

# FastAPI 애플리케이션 인스턴스 생성
app = FastAPI()

# CORS는 nginx에서 처리하므로 여기서는 제거

# 🔥 Phase 1: 하이브리드 검색 엔진 초기화
query_analyzer = QueryAnalyzer()
hybrid_engine = HybridSearchEngine()

# 🔥 Phase 2: Cross-Encoder 재순위화 엔진 초기화
reranker = SearchReranker()

# 🔥 Phase 3: 검색 로거 및 품질 분석기 초기화
search_logger = SearchLogger()
quality_analyzer = QualityAnalyzer()
alert_system = AlertSystem()

# 🔥 Phase 4: AI 토큰 사용량 추적기 초기화
token_tracker = TokenTracker()

# 💡 T11 변경 사항 시작 - 요청 및 응답 모델 정의
class SearchRequest(BaseModel):
    query: str
    mode: str = "OR"
    search_mode: str = "semantic"
    user_id: Optional[str] = None
    customer_id: Optional[str] = None
    top_k: int = 10  # AI 검색 결과 개수 (기본 10개)

class UnifiedSearchResponse(BaseModel):
    search_mode: str
    answer: Optional[str] = None
    search_results: List[Dict[str, Any]]

# 보안: 내부망에서만 n8n 접근 (host 네트워크 모드로 localhost 직접 접근)
SMARTSEARCH_API_URL = "http://localhost:5678/webhook/smartsearch"
# 💡 T11 변경 사항 끝

# 1. 쿼리 임베딩 함수 (토큰 추적 추가)
def embed_query(query_text: str) -> tuple:
    """
    쿼리 텍스트를 임베딩 벡터로 변환

    Args:
        query_text: 임베딩할 쿼리 텍스트

    Returns:
        tuple: (embedding_vector, openai_response) - 벡터와 응답 객체 (토큰 추적용)
    """
    client = OpenAI()
    try:
        response = client.embeddings.create(
            input=query_text,
            model="text-embedding-3-small",
            encoding_format="float"
        )
        return response.data[0].embedding, response
    except Exception as e:
        print(f"❌ 쿼리 임베딩 중 오류 발생: {e}")
        return None, None

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

# 3. 문서별 중복 제거 함수 (최고 점수 청크만 반환)
def deduplicate_by_document(search_results: List) -> List[Dict]:
    """
    문서별로 중복을 제거하고, 각 문서의 최고 점수 청크만 반환

    Args:
        search_results: Qdrant 검색 결과 리스트

    Returns:
        문서별 최고 점수 청크 리스트 (점수 기준 내림차순 정렬)
    """
    if not search_results:
        return []

    doc_map = {}
    for res in search_results:
        doc_id = res.payload.get('doc_id')
        if not doc_id:
            continue

        # 해당 문서의 최고 점수 청크만 유지
        if doc_id not in doc_map or res.score > doc_map[doc_id]['score']:
            doc_map[doc_id] = {
                "id": res.id,
                "score": res.score,
                "payload": res.payload
            }

    # 점수 기준으로 내림차순 정렬
    results = list(doc_map.values())
    results.sort(key=lambda x: x['score'], reverse=True)

    return results

# 4. LLM을 사용하여 답변 생성하는 함수 (토큰 추적 추가)
def generate_answer_with_llm(query: str, search_results: List[Dict]) -> tuple:
    """
    검색 결과를 바탕으로 LLM 답변 생성

    Args:
        query: 사용자 질문
        search_results: 검색 결과 리스트

    Returns:
        tuple: (answer_text, openai_response) - 답변과 응답 객체 (토큰 추적용)
    """
    if not search_results:
        return "관련 문서를 찾을 수 없습니다.", None

    # 검색 결과를 바탕으로 컨텍스트 생성
    context = ""
    for i, result in enumerate(search_results):
        # 🔥 수정: 하이브리드 검색 결과는 이미 Dict 형태
        payload = result.get('payload', result)
        preview = payload.get('preview', '')
        original_name = payload.get('original_name', '알 수 없는 문서')
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
        return response.choices[0].message.content, response
    except Exception as e:
        return f"❌ LLM 답변 생성 중 오류 발생: {e}", None

@app.post("/search", response_model=UnifiedSearchResponse)
async def search_endpoint(request: SearchRequest):
    if request.search_mode == "keyword":
        # 키워드 검색 로직
        payload = {"query": request.query, "mode": request.mode, "user_id": request.user_id}
        if request.customer_id:
            payload["customer_id"] = request.customer_id
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
        # 🔥 Phase 1: 하이브리드 검색 로직
        # 🔥 Phase 2: Cross-Encoder 재순위화 추가
        # 🔥 Phase 3: 검색 품질 모니터링 추가
        try:
            # 전체 시작 시간
            total_start_time = time.time()
            timing = {}

            # 1단계: 쿼리 의도 분석
            analysis_start = time.time()
            query_intent = query_analyzer.analyze(request.query)
            timing["query_analysis_time"] = time.time() - analysis_start
            print(f"📊 쿼리 유형: {query_intent['query_type']}")
            print(f"🔍 고객 필터: customer_id={request.customer_id if request.customer_id else '전체'}")

            # 2단계: 하이브리드 검색 (top-20 가져오기)
            search_start = time.time()
            search_results = hybrid_engine.search(
                query=request.query,
                query_intent=query_intent,
                user_id=request.user_id,
                customer_id=request.customer_id,  # 🔥 고객별 필터링 추가
                top_k=20  # 재순위화를 위해 더 많이 가져오기
            )
            timing["search_time"] = time.time() - search_start

            # 3단계: Cross-Encoder 재순위화 (Top-20 → Top-K)
            rerank_start = time.time()
            top_results = reranker.rerank(request.query, search_results, top_k=request.top_k)
            timing["rerank_time"] = time.time() - rerank_start
            print(f"✅ 재순위화 완료: {len(top_results)}개 문서 선택 (요청: Top-{request.top_k})")

            # 4단계: LLM 답변 생성
            llm_start = time.time()
            final_answer, llm_response = generate_answer_with_llm(request.query, top_results)
            timing["llm_time"] = time.time() - llm_start

            # 전체 시간 계산
            timing["total_time"] = time.time() - total_start_time

            # 🔥 Phase 3: 검색 로그 저장
            log_id = None
            try:
                log_id = search_logger.log_search(
                    query=request.query,
                    user_id=request.user_id or "anonymous",
                    search_mode=request.search_mode,
                    query_intent=query_intent,
                    search_results=top_results,
                    timing=timing,
                    metadata={
                        "customer_id": request.customer_id,
                        "mode": request.mode
                    }
                )
                print(f"📝 검색 로그 저장 완료: {log_id}")
            except Exception as log_error:
                print(f"⚠️ 로그 저장 실패 (검색은 정상 진행): {log_error}")

            # 🔥 Phase 4: AI 토큰 사용량 추적 (항상 추적)
            try:
                # user_id가 없으면 anonymous 사용
                tracking_user_id = request.user_id or "anonymous"

                # 임베딩 토큰 사용량 추적
                embedding_usage = None
                if hybrid_engine.last_embedding_response:
                    embedding_usage = token_tracker.track_embedding(hybrid_engine.last_embedding_response)

                # LLM 토큰 사용량 추적
                chat_usage = None
                if llm_response:
                    chat_usage = token_tracker.track_chat_completion(llm_response)

                # 사용량 저장 (임베딩 또는 LLM 토큰이 있는 경우)
                if embedding_usage or chat_usage:
                    token_tracker.save_usage(
                        user_id=tracking_user_id,
                        embedding_usage=embedding_usage,
                        chat_usage=chat_usage,
                        metadata={
                            "query": request.query[:200],  # 쿼리 앞 200자
                            "customer_id": request.customer_id,
                            "results_count": len(top_results)
                        },
                        search_log_id=str(log_id) if log_id else None
                    )
            except Exception as token_error:
                print(f"⚠️ 토큰 사용량 저장 실패 (검색은 정상 진행): {token_error}")

            # 응답 구조를 통일된 형식으로 변경
            return UnifiedSearchResponse(
                search_mode="semantic",
                answer=final_answer,
                search_results=top_results
            )

        except Exception as e:
            import traceback
            print(f"❌ 하이브리드 검색 중 오류 발생: {e}")
            print(f"📍 Traceback:")
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"하이브리드 검색 오류: {e}")
    else:
        raise HTTPException(status_code=400, detail="유효하지 않은 검색 모드입니다. 'keyword' 또는 'semantic'을 사용하세요.")


# ========================================
# 🔥 Phase 3: 검색 품질 모니터링 API
# ========================================

class FeedbackRequest(BaseModel):
    """사용자 피드백 요청 모델"""
    log_id: str
    clicked_docs: Optional[List[str]] = None
    satisfaction_rating: Optional[int] = None
    feedback_text: Optional[str] = None


@app.get("/analytics/overall")
async def get_overall_stats(days: int = 7):
    """
    전체 검색 통계 조회

    Args:
        days: 최근 N일 (기본 7일)

    Returns:
        전체 통계 딕셔너리
    """
    try:
        stats = quality_analyzer.get_overall_stats(days=days)
        return {"success": True, "data": stats, "days": days}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"통계 조회 오류: {e}")


@app.get("/analytics/query_types")
async def get_query_type_breakdown(days: int = 7):
    """
    쿼리 유형별 통계 조회

    Args:
        days: 최근 N일

    Returns:
        쿼리 유형별 통계 딕셔너리
    """
    try:
        breakdown = quality_analyzer.get_query_type_breakdown(days=days)
        return {"success": True, "data": breakdown, "days": days}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"쿼리 유형 통계 조회 오류: {e}")


@app.get("/analytics/rerank_impact")
async def get_rerank_impact(days: int = 7):
    """
    재순위화 효과 측정

    Args:
        days: 최근 N일

    Returns:
        재순위화 효과 통계
    """
    try:
        impact = quality_analyzer.get_rerank_impact(days=days)
        return {"success": True, "data": impact, "days": days}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"재순위화 효과 조회 오류: {e}")


@app.get("/analytics/failure_rate")
async def get_failure_rate(days: int = 7, threshold_score: float = 0.3, threshold_result_count: int = 1):
    """
    실패율 분석

    Args:
        days: 최근 N일
        threshold_score: 점수 임계값
        threshold_result_count: 결과 수 임계값

    Returns:
        실패율 통계
    """
    try:
        failure_rate = quality_analyzer.get_failure_rate(
            days=days,
            threshold_score=threshold_score,
            threshold_result_count=threshold_result_count
        )
        return {"success": True, "data": failure_rate, "days": days}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"실패율 조회 오류: {e}")


@app.get("/analytics/failed_queries")
async def get_failed_queries(days: int = 7, limit: int = 10):
    """
    실패한 쿼리 Top N 조회

    Args:
        days: 최근 N일
        limit: 최대 조회 수

    Returns:
        실패 쿼리 리스트
    """
    try:
        failed_queries = quality_analyzer.get_top_failed_queries(days=days, limit=limit)
        return {"success": True, "data": failed_queries, "days": days, "limit": limit}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"실패 쿼리 조회 오류: {e}")


@app.get("/analytics/performance_trends")
async def get_performance_trends(days: int = 7):
    """
    성능 트렌드 분석 (일별)

    Args:
        days: 최근 N일

    Returns:
        일별 성능 통계
    """
    try:
        trends = quality_analyzer.get_performance_trends(days=days)
        return {"success": True, "data": trends, "days": days}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"성능 트렌드 조회 오류: {e}")


@app.get("/analytics/user_satisfaction")
async def get_user_satisfaction(days: int = 7):
    """
    사용자 만족도 분석

    Args:
        days: 최근 N일

    Returns:
        만족도 통계
    """
    try:
        satisfaction = quality_analyzer.get_user_satisfaction(days=days)
        return {"success": True, "data": satisfaction, "days": days}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"만족도 조회 오류: {e}")


@app.get("/analytics/alerts")
async def check_alerts(days: int = 1):
    """
    품질 알림 체크

    Args:
        days: 최근 N일

    Returns:
        발생한 알림 리스트
    """
    try:
        alerts = alert_system.run_all_checks(days=days)
        return {
            "success": True,
            "data": {
                "alert_count": len(alerts),
                "alerts": alerts
            },
            "days": days
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"알림 체크 오류: {e}")


@app.post("/feedback")
async def submit_feedback(request: FeedbackRequest):
    """
    사용자 피드백 제출

    Args:
        request: 피드백 정보

    Returns:
        성공 여부
    """
    try:
        search_logger.update_feedback(
            log_id=request.log_id,
            clicked_docs=request.clicked_docs,
            satisfaction_rating=request.satisfaction_rating,
            feedback_text=request.feedback_text
        )
        return {"success": True, "message": "피드백이 성공적으로 저장되었습니다"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"피드백 저장 오류: {e}")


@app.get("/analytics/recent_logs")
async def get_recent_logs(user_id: Optional[str] = None, limit: int = 100):
    """
    최근 검색 로그 조회

    Args:
        user_id: 사용자 ID (None이면 전체)
        limit: 최대 조회 수

    Returns:
        검색 로그 리스트
    """
    try:
        logs = search_logger.get_recent_logs(user_id=user_id, limit=limit)
        return {"success": True, "data": logs, "count": len(logs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"로그 조회 오류: {e}")


# 4. 전체 실행 로직
if __name__ == '__main__':
    test_query = "2025년 2월 퇴직연금 부담금 내역에 대해 알려줘"
    print(f"🔎 질문: '{test_query}'")

    # 1단계: 쿼리 임베딩
    query_vector, embed_response = embed_query(test_query)
    if embed_response:
        print(f"📊 임베딩 토큰: {embed_response.usage.total_tokens}")

    # 2단계: Qdrant 유사도 검색
    search_results = search_qdrant(query_vector)

    # 3단계: 검색 결과와 LLM을 사용해 답변 생성
    final_answer, llm_response = generate_answer_with_llm(test_query, search_results)
    if llm_response:
        print(f"📊 LLM 토큰: prompt={llm_response.usage.prompt_tokens}, completion={llm_response.usage.completion_tokens}")

    print("\n--- 최종 답변 ---")
    print(final_answer)
