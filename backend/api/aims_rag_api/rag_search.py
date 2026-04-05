# rag_search.py
import asyncio
import os
import re
import time
from typing import Any, Dict, List, Optional

import requests
from alert_system import AlertSystem

# 💡 T11 변경 사항 시작
from fastapi import FastAPI, HTTPException, Request
from hybrid_search import HybridSearchEngine
from openai import OpenAI
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient, models
from quality_analyzer import QualityAnalyzer

# 🔥 Phase 1: 하이브리드 검색 추가
from query_analyzer import QueryAnalyzer

# 🔥 Phase 2: Cross-Encoder 재순위화 추가
from reranker import SearchReranker

# 🔥 Phase 3: 검색 품질 모니터링 추가
from search_logger import SearchLogger

# 시스템 로그 전송
from system_logger import send_error_log

# 🔥 Phase 4: AI 토큰 사용량 추적 추가
from token_tracker import TokenTracker

# 버전 정보
from version import VERSION_INFO, log_version_info

# 시스템 로그 연동

# FastAPI 애플리케이션 인스턴스 생성
app = FastAPI(
    title="AIMS RAG API",
    version=VERSION_INFO["version"],
    description="AIMS 문서 검색 및 RAG API"
)

# 시작 시 버전 정보 출력
log_version_info()

# CORS는 nginx에서 처리하므로 여기서는 제거

# 🔧 튜닝 파라미터 (환경변수로 재배포 없이 조정 가능)
RERANK_LIMIT = int(os.getenv("RERANK_LIMIT", "20"))       # Cross-Encoder 재순위화 대상 수
LLM_CONTEXT_LIMIT = int(os.getenv("LLM_CONTEXT_LIMIT", "8"))  # LLM 답변 생성 시 사용할 청크 수
SEARCH_FETCH_LIMIT = int(os.getenv("SEARCH_FETCH_LIMIT", "200"))  # top_k 미지정 시 하이브리드 검색 최대 fetch 수

# 🔒 RAG API 인증: 내부 API 키 검증 (미들웨어로 모든 엔드포인트에 적용)
RAG_API_KEY = os.getenv("RAG_API_KEY", "")
if not RAG_API_KEY:
    print("⚠️ [Security] RAG_API_KEY 미설정 — API 인증이 비활성화됩니다. .env.shared에 설정을 권장합니다.")

# P4-5: 인메모리 Rate Limiting (외부 의존성 없음)
import collections

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

_rate_limit_store: Dict[str, collections.deque] = {}  # {ip: deque of timestamps}
_RATE_LIMIT_WINDOW = 60  # 60초
_RATE_LIMIT_MAX = 30  # 윈도우당 최대 요청 수 (/search 엔드포인트)

class ApiKeyMiddleware(BaseHTTPMiddleware):
    """모든 엔드포인트에 x-api-key 검증 적용 (/health 제외)"""
    async def dispatch(self, request: Request, call_next):
        if not RAG_API_KEY:
            return await call_next(request)  # 키 미설정 시 스킵 (하위 호환)
        if request.url.path == "/health":
            return await call_next(request)  # 헬스체크는 인증 제외
        api_key = request.headers.get("x-api-key", "")
        if api_key != RAG_API_KEY:
            return JSONResponse(status_code=403, content={"detail": "Invalid API key"})
        return await call_next(request)

app.add_middleware(ApiKeyMiddleware)


def _check_rate_limit(client_ip: str) -> bool:
    """
    P4-5: 인메모리 슬라이딩 윈도우 Rate Limiting.
    Returns True if request is allowed, False if rate limited.
    """
    now = time.time()
    if client_ip not in _rate_limit_store:
        _rate_limit_store[client_ip] = collections.deque()

    window = _rate_limit_store[client_ip]
    # 윈도우 밖의 오래된 타임스탬프 제거
    while window and window[0] < now - _RATE_LIMIT_WINDOW:
        window.popleft()

    if len(window) >= _RATE_LIMIT_MAX:
        return False

    window.append(now)

    # 메모리 누수 방지: 빈 deque를 가진 IP 항목 정리 (100개 초과 시)
    if len(_rate_limit_store) > 100:
        empty_keys = [k for k, v in _rate_limit_store.items() if not v]
        for k in empty_keys:
            del _rate_limit_store[k]

    return True

# 🛡️ Qdrant 컬렉션 자동 확인/생성 (서비스 시작 시)
QDRANT_COLLECTION = "docembed"
# P5-4: 현재 text-embedding-3-small (1536차원). text-embedding-3-large (3072차원) 업그레이드 시
# QDRANT_VECTOR_SIZE를 3072로 변경하고, Qdrant 컬렉션 재생성 + 전체 재임베딩 필요.
# Phase 1~3 효과 측정 후 결정. 비용: 재임베딩 ~$0.01 (985 포인트 기준), 효과: 검색 정확도 5~10% 개선 기대.
QDRANT_VECTOR_SIZE = 1536

