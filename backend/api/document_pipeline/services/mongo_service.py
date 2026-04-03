"""
MongoDB Service
"""
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from typing import Optional, Dict, Any
from datetime import datetime

from config import get_settings


class MongoService:
    _client: Optional[AsyncIOMotorClient] = None
    _db = None

    @classmethod
    async def connect(cls):
        """Initialize MongoDB connection"""
        if cls._client is None:
            settings = get_settings()
            cls._client = AsyncIOMotorClient(settings.MONGODB_URI)
            cls._db = cls._client[settings.MONGODB_DB]

    @classmethod
    async def disconnect(cls):
        """Close MongoDB connection"""
        if cls._client:
            cls._client.close()
            cls._client = None
            cls._db = None

    @classmethod
    def get_db(cls):
        """Get database instance"""
        if cls._db is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        return cls._db

    @classmethod
    def get_collection(cls, name: str):
        """Get collection by name"""
        db = cls.get_db()
        return db[name]

    @classmethod
    async def insert_file(cls, owner_id: str, customer_id: Optional[str] = None) -> str:
        """Insert new file document and return ID — Internal API 경유"""
        from services.internal_api import create_file, _serialize_for_api
        doc = {
            "ownerId": owner_id,
            "createdAt": datetime.utcnow(),
        }
        if customer_id:
            # ⚠️ customerId는 ObjectId로 저장 (aims_api와 타입 일관성 유지)
            doc["customerId"] = ObjectId(customer_id) if ObjectId.is_valid(customer_id) else customer_id

        api_result = await create_file(_serialize_for_api(doc))
        if api_result.get("success"):
            return api_result["data"]["insertedId"]
        raise Exception(f"Internal API 파일 생성 실패: {api_result.get('error', 'unknown')}")

    @classmethod
    async def update_file(cls, file_id: str, update_data: Dict[str, Any]) -> bool:
        """Update file document — Internal API 경유"""
        from services.internal_api import update_file as _update_file, _serialize_for_api
        api_result = await _update_file(file_id, set_fields=_serialize_for_api(update_data))
        return api_result.get("success", False)

    @classmethod
    async def get_file(cls, file_id: str) -> Optional[Dict[str, Any]]:
        """Get file document by ID — Internal API 경유"""
        from services.internal_api import query_file_one
        doc = await query_file_one({"_id": file_id})
        return doc  # Internal API가 이미 _id를 문자열로 반환

    @classmethod
    async def insert_error(cls, error_data: Dict[str, Any]) -> str:
        """Insert error log"""
        db = cls.get_db()
        error_data["createdAt"] = datetime.utcnow()
        result = await db.errors.insert_one(error_data)
        return str(result.inserted_id)
