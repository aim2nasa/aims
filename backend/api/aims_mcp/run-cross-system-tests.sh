#!/bin/bash
# run-cross-system-tests.sh
# MCP ↔ aims_api Cross-System 테스트 실행 스크립트
#
# 테스트 인증 자동 on/off 포함
# 사용법:
#   ./run-cross-system-tests.sh           # 로컬 테스트
#   ./run-cross-system-tests.sh remote    # 원격 서버 테스트

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIMS_API_DIR="$SCRIPT_DIR/../aims_api"

# 원격 서버 테스트 여부
REMOTE_MODE="${1:-local}"

# URL 설정
if [ "$REMOTE_MODE" = "remote" ]; then
  export MCP_URL="${MCP_URL:-http://tars.giize.com:3011}"
  export AIMS_API_URL="${AIMS_API_URL:-http://tars.giize.com:3010}"
else
  export MCP_URL="${MCP_URL:-http://localhost:3011}"
  export AIMS_API_URL="${AIMS_API_URL:-http://localhost:3010}"
fi

echo "========================================="
echo "  MCP ↔ aims_api Cross-System 테스트"
echo "========================================="
echo "  MCP URL: $MCP_URL"
echo "  API URL: $AIMS_API_URL"
echo "  Mode: $REMOTE_MODE"
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
  echo "ALLOW_TEST_AUTH=false 복구 완료"
}
trap cleanup EXIT

# 2. Cross-system 테스트 실행
echo "[2/4] Cross-System 테스트 실행..."
cd "$SCRIPT_DIR"

# 테스트 카테고리별 실행 또는 전체 실행
if [ -n "$TEST_CATEGORY" ]; then
  echo "  카테고리: $TEST_CATEGORY"
  npm run test:e2e:cross-system -- --testPathPattern="$TEST_CATEGORY"
else
  npm run test:e2e:cross-system
fi

# 3. 결과 출력
echo ""
echo "[3/4] 테스트 완료"
echo ""
echo "==========================================="
echo "  테스트 실행 옵션:"
echo "==========================================="
echo "  전체 실행:"
echo "    ./run-cross-system-tests.sh"
echo ""
echo "  카테고리별 실행:"
echo "    TEST_CATEGORY=sync ./run-cross-system-tests.sh"
echo "    TEST_CATEGORY=integrity ./run-cross-system-tests.sh"
echo "    TEST_CATEGORY=race-condition ./run-cross-system-tests.sh"
echo "    TEST_CATEGORY=lifecycle ./run-cross-system-tests.sh"
echo "    TEST_CATEGORY=edge-cases ./run-cross-system-tests.sh"
echo ""
echo "  원격 서버 테스트:"
echo "    ./run-cross-system-tests.sh remote"
echo "==========================================="
