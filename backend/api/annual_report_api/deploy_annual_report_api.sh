#!/bin/bash
# deploy_annual_report_api.sh
# Annual Report API 프로세스 재배포 스크립트 (PM2 관리)

set -e  # 오류 발생 시 즉시 종료

PROCESS_NAME="annual_report_api"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIMS_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
VENV_PYTHON="$SCRIPT_DIR/venv/bin/python"

# 버전 정보 가져오기
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VERSION=$(cat "$SCRIPT_DIR/VERSION" 2>/dev/null || echo "0.0.0")

echo "========================================="
echo "  Annual Report API 배포"
echo "  Version: v${VERSION} (${GIT_HASH})"
echo "  Build Time: ${BUILD_TIME}"
echo "========================================="

# 빌드 정보 파일 생성
cat > "$SCRIPT_DIR/_build_info.json" << EOF
{
  "gitHash": "${GIT_HASH}",
  "buildTime": "${BUILD_TIME}"
}
EOF

# 1. 가상환경 확인 및 의존성 설치 (스마트 빌드)
HASH_FILE="$SCRIPT_DIR/.requirements_hash"
CURRENT_HASH=$(md5sum "$SCRIPT_DIR/requirements.txt" 2>/dev/null | cut -d' ' -f1)
PREVIOUS_HASH=""
if [ -f "$HASH_FILE" ]; then
    PREVIOUS_HASH=$(cat "$HASH_FILE")
fi

if [ ! -f "$VENV_PYTHON" ]; then
    echo "가상환경 생성 중..."
    cd "$SCRIPT_DIR"
    python3 -m venv venv
    source venv/bin/activate
    if command -v uv &> /dev/null; then uv pip install -q -r requirements.txt; else pip install -q -r requirements.txt; fi
    echo "$CURRENT_HASH" > "$HASH_FILE"
    echo "가상환경 생성 완료"
elif [ "$CURRENT_HASH" != "$PREVIOUS_HASH" ]; then
    echo "의존성 업데이트 중..."
    source "$SCRIPT_DIR/venv/bin/activate"
    if command -v uv &> /dev/null; then uv pip install -q -r requirements.txt; else pip install -q -r requirements.txt; fi
    echo "$CURRENT_HASH" > "$HASH_FILE"
    echo "의존성 업데이트 완료"
else
    echo "가상환경 확인 완료 (변경 없음)"
fi

# 2. 환경 변수 확인
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "⚠️  .env 파일이 없습니다!"
    exit 1
fi

# 공유 API 키 로드 (.env.shared가 Single Source of Truth)
# Phase 4-E: UPSTAGE_API_KEY도 .env.shared에서 SSoT로 관리
OPENAI_KEY=""
INTERNAL_KEY=""
UPSTAGE_KEY=""
if [ -f "$AIMS_DIR/.env.shared" ]; then
  OPENAI_KEY=$(grep "^OPENAI_API_KEY=" "$AIMS_DIR/.env.shared" | cut -d= -f2-)
  INTERNAL_KEY=$(grep "^INTERNAL_API_KEY=" "$AIMS_DIR/.env.shared" | cut -d= -f2-)
  UPSTAGE_KEY=$(grep "^UPSTAGE_API_KEY=" "$AIMS_DIR/.env.shared" | cut -d= -f2-)
fi

# UPSTAGE_API_KEY 누락 경고 (이미지 PDF 라우팅이 실패하므로 치명적)
if [ -z "$UPSTAGE_KEY" ]; then
  echo "⚠️  UPSTAGE_API_KEY가 .env.shared에 없습니다."
  echo "   이미지 PDF (텍스트 레이어 없음) 파싱이 실패합니다."
  echo "   ~/aims/.env.shared에 UPSTAGE_API_KEY=up_... 를 추가하세요."
fi

# 3. ecosystem.config.cjs 생성 (API 키 주입)
# - env 값은 Python 리터럴로 안전하게 직렬화 (따옴표/특수문자 대응)
AIMS_SCRIPT_DIR="$SCRIPT_DIR" \
AIMS_OPENAI_KEY="$OPENAI_KEY" \
AIMS_INTERNAL_KEY="$INTERNAL_KEY" \
AIMS_UPSTAGE_KEY="$UPSTAGE_KEY" \
python3 <<'PYEOF'
import json
import os

script_dir = os.environ["AIMS_SCRIPT_DIR"]
env_block = {
    "OPENAI_API_KEY": os.environ.get("AIMS_OPENAI_KEY", ""),
    "INTERNAL_API_KEY": os.environ.get("AIMS_INTERNAL_KEY", ""),
    "UPSTAGE_API_KEY": os.environ.get("AIMS_UPSTAGE_KEY", ""),
}

content = (
    "module.exports = {\n"
    "  apps: [{\n"
    '    name: "annual_report_api",\n'
    '    script: "venv/bin/uvicorn",\n'
    '    args: "main:app --host 0.0.0.0 --port 8004",\n'
    '    interpreter: "venv/bin/python",\n'
    f'    cwd: {json.dumps(script_dir)},\n'
    f'    env: {json.dumps(env_block, ensure_ascii=False)}\n'
    "  }]\n"
    "};\n"
)

with open(os.path.join(script_dir, "ecosystem.config.cjs"), "w", encoding="utf-8") as f:
    f.write(content)
PYEOF

# 4. PM2 재시작
echo "🚀 PM2 프로세스 재시작..."
cd "$SCRIPT_DIR"

if pm2 describe "$PROCESS_NAME" > /dev/null 2>&1; then
    pm2 delete "$PROCESS_NAME" 2>/dev/null || true
fi

pm2 start ecosystem.config.cjs
pm2 save

# 5. 헬스체크
echo "🔍 헬스체크 대기 중..."
sleep 3

HEALTH_CHECK=$(curl -s http://localhost:8004/health 2>/dev/null || echo "")
if echo "$HEALTH_CHECK" | grep -q '"status":"healthy"'; then
    echo "✅ Annual Report API 배포 완료: v${VERSION} (${GIT_HASH})"
    echo "   포트: 8004 | 관리: pm2 logs annual_report_api"
else
    echo "⚠️  헬스체크 실패 - 수동 확인 필요"
    echo "  응답: $HEALTH_CHECK"
    pm2 logs "$PROCESS_NAME" --lines 20 --nostream
fi
