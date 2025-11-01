#!/bin/bash
# MongoDB + Qdrant 완전 정리
# 사용: ./scripts/clean_all_databases.sh

echo "============================================================"
echo "MongoDB + Qdrant 완전 정리"
echo "============================================================"

# MongoDB 정리
echo -e "\n[MongoDB] 정리 중..."
mongosh docupload --quiet --eval "db.files.deleteMany({})"

# Qdrant 정리
echo -e "\n[Qdrant] 정리 중..."
curl -s -X DELETE http://localhost:6333/collections/docembed | python3 -m json.tool

# Qdrant 컬렉션 재생성
echo -e "\n[Qdrant] docembed 컬렉션 재생성 중..."
curl -s -X PUT http://localhost:6333/collections/docembed \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    }
  }' | python3 -m json.tool

echo -e "\n============================================================"
echo "[완료]"
echo "============================================================"
