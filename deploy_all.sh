#!/bin/bash
# AIMS 전체 배포 스크립트 (tars 서버용)
# 사용법: cd ~/aims && ./deploy_all.sh [--with-regression]
#
# 옵션:
#   --with-regression  AI 어시스턴트 Regression 테스트 포함 (기본: 제외)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

AIMS_DIR="$HOME/aims"
LOCKFILE="/tmp/aims_deploy.lock"
WITH_REGRESSION=false

# 옵션 파싱
for arg in "$@"; do
  case $arg in
    --with-regression) WITH_REGRESSION=true ;;
  esac
done

if [ "$WITH_REGRESSION" = true ]; then
  TOTAL_STEPS=14
else
  TOTAL_STEPS=13
fi

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
    echo -n "[${step_num}/${TOTAL_STEPS}] ${step_name} ... "

    eval "$step_cmd" > /dev/null 2>&1

    local end=$(date +%s)
    local elapsed=$((end - start))
    echo -e "${GREEN}완료${NC} ${CYAN}($(format_time $elapsed))${NC}"
}

# 병렬 단계 실행 함수 (독립 서비스 동시 배포)
run_parallel_steps() {
    local group_label=$1
    shift
    # 나머지 인자: "step_num|step_name|step_cmd" 형식

    local start=$(date +%s)
    local pids=()
    local step_names=()
    local step_nums=()
    local tmpdir=$(mktemp -d)

    for entry in "$@"; do
        IFS='|' read -r snum sname scmd <<< "$entry"
        step_nums+=("$snum")
        step_names+=("$sname")
        echo -n "[${snum}/${TOTAL_STEPS}] ${sname} ... "
        (eval "$scmd" > /dev/null 2>&1 && echo "OK" > "$tmpdir/$snum" || echo "FAIL" > "$tmpdir/$snum") &
        pids+=($!)
    done
    echo ""

    # 모든 병렬 작업 완료 대기
    local all_ok=true
    for i in "${!pids[@]}"; do
        wait "${pids[$i]}" || true
        local result=$(cat "$tmpdir/${step_nums[$i]}" 2>/dev/null || echo "FAIL")
        if [ "$result" != "OK" ]; then
            echo -e "  ${RED}✗ ${step_names[$i]} 실패${NC}"
            all_ok=false
        fi
    done

    local end=$(date +%s)
    local elapsed=$((end - start))

    if [ "$all_ok" = true ]; then
        # 각 단계별 완료 표시 (grep 파싱용)
        for i in "${!step_nums[@]}"; do
            echo -e "[${step_nums[$i]}/${TOTAL_STEPS}] ${step_names[$i]} ... ${GREEN}완료${NC} ${CYAN}(병렬)${NC}"
        done
        echo -e "  ${GREEN}병렬 그룹 완료${NC} ${CYAN}($(format_time $elapsed))${NC}"
    else
        echo -e "  ${RED}병렬 그룹 일부 실패${NC}"
        rm -rf "$tmpdir"
        exit 1
    fi

    rm -rf "$tmpdir"
}

echo "=== AIMS 전체 배포 시작 ==="
if [ "$WITH_REGRESSION" = true ]; then
  echo "  (AI Regression 테스트 포함)"
fi
echo ""

# 1. Git 정리 및 Pull
run_step 1 "Git 정리 및 Pull" "cd '$AIMS_DIR' && git checkout -- . && git clean -fd -e deploy_all.sh -e '**/.build_hash' -e '**/.requirements_hash' -e .env.shared -e '**/public/installers/**' && git pull"

# 2. aims_api (가장 오래 걸림 — 단독 실행)
run_step 2 "aims_api 배포" "cd '$AIMS_DIR/backend/api/aims_api' && ./deploy_aims_api.sh"

