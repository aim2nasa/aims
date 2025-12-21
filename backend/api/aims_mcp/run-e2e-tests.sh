#!/bin/bash
# run-e2e-tests.sh
# E2E 테스트 실행 (테스트 인증 자동 on/off)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIMS_API_DIR="$SCRIPT_DIR/../aims_api"

echo "========================================="
echo "  MCP E2E 테스트 실행"
echo "========================================="

# 1. 테스트 인증 활성화
echo "[1/4] 테스트 인증 활성화..."
cd "$AIMS_API_DIR"
ALLOW_TEST_AUTH=true ./deploy_aims_api.sh > /dev/null 2>&1
sleep 2

# 테스트 종료 시 항상 인증 비활성화 (성공/실패 무관)
cleanup() {
  echo ""
  echo "[4/4] 테스트 인증 비활성화..."
  cd "$AIMS_API_DIR"
  ALLOW_TEST_AUTH=false ./deploy_aims_api.sh > /dev/null 2>&1
  echo "✅ ALLOW_TEST_AUTH=false 복구 완료"
}
trap cleanup EXIT

# 2. 테스트 실행
echo "[2/4] E2E 테스트 실행..."
cd "$SCRIPT_DIR"
MCP_URL=http://localhost:3011 npm run test:e2e

# 3. 결과 출력
echo ""
echo "[3/4] 테스트 완료"
