"""
SmartSearch Router - Document Search Handler
Replaces n8n SmartSearch workflow
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any
from bson import ObjectId
import logging
import re

from services.mongo_service import MongoService

router = APIRouter()
logger = logging.getLogger(__name__)


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
                "ocr.tags",
                "meta.filename",
                "meta.full_text",
                "meta.summary",
                "meta.tags",
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
        results = await cursor.to_list(length=100)  # Limit to 100 results

        # Convert ObjectId to string for JSON serialization
        for doc in results:
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
            if "customerId" in doc and doc["customerId"]:
                doc["customerId"] = str(doc["customerId"])
            if "ownerId" in doc:
                doc["ownerId"] = str(doc["ownerId"])

        logger.info(f"SmartSearch: query='{query}', id='{doc_id}', mode={mode}, results={len(results)}")
        return results

    except Exception as e:
        logger.error(f"SmartSearch failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
