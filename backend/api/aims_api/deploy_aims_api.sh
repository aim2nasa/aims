#!/bin/bash
# deploy_aims_api.sh
# AIMS Main API 컨테이너 재배포 스크립트 (스마트 빌드)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 빌드 context는 backend/ 디렉토리 (shared-schema 접근 위해)
BACKEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONTAINER_NAME="aims-api"
IMAGE_NAME="aims-api"
HASH_FILE=".build_hash"

# .env 파일에서 환경변수 읽기
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# 공유 API 키 로드 (독립 실행 대비 - deploy_all.sh에서 이미 로드됨)
AIMS_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
if [ -z "$OPENAI_API_KEY" ] && [ -f "$AIMS_DIR/.env.shared" ]; then
  export $(cat "$AIMS_DIR/.env.shared" | grep -v '^#' | grep -v '^$' | xargs)
fi

# 버전 정보 가져오기
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VERSION=$(cat VERSION 2>/dev/null || echo "0.0.0")

# 소스 파일 해시 계산 (Dockerfile, package.json, server.js, lib/*, shared-schema)
calculate_hash() {
  cat Dockerfile package.json package-lock.json 2>/dev/null | md5sum | cut -d' ' -f1
  find . -maxdepth 1 -name "*.js" -exec md5sum {} \; 2>/dev/null | sort | md5sum | cut -d' ' -f1
  find lib middleware routes -type f -name "*.js" -exec md5sum {} \; 2>/dev/null | sort | md5sum | cut -d' ' -f1
  # shared-schema 변경도 감지
  cat "$BACKEND_DIR/shared/schema/src"/*.ts 2>/dev/null | md5sum | cut -d' ' -f1
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
echo "  AIMS API 배포"
echo "  Version: v${VERSION} (${GIT_HASH})"
if [ "$NEED_BUILD" = true ]; then
  echo "  Mode: FULL BUILD"
else
  echo "  Mode: QUICK RESTART (변경 없음)"
fi
echo "========================================="

# 서비스 이벤트 기록 함수
record_event() {
  local event_type=$1
  local reason=$2
  curl -s -X POST "http://localhost:3010/api/admin/service-event" \
    -H "Content-Type: application/json" \
    -d "{\"serviceName\":\"aims-api\",\"eventType\":\"$event_type\",\"reason\":\"$reason\",\"triggeredBy\":\"deploy-script\"}" \
    2>/dev/null || true
}

# 배포 전 이벤트 기록 (API가 살아있을 때만)
if [ "$NEED_BUILD" = true ]; then
  record_event "restart-initiated" "Deploy script - FULL BUILD"
else
  record_event "restart-initiated" "Deploy script - QUICK RESTART"
fi

# 1. 기존 컨테이너 중지 및 제거
echo "기존 컨테이너 중지..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

if [ "$NEED_BUILD" = true ]; then
  # 2. 새 이미지 빌드 (backend/ 디렉토리에서 빌드하여 shared-schema 접근)
  echo "새 이미지 빌드 중..."
  DOCKER_BUILDKIT=1 docker build \
    --build-arg GIT_HASH="${GIT_HASH}" \
    --build-arg BUILD_TIME="${BUILD_TIME}" \
    -f "$SCRIPT_DIR/Dockerfile" \
    -t $IMAGE_NAME \
    "$BACKEND_DIR"

  # 해시 저장
  echo "$CURRENT_HASH" > "$HASH_FILE"
else
  echo "빌드 스킵 (변경 없음)"
fi

# 3. 컨테이너 실행 (환경변수 전달 + 볼륨 마운트)
echo "🚀 새 컨테이너 실행..."
docker run -d --network host \
  --memory=2g \
  --restart=unless-stopped \
  -e NODE_ENV="${NODE_ENV:-development}" \
  -e PORT="3010" \
  -e MONGO_URI="mongodb://tars:27017/" \
  -e DB_NAME="docupload" \
  -e NAVER_MAP_ACCESS_KEY="${NAVER_MAP_ACCESS_KEY}" \
  -e NAVER_MAP_SECRET_KEY="${NAVER_MAP_SECRET_KEY}" \
  -e JWT_SECRET="${JWT_SECRET}" \
  -e JWT_EXPIRES_IN="${JWT_EXPIRES_IN}" \
  -e SESSION_SECRET="${SESSION_SECRET}" \
  -e KAKAO_CLIENT_ID="${KAKAO_CLIENT_ID}" \
  -e KAKAO_CLIENT_SECRET="${KAKAO_CLIENT_SECRET}" \
  -e KAKAO_CALLBACK_URL="${KAKAO_CALLBACK_URL}" \
  -e NAVER_CLIENT_ID="${NAVER_CLIENT_ID}" \
  -e NAVER_CLIENT_SECRET="${NAVER_CLIENT_SECRET}" \
  -e NAVER_CALLBACK_URL="${NAVER_CALLBACK_URL}" \
  -e GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID}" \
  -e GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET}" \
  -e GOOGLE_CALLBACK_URL="${GOOGLE_CALLBACK_URL}" \
  -e FRONTEND_URL="${FRONTEND_URL}" \
  -e N8N_API_KEY="${N8N_API_KEY}" \
  -e N8N_WEBHOOK_API_KEY="${N8N_WEBHOOK_API_KEY}" \
  -e INTERNAL_WEBHOOK_API_KEY="${N8N_WEBHOOK_API_KEY}" \
  -e CREDIT_POLICY="${CREDIT_POLICY:-default}" \
  -e INTERNAL_API_KEY="${INTERNAL_API_KEY}" \
  -e CLAMAV_ENABLED="${CLAMAV_ENABLED:-true}" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY}" \
  -e MCP_SERVER_URL="${MCP_SERVER_URL:-http://localhost:3011}" \
  -e ALLOW_TEST_AUTH="${ALLOW_TEST_AUTH:-false}" \
  -e ANNUAL_REPORT_API_URL="${ANNUAL_REPORT_API_URL:-http://localhost:8004}" \
  -e DOCUMENT_PIPELINE_URL="${DOCUMENT_PIPELINE_URL:-http://localhost:8100}" \
  -e AIMS_RAG_API_URL="${AIMS_RAG_API_URL:-http://localhost:8000}" \
  -e PDF_PROXY_URL="${PDF_PROXY_URL:-http://localhost:8002}" \
  -e PDF_CONVERTER_URL="${PDF_CONVERTER_URL:-http://localhost:8005}" \
  -e N8N_URL="${N8N_URL:-http://localhost:5678}" \
  -e AIMS_MCP_URL="${AIMS_MCP_URL:-http://localhost:3011}" \
  -v /data/files:/data/files \
  -v /data/backup:/data/backup \
  -v /home/rossi/aims/backend/scripts:/home/rossi/aims/backend/scripts:ro \
  -v /home/rossi/n8n-docker/n8n_data:/n8n_data:ro \
  -v /var/run/clamav:/var/run/clamav:ro \
  -v /var/lib/clamav:/var/lib/clamav:ro \
  -v /home/rossi/aims/backend/api/aims_api/public:/app/public:ro \
  --name $CONTAINER_NAME \
  $IMAGE_NAME

echo "✅ AIMS Main API 재배포 완료"

# 4. 배포 완료 이벤트 기록 (API가 준비될 때까지 대기)
echo "서비스 시작 대기 중..."
sleep 5
for i in {1..10}; do
  if curl -sf http://localhost:3010/api/health > /dev/null 2>&1; then
    record_event "restart-completed" "Deploy completed - v${VERSION}"
    echo "✅ 서비스 이벤트 기록 완료"
    break
  fi
  echo "  서비스 시작 대기... ($i/10)"
  sleep 2
done

# 5. 미사용 Docker 이미지 정리 (dangling images)
echo ""
echo "🧹 미사용 Docker 이미지 정리..."
PRUNED=$(docker image prune -f 2>/dev/null | grep "Total reclaimed space" || echo "정리할 이미지 없음")
echo "   $PRUNED"

echo ""
echo "📖 로그 확인:"
echo "  docker logs -f $CONTAINER_NAME"
echo ""
echo "📊 상태 확인:"
echo "  docker ps | grep $CONTAINER_NAME"
echo ""
echo "🌍 헬스체크:"
echo "  curl http://localhost:3010/api/health"
