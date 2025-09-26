#!/bin/bash
# deploy_aims_rag_api.sh
# AIMS RAG API 컨테이너 재배포 스크립트

CONTAINER_NAME="aims-api-container"
IMAGE_NAME="aims-rag-api"

echo "1. 기존 컨테이너 중지 및 삭제..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

echo "2. 새 이미지 빌드..."
docker build -t $IMAGE_NAME .

echo "3. 새 컨테이너 실행..."
docker run -d \
  --name $CONTAINER_NAME \
  -p 8000:8000 \
  --network=host \
  -e OPENAI_API_KEY="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" \
  $IMAGE_NAME

echo "✅ AIMS RAG API 컨테이너가 배포되었습니다."
echo "로그 확인: docker logs -f $CONTAINER_NAME"

