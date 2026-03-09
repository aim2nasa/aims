#!/bin/bash
# deploy_annual_report_api.sh
# Annual Report API 프로세스 재배포 스크립트

set -e  # 오류 발생 시 즉시 종료

PROCESS_NAME="annual_report_api"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIMS_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MAIN_PY="$SCRIPT_DIR/main.py"
VENV_PYTHON="$SCRIPT_DIR/venv/bin/python"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/api.log"

# 로그 디렉토리 생성
mkdir -p "$LOG_DIR"

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

# 1. 기존 프로세스 중지 (강화된 버전)
echo "🚫 기존 프로세스 중지..."

# 방법 1: 포트 8004를 사용하는 프로세스 찾아서 직접 kill
PORT_PID=$(lsof -ti :8004 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
    echo "   포트 8004 사용 중인 프로세스 발견: PID=$PORT_PID"
    kill -9 $PORT_PID 2>/dev/null && echo "   PID $PORT_PID 강제 종료됨" || true
fi

# 방법 2: 패턴 매칭으로 추가 프로세스 종료
pkill -9 -f "python.*main.py.*annual_report" 2>/dev/null || true
pkill -9 -f "venv/bin/python.*main.py" 2>/dev/null || true

# 프로세스 완전 종료 대기
sleep 2

# 종료 확인
REMAINING_PID=$(lsof -ti :8004 2>/dev/null || true)
if [ -n "$REMAINING_PID" ]; then
    echo "⚠️  포트 8004 아직 사용 중: PID=$REMAINING_PID, 재시도..."
    kill -9 $REMAINING_PID 2>/dev/null || true
    sleep 2
fi

# 최종 확인
FINAL_PID=$(lsof -ti :8004 2>/dev/null || true)
if [ -z "$FINAL_PID" ]; then
    echo "   ✅ 기존 프로세스 완전 종료됨"
else
    echo "   ❌ 경고: 포트 8004가 아직 사용 중입니다 (PID=$FINAL_PID)"
    echo "   수동으로 종료 후 다시 시도하세요: kill -9 $FINAL_PID"
    exit 1
fi

# 2. 가상환경 확인 및 의존성 설치 (스마트 빌드)
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

# 3. 환경 변수 확인
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "⚠️  .env 파일이 없습니다!"
    echo "   다음 환경 변수를 설정해주세요:"
    echo "   - MONGO_URI"
    echo "   - DB_NAME"
    echo "   - OPENAI_MODEL"
    exit 1
fi

# 공유 API 키 로드 (.env.shared가 Single Source of Truth)
if [ -f "$AIMS_DIR/.env.shared" ]; then
  export $(cat "$AIMS_DIR/.env.shared" | grep -v '^#' | grep -v '^$' | xargs)
fi

# 4. 새 프로세스 시작 (백그라운드)
echo "🚀 새 프로세스 시작..."
cd "$SCRIPT_DIR"

# .env 파일 로드 + 공유 키 환경변수 전달
OPENAI_API_KEY="$OPENAI_API_KEY" nohup $VENV_PYTHON $MAIN_PY >> "$LOG_FILE" 2>&1 &
PID=$!

# 5. 헬스체크 (자동)
echo "🔍 헬스체크 대기 중..."
sleep 3  # 서버 시작 대기

HEALTH_CHECK=$(curl -s http://localhost:8004/health 2>/dev/null || echo "")
if echo "$HEALTH_CHECK" | grep -q '"status":"healthy"'; then
    echo "✅ Annual Report API 배포 완료: v${VERSION} (${GIT_HASH})"
    echo ""
    echo "📊 프로세스 정보:"
    echo "  PID: $PID"
    echo "  포트: 8004"
    echo "  상태: healthy"
    echo ""
    echo "📖 로그 확인: tail -f $LOG_FILE"
else
    echo "⚠️  헬스체크 실패 - 수동 확인 필요"
    echo "  PID: $PID"
    echo "  응답: $HEALTH_CHECK"
    echo ""
    echo "📖 로그 확인: tail -20 $LOG_FILE"
    tail -20 "$LOG_FILE" 2>/dev/null || true
fi
