#!/bin/bash
# n8n 워크플로우 Pull 스크립트
# n8n에서 워크플로우를 가져와서 git repo에 저장
#
# 사용법: ./pull_n8n_workflows.sh
#
# 환경변수:
#   N8N_API_KEY - n8n API 키 (필수)

# 설정
N8N_URL="https://n8nd.giize.com/api/v1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# API 키 확인
if [ -z "$N8N_API_KEY" ]; then
  echo -e "${RED}오류: N8N_API_KEY 환경변수가 설정되지 않았습니다${NC}"
  echo "사용법: N8N_API_KEY=your-key ./pull_n8n_workflows.sh"
  exit 1
fi

# jq 설치 확인
if ! command -v jq &> /dev/null; then
  echo -e "${RED}오류: jq가 설치되어 있지 않습니다${NC}"
  exit 1
fi

echo "=== n8n 워크플로우 Pull 시작 ==="
echo ""

# 워크플로우 이름 → 파일 경로 매핑
declare -A WORKFLOW_MAP
WORKFLOW_MAP["DocPrepMain"]="$SCRIPT_DIR/DocPrepMain.json"
WORKFLOW_MAP["DocMeta"]="$SCRIPT_DIR/modules/DocMeta.json"
WORKFLOW_MAP["DocOCR"]="$SCRIPT_DIR/modules/DocOCR.json"
WORKFLOW_MAP["DocReadAI"]="$SCRIPT_DIR/modules/DocReadAI.json"
WORKFLOW_MAP["DocSummary"]="$SCRIPT_DIR/modules/DocSummary.json"
WORKFLOW_MAP["DocUpload"]="$SCRIPT_DIR/modules/DocUpload.json"
WORKFLOW_MAP["ErrorLogger"]="$SCRIPT_DIR/modules/ErrorLogger.json"
WORKFLOW_MAP["OCRWorker"]="$SCRIPT_DIR/modules/OCRWorker.json"
WORKFLOW_MAP["SmartSearch"]="$SCRIPT_DIR/modules/SmartSearch.json"

# 기존 워크플로우 목록 가져오기
echo "n8n 워크플로우 목록 조회 중..."
WORKFLOWS=$(curl -sf -X GET "$N8N_URL/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" 2>/dev/null)

if [ -z "$WORKFLOWS" ]; then
  echo -e "${RED}오류: n8n API 응답이 비어있습니다${NC}"
  exit 1
fi

SUCCESS_COUNT=0
FAIL_COUNT=0
CHANGED_COUNT=0

for name in "${!WORKFLOW_MAP[@]}"; do
  file="${WORKFLOW_MAP[$name]}"

  echo -n "Pull 중: $name ... "

  # 워크플로우 ID 찾기
  WORKFLOW_ID=$(echo "$WORKFLOWS" | jq -r --arg name "$name" '[.data[] | select(.name == $name) | .id][0] // empty')

  if [ -z "$WORKFLOW_ID" ] || [ "$WORKFLOW_ID" = "null" ]; then
    echo -e "${YELLOW}n8n에 없음 (건너뜀)${NC}"
    continue
  fi

  # 워크플로우 상세 정보 가져오기
  WORKFLOW_JSON=$(curl -sf -X GET "$N8N_URL/workflows/$WORKFLOW_ID" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" 2>/dev/null)

  if [ -z "$WORKFLOW_JSON" ]; then
    echo -e "${RED}API 응답 실패${NC}"
    ((FAIL_COUNT++))
    continue
  fi

  # JSON 정리 (배포 시 추가되는 필드 제거)
  # - id, versionId: n8n 내부 ID
  # - staticData.git: 배포 시 자동 추가
  # - "Git Version Info" Sticky Note: 배포 시 자동 추가
  # - active, updatedAt, createdAt: 런타임 상태
  CLEANED_JSON=$(echo "$WORKFLOW_JSON" | jq '
    del(.id, .versionId, .active, .updatedAt, .createdAt) |
    if .staticData.git then .staticData = (.staticData | del(.git)) else . end |
    if (.staticData | keys | length) == 0 then del(.staticData) else . end |
    .nodes = [.nodes[] | select(.name != "Git Version Info")]
  ')

  if [ -z "$CLEANED_JSON" ]; then
    echo -e "${RED}JSON 정리 실패${NC}"
    ((FAIL_COUNT++))
    continue
  fi

  # 디렉토리 확인
  mkdir -p "$(dirname "$file")"

  # 기존 파일과 비교
  if [ -f "$file" ]; then
    # 기존 파일도 같은 방식으로 정규화해서 비교
    OLD_NORMALIZED=$(cat "$file" | jq -S '.')
    NEW_NORMALIZED=$(echo "$CLEANED_JSON" | jq -S '.')

    if [ "$OLD_NORMALIZED" = "$NEW_NORMALIZED" ]; then
      echo -e "${CYAN}변경 없음${NC}"
      ((SUCCESS_COUNT++))
      continue
    fi
  fi

  # 파일 저장
  echo "$CLEANED_JSON" | jq '.' > "$file"

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}저장 완료${NC}"
    ((SUCCESS_COUNT++))
    ((CHANGED_COUNT++))
  else
    echo -e "${RED}저장 실패${NC}"
    ((FAIL_COUNT++))
  fi
done

echo ""
echo "=== Pull 완료 ==="
echo -e "성공: ${GREEN}${SUCCESS_COUNT}${NC}개"
echo -e "변경: ${CYAN}${CHANGED_COUNT}${NC}개"
echo -e "실패: ${RED}${FAIL_COUNT}${NC}개"

if [ $CHANGED_COUNT -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}변경된 파일이 있습니다. git diff로 확인하세요:${NC}"
  echo "  git diff backend/n8n_flows/"
fi

if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
fi