# 3-8. 독립 서비스 병렬 배포
run_parallel_steps "백엔드 서비스" \
    "3|aims_rag_api 배포|cd '$AIMS_DIR/backend/api/aims_rag_api' && ./deploy_aims_rag_api.sh" \
    "4|annual_report_api 배포|cd '$AIMS_DIR/backend/api/annual_report_api' && ./deploy_annual_report_api.sh" \
    "5|pdf_proxy 배포|cd '$AIMS_DIR/backend/api/pdf_proxy' && ./deploy_pdf_proxy.sh" \
    "6|aims_mcp 배포|cd '$AIMS_DIR/backend/api/aims_mcp' && ./deploy_aims_mcp.sh" \
    "7|aims_health_monitor 배포|cd '$AIMS_DIR/backend/api/aims_health_monitor' && bash deploy_aims_health_monitor.sh" \
    "8|pdf_converter 배포|cd '$AIMS_DIR/tools/convert' && ./deploy_pdf_converter.sh"

# 9. document_pipeline (Python 의존성 있어 단독)
run_step 9 "document_pipeline 배포" "cd '$AIMS_DIR/backend/api/document_pipeline' && bash deploy_document_pipeline.sh"

# 10-11. 프론트엔드 병렬 배포
run_parallel_steps "프론트엔드" \
    "10|Frontend 배포|cd '$AIMS_DIR/frontend/aims-uix3' && ./deploy_aims_frontend.sh" \
    "11|Admin 배포|cd '$AIMS_DIR/frontend/aims-admin' && ./deploy_aims_admin.sh"

# 12. 상태 확인
run_step 12 "서비스 상태 확인" "pm2 list"

# 13. Docker 정리
run_step 13 "Docker 정리" "docker image prune -f && docker container prune -f"

# 14. AI 어시스턴트 Regression 테스트 (--with-regression 옵션 시에만)
if [ "$WITH_REGRESSION" = true ]; then
  REGRESSION_SCRIPT="$AIMS_DIR/tools/ai_assistant_regression/run_regression.py"
  if [ -f "$REGRESSION_SCRIPT" ]; then
    echo -n "[14/${TOTAL_STEPS}] AI 어시스턴트 Regression 테스트 ... "
    REGRESSION_START=$(date +%s)
    sleep 5
    # temperature=0으로 aims_api Docker 컨테이너 재시작 (비결정성 제거)
    # set +e: regression 실패/중단 시에도 반드시 temperature 원복 보장
    set +e
    export AI_TEMPERATURE=0
    docker stop aims-api 2>/dev/null || true
    docker rm aims-api 2>/dev/null || true
    cd "$AIMS_DIR/backend/api/aims_api" && ./deploy_aims_api.sh > /dev/null 2>&1
    sleep 5
    (python3 "$REGRESSION_SCRIPT" > /tmp/regression_output.txt 2>&1) && REGRESSION_OK=1 || REGRESSION_OK=0
    # temperature 원복 (일반 사용자는 OpenAI 기본값 사용) — Docker 컨테이너 재시작
    unset AI_TEMPERATURE
    docker stop aims-api 2>/dev/null || true
    docker rm aims-api 2>/dev/null || true
    cd "$AIMS_DIR/backend/api/aims_api" && ./deploy_aims_api.sh > /dev/null 2>&1
    set -e
    REGRESSION_END=$(date +%s)
    REGRESSION_ELAPSED=$((REGRESSION_END - REGRESSION_START))
    if [ "$REGRESSION_OK" = "1" ]; then
      echo -e "${GREEN}PASS${NC} ${CYAN}($(format_time $REGRESSION_ELAPSED))${NC}"
    else
      echo -e "${YELLOW}FAIL (경고)${NC} ${CYAN}($(format_time $REGRESSION_ELAPSED))${NC}"
      echo -e "${YELLOW}  AI 응답 비결정적 특성상 배포는 계속됩니다.${NC}"
      echo -e "${YELLOW}  상세: cat /tmp/regression_output.txt${NC}"
    fi
  else
    echo "[14/${TOTAL_STEPS}] AI Regression 테스트 스킵 (스크립트 없음)"
  fi
fi

TOTAL_END=$(date +%s)
TOTAL_ELAPSED=$((TOTAL_END - TOTAL_START))

echo ""
echo -e "=== ${GREEN}전체 배포 완료${NC} ${CYAN}(총 $(format_time $TOTAL_ELAPSED))${NC} ==="
