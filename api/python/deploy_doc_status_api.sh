#!/bin/bash
# deploy_doc_status_api.sh
# FastAPI 기반 Document Status API 컨테이너 재배포 스크립트

set -e  # 오류 발생 시 즉시 종료

CONTAINER_NAME="doc-status-api"
IMAGE_NAME="document-status-api"

# 1. 기존 컨테이너 중지 및 제거
echo "🚫 기존 컨테이너 중지 및 제거..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# 2. 새 이미지 빌드
echo "📦 새 이미지 빌드 중..."
docker build -t $IMAGE_NAME .

# 3. 컨테이너 실행
echo "🚀 새 컨테이너 실행..."
docker run -d --network host \
  -e MONGO_URI="mongodb://localhost:27017/" \
  -e DB_NAME="docupload" \
  -e COLLECTION_NAME="files" \
  -e API_PORT="8080" \
  --name $CONTAINER_NAME \
  $IMAGE_NAME

echo "✅ Document Status API 재배포 완료"
echo ""
echo "📖 로그 확인:"
echo "  docker logs -f $CONTAINER_NAME"

