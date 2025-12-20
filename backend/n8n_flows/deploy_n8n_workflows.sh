#!/bin/bash
# n8n 워크플로우 자동 배포 스크립트
# 사용법: ./deploy_n8n_workflows.sh
#
# 환경변수:
#   N8N_API_KEY - n8n API 키 (필수)

set -e

# 설정
N8N_URL="https://n8nd.giize.com/api/v1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# API 키 확인
if [ -z "$N8N_API_KEY" ]; then
  echo -e "${RED}오류: N8N_API_KEY 환경변수가 설정되지 않았습니다${NC}"
  echo "사용법: N8N_API_KEY=your-key ./deploy_n8n_workflows.sh"
  exit 1
fi

# jq 설치 확인
if ! command -v jq &> /dev/null; then
  echo -e "${RED}오류: jq가 설치되어 있지 않습니다${NC}"
  exit 1
fi

echo "=== n8n 워크플로우 배포 시작 ==="
echo ""

# 배포할 워크플로우 파일 목록
WORKFLOW_FILES=(
  "$SCRIPT_DIR/DocPrepMain.json"
  "$SCRIPT_DIR/modules/DocMeta.json"
  "$SCRIPT_DIR/modules/DocOCR.json"
  "$SCRIPT_DIR/modules/DocReadAI.json"
  "$SCRIPT_DIR/modules/DocSummary.json"
  "$SCRIPT_DIR/modules/DocUpload.json"
  "$SCRIPT_DIR/modules/ErrorLogger.json"
  "$SCRIPT_DIR/modules/OCRWorker.json"
  "$SCRIPT_DIR/modules/SmartSearch.json"
)

# 기존 워크플로우 목록 가져오기
echo "기존 워크플로우 목록 조회 중..."
EXISTING_WORKFLOWS=$(curl -sf -X GET "$N8N_URL/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" 2>/dev/null || echo '{"data":[]}')

SUCCESS_COUNT=0
FAIL_COUNT=0

for file in "${WORKFLOW_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo -e "${YELLOW}건너뛰기: $file (파일 없음)${NC}"
    continue
  fi

  # 워크플로우 이름 추출
  WORKFLOW_NAME=$(jq -r '.name' "$file")

  if [ -z "$WORKFLOW_NAME" ] || [ "$WORKFLOW_NAME" = "null" ]; then
    echo -e "${YELLOW}건너뛰기: $file (이름 없음)${NC}"
    continue
  fi

  echo -n "배포 중: $WORKFLOW_NAME ... "

  # 기존 워크플로우 ID 찾기
  WORKFLOW_ID=$(echo "$EXISTING_WORKFLOWS" | jq -r --arg name "$WORKFLOW_NAME" '.data[] | select(.name == $name) | .id')

  if [ -n "$WORKFLOW_ID" ] && [ "$WORKFLOW_ID" != "null" ]; then
    # 기존 워크플로우 업데이트
    RESPONSE=$(curl -sf -X PUT "$N8N_URL/workflows/$WORKFLOW_ID" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" \
      -H "Content-Type: application/json" \
      -d @"$file" 2>&1)

    if [ $? -eq 0 ]; then
      echo -e "${GREEN}업데이트 완료${NC}"
      ((SUCCESS_COUNT++))
    else
      echo -e "${RED}업데이트 실패${NC}"
      ((FAIL_COUNT++))
    fi
  else
    # 새 워크플로우 생성
    RESPONSE=$(curl -sf -X POST "$N8N_URL/workflows" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" \
      -H "Content-Type: application/json" \
      -d @"$file" 2>&1)

    if [ $? -eq 0 ]; then
      echo -e "${GREEN}생성 완료${NC}"
      ((SUCCESS_COUNT++))
    else
      echo -e "${RED}생성 실패${NC}"
      ((FAIL_COUNT++))
    fi
  fi
done

echo ""
echo "=== 배포 완료 ==="
echo -e "성공: ${GREEN}${SUCCESS_COUNT}${NC}개"
echo -e "실패: ${RED}${FAIL_COUNT}${NC}개"

if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
fi
