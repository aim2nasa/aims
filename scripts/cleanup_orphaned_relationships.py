#!/usr/bin/env python3
"""
Orphaned Customer Relationships Cleanup Script
기존 데이터베이스에서 참조하는 고객이 삭제된 관계 레코드를 정리하는 스크립트
"""

import pymongo
from bson import ObjectId
import sys

def cleanup_orphaned_relationships():
    """
    customer_relationships 컬렉션에서 존재하지 않는 고객을 참조하는 레코드를 정리
    """
    try:
        # MongoDB 연결
        client = pymongo.MongoClient("mongodb://tars:27017/")
        db = client["aimsdb"]
        
        customers_collection = db["customers"]
        relationships_collection = db["customer_relationships"]
        
        print("🔍 Orphaned relationships 검사를 시작합니다...")
        
        # 모든 관계 레코드 조회
        all_relationships = list(relationships_collection.find({}))
        print(f"📊 총 관계 레코드 수: {len(all_relationships)}")
        
        # 모든 고객 ID 조회 (빠른 검색을 위해 set으로 변환)
        all_customer_ids = set(customers_collection.distinct("_id"))
        print(f"👥 총 고객 수: {len(all_customer_ids)}")
        
        orphaned_relationships = []
        
        for relationship in all_relationships:
            from_customer_id = relationship.get("from_customer")
            related_customer_id = relationship.get("related_customer")
            
            # ObjectId로 변환 (문자열인 경우)
            if isinstance(from_customer_id, str):
                from_customer_id = ObjectId(from_customer_id)
            if isinstance(related_customer_id, str):
                related_customer_id = ObjectId(related_customer_id)
            
            # 참조하는 고객이 존재하지 않는 경우 orphaned로 간주
            from_customer_exists = from_customer_id in all_customer_ids
            related_customer_exists = related_customer_id in all_customer_ids
            
            if not from_customer_exists or not related_customer_exists:
                orphaned_relationships.append({
                    "relationship_id": relationship["_id"],
                    "from_customer": from_customer_id,
                    "related_customer": related_customer_id,
                    "from_exists": from_customer_exists,
                    "related_exists": related_customer_exists,
                    "relationship_type": relationship.get("relationship_info", {}).get("relationship_type", "Unknown")
                })
        
        print(f"🚨 발견된 orphaned relationships: {len(orphaned_relationships)}")
        
        if not orphaned_relationships:
            print("✅ 정리할 orphaned relationships가 없습니다.")
            return
        
        # Orphaned relationships 출력
        for i, orphaned in enumerate(orphaned_relationships, 1):
            print(f"\n[{i}] Relationship ID: {orphaned['relationship_id']}")
            print(f"    From Customer: {orphaned['from_customer']} (exists: {orphaned['from_exists']})")
            print(f"    Related Customer: {orphaned['related_customer']} (exists: {orphaned['related_exists']})")
            print(f"    Relationship Type: {orphaned['relationship_type']}")
        
        # 사용자 확인
        print(f"\n⚠️  {len(orphaned_relationships)}개의 orphaned relationship 레코드를 삭제하시겠습니까?")
        print("이 작업은 되돌릴 수 없습니다.")
        
        confirmation = input("계속 진행하려면 'YES' 입력: ").strip()
        
        if confirmation == "YES":
            # Orphaned relationships 삭제
            orphaned_ids = [rel["relationship_id"] for rel in orphaned_relationships]
            
            delete_result = relationships_collection.delete_many({
                "_id": {"$in": orphaned_ids}
            })
            
            print(f"✅ {delete_result.deleted_count}개의 orphaned relationship 레코드가 삭제되었습니다.")
            
            # 정리 후 상태 확인
            remaining_relationships = relationships_collection.count_documents({})
            print(f"📊 정리 후 남은 관계 레코드 수: {remaining_relationships}")
            
        else:
            print("❌ 작업이 취소되었습니다.")
        
    except Exception as e:
        print(f"❌ 오류가 발생했습니다: {e}")
        sys.exit(1)
    
    finally:
        if 'client' in locals():
            client.close()

if __name__ == "__main__":
    cleanup_orphaned_relationships()