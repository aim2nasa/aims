"""
SmartSearch Router - Document Search Handler
Replaces n8n SmartSearch workflow
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from bson import ObjectId, Decimal128
import logging
import re

from services.mongo_service import MongoService
from datetime import datetime

router = APIRouter()
logger = logging.getLogger(__name__)

# 한국어 불용어 (질문형/조사/보조동사)
STOPWORDS_KO = {
    "정보", "알려줘", "알려", "줘", "뭐야", "어떻게", "있어", "없어",
    "해줘", "보여줘", "확인", "좀", "해", "대해", "관련", "에서", "으로",
    "이란", "라는", "뭔가", "어디", "언제", "얼마", "몇", "왜",
    "무엇", "어떤", "하는", "하고", "그리고", "또는", "그런",
    "것", "거", "수", "등", "및", "의", "가", "를", "은", "는", "이", "에",
}

# 키워드 검색: 결과 제한 없음 (검색된 모든 문서를 반환)
# projection으로 대용량 필드(full_text, docembed)를 제외하여 성능 보호

# MongoDB projection: 키워드 검색 시 불필요한 대용량 필드 제외
_KEYWORD_SEARCH_PROJECTION = {
    "ocr.full_text": 0,
    "meta.full_text": 0,
    "text.full_text": 0,
    "docembed": 0,
    "annual_report": 0,
}


def _filter_stopwords(keywords: List[str]) -> List[str]:
    """불용어를 제거한 키워드 목록 반환"""
    filtered = [kw for kw in keywords if kw not in STOPWORDS_KO]
    # 불용어 제거 후 키워드가 없으면 원본 반환 (검색 불가 방지)
    return filtered if filtered else keywords


def _convert_objectids(obj):
    """재귀적으로 BSON 타입을 JSON 직렬화 가능한 값으로 변환"""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, bytes):
        return obj.hex()
    if isinstance(obj, dict):
        return {k: _convert_objectids(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_objectids(item) for item in obj]
    if isinstance(obj, Decimal128):
        return float(obj.to_decimal())
    return obj

# 플레이스홀더 ObjectId 패턴 (0으로만 이루어진 ID)
_PLACEHOLDER_ID_PATTERN = re.compile(r'^0{20,}[0-9]?$')


def _is_valid_customer_id(customer_id: str) -> bool:
    """유효한 customerId인지 검사 (플레이스홀더 제외)"""
    if not customer_id:
        return False
    if _PLACEHOLDER_ID_PATTERN.match(customer_id):
        return False
    return True


# 키워드 매칭 점수 계산용 필드 가중치
_SCORE_FIELDS_HIGH = ["displayName", "upload.originalName"]  # 파일명: 가중치 3
_SCORE_FIELDS_LOW = [
    "ocr.summary",
    "meta.summary", "meta.filename",
    "customer_relation.notes",
    "customer_relation.customer_name",
]  # 본문: 가중치 1 (full_text는 projection으로 제외됨)

WEIGHT_HIGH = 3
WEIGHT_LOW = 1
# 모든 키워드가 파일명에 매칭될 때 추가 보너스 (키워드 수에 비례)
ALL_MATCH_BONUS_MULTIPLIER = 5


def _get_nested(doc: dict, dotted_key: str) -> str:
    """점(.)으로 구분된 키로 중첩 딕셔너리 값을 안전하게 가져옴"""
    parts = dotted_key.split(".")
    val = doc
    for p in parts:
        if isinstance(val, dict):
            val = val.get(p)
        else:
            return ""
    return str(val) if val is not None else ""


def _compute_relevance_score(doc: dict, keywords: List[str]) -> float:
    """
    문서의 키워드 매칭 점수 계산.
    - 파일명(displayName, originalName)에서 매칭: 가중치 3
    - 본문(summary 등)에서 매칭: 가중치 1
    - 모든 키워드가 파일명에 동시 매칭 시: 큰 보너스 부여
    - 점수 = 각 키워드별 최고 가중치의 합 + all-match 보너스
    """
    score = 0.0
    filename_match_count = 0  # 파일명에서 매칭된 키워드 수

    # 중복 키워드 제거 (동일 키워드 반복 시 보너스 과다 방지)
    unique_keywords = list(set(keywords))

    for kw in unique_keywords:
        kw_lower = kw.lower()
        kw_score = 0

        # 높은 가중치 필드 (파일명)
        for field in _SCORE_FIELDS_HIGH:
            val = _get_nested(doc, field)
            if val and kw_lower in val.lower():
                kw_score = WEIGHT_HIGH
                filename_match_count += 1
                break  # 이 키워드는 이미 최고 가중치

        # 높은 가중치에서 매칭 안 됐으면 낮은 가중치 필드 확인
        if kw_score == 0:
            for field in _SCORE_FIELDS_LOW:
                val = _get_nested(doc, field)
                if val and kw_lower in val.lower():
                    kw_score = WEIGHT_LOW
                    break

        score += kw_score

    # 보너스: 모든 키워드가 파일명에 매칭된 경우 (2개 이상 키워드일 때만)
    if len(unique_keywords) >= 2 and filename_match_count == len(unique_keywords):
        score += len(unique_keywords) * ALL_MATCH_BONUS_MULTIPLIER

    return score


class SearchRequest(BaseModel):
    query: Optional[str] = ""
    id: Optional[str] = ""
    mode: Optional[str] = "OR"  # OR or AND
    user_id: str = "tester"
    customer_id: Optional[str] = ""


@router.post("/smartsearch")
async def smart_search(request: SearchRequest):
    """
    Smart search for documents in MongoDB.

    Search modes:
    - By ID: If `id` is provided, search by document _id
    - By keywords: If `query` is provided, search across multiple text fields
    - Mode: "AND" requires all keywords, "OR" requires any keyword

    Compatible with n8n SmartSearch webhook response format.
    """
    try:
        query = (request.query or "").strip()
        doc_id = (request.id or "").strip()
        mode = (request.mode or "OR").upper()
        user_id = request.user_id
        customer_id = (request.customer_id or "").strip()

        # Build MongoDB query
        mongo_query = None
        effective_keywords = []  # 점수 계산에 사용할 키워드
        is_keyword_search = False  # 키워드 검색 여부 (projection 적용 판단용)

        # 1. Search by ID
        if doc_id:
            try:
                conditions = [
                    {"ownerId": user_id},
                    {"_id": ObjectId(doc_id)}
                ]
                if customer_id:
                    conditions.append({"customerId": ObjectId(customer_id)})
                mongo_query = {"$and": conditions}
            except Exception as e:
                logger.warning(f"Invalid ObjectId: {doc_id}, error: {e}")
                return []

        # 2. Search by keywords
        elif query:
            raw_keywords = [k.strip() for k in query.split() if k.strip()]
            if not raw_keywords:
                return []

            # 불용어 필터링
            effective_keywords = _filter_stopwords(raw_keywords)
            is_keyword_search = True
            logger.info(f"SmartSearch keywords: raw={raw_keywords} -> filtered={effective_keywords}")

            # Fields to search (displayName 추가)
            fields = [
                "displayName",
                "upload.originalName",
                "ocr.full_text",
                "ocr.summary",
                "meta.filename",
                "meta.full_text",
                "meta.summary",
                "text.full_text",
                "customer_relation.notes"
            ]

            def build_keyword_query(keyword: str) -> List[dict]:
                """Build regex query for a single keyword across all fields"""
                escaped = re.escape(keyword)
                return [{field: {"$regex": escaped, "$options": "i"}} for field in fields]

            conditions = [{"ownerId": user_id}]
            if customer_id:
                conditions.append({"customerId": ObjectId(customer_id)})

            if mode == "AND":
                # All keywords must match (each keyword in at least one field)
                for kw in effective_keywords:
                    conditions.append({"$or": build_keyword_query(kw)})
            else:
                # Any keyword can match (OR mode)
                or_conditions = []
                for kw in effective_keywords:
                    or_conditions.extend(build_keyword_query(kw))
                conditions.append({"$or": or_conditions})

            mongo_query = {"$and": conditions}

        # 3. No search criteria
        else:
            return []

        # Execute query
        collection = MongoService.get_collection("files")

        # 키워드 검색: projection으로 대용량 필드 제외 (응답 크기 대폭 감소)
        if is_keyword_search:
            cursor = collection.find(mongo_query, _KEYWORD_SEARCH_PROJECTION)
        else:
            cursor = collection.find(mongo_query)

        results = await cursor.to_list(length=None)

        # customer_relation 보강: customerId 기반 고객명 batch 조회 (ObjectId 변환 전에 수행)
        await _enrich_customer_relations(results, user_id)

        # 키워드 매칭 점수 기반 정렬 + 결과 수 제한 (키워드 검색일 때만)
        if effective_keywords:
            results.sort(
                key=lambda doc: _compute_relevance_score(doc, effective_keywords),
                reverse=True
            )

        # Convert all ObjectId/datetime to string for JSON serialization
        results = [_convert_objectids(doc) for doc in results]

        logger.info(f"SmartSearch: query='{query}', id='{doc_id}', mode={mode}, results={len(results)}")
        return results

    except Exception as e:
        logger.error(f"SmartSearch failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


async def _enrich_customer_relations(results: List[Dict[str, Any]], user_id: str) -> None:
    """
    검색 결과에 customer_relation 보강 (batch 조회).
    customerId를 기반으로 customers 컬렉션에서 고객명/유형을 일괄 조회하여
    각 결과에 customer_relation 필드를 추가한다.
    프론트엔드의 N+1 개별 API 호출을 제거하기 위한 서버사이드 enrichment.
    ownerId 필터로 설계사별 데이터 격리를 보장한다.
    """
    if not results:
        return

    # 유효한 customerId 수집 (중복 제거)
    valid_customer_ids: Dict[str, List[int]] = {}  # customerId -> [result indices]
    placeholder_indices: List[int] = []  # 플레이스홀더 ID를 가진 결과 인덱스

    for i, doc in enumerate(results):
        customer_id = doc.get("customerId")
        if not customer_id:
            continue

        customer_id_str = str(customer_id)
        if _is_valid_customer_id(customer_id_str):
            if customer_id_str not in valid_customer_ids:
                valid_customer_ids[customer_id_str] = []
            valid_customer_ids[customer_id_str].append(i)
        else:
            placeholder_indices.append(i)

    # 유효한 customerId에 대해 customers 컬렉션 batch 조회
    customer_map: Dict[str, Dict[str, Any]] = {}
    if valid_customer_ids:
        try:
            customers_collection = MongoService.get_collection("customers")
            object_ids = [ObjectId(cid) for cid in valid_customer_ids.keys()]
            cursor = customers_collection.find(
                {"_id": {"$in": object_ids}, "meta.created_by": user_id},
                {"personal_info.name": 1, "insurance_info.customer_type": 1}
            )
            async for customer in cursor:
                cid = str(customer["_id"])
                customer_map[cid] = {
                    "name": customer.get("personal_info", {}).get("name"),
                    "type": customer.get("insurance_info", {}).get("customer_type")
                }
        except Exception as e:
            logger.warning(f"Customer batch lookup failed: {e}")

    # 결과에 customer_relation 추가
    for customer_id_str, indices in valid_customer_ids.items():
        customer_info = customer_map.get(customer_id_str, {})
        for idx in indices:
            results[idx]["customer_relation"] = {
                "customer_id": customer_id_str,
                "customer_name": customer_info.get("name"),
                "customer_type": customer_info.get("type")
            }

    # 플레이스홀더 ID -> "내 보관함"
    for idx in placeholder_indices:
        customer_id_str = str(results[idx].get("customerId", ""))
        results[idx]["customer_relation"] = {
            "customer_id": customer_id_str,
            "customer_name": "내 보관함",
            "customer_type": "__MY_STORAGE__"
        }