@app.on_event("startup")
async def ensure_qdrant_collection():
    """Qdrant 컬렉션이 없으면 자동 생성"""
    try:
        client = QdrantClient(host="localhost", port=6333, check_compatibility=False)
        if not client.collection_exists(collection_name=QDRANT_COLLECTION):
            client.create_collection(
                collection_name=QDRANT_COLLECTION,
                vectors_config=models.VectorParams(
                    size=QDRANT_VECTOR_SIZE,
                    distance=models.Distance.COSINE,
                ),
            )
            print(f"⚠️ [Startup] Qdrant 컬렉션 '{QDRANT_COLLECTION}' 자동 생성됨")
            send_error_log("WARNING", "Qdrant", f"컬렉션 '{QDRANT_COLLECTION}'이 없어 자동 생성했습니다. 임베딩 재생성이 필요할 수 있습니다.")
        else:
            info = client.get_collection(collection_name=QDRANT_COLLECTION)
            print(f"✅ [Startup] Qdrant 컬렉션 '{QDRANT_COLLECTION}' 확인 완료 (포인트: {info.points_count}개)")
    except Exception as e:
        print(f"⚠️ [Startup] Qdrant 연결 실패: {e}")

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

# P2-5: OpenAI 클라이언트 모듈 레벨 싱글턴 (매 요청마다 새 인스턴스 생성 방지)
_openai_client = OpenAI()

# P4-1/P4-2: user_id 검증 (MongoDB ObjectId 24자리 hex 형식)
_OBJECTID_PATTERN = re.compile(r'^[a-fA-F0-9]{24}$')

def validate_user_id(user_id: Optional[str]) -> str:
    """
    user_id 서버 측 검증.
    - None, 빈 문자열, 'anonymous' → 403
    - MongoDB ObjectId 형식이 아닌 값 → 403
    - 유효한 ObjectId → 그대로 반환
    """
    if not user_id or user_id.strip() == "" or user_id == "anonymous":
        raise HTTPException(
            status_code=403,
            detail={"error": "user_id_required", "message": "인증된 사용자 ID가 필요합니다."}
        )
    user_id = user_id.strip()
    if not _OBJECTID_PATTERN.match(user_id):
        raise HTTPException(
            status_code=403,
            detail={"error": "invalid_user_id", "message": "유효하지 않은 사용자 ID 형식입니다."}
        )
    return user_id

# 🔥 AI 모델 설정 캐싱
AIMS_API_URL = os.getenv("AIMS_API_URL", "http://localhost:3010")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
_ai_model_cache = {"model": None, "timestamp": 0}
_AI_MODEL_CACHE_TTL = 60  # 1분

# 🔴 크레딧 체크 API 설정
CREDIT_CHECK_URL = f"{AIMS_API_URL}/api/internal/check-credit"


