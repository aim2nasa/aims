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
OPENAI_KEY=""
if [ -f "$AIMS_DIR/.env.shared" ]; then
  OPENAI_KEY=$(grep "^OPENAI_API_KEY=" "$AIMS_DIR/.env.shared" | cut -d= -f2-)
fi

# 3. ecosystem.config.cjs 생성 (OPENAI_API_KEY 주입)
python3 -c "
key = '$OPENAI_KEY'
content = 'module.exports = {\n'
content += '  apps: [{\n'
content += '    name: \"annual_report_api\",\n'
content += '    script: \"venv/bin/uvicorn\",\n'
content += '    args: \"main:app --host 0.0.0.0 --port 8004\",\n'
content += '    interpreter: \"venv/bin/python\",\n'
content += '    cwd: \"$SCRIPT_DIR\",\n'
content += '    env: {\n'
content += '      OPENAI_API_KEY: \"' + key + '\"\n'
content += '    }\n'
content += '  }]\n'
content += '};\n'
with open('$SCRIPT_DIR/ecosystem.config.cjs', 'w') as f:
    f.write(content)
"

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
