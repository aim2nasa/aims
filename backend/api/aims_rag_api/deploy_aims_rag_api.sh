#!/bin/bash
# deploy_aims_rag_api.sh
# AIMS RAG API 컨테이너 재배포 스크립트

set -e  # 오류 발생 시 즉시 종료

CONTAINER_NAME="aims-rag-api"
IMAGE_NAME="aims-rag-api"

# .env 파일에서 환경변수 읽기
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# 버전 정보 가져오기
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VERSION=$(cat VERSION 2>/dev/null || echo "0.0.0")

echo "========================================="
echo "  AIMS RAG API 배포"
echo "  Version: v${VERSION} (${GIT_HASH})"
echo "  Build Time: ${BUILD_TIME}"
echo "========================================="

echo "1. 기존 컨테이너 중지 및 삭제..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

echo "2. 새 이미지 빌드..."
docker build \
  --build-arg GIT_HASH="${GIT_HASH}" \
  --build-arg BUILD_TIME="${BUILD_TIME}" \
  -t $IMAGE_NAME .

echo "3. 새 컨테이너 실행..."
docker run -d \
  --name $CONTAINER_NAME \
  -p 8000:8000 \
  --network=host \
  -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
  $IMAGE_NAME

echo "✅ AIMS RAG API 배포 완료: v${VERSION} (${GIT_HASH})"
echo ""
echo "📖 로그 확인:"
echo "  docker logs -f $CONTAINER_NAME"
echo ""
echo "🌍 헬스체크:"
echo "  curl http://localhost:8000/health"
