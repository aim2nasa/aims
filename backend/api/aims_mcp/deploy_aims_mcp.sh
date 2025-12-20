#!/bin/bash

# AIMS MCP Server 배포 스크립트
# 사용법: ./deploy_aims_mcp.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "AIMS MCP Server 배포 시작"
echo "=========================================="

# 1. 의존성 설치 (devDependencies 포함 - 빌드에 필요)
echo "[1/4] 의존성 설치..."
npm install

# 2. TypeScript 빌드
echo "[2/4] TypeScript 빌드..."
npm run build

# 3. devDependencies 제거 (프로덕션 최적화)
echo "[2.5/4] 프로덕션 최적화..."
npm prune --omit=dev

# 3. 환경변수 확인
if [ ! -f .env ]; then
    echo "[경고] .env 파일이 없습니다. .env.example을 참고하여 생성하세요."
fi

# 4. PM2로 서비스 재시작
echo "[3/4] PM2 서비스 재시작..."
if pm2 list | grep -q "aims-mcp"; then
    pm2 restart aims-mcp
else
    # HTTP 모드로 시작 (프로덕션)
    pm2 start dist/index.js --name aims-mcp --env production
fi

# 5. 상태 확인
echo "[4/4] 서비스 상태 확인..."
pm2 status aims-mcp

echo "=========================================="
echo "AIMS MCP Server 배포 완료"
echo "=========================================="
echo ""
echo "사용법:"
echo "  stdio 모드: USER_ID=<userId> node dist/index.js"
echo "  HTTP 모드:  MCP_MODE=http node dist/index.js"
echo ""
echo "테스트:"
echo "  curl http://localhost:3011/health"
echo "  curl http://localhost:3011/tools"
