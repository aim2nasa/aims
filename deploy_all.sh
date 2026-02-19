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
    echo -n "[${step_num}/13] ${step_name} ... "

    eval "$step_cmd" > /dev/null 2>&1

    local end=$(date +%s)
    local elapsed=$((end - start))
    echo -e "${GREEN}완료${NC} ${CYAN}($(format_time $elapsed))${NC}"
}

echo "=== AIMS 전체 배포 시작 ==="
echo ""

# 1. Git 정리 및 Pull
run_step 1 "Git 정리 및 Pull" "cd '$AIMS_DIR' && git checkout -- . && git clean -fd -e deploy_all.sh -e '**/.build_hash' -e '**/.requirements_hash' -e .env.shared && git pull"

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

# 9. n8n 워크플로우
run_step 9 "n8n 워크플로우 배포" "cd '$AIMS_DIR/backend/n8n_flows' && source ~/.profile 2>/dev/null || true && ./deploy_n8n_workflows.sh"

# 10. Frontend (메인)
run_step 10 "Frontend 배포" "cd '$AIMS_DIR/frontend/aims-uix3' && ./deploy_aims_frontend.sh"

# 11. Admin Frontend
run_step 11 "Admin 배포" "cd '$AIMS_DIR/frontend/aims-admin' && ./deploy_aims_admin.sh"

# 12. 상태 확인
run_step 12 "서비스 상태 확인" "pm2 list"

# 13. Docker 정리 (미사용 이미지 삭제)
run_step 13 "Docker 정리" "docker image prune -f && docker container prune -f"

TOTAL_END=$(date +%s)
TOTAL_ELAPSED=$((TOTAL_END - TOTAL_START))

echo ""
echo -e "=== ${GREEN}전체 배포 완료${NC} ${CYAN}(총 $(format_time $TOTAL_ELAPSED))${NC} ==="
