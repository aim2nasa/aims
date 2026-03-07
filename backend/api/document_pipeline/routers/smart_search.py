"""
SmartSearch Router - Document Search Handler
Replaces n8n SmartSearch workflow
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from bson import ObjectId
import logging
import re

from services.mongo_service import MongoService

router = APIRouter()
logger = logging.getLogger(__name__)

# 플레이스홀더 ObjectId 패턴 (0으로만 이루어진 ID)
_PLACEHOLDER_ID_PATTERN = re.compile(r'^0{20,}[0-9]?$')


def _is_valid_customer_id(customer_id: str) -> bool:
    """유효한 customerId인지 검사 (플레이스홀더 제외)"""
    if not customer_id:
        return False
    if _PLACEHOLDER_ID_PATTERN.match(customer_id):
        return False
    return True


class SearchRequest(BaseModel):
    query: Optional[str] = ""
    id: Optional[str] = ""
    mode: Optional[str] = "OR"  # OR or AND
    user_id: str = "tester"
    customer_id: Optional[str] = ""


class SearchResponse(BaseModel):
    results: List[Any]
    count: int


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
            keywords = [k.strip() for k in query.split() if k.strip()]
            if not keywords:
                return []

            # Fields to search
            fields = [
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
                for kw in keywords:
                    conditions.append({"$or": build_keyword_query(kw)})
            else:
                # Any keyword can match (OR mode)
                or_conditions = []
                for kw in keywords:
                    or_conditions.extend(build_keyword_query(kw))
                conditions.append({"$or": or_conditions})

            mongo_query = {"$and": conditions}

        # 3. No search criteria
        else:
            return []

        # Execute query
        collection = MongoService.get_collection("files")
        cursor = collection.find(mongo_query)
        results = await cursor.to_list(length=None)  # 제한 없음 (키워드 검색은 전체 반환)

        # Convert ObjectId to string for JSON serialization
        for doc in results:
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
            if "customerId" in doc and doc["customerId"]:
                doc["customerId"] = str(doc["customerId"])
            if "ownerId" in doc:
                doc["ownerId"] = str(doc["ownerId"])

        # customer_relation 보강: customerId 기반 고객명 batch 조회
        await _enrich_customer_relations(results, user_id)

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

    # 플레이스홀더 ID → "내 보관함"
    for idx in placeholder_indices:
        customer_id_str = str(results[idx].get("customerId", ""))
        results[idx]["customer_relation"] = {
            "customer_id": customer_id_str,
            "customer_name": "내 보관함",
            "customer_type": "__MY_STORAGE__"
        }
