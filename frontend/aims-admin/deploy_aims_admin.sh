#!/bin/bash
# AIMS Admin 배포 스크립트 (tars 서버 전용)
# 사용법: ssh tars 'cd ~/aims/frontend/aims-admin && ./deploy_aims_admin.sh'

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo "=== AIMS Admin 배포 시작 ==="

# 1. 의존성 확인
echo ""
echo "📦 1단계: 의존성 확인..."
NEED_INSTALL=false

# git pull로 package.json이 변경되었는지 확인
if git diff HEAD@{1} HEAD --name-only 2>/dev/null | grep -q "frontend/aims-admin/package.json"; then
    NEED_INSTALL=true
    echo "→ package.json 변경 감지"
fi

# node_modules가 없으면 무조건 설치
if [ ! -d "node_modules" ]; then
    NEED_INSTALL=true
    echo "→ node_modules가 없음"
fi

if [ "$NEED_INSTALL" = true ]; then
    echo "→ npm install 실행..."
    npm install
    echo -e "✓ 의존성 설치 ${GREEN}완료${NC}"
else
    echo -e "✓ package.json 변경 없음, ${CYAN}npm install 건너뛰기${NC}"
fi

# 2. 프로덕션 빌드
echo ""
echo "🔨 2단계: 프로덕션 빌드 중..."
BUILD_START=$(date +%s)
npm run build
BUILD_END=$(date +%s)
BUILD_TIME=$((BUILD_END - BUILD_START))

if [ ! -d "dist" ]; then
    echo "❌ 빌드 실패: dist 디렉토리가 생성되지 않았습니다"
    exit 1
fi

BUILD_SIZE=$(du -sh dist | cut -f1)
FILE_COUNT=$(find dist -type f | wc -l)
echo -e "✓ 빌드 완료 ${GREEN}(${BUILD_TIME}초, ${FILE_COUNT}개 파일, ${BUILD_SIZE})${NC}"

# 3. 배포 확인
echo ""
echo "🚀 3단계: 배포 완료 확인..."

DEPLOY_PATH="/home/rossi/aims/frontend/aims-admin/dist"
INDEX_TIME=$(stat -c "%y" dist/index.html | cut -d. -f1)
echo "→ 배포 경로: $DEPLOY_PATH"
echo "→ index.html: $INDEX_TIME"

echo ""
echo -e "=== ${GREEN}✅ AIMS Admin 배포 완료!${NC} ==="
echo ""
echo "📊 배포 정보:"
echo "  - 빌드 시간: ${BUILD_TIME}초"
echo "  - 파일 개수: ${FILE_COUNT}개"
echo "  - 서비스 URL: https://admin.aims.giize.com"
echo ""