def check_credit_for_rag(user_id: str, estimated_tokens: int = 1000) -> dict:
    """
    RAG 검색 전 크레딧 체크 (aims_api 내부 API 호출)

    Args:
        user_id: 사용자 ID
        estimated_tokens: 예상 토큰 수 (기본 1000 = 0.5 크레딧)

    Returns:
        dict: {
            allowed: bool,
            reason: str,
            credits_remaining: int,
            ...
        }

    @see docs/EMBEDDING_CREDIT_POLICY.md
    """
    if not user_id or user_id == "anonymous":
        # anonymous 사용자는 크레딧 체크 스킵 (demo/테스트용)
        return {"allowed": True, "reason": "anonymous_user"}

    try:
        # AI 토큰을 페이지 수로 환산 (1K 토큰 ≈ 0.5 크레딧, 1페이지 = 2.5 크레딧)
        # RAG 검색은 보통 1-2페이지 분량으로 추정
        estimated_pages = max(1, estimated_tokens // 5000)

        response = requests.post(
            CREDIT_CHECK_URL,
            json={
                "user_id": user_id,
                "estimated_pages": estimated_pages
            },
            headers={
                "Content-Type": "application/json",
                "x-api-key": INTERNAL_API_KEY
            },
            timeout=5
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"[CreditCheck] API 호출 실패 (fail-closed): {response.status_code}")
            # fail-closed: API 실패 시 처리 보류 (안전 우선)
            return {"allowed": False, "reason": "api_error_fallback"}

    except Exception as e:
        print(f"[CreditCheck] 오류 (fail-closed): {e}")
        # fail-closed: 오류 시 처리 보류 (aims_api 복구 후 재시도)
        return {"allowed": False, "reason": "error_fallback", "error": str(e)}

def get_rag_model() -> str:
    """
    aims_api Internal API에서 RAG 모델 설정 조회 (1분 캐싱)
    """
    import time
    now = time.time()

    # 캐시 유효성 검사
    if _ai_model_cache["model"] and (now - _ai_model_cache["timestamp"]) < _AI_MODEL_CACHE_TTL:
        return _ai_model_cache["model"]

    # Internal API에서 조회
    try:
        response = requests.get(
            f"{AIMS_API_URL}/api/internal/settings/ai-models",
            headers={"x-api-key": INTERNAL_API_KEY, "Content-Type": "application/json"},
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            model = data.get("data", {}).get("rag", {}).get("model", "gpt-3.5-turbo")
            _ai_model_cache["model"] = model
            _ai_model_cache["timestamp"] = now
            return model
    except Exception as e:
        print(f"[RAG] AI 모델 설정 조회 실패: {e}")

    # 실패 시 기본값
    return _ai_model_cache.get("model") or "gpt-3.5-turbo"

# 💡 T11 변경 사항 시작 - 요청 및 응답 모델 정의
class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    mode: str = "OR"
    search_mode: str = "semantic"
    user_id: Optional[str] = None
    customer_id: Optional[str] = None
    top_k: Optional[int] = Field(None, ge=1, le=500)  # 결과 개수 제한 (1~500, None=기본값 사용)
    offset: int = 0  # 페이지네이션: 건너뛸 결과 수

class UnifiedSearchResponse(BaseModel):
    search_mode: str
    answer: Optional[str] = None
    search_results: List[Dict[str, Any]]
    total_count: Optional[int] = None  # 페이지네이션: 전체 결과 수
    has_more: Optional[bool] = None  # 페이지네이션: 더 많은 결과 존재 여부
    log_id: Optional[str] = None  # 검색 로그 ID (피드백 제출 시 사용)

# SmartSearch: document_pipeline FastAPI (n8n 사용 안함 — CLAUDE.md 준수)
SMARTSEARCH_API_URL = "http://localhost:8100/webhook/smartsearch"
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
    try:
        response = _openai_client.embeddings.create(
            input=query_text,
            model="text-embedding-3-small",
            encoding_format="float"
        )
        return response.data[0].embedding, response
    except Exception as e:
        print(f"❌ 쿼리 임베딩 중 오류 발생: {e}")
        send_error_log("aims_rag_api", f"쿼리 임베딩 중 오류: {e}", e)
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
        send_error_log("aims_rag_api", f"Qdrant 검색 중 오류: {e}", e)
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
def generate_answer_with_llm(query: str, search_results: List[Dict], relationship_context: Optional[str] = None) -> tuple:
    """
    검색 결과를 바탕으로 LLM 답변 생성

    Args:
        query: 사용자 질문
        search_results: 검색 결과 리스트
        relationship_context: 고객 관계 정보 텍스트 (optional)

    Returns:
        tuple: (answer_text, openai_response) - 답변과 응답 객체 (토큰 추적용)
    """
    if not search_results and not relationship_context:
        return "관련 문서를 찾을 수 없습니다.", None

    # 검색 결과를 바탕으로 컨텍스트 생성 + doc_id-파일명 매핑 구축
    context = ""
    doc_id_map = {}  # {doc_id: original_name} — 후처리 검증용

    # 고객 관계 정보가 있으면 문서 컨텍스트 앞에 배치
    if relationship_context:
        context += f"{relationship_context}\n\n"

    for i, result in enumerate(search_results):
        payload = result.get('payload', result)
        preview = payload.get('preview', '')
        original_name = payload.get('original_name', '알 수 없는 문서')
        doc_id = payload.get('doc_id', '')
        # P4-4: 파일명/미리보기에서 제어문자 제거 (프롬프트 인젝션 방어)
        original_name = re.sub(r'[\x00-\x1f\x7f]', '', original_name)
        preview = re.sub(r'[\x00-\x1f\x7f]', '', preview)
        # doc_id가 있는 경우 매핑에 추가
        if doc_id:
            doc_id_map[doc_id] = original_name
        context += f"--- [DOC_ID:{doc_id}|{original_name}] ---\n{preview}\n\n"

    # 문서 참조 형식 안내 (doc_id 목록)
    doc_ref_guide = ""
    if doc_id_map:
        doc_ref_guide = "\n\n## 문서 참조 형식\n"
        doc_ref_guide += "답변에서 문서를 참조할 때 반드시 다음 형식을 사용해:\n"
        doc_ref_guide += "[[DOC:문서ID|파일명]]\n\n"
        doc_ref_guide += "사용 가능한 문서 목록:\n"
        for did, fname in doc_id_map.items():
            doc_ref_guide += f"- [[DOC:{did}|{fname}]]\n"
        doc_ref_guide += "\n위 목록에 없는 문서는 참조하지 마. 파일명을 변형하거나 축약하지 마.\n"

    # 시스템 프롬프트: 보험 도메인 전문 프롬프트
    system_prompt = (
        "너는 보험 설계사를 지원하는 전문 AI 어시스턴트야. "
        "주어진 문서와 고객 관계 정보만을 근거로 답변해.\n\n"
        "## 답변 규칙\n"
        "1. 문서에 있는 금액, 날짜, 수치는 반드시 정확히 인용해. 반올림하거나 요약하지 마.\n"
        "2. 표 형식 데이터(보험료, 급여, 내역 등)는 항목별로 줄바꿈하여 읽기 쉽게 정리해.\n"
        "3. 문서에 없는 내용은 절대 추가하거나 추측하지 마. "
        "\"제공된 문서에서 해당 정보를 찾을 수 없습니다\"라고 솔직하게 답해.\n"
        "4. 여러 문서에 관련 정보가 있으면 종합하여 답변해.\n"
        "5. 고객 관계 정보가 제공되면 이를 참고하되, 관계 정보에 없는 관계를 만들어내지 마.\n"
        "6. 답변은 간결하면서도 필요한 정보를 빠짐없이 포함해.\n"
        "7. 반드시 한국어로 답변해.\n"
        "8. 질문의 핵심 키워드가 문서에 실제로 존재하는지 먼저 확인해. "
        "문서에 해당 키워드나 주제가 없으면 유사한 내용으로 답변을 만들어내지 말고, "
        "\"해당 정보를 찾을 수 없습니다\"라고 답해.\n"
        "9. 너의 일반 지식으로 답변하지 마. 오직 제공된 문서 내용만 사용해.\n"
        "10. 답변에 내부 참조 번호(문서 조각 번호 등)를 언급하지 마.\n"
        "11. 문서를 참조할 때 반드시 [[DOC:문서ID|파일명]] 형식을 사용해. "
        "문서 참조는 반드시 문장이 끝난 뒤(마침표 뒤)에 배치해. 문장 중간에 넣지 마. "
        "여러 문서를 참조하면 각각 별도 마커로 나열해. "
        "예: \"보험료는 73,230원입니다. [[DOC:id1|설계서_[계약자].pdf]] [[DOC:id2|증권_[계약자].pdf]]\""
    )

    messages = [
        {"role": "system", "content": system_prompt + doc_ref_guide},
        {"role": "user", "content": f"다음 정보를 참고해서 질문에 답해줘. 질문: '{query}'\n\n{context}"}
    ]

    try:
        rag_model = get_rag_model()
        response = _openai_client.chat.completions.create(
            model=rag_model,
            messages=messages,
            max_tokens=4000,
            temperature=0.0
        )
        raw_answer = response.choices[0].message.content

        # 후처리: 파일명을 [[DOC:...]] 마커로 강제 치환 (AI 의존 안 함)
        final_answer = _inject_doc_markers(raw_answer, doc_id_map)

        return final_answer, response
    except Exception as e:
        send_error_log("aims_rag_api", f"LLM 답변 생성 중 오류: {e}", e)
        return f"❌ LLM 답변 생성 중 오류 발생: {e}", None


# [[DOC:doc_id|파일명]] 마커 후처리
_DOC_MARKER_RE = re.compile(r'\[\[DOC:([^|]+)\|([^\]]+)\]\]')

def _inject_doc_markers(answer: str, doc_id_map: Dict[str, str]) -> str:
    """
    AI 응답에 [[DOC:doc_id|파일명]] 마커를 강제 삽입.
    AI가 마커를 생성했든 안 했든, 파일명을 찾아 치환한다.

    1단계: 기존 마커가 있으면 검증/교정
    2단계: 마커 없는 파일명을 찾아 강제 삽입
    """
    if not doc_id_map:
        return answer

    result = answer

    # 1단계: 기존 [[DOC:...]] 마커 검증/교정
    if '[[DOC:' in result:
        def replace_marker(match):
            doc_id = match.group(1).strip()
            if doc_id in doc_id_map:
                correct_name = doc_id_map[doc_id]
                return f"[[DOC:{doc_id}|{correct_name}]]"
            else:
                return match.group(2).strip()
        result = _DOC_MARKER_RE.sub(replace_marker, result)

    # 2단계: 마커 없이 등장하는 파일명을 찾아 강제 삽입
    # 역방향 매핑: 파일명 → doc_id
    name_to_id = {fname: did for did, fname in doc_id_map.items()}
    # 긴 파일명부터 매칭 (부분 매칭 방지)
    sorted_names = sorted(name_to_id.keys(), key=len, reverse=True)

    for fname in sorted_names:
        marker = f"[[DOC:{name_to_id[fname]}|{fname}]]"
        # 이미 마커로 감싸진 파일명은 건너뛰기
        if marker in result:
            continue
        # 마커 안에 있지 않은 파일명만 치환
        # 단순 replace로 처리 (마커 안의 파일명은 이미 1단계에서 교정됨)
        if fname in result:
            result = result.replace(fname, marker)

    # 3단계: 마커를 마침표 뒤로 이동
    # "...입니다[[DOC:...]][[DOC:...]]." → "...입니다. [[DOC:...]] [[DOC:...]]"
    # 패턴: (마커들)(마침표) → (마침표 공백)(마커들)
    result = re.sub(
        r'((?:\[\[DOC:[^\]]+\]\]\s*)+)([.。])',
        lambda m: m.group(2) + ' ' + m.group(1).strip(),
        result
    )
    # 마커 사이에 공백 보장
    result = re.sub(r'\]\]\s*\[\[DOC:', ']] [[DOC:', result)

    return result


# ========================================
# 헬스체크 API
# ========================================

@app.get("/health")
async def health_check():
    """헬스 체크 엔드포인트"""
    return {
        "status": "healthy",
        "service": "aims-rag-api",
        "version": VERSION_INFO["fullVersion"],
        "versionInfo": VERSION_INFO
    }


@app.post("/search", response_model=UnifiedSearchResponse)
async def search_endpoint(request: SearchRequest, raw_request: Request):
    # P4-5: Rate Limiting 체크
    if raw_request:
        client_ip = raw_request.headers.get("x-real-ip") or raw_request.client.host
        if not _check_rate_limit(client_ip):
            raise HTTPException(
                status_code=429,
                detail={"error": "rate_limited", "message": "요청이 너무 빈번합니다. 잠시 후 다시 시도해주세요."}
            )

    # P4-1/P4-2: user_id 서버 측 검증 (semantic 검색 시 필수)
    if request.search_mode == "semantic":
        validated_user_id = validate_user_id(request.user_id)
        request.user_id = validated_user_id
    elif request.search_mode == "keyword" and request.user_id and request.user_id != "anonymous":
        # 키워드 검색도 user_id가 있으면 형식 검증
        user_id_trimmed = request.user_id.strip()
        if user_id_trimmed and not _OBJECTID_PATTERN.match(user_id_trimmed):
            raise HTTPException(
                status_code=403,
                detail={"error": "invalid_user_id", "message": "유효하지 않은 사용자 ID 형식입니다."}
            )
        request.user_id = user_id_trimmed

    # 🔴 크레딧 체크 (semantic 검색만 - AI 토큰 소비)
    # P2-2: asyncio.to_thread로 동기 HTTP 호출이 이벤트 루프를 블로킹하지 않도록 함
    if request.search_mode == "semantic" and request.user_id:
        credit_check = await asyncio.to_thread(check_credit_for_rag, request.user_id, 2000)
        if not credit_check.get("allowed", False):
            print(f"[CREDIT_EXCEEDED] RAG 검색 차단: user_id={request.user_id}, remaining={credit_check.get('credits_remaining', 0)}")
            raise HTTPException(
                status_code=402,  # Payment Required
                detail={
                    "error": "credit_exceeded",
                    "message": "크레딧이 부족합니다. 다음 달 1일에 리셋됩니다.",
                    "credits_remaining": credit_check.get("credits_remaining", 0),
                    "days_until_reset": credit_check.get("days_until_reset", 0)
                }
            )

    if request.search_mode == "keyword":
        # 키워드 검색 로직 — smartsearch 백엔드 페이지네이션 활용
        # page 계산: offset/top_k → page/page_size 변환
        page_size = request.top_k or 20
        page = (request.offset // page_size) + 1 if request.offset else 1

        payload = {
            "query": request.query,
            "mode": request.mode,
            "user_id": request.user_id,
            "page": page,
            "page_size": page_size,
        }
        if request.customer_id:
            payload["customer_id"] = request.customer_id
        try:
            response = requests.post(SMARTSEARCH_API_URL, json=payload)
            response.raise_for_status()

            raw_response = response.json()

            # smartsearch 응답 형식 분기: dict(페이지네이션) / list(레거시 호환)
            if isinstance(raw_response, dict) and "results" in raw_response:
                # 페이지네이션 응답 (full_text 포함)
                paginated_results = raw_response["results"]
                total_count = raw_response.get("total", len(paginated_results))
                total_pages = raw_response.get("total_pages", 1)
                has_more = page < total_pages
            else:
                # 레거시 List[dict] 응답 (ID 검색 등)
                total_count = len(raw_response) if isinstance(raw_response, list) else 0
                paginated_results = raw_response if isinstance(raw_response, list) else []
                has_more = False

            print(f"✅ 키워드 검색 완료: 전체 {total_count}개 �� {len(paginated_results)}개 반환 (page={page}, page_size={page_size})")

            return UnifiedSearchResponse(
                search_mode="keyword",
                answer=None,
                search_results=paginated_results,
                total_count=total_count,
                has_more=has_more
            )
        except requests.RequestException as e:
            send_error_log("aims_rag_api", f"SmartSearch API 호출 오류: {e}", e, {"query": request.query})
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
            # 고객명 자동 매칭: 엔터티에서 고객명 감지 → customer_id 자동 필터링
            search_customer_id = request.customer_id
            if not search_customer_id and query_intent.get("entities"):
                resolved = hybrid_engine.resolve_customer_from_entities(
                    query_intent["entities"], request.user_id
                )
                if resolved:
                    search_customer_id = resolved
                    print(f"🔍 고객명 자동 매칭: {query_intent['entities']} → customer_id={resolved}")

            # 1-b단계: 고객 관계 정보 조회 (customer_id 매칭 시 항상 수행)
            relationship_context = None
            search_customer_ids = None
            if search_customer_id:
                rel_start = time.time()
                rel_data = await asyncio.to_thread(
                    hybrid_engine.get_customer_relationships,
                    search_customer_id, request.user_id
                )
                timing["relationship_lookup_time"] = time.time() - rel_start

                # 관계 정보가 있으면 LLM 컨텍스트 문자열 생성
                if rel_data["relationships"]:
                    lines = ["--- 고객 관계 정보 ---", f"{rel_data['customer_name']}의 관계:"]
                    for r in rel_data["relationships"]:
                        lines.append(f"- {r['type']}: {r['name']}")
                    relationship_context = "\n".join(lines)

                    # 검색 범위 확장: 기준 고객 + 관련 고객 전체
                    search_customer_ids = [search_customer_id] + rel_data["related_customer_ids"]
                    print(f"🔍 고객 필터 확장: {len(search_customer_ids)}명 (본인 + 관계 {len(rel_data['relationships'])}명)")
                else:
                    print(f"🔍 고객 필터: customer_id={search_customer_id} (관계 없음)")
            else:
                print("🔍 고객 필터: 전체")

            # 2단계: 하이브리드 검색 (top_k=None이면 전체 결과 반환)
            if request.top_k is not None:
                fetch_count = max(50, request.offset + request.top_k + 10)
            else:
                fetch_count = SEARCH_FETCH_LIMIT  # top_k 미지정 시 환경변수 기반 제한
            search_start = time.time()
            search_results = await asyncio.to_thread(
                hybrid_engine.search,
                query=request.query,
                query_intent=query_intent,
                user_id=request.user_id,
                customer_id=search_customer_id if not search_customer_ids else None,
                customer_ids=search_customer_ids,
                top_k=fetch_count
            )
            timing["search_time"] = time.time() - search_start

            # 3단계: Cross-Encoder 재순위화 (asyncio.to_thread로 이벤트 루프 블로킹 방지)
            rerank_start = time.time()
            if len(search_results) <= RERANK_LIMIT:
                all_reranked = await asyncio.to_thread(
                    reranker.rerank, request.query, search_results, len(search_results)
                )
            else:
                # 상위 20개만 정밀 재순위화, 나머지는 원본 벡터 유사도 순서 유지
                top_candidates = search_results[:RERANK_LIMIT]
                remaining = search_results[RERANK_LIMIT:]
                reranked_top = await asyncio.to_thread(
                    reranker.rerank, request.query, top_candidates, len(top_candidates)
                )
                # 나머지에 원본 점수 기반 final_score 부여 (재순위화 결과보다 아래)
                min_reranked_score = min(r.get("final_score", 0) for r in reranked_top) if reranked_top else 0
                for i, result in enumerate(remaining):
                    result["rerank_score"] = 0.0
                    result["original_score"] = result.get("score", 0.0)
                    result["final_score"] = min_reranked_score - 0.001 * (i + 1)
                all_reranked = reranked_top + remaining
            timing["rerank_time"] = time.time() - rerank_start

            # 🔥 페이지네이션: offset 적용하여 결과 슬라이싱
            total_reranked = len(all_reranked)
            if request.top_k is not None:
                top_results = all_reranked[request.offset:request.offset + request.top_k]
            else:
                top_results = all_reranked[request.offset:]
            print(f"✅ 재순위화 완료: 전체 {total_reranked}개 중 {len(top_results)}개 반환 (offset={request.offset}, top_k={request.top_k})")

            # 4단계: LLM 답변 생성
            llm_start = time.time()
            final_answer, llm_response = generate_answer_with_llm(request.query, top_results[:LLM_CONTEXT_LIMIT], relationship_context)
            timing["llm_time"] = time.time() - llm_start

            # 임베딩 시간 분리 (hybrid_engine 내부에서 측정)
            timing["embedding_ms"] = hybrid_engine.last_embedding_ms
            # 순수 Qdrant 검색 시간 = search_time - 임베딩 시간
            timing["qdrant_search_ms"] = int(timing["search_time"] * 1000) - hybrid_engine.last_embedding_ms

            # 전체 시간 계산
            timing["total_time"] = time.time() - total_start_time

            # ⏱️ 단계별 소요 시간 로깅
            print(f"⏱️ [Timing] 임베딩={timing['embedding_ms']}ms | "
                  f"Qdrant검색={timing['qdrant_search_ms']}ms | "
                  f"재순위화={int(timing['rerank_time']*1000)}ms | "
                  f"LLM답변={int(timing['llm_time']*1000)}ms | "
                  f"전체={int(timing['total_time']*1000)}ms")

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
                send_error_log("aims_rag_api", f"검색 로그 저장 실패: {log_error}", log_error)

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
                send_error_log("aims_rag_api", f"토큰 사용량 저장 실패: {token_error}", token_error)

            # 🔥 페이지네이션: 전체 검색 결과 수 및 더 보기 여부 계산
            # total_reranked: 재순위화된 전체 결과 수 (실제로 반환 가능한 문서 수)
            has_more = (request.offset + len(top_results)) < total_reranked

            # 응답용 preview 트리밍 (LLM 컨텍스트에는 전체 사용, 클라이언트에는 300자 제한)
            import copy
            response_results = copy.deepcopy(top_results)
            for r in response_results:
                payload = r.get('payload', r)
                if 'preview' in payload and len(payload['preview']) > 300:
                    payload['preview'] = payload['preview'][:300]

            # 응답 구조를 통일된 형식으로 변경
            return UnifiedSearchResponse(
                search_mode="semantic",
                answer=final_answer,
                search_results=response_results,
                total_count=total_reranked,
                has_more=has_more,
                log_id=str(log_id) if log_id else None  # 피드백 제출 시 사용
            )

        except Exception as e:
            import traceback
            print(f"❌ 하이브리드 검색 중 오류 발생: {e}")
            print("📍 Traceback:")
            traceback.print_exc()
            send_error_log("aims_rag_api", f"하이브리드 검색 오류: {e}", e, {"query": request.query, "search_mode": request.search_mode})
            raise HTTPException(status_code=500, detail="검색 중 오류가 발생했습니다.")
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


# P4-6: /analytics/* 접근 통제 — 내부 API 키 또는 로컬 네트워크에서만 접근 허용
ANALYTICS_API_KEY = os.getenv("ANALYTICS_API_KEY", "")

def _verify_analytics_access(request: Request):
    """
    P4-6: analytics 엔드포인트 접근 검증.
    - ANALYTICS_API_KEY가 설정되어 있으면 x-analytics-key 헤더와 대조
    - 미설정 시 localhost/내부망에서의 접근만 허용
    """
    if ANALYTICS_API_KEY:
        provided_key = request.headers.get("x-analytics-key", "")
        if provided_key != ANALYTICS_API_KEY:
            raise HTTPException(status_code=403, detail="Analytics API 접근 권한이 없습니다.")
        return

    # ANALYTICS_API_KEY 미설정 시: localhost/내부망만 허용
    client_ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")
    allowed_prefixes = ("127.0.0.1", "::1", "localhost", "10.", "172.16.", "192.168.", "100.")
    if not any(client_ip.startswith(prefix) for prefix in allowed_prefixes):
        raise HTTPException(status_code=403, detail="Analytics API는 내부 네트워크에서만 접근 가능합니다.")


@app.get("/analytics/overall")
async def get_overall_stats(request: Request, days: int = 7):
    """
    전체 검색 통계 조회

    Args:
        days: 최근 N일 (기본 7일)

    Returns:
        전체 통계 딕셔너리
    """
    _verify_analytics_access(request)
    try:
        stats = quality_analyzer.get_overall_stats(days=days)
        return {"success": True, "data": stats, "days": days}
    except Exception as e:
        send_error_log("aims_rag_api", f"통계 조회 오류: {e}", e)
        raise HTTPException(status_code=500, detail=f"통계 조회 오류: {e}")


@app.get("/analytics/query_types")
async def get_query_type_breakdown(request: Request, days: int = 7):
    """
    쿼리 유형별 통계 조회

    Args:
        days: 최근 N일

    Returns:
        쿼리 유형별 통계 딕셔너리
    """
    _verify_analytics_access(request)
    try:
        breakdown = quality_analyzer.get_query_type_breakdown(days=days)
        return {"success": True, "data": breakdown, "days": days}
    except Exception as e:
        send_error_log("aims_rag_api", f"쿼리 유형 통계 조회 오류: {e}", e)
        raise HTTPException(status_code=500, detail=f"쿼리 유형 통계 조회 오류: {e}")


@app.get("/analytics/rerank_impact")
async def get_rerank_impact(request: Request, days: int = 7):
    """
    재순위화 효과 측정

    Args:
        days: 최근 N일

    Returns:
        재순위화 효과 통계
    """
    _verify_analytics_access(request)
    try:
        impact = quality_analyzer.get_rerank_impact(days=days)
        return {"success": True, "data": impact, "days": days}
    except Exception as e:
        send_error_log("aims_rag_api", f"재순위화 효과 조회 오류: {e}", e)
        raise HTTPException(status_code=500, detail=f"재순위화 효과 조회 오류: {e}")


@app.get("/analytics/failure_rate")
async def get_failure_rate(request: Request, days: int = 7, threshold_score: float = 0.3, threshold_result_count: int = 1):
    """
    실패율 분석

    Args:
        days: 최근 N일
        threshold_score: 점수 임계값
        threshold_result_count: 결과 수 임계값

    Returns:
        실패율 통계
    """
    _verify_analytics_access(request)
    try:
        failure_rate = quality_analyzer.get_failure_rate(
            days=days,
            threshold_score=threshold_score,
            threshold_result_count=threshold_result_count
        )
        return {"success": True, "data": failure_rate, "days": days}
    except Exception as e:
        send_error_log("aims_rag_api", f"실패율 조회 오류: {e}", e)
        raise HTTPException(status_code=500, detail=f"실패율 조회 오류: {e}")


@app.get("/analytics/failed_queries")
async def get_failed_queries(request: Request, days: int = 7, limit: int = 10):
    """
    실패한 쿼리 Top N 조회

    Args:
        days: 최근 N일
        limit: 최대 조회 수

    Returns:
        실패 쿼리 리스트
    """
    _verify_analytics_access(request)
    try:
        failed_queries = quality_analyzer.get_top_failed_queries(days=days, limit=limit)
        return {"success": True, "data": failed_queries, "days": days, "limit": limit}
    except Exception as e:
        send_error_log("aims_rag_api", f"실패 쿼리 조회 오류: {e}", e)
        raise HTTPException(status_code=500, detail=f"실패 쿼리 조회 오류: {e}")


@app.get("/analytics/performance_trends")
async def get_performance_trends(request: Request, days: int = 7):
    """
    성능 트렌드 분석 (일별)

    Args:
        days: 최근 N일

    Returns:
        일별 성능 통계
    """
    _verify_analytics_access(request)
    try:
        trends = quality_analyzer.get_performance_trends(days=days)
        return {"success": True, "data": trends, "days": days}
    except Exception as e:
        send_error_log("aims_rag_api", f"성능 트렌드 조회 오류: {e}", e)
        raise HTTPException(status_code=500, detail=f"성능 트렌드 조회 오류: {e}")


@app.get("/analytics/user_satisfaction")
async def get_user_satisfaction(request: Request, days: int = 7):
    """
    사용자 만족도 분석

    Args:
        days: 최근 N일

    Returns:
        만족도 통계
    """
    _verify_analytics_access(request)
    try:
        satisfaction = quality_analyzer.get_user_satisfaction(days=days)
        return {"success": True, "data": satisfaction, "days": days}
    except Exception as e:
        send_error_log("aims_rag_api", f"만족도 조회 오류: {e}", e)
        raise HTTPException(status_code=500, detail=f"만족도 조회 오류: {e}")


@app.get("/analytics/alerts")
async def check_alerts(request: Request, days: int = 1):
    """
    품질 알림 체크

    Args:
        days: 최근 N일

    Returns:
        발생한 알림 리스트
    """
    _verify_analytics_access(request)
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
        send_error_log("aims_rag_api", f"알림 체크 오류: {e}", e)
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
        send_error_log("aims_rag_api", f"피드백 저장 오류: {e}", e)
        raise HTTPException(status_code=500, detail=f"피드백 저장 오류: {e}")


@app.get("/analytics/recent_logs")
async def get_recent_logs(request: Request, user_id: Optional[str] = None, limit: int = 100):
    """
    최근 검색 로그 조회

    Args:
        user_id: 사용자 ID (None이면 전체)
        limit: 최대 조회 수

    Returns:
        검색 로그 리스트
    """
    _verify_analytics_access(request)
    try:
        logs = search_logger.get_recent_logs(user_id=user_id, limit=limit)
        return {"success": True, "data": logs, "count": len(logs)}
    except Exception as e:
        send_error_log("aims_rag_api", f"로그 조회 오류: {e}", e)
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
