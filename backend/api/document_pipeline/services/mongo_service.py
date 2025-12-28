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
    async def insert_file(cls, owner_id: str, customer_id: Optional[str] = None) -> str:
        """Insert new file document and return ID"""
        db = cls.get_db()
        doc = {
            "ownerId": owner_id,
            "createdAt": datetime.utcnow(),
        }
        if customer_id:
            doc["customerId"] = customer_id

        result = await db.files.insert_one(doc)
        return str(result.inserted_id)

    @classmethod
    async def update_file(cls, file_id: str, update_data: Dict[str, Any]) -> bool:
        """Update file document"""
        db = cls.get_db()
        result = await db.files.find_one_and_update(
            {"_id": ObjectId(file_id)},
            {"$set": update_data}
        )
        return result is not None

    @classmethod
    async def get_file(cls, file_id: str) -> Optional[Dict[str, Any]]:
        """Get file document by ID"""
        db = cls.get_db()
        doc = await db.files.find_one({"_id": ObjectId(file_id)})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    @classmethod
    async def insert_error(cls, error_data: Dict[str, Any]) -> str:
        """Insert error log"""
        db = cls.get_db()
        error_data["createdAt"] = datetime.utcnow()
        result = await db.errors.insert_one(error_data)
        return str(result.inserted_id)
