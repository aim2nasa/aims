#!/bin/bash
#
# AIMS Health Monitor 배포 스크립트
# 독립 헬스 모니터링 서비스 배포
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HASH_FILE=".build_hash"
SERVICE_NAME="aims-health-monitor"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}  AIMS Health Monitor 배포${NC}"
echo -e "${GREEN}===========================================${NC}"

# 소스 해시 계산 함수
calculate_hash() {
  (
    cat package.json tsconfig.json 2>/dev/null | md5sum
    find src -type f -name "*.ts" -exec md5sum {} \; 2>/dev/null | sort
  ) | md5sum | cut -d' ' -f1
}

CURRENT_HASH=$(calculate_hash)
PREVIOUS_HASH=""
[ -f "$HASH_FILE" ] && PREVIOUS_HASH=$(cat "$HASH_FILE")

NEED_BUILD=false
[ "$CURRENT_HASH" != "$PREVIOUS_HASH" ] && NEED_BUILD=true
[ ! -d "dist" ] && NEED_BUILD=true

if [ "$NEED_BUILD" = true ]; then
  echo -e "${YELLOW}Mode: FULL BUILD (소스 변경 감지)${NC}"
else
  echo -e "${GREEN}Mode: QUICK RESTART (변경 없음)${NC}"
fi

echo "==========================================="

if [ "$NEED_BUILD" = true ]; then
  # 의존성 설치
  echo -e "${YELLOW}[1/4] 의존성 설치 중...${NC}"
  npm install --silent

  # TypeScript 빌드
  echo -e "${YELLOW}[2/4] TypeScript 빌드 중...${NC}"
  npm run build

  # devDependencies 정리
  echo -e "${YELLOW}[3/4] devDependencies 정리 중...${NC}"
  npm prune --omit=dev --silent 2>/dev/null || true

  # 해시 저장
  echo "$CURRENT_HASH" > "$HASH_FILE"
else
  echo -e "${GREEN}[1-3/4] 빌드 스킵 (변경 없음)${NC}"
fi

# PM2 서비스 재시작
echo -e "${YELLOW}[4/4] PM2 서비스 재시작 중...${NC}"

if pm2 list 2>/dev/null | grep -q "$SERVICE_NAME"; then
  pm2 restart "$SERVICE_NAME"
else
  echo -e "${YELLOW}PM2 프로세스 새로 시작...${NC}"
  pm2 start ecosystem.config.js
fi

pm2 save --force 2>/dev/null || true

# 서비스 시작 대기
echo -e "${YELLOW}서비스 시작 대기 중 (5초)...${NC}"
sleep 5

# 헬스체크
echo -e "${YELLOW}헬스체크 중...${NC}"
HEALTH_RESULT=$(curl -s http://localhost:3012/health 2>/dev/null || echo '{"success":false}')
echo "$HEALTH_RESULT"

if echo "$HEALTH_RESULT" | grep -q '"success":true'; then
  echo -e "${GREEN}===========================================${NC}"
  echo -e "${GREEN}✅ 배포 완료!${NC}"
  echo -e "${GREEN}===========================================${NC}"
  echo ""
  echo "📖 로그 확인:"
  echo "   pm2 logs $SERVICE_NAME"
  echo ""
  echo "📊 상태 확인:"
  echo "   curl http://localhost:3012/api/health/current"
  echo ""
else
  echo -e "${RED}===========================================${NC}"
  echo -e "${RED}❌ 헬스체크 실패${NC}"
  echo -e "${RED}===========================================${NC}"
  echo "로그 확인: pm2 logs $SERVICE_NAME"
  exit 1
fi
