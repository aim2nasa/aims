#!/bin/bash
# n8n 워크플로우 자동 배포 스크립트
# 사용법: ./deploy_n8n_workflows.sh
#
# 환경변수:
#   N8N_API_KEY - n8n API 키 (필수)

# set -e  # 개별 오류 핸들링 사용

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

# Git commit hash 수집
AIMS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOYED_VERSIONS_FILE="/data/backup/.n8n_deployed_versions.json"

# 기존 배포 버전 파일 읽기 (없으면 빈 객체)
if [ -f "$DEPLOYED_VERSIONS_FILE" ]; then
  DEPLOYED_VERSIONS=$(cat "$DEPLOYED_VERSIONS_FILE")
else
  DEPLOYED_VERSIONS="{}"
fi

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

  # 기존 워크플로우 ID 찾기 (동일 이름이 여러개면 첫번째 사용)
  WORKFLOW_ID=$(echo "$EXISTING_WORKFLOWS" | jq -r --arg name "$WORKFLOW_NAME" '[.data[] | select(.name == $name) | .id][0] // empty')

  # Git 커밋 해시 추출
  RELATIVE_PATH="${file#$AIMS_DIR/}"
  GIT_HASH=$(cd "$AIMS_DIR" && git log -1 --format="%h" -- "$RELATIVE_PATH" 2>/dev/null || echo "unknown")
  GIT_HASH_FULL=$(cd "$AIMS_DIR" && git log -1 --format="%H" -- "$RELATIVE_PATH" 2>/dev/null || echo "unknown")
  GIT_DATE=$(cd "$AIMS_DIR" && git log -1 --format="%ci" -- "$RELATIVE_PATH" 2>/dev/null || echo "unknown")
  DEPLOY_TIME=$(date '+%Y-%m-%d %H:%M:%S')

  # Sticky Note 노드 내용 (Git 정보 표시)
  STICKY_CONTENT="## 🔖 Git Version Info\n\n**Commit:** ${GIT_HASH}\n**Full:** ${GIT_HASH_FULL}\n**Committed:** ${GIT_DATE}\n**Deployed:** ${DEPLOY_TIME}"

  # 임시 파일에 필터링된 JSON 저장
  # 1) Sticky Note로 시각적 표시 + 2) staticData에 프로그래밍 접근용 저장
  TEMP_JSON=$(mktemp)
  if ! jq --arg content "$STICKY_CONTENT" \
          --arg hash "$GIT_HASH" \
          --arg hashFull "$GIT_HASH_FULL" \
          --arg gitDate "$GIT_DATE" \
          --arg deployTime "$DEPLOY_TIME" '
    del(.id, .versionId, .meta, .tags, .pinData, .active, .isArchived, .settings.callerPolicy) |
    .staticData = {
      "git": {
        "commit": $hash,
        "commitFull": $hashFull,
        "committedAt": $gitDate,
        "deployedAt": $deployTime
      }
    } |
    .nodes = [(.nodes // [])[] | select(.name != "Git Version Info")] + [{
      "parameters": { "content": $content, "height": 180, "width": 280 },
      "type": "n8n-nodes-base.stickyNote",
      "typeVersion": 1,
      "position": [-600, -400],
      "id": "git-version-info",
      "name": "Git Version Info"
    }]
  ' "$file" > "$TEMP_JSON" 2>/dev/null; then
    echo -e "${RED}JSON 필터링 실패${NC}"
    ((FAIL_COUNT++))
    rm -f "$TEMP_JSON"
    continue
  fi

  if [ -n "$WORKFLOW_ID" ] && [ "$WORKFLOW_ID" != "null" ]; then
    # 기존 워크플로우 업데이트
    RESPONSE=$(curl -s -X PUT "$N8N_URL/workflows/$WORKFLOW_ID" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" \
      -H "Content-Type: application/json" \
      -d @"$TEMP_JSON" 2>&1)

    if [ -z "$RESPONSE" ]; then
      echo -e "${RED}업데이트 실패 (빈 응답)${NC}"
      ((FAIL_COUNT++))
    elif echo "$RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
      # 배포된 파일의 git commit hash 기록
      RELATIVE_PATH="${file#$AIMS_DIR/}"
      GIT_HASH=$(cd "$AIMS_DIR" && git log -1 --format="%h" -- "$RELATIVE_PATH" 2>/dev/null || echo "unknown")
      DEPLOYED_VERSIONS=$(echo "$DEPLOYED_VERSIONS" | jq --arg name "$WORKFLOW_NAME" --arg hash "$GIT_HASH" --arg time "$(date -Iseconds)" \
        '. + {($name): {"gitCommit": $hash, "deployedAt": $time}}')
      echo -e "${GREEN}업데이트 완료 ($GIT_HASH)${NC}"
      ((SUCCESS_COUNT++))
    else
      echo -e "${RED}업데이트 실패${NC}"
      echo "  응답: ${RESPONSE:0:200}"
      ((FAIL_COUNT++))
    fi
  else
    # 새 워크플로우 생성
    RESPONSE=$(curl -s -X POST "$N8N_URL/workflows" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" \
      -H "Content-Type: application/json" \
      -d @"$TEMP_JSON" 2>&1)

    if [ -z "$RESPONSE" ]; then
      echo -e "${RED}생성 실패 (빈 응답)${NC}"
      ((FAIL_COUNT++))
    elif echo "$RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
      # 배포된 파일의 git commit hash 기록
      RELATIVE_PATH="${file#$AIMS_DIR/}"
      GIT_HASH=$(cd "$AIMS_DIR" && git log -1 --format="%h" -- "$RELATIVE_PATH" 2>/dev/null || echo "unknown")
      DEPLOYED_VERSIONS=$(echo "$DEPLOYED_VERSIONS" | jq --arg name "$WORKFLOW_NAME" --arg hash "$GIT_HASH" --arg time "$(date -Iseconds)" \
        '. + {($name): {"gitCommit": $hash, "deployedAt": $time}}')
      echo -e "${GREEN}생성 완료 ($GIT_HASH)${NC}"
      ((SUCCESS_COUNT++))
    else
      echo -e "${RED}생성 실패${NC}"
      echo "  응답: ${RESPONSE:0:200}"
      ((FAIL_COUNT++))
    fi
  fi

  rm -f "$TEMP_JSON"
done

echo ""
echo "=== 배포 완료 ==="
echo -e "성공: ${GREEN}${SUCCESS_COUNT}${NC}개"
echo -e "실패: ${RED}${FAIL_COUNT}${NC}개"

# 배포된 버전 정보 저장
if [ $SUCCESS_COUNT -gt 0 ]; then
  echo "$DEPLOYED_VERSIONS" > "$DEPLOYED_VERSIONS_FILE"
  echo ""
  echo "배포 버전 기록: $DEPLOYED_VERSIONS_FILE"
fi

if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
fi
