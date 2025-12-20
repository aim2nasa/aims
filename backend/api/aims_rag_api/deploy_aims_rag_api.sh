#!/bin/bash
# deploy_aims_rag_api.sh
# AIMS RAG API 컨테이너 재배포 스크립트
# 스마트 빌드: 소스 변경 시에만 Docker 재빌드

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

CONTAINER_NAME="aims-rag-api"
IMAGE_NAME="aims-rag-api"
HASH_FILE=".build_hash"

# .env 파일에서 환경변수 읽기
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# 버전 정보 가져오기
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VERSION=$(cat VERSION 2>/dev/null || echo "0.0.0")

# 소스 파일 해시 계산 (Dockerfile, requirements.txt, *.py)
calculate_hash() {
  find . -maxdepth 2 \( -name "Dockerfile" -o -name "requirements.txt" -o -name "*.py" \) \
    -exec md5sum {} \; 2>/dev/null | sort | md5sum | cut -d' ' -f1
}

CURRENT_HASH=$(calculate_hash)
PREVIOUS_HASH=""
if [ -f "$HASH_FILE" ]; then
  PREVIOUS_HASH=$(cat "$HASH_FILE")
fi

NEED_BUILD=false
if [ "$CURRENT_HASH" != "$PREVIOUS_HASH" ]; then
  NEED_BUILD=true
fi

# 이미지가 없으면 반드시 빌드
if ! docker image inspect $IMAGE_NAME > /dev/null 2>&1; then
  NEED_BUILD=true
fi

echo "========================================="
echo "  AIMS RAG API 배포"
echo "  Version: v${VERSION} (${GIT_HASH})"
if [ "$NEED_BUILD" = true ]; then
  echo "  Mode: FULL BUILD (소스 변경 감지)"
else
  echo "  Mode: QUICK RESTART (소스 변경 없음)"
fi
echo "========================================="

echo "1. 기존 컨테이너 중지 및 삭제..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

if [ "$NEED_BUILD" = true ]; then
  echo "2. 새 이미지 빌드..."
  docker build \
    --build-arg GIT_HASH="${GIT_HASH}" \
    --build-arg BUILD_TIME="${BUILD_TIME}" \
    -t $IMAGE_NAME .

  # 해시 저장
  echo "$CURRENT_HASH" > "$HASH_FILE"
else
  echo "2. 빌드 스킵 (변경 없음)"
fi

echo "3. 새 컨테이너 실행..."
docker run -d \
  --name $CONTAINER_NAME \
  -p 8000:8000 \
  --network=host \
  -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
  $IMAGE_NAME

echo "AIMS RAG API 배포 완료: v${VERSION} (${GIT_HASH})"
