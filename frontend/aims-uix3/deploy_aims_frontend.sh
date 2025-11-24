#!/bin/bash

# AIMS Frontend 배포 스크립트 (tars 서버 전용)
# 사용법: ssh tars.giize.com 'cd ~/aims/frontend/aims-uix3 && ./deploy_aims_frontend.sh'
#        또는 tars 서버 접속 후: ./deploy_aims_frontend.sh
#
# 이 스크립트는:
# 1. 최신 코드 가져오기 (git pull)
# 2. 의존성 설치 (필요시)
# 3. 프로덕션 빌드
# 4. nginx 설정 업데이트
# 5. nginx 리로드

set -e

echo "=== AIMS Frontend 배포 시작 ==="

# 현재 디렉토리 확인
if [ ! -f "package.json" ]; then
    echo "❌ 오류: package.json을 찾을 수 없습니다"
    echo "   ~/aims/frontend/aims-uix3 디렉토리에서 실행하세요"
    exit 1
fi

# 1. Git 최신 코드 가져오기
echo ""
echo "📥 1단계: 최신 코드 가져오기..."
git fetch origin
CURRENT_COMMIT=$(git rev-parse HEAD)
LATEST_COMMIT=$(git rev-parse origin/main)

if [ "$CURRENT_COMMIT" = "$LATEST_COMMIT" ]; then
    echo "✓ 이미 최신 버전입니다"
else
    echo "→ 새 커밋 발견, git pull 실행..."
    git pull origin main
    echo "✓ 최신 코드 업데이트 완료"
fi

# 2. package.json 변경 확인
echo ""
echo "📦 2단계: 의존성 확인..."
NEED_INSTALL=false

# git pull로 package.json이 변경되었는지 확인
if git diff HEAD@{1} HEAD --name-only 2>/dev/null | grep -q "package.json"; then
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
    echo "✓ 의존성 설치 완료"
else
    echo "✓ package.json 변경 없음, npm install 건너뛰기"
fi

# 3. 프로덕션 빌드
echo ""
echo "🔨 3단계: 프로덕션 빌드 중..."
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
echo "✓ 빌드 완료 (${BUILD_TIME}초, ${FILE_COUNT}개 파일, ${BUILD_SIZE})"

# 4. nginx 설정 확인 및 업데이트
echo ""
echo "🔧 4단계: nginx 설정 확인..."

NGINX_CONFIG="/etc/nginx/sites-available/aims"
EXPECTED_ROOT="/home/rossi/aims/frontend/aims-uix3/dist"

# 현재 root 경로 확인
CURRENT_ROOT=$(sudo grep -o 'root [^;]*' "$NGINX_CONFIG" | grep -v "acme-challenge" | head -1 | awk '{print $2}')

if [ "$CURRENT_ROOT" != "$EXPECTED_ROOT" ]; then
    echo "→ nginx 설정 업데이트 필요 (현재: $CURRENT_ROOT)"

    if [ ! -f "nginx-aims.conf" ]; then
        echo "❌ 오류: nginx-aims.conf 파일을 찾을 수 없습니다"
        exit 1
    fi

    # 기존 설정 백업
    BACKUP_FILE="${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "→ 기존 설정 백업: $BACKUP_FILE"
    sudo cp "$NGINX_CONFIG" "$BACKUP_FILE"

    # 새 설정 적용
    echo "→ 새 설정 적용 중..."
    sudo cp nginx-aims.conf "$NGINX_CONFIG"

    # nginx 설정 테스트
    echo "→ nginx 설정 검증 중..."
    if sudo nginx -t 2>&1 | grep -q "successful"; then
        echo "✓ nginx 설정 검증 성공"

        # nginx 리로드
        echo "→ nginx 리로드 중..."
        sudo systemctl reload nginx
        echo "✓ nginx 설정 업데이트 및 리로드 완료"
    else
        echo "❌ nginx 설정 오류 발생, 이전 설정으로 복구 중..."
        sudo cp "$BACKUP_FILE" "$NGINX_CONFIG"
        sudo systemctl reload nginx
        exit 1
    fi
else
    echo "✓ nginx 설정 이미 올바름 ($CURRENT_ROOT)"
fi

# 5. nginx 상태 확인
echo ""
echo "🚀 5단계: 배포 완료 확인..."

# nginx 상태 확인
NGINX_STATUS=$(systemctl is-active nginx)
echo "→ nginx 상태: $NGINX_STATUS"

if [ "$NGINX_STATUS" != "active" ]; then
    echo "❌ 경고: nginx가 실행 중이지 않습니다!"
    exit 1
fi

# 배포된 파일 확인
echo "→ 배포 파일: ${FILE_COUNT}개 (${BUILD_SIZE})"

# index.html 타임스탬프
INDEX_TIME=$(stat -c "%y" dist/index.html | cut -d. -f1)
echo "→ index.html 타임스탬프: $INDEX_TIME"

echo ""
echo "=== ✅ AIMS Frontend 배포 완료! ==="
echo ""
echo "📊 배포 정보:"
echo "  - 빌드 시간: ${BUILD_TIME}초"
echo "  - 파일 개수: ${FILE_COUNT}개"
echo "  - 총 크기: ${BUILD_SIZE}"
echo "  - 배포 경로: $EXPECTED_ROOT"
echo "  - 서비스 URL: https://aims.giize.com"
echo ""
echo "💡 배포 확인:"
echo "  1. 브라우저에서 https://aims.giize.com 접속"
echo "  2. Ctrl+Shift+R (하드 리프레시) 필수!"
echo "  3. 개발자 도구(F12) → Console에서 오류 확인"
echo ""
