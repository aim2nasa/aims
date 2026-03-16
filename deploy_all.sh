#!/bin/bash
# AIMS 전체 배포 스크립트 (tars 서버용)
# 사용법: cd ~/aims && ./deploy_all.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

AIMS_DIR="$HOME/aims"
LOCKFILE="/tmp/aims_deploy.lock"

# --- 동시 실행 방지 (flock) ---
EXISTING_PID=$(cat "$LOCKFILE" 2>/dev/null || true)
exec 200>"$LOCKFILE"
if ! flock -n 200; then
    echo -e "${YELLOW}다른 배포가 진행 중입니다 (PID: $EXISTING_PID). 기존 배포를 중단하고 새로 시작합니다.${NC}"
    if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
        pkill -P "$EXISTING_PID" 2>/dev/null || true
        kill "$EXISTING_PID" 2>/dev/null || true
        sleep 2
    fi
    pkill -f "smoke_test.py" 2>/dev/null || true
    if ! flock -n 200; then
        echo -e "${RED}Lock 획득 실패. 수동 정리 필요: rm $LOCKFILE${NC}"
        exit 1
    fi
fi
echo $$ > "$LOCKFILE"
trap "flock -u 200; rm -f $LOCKFILE" EXIT

TOTAL_START=$(date +%s)

# 공유 API 키 로드 (Single Source of Truth)
SHARED_ENV="$AIMS_DIR/.env.shared"
if [ -f "$SHARED_ENV" ]; then
  export $(cat "$SHARED_ENV" | grep -v '^#' | grep -v '^$' | xargs)
  echo "공유 환경변수 로드: $SHARED_ENV"
else
  echo -e "${YELLOW}⚠️  $SHARED_ENV 파일이 없습니다. API 키가 누락될 수 있습니다.${NC}"
fi

# 시간 포맷 함수
format_time() {
    local seconds=$1
    if [ $seconds -lt 60 ]; then
        echo "${seconds}s"
    else
        local mins=$((seconds / 60))
        local secs=$((seconds % 60))
        echo "${mins}m ${secs}s"
    fi
}

# 단계 실행 함수
run_step() {
    local step_num=$1
    local step_name=$2
    local step_cmd=$3

    local start=$(date +%s)
    echo -n "[${step_num}/15] ${step_name} ... "

    eval "$step_cmd" > /dev/null 2>&1

    local end=$(date +%s)
    local elapsed=$((end - start))
    echo -e "${GREEN}완료${NC} ${CYAN}($(format_time $elapsed))${NC}"
}

echo "=== AIMS 전체 배포 시작 ==="
echo ""

# 1. Git 정리 및 Pull
run_step 1 "Git 정리 및 Pull" "cd '$AIMS_DIR' && git checkout -- . && git clean -fd -e deploy_all.sh -e '**/.build_hash' -e '**/.requirements_hash' -e .env.shared -e '**/public/installers/**' && git pull"

# 2. aims_api
run_step 2 "aims_api 배포" "cd '$AIMS_DIR/backend/api/aims_api' && ./deploy_aims_api.sh"

# 3. aims_rag_api
run_step 3 "aims_rag_api 배포" "cd '$AIMS_DIR/backend/api/aims_rag_api' && ./deploy_aims_rag_api.sh"

# 4. annual_report_api
run_step 4 "annual_report_api 배포" "cd '$AIMS_DIR/backend/api/annual_report_api' && ./deploy_annual_report_api.sh"

# 5. pdf_proxy
run_step 5 "pdf_proxy 배포" "cd '$AIMS_DIR/backend/api/pdf_proxy' && ./deploy_pdf_proxy.sh"

# 6. aims_mcp
run_step 6 "aims_mcp 배포" "cd '$AIMS_DIR/backend/api/aims_mcp' && ./deploy_aims_mcp.sh"

# 7. aims_health_monitor (3012)
run_step 7 "aims_health_monitor 배포" "cd '$AIMS_DIR/backend/api/aims_health_monitor' && bash deploy_aims_health_monitor.sh"

# 8. pdf_converter
run_step 8 "pdf_converter 배포" "cd '$AIMS_DIR/tools/convert' && ./deploy_pdf_converter.sh"

# 9. document_pipeline (8100)
run_step 9 "document_pipeline 배포" "cd '$AIMS_DIR/backend/api/document_pipeline' && bash deploy_document_pipeline.sh"

# 10. n8n 워크플로우
# [DISABLED] n8n은 AIMS에서 사용하지 않음 (2026-03-05)
# run_step 10 "n8n 워크플로우 배포" "cd '$AIMS_DIR/backend/n8n_flows' && source ~/.profile 2>/dev/null || true && ./deploy_n8n_workflows.sh"

# 11. Frontend (메인)
run_step 11 "Frontend 배포" "cd '$AIMS_DIR/frontend/aims-uix3' && ./deploy_aims_frontend.sh"

# 12. Admin Frontend
run_step 12 "Admin 배포" "cd '$AIMS_DIR/frontend/aims-admin' && ./deploy_aims_admin.sh"

# 13. 상태 확인
run_step 13 "서비스 상태 확인" "pm2 list"

# 14. Docker 정리 (미사용 이미지 삭제)
run_step 14 "Docker 정리" "docker image prune -f && docker container prune -f"

# 15. AI 어시스턴트 Regression 테스트 (배포 중단하지 않음 — AI 모델 응답은 비결정적)
REGRESSION_SCRIPT="$AIMS_DIR/tools/ai_assistant_regression/run_regression.py"
if [ -f "$REGRESSION_SCRIPT" ]; then
  echo -n "[15/15] AI 어시스턴트 Regression 테스트 ... "
  REGRESSION_START=$(date +%s)

  # 서비스 안정화 대기 (배포 직후 PM2 재시작 반영)
  sleep 5

  # set -e 영향 차단: 서브셸에서 실행하여 regression 실패가 배포를 중단하지 않도록 함
  (python3 "$REGRESSION_SCRIPT" > /tmp/regression_output.txt 2>&1) && REGRESSION_OK=1 || REGRESSION_OK=0
  REGRESSION_END=$(date +%s)
  REGRESSION_ELAPSED=$((REGRESSION_END - REGRESSION_START))
  if [ "$REGRESSION_OK" = "1" ]; then
    echo -e "${GREEN}PASS${NC} ${CYAN}($(format_time $REGRESSION_ELAPSED))${NC}"
  else
    echo -e "${YELLOW}FAIL (경고)${NC} ${CYAN}($(format_time $REGRESSION_ELAPSED))${NC}"
    echo -e "${YELLOW}  AI 응답 비결정적 특성상 배포는 계속됩니다.${NC}"
    echo -e "${YELLOW}  상세: cat /tmp/regression_output.txt${NC}"
    echo -e "${YELLOW}  결과: cat /tmp/regression_results.json${NC}"
  fi
else
  echo "[15/15] AI Regression 테스트 스킵 (스크립트 없음)"
fi

TOTAL_END=$(date +%s)
TOTAL_ELAPSED=$((TOTAL_END - TOTAL_START))

echo ""
echo -e "=== ${GREEN}전체 배포 완료${NC} ${CYAN}(총 $(format_time $TOTAL_ELAPSED))${NC} ==="
