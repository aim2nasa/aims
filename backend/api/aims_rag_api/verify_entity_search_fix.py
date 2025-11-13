#!/usr/bin/env python3
"""
Entity Search 수정 전/후 비교 테스트

목적: "entities만 사용" vs "entities + metadata_keywords 사용" 비교
"""

from pymongo import MongoClient
import re

# MongoDB 연결
client = MongoClient("mongodb://localhost:27017/")
db = client["docupload"]
collection = db["files"]

# 테스트 케이스 (다양한 Entity 쿼리 패턴)
test_cases = [
    {
        "name": "Case 1: 곽승철 + 직업",
        "entities": ["곽승철"],
        "metadata_keywords": ["곽승철", "직업"],
        "description": "원본 문제 케이스"
    },
    {
        "name": "Case 2: 곽승철 + 이력서",
        "entities": ["곽승철"],
        "metadata_keywords": ["곽승철", "이력서"],
        "description": "파일명 직접 매칭 케이스"
    },
    {
        "name": "Case 3: 김보성 + 보험",
        "entities": ["김보성"],
        "metadata_keywords": ["김보성", "보험"],
        "description": "다른 entity 테스트"
    },
    {
        "name": "Case 4: 캐치업코리아 + 재무제표",
        "entities": ["캐치업코리아"],
        "metadata_keywords": ["캐치업코리아", "재무제표"],
        "description": "회사명 entity"
    },
    {
        "name": "Case 5: 안영미 + 연간보고서",
        "entities": ["안영미"],
        "metadata_keywords": ["안영미", "연간보고서"],
        "description": "annual report 케이스"
    }
]

user_id = "675a7d1f9b0a2c1c8012fc93"  # tester user

def search_current_logic(entities, metadata_keywords):
    """현재 로직: entities + metadata_keywords 사용"""
    search_terms = entities + metadata_keywords
    regex_pattern = "|".join([re.escape(term) for term in search_terms])

    mongo_filter = {
        "ownerId": user_id,
        "$or": [
            {"upload.originalName": {"$regex": regex_pattern, "$options": "i"}},
            {"meta.full_text": {"$regex": regex_pattern, "$options": "i"}},
            {"meta.tags": {"$in": search_terms}},
            {"meta.summary": {"$regex": regex_pattern, "$options": "i"}},
            {"ocr.tags": {"$in": search_terms}},
            {"ocr.summary": {"$regex": regex_pattern, "$options": "i"}}
        ]
    }

    results = []
    for doc in collection.find(mongo_filter).limit(10):
        upload_data = doc.get('upload') or {}
        results.append({
            "original_name": upload_data.get('originalName', ''),
            "doc_id": str(doc["_id"])
        })

    return results

def search_fixed_logic(entities):
    """수정 후 로직: entities만 사용"""
    search_terms = entities  # metadata_keywords 제거!
    regex_pattern = "|".join([re.escape(term) for term in search_terms])

    mongo_filter = {
        "ownerId": user_id,
        "$or": [
            {"upload.originalName": {"$regex": regex_pattern, "$options": "i"}},
            {"meta.full_text": {"$regex": regex_pattern, "$options": "i"}},
            {"meta.tags": {"$in": search_terms}},
            {"meta.summary": {"$regex": regex_pattern, "$options": "i"}},
            {"ocr.tags": {"$in": search_terms}},
            {"ocr.summary": {"$regex": regex_pattern, "$options": "i"}}
        ]
    }

    results = []
    for doc in collection.find(mongo_filter).limit(10):
        upload_data = doc.get('upload') or {}
        results.append({
            "original_name": upload_data.get('originalName', ''),
            "doc_id": str(doc["_id"])
        })

    return results

def analyze_results(current_results, fixed_results, case_name, entities):
    """결과 비교 분석"""
    print(f"\n{'='*80}")
    print(f"{case_name}")
    print(f"{'='*80}")

    print(f"\n📊 현재 로직 (entities + metadata_keywords):")
    print(f"   검색 결과: {len(current_results)}개")
    for i, result in enumerate(current_results[:5], 1):
        print(f"   {i}. {result['original_name']}")

    print(f"\n✅ 수정 후 로직 (entities만):")
    print(f"   검색 결과: {len(fixed_results)}개")
    for i, result in enumerate(fixed_results[:5], 1):
        print(f"   {i}. {result['original_name']}")

    # 정확도 분석
    entity_pattern = "|".join(entities)

    current_correct = sum(1 for r in current_results
                         if any(e.lower() in r['original_name'].lower() for e in entities))
    fixed_correct = sum(1 for r in fixed_results
                       if any(e.lower() in r['original_name'].lower() for e in entities))

    print(f"\n📈 정확도 비교:")
    if len(current_results) > 0:
        print(f"   현재: {current_correct}/{len(current_results)} ({current_correct/len(current_results)*100:.1f}%)")
    else:
        print(f"   현재: 0/0 (N/A)")

    if len(fixed_results) > 0:
        print(f"   수정: {fixed_correct}/{len(fixed_results)} ({fixed_correct/len(fixed_results)*100:.1f}%)")
    else:
        print(f"   수정: 0/0 (N/A)")

    # 판정
    if fixed_correct >= current_correct and len(fixed_results) <= len(current_results):
        print(f"\n✅ 판정: 개선됨 (정확도 유지/향상, 노이즈 감소)")
    elif fixed_correct > current_correct:
        print(f"\n✅ 판정: 개선됨 (정확도 향상)")
    elif len(fixed_results) == 0:
        print(f"\n⚠️ 판정: 검토 필요 (결과 없음)")
    else:
        print(f"\n❌ 판정: 악화됨")

# 전체 테스트 실행
print("\n" + "="*80)
print("Entity Search 수정 전/후 비교 테스트")
print("="*80)

summary = []

for case in test_cases:
    current_results = search_current_logic(case["entities"], case["metadata_keywords"])
    fixed_results = search_fixed_logic(case["entities"])

    analyze_results(current_results, fixed_results, case["name"], case["entities"])

    summary.append({
        "case": case["name"],
        "current_count": len(current_results),
        "fixed_count": len(fixed_results)
    })

# 전체 요약
print("\n" + "="*80)
print("전체 요약")
print("="*80)
for s in summary:
    print(f"{s['case']}: {s['current_count']}개 → {s['fixed_count']}개")

print("\n✅ 테스트 완료!")
