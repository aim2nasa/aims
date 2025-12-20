#!/bin/bash

# AIMS MCP Server 배포 스크립트 (스마트 빌드)
# 사용법: ./deploy_aims_mcp.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HASH_FILE=".build_hash"

# 소스 파일 해시 계산 (package.json, tsconfig.json, src/*)
calculate_hash() {
  cat package.json tsconfig.json 2>/dev/null | md5sum | cut -d' ' -f1
  find src -type f -name "*.ts" -exec md5sum {} \; 2>/dev/null | sort | md5sum | cut -d' ' -f1
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

# dist가 없으면 반드시 빌드
if [ ! -d "dist" ]; then
  NEED_BUILD=true
fi

echo "=========================================="
echo "AIMS MCP Server 배포"
if [ "$NEED_BUILD" = true ]; then
  echo "Mode: FULL BUILD"
else
  echo "Mode: QUICK RESTART (변경 없음)"
fi
echo "=========================================="

if [ "$NEED_BUILD" = true ]; then
  # 1. 의존성 설치 (devDependencies 포함 - 빌드에 필요)
  echo "[1/3] 의존성 설치..."
  npm install --silent

  # 2. TypeScript 빌드
  echo "[2/3] TypeScript 빌드..."
  npm run build

  # devDependencies 제거 (프로덕션 최적화)
  npm prune --omit=dev --silent

  # 해시 저장
  echo "$CURRENT_HASH" > "$HASH_FILE"
else
  echo "[1/3] 빌드 스킵 (변경 없음)"
fi

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
