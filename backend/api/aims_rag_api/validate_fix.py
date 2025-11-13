#!/usr/bin/env python3
"""Entity Search 수정 검증"""
from pymongo import MongoClient
import re

client = MongoClient("mongodb://localhost:27017/")
db = client["docupload"]
collection = db["files"]
user_id = "tester"

cases = [
    ("곽승철", "직업"),
    ("김보성", "보험"),
    ("캐치업코리아", "재무제표"),
]

print("\n" + "="*80)
print("Entity Search 수정 전/후 비교")
print("="*80)

for entity, concept in cases:
    # 현재: entity + concept
    current_pattern = f"{re.escape(entity)}|{re.escape(concept)}"
    current = list(collection.find({
        "ownerId": user_id,
        "$or": [
            {"upload.originalName": {"$regex": current_pattern, "$options": "i"}},
            {"meta.full_text": {"$regex": current_pattern, "$options": "i"}}
        ]
    }).limit(20))

    # 수정: entity만
    fixed_pattern = re.escape(entity)
    fixed = list(collection.find({
        "ownerId": user_id,
        "$or": [
            {"upload.originalName": {"$regex": fixed_pattern, "$options": "i"}},
            {"meta.full_text": {"$regex": fixed_pattern, "$options": "i"}}
        ]
    }).limit(20))

    print(f"\nCase: {entity} + {concept}")
    print(f"  현재: {len(current)}개 → 수정: {len(fixed)}개 (노이즈 {len(current)-len(fixed)}개 제거)")

    if len(current) > 0:
        print(f"  현재 결과 샘플:")
        for i, d in enumerate(current[:3], 1):
            name = d.get('upload', {}).get('originalName', 'N/A')
            has_entity = entity.lower() in name.lower()
            print(f"    {i}. {name} {'✅' if has_entity else '❌'}")

    if len(fixed) > 0:
        print(f"  수정 결과:")
        for i, d in enumerate(fixed, 1):
            name = d.get('upload', {}).get('originalName', 'N/A')
            print(f"    {i}. {name} ✅")

print("\n✅ 검증 완료")
