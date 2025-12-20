#!/bin/bash
# deploy_pdf_proxy.sh
# PDF Proxy API 프로세스 재배포 스크립트

set -e  # 오류 발생 시 즉시 종료

PROCESS_NAME="pdf_proxy"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
echo "  PDF Proxy API 배포"
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

# 1. 기존 프로세스 중지
echo "🚫 기존 프로세스 중지..."
pkill -f "python.*$MAIN_PY" 2>/dev/null && echo "   기존 프로세스 종료됨" || echo "   실행 중인 프로세스 없음"

# 잠시 대기 (프로세스 완전 종료 대기)
sleep 2

# 2. 가상환경 확인
if [ ! -f "$VENV_PYTHON" ]; then
    echo "⚠️  가상환경이 없습니다. 생성 중..."
    cd "$SCRIPT_DIR"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    echo "✅ 가상환경 생성 완료"
else
    echo "✅ 가상환경 확인 완료"
fi

# 3. 새 프로세스 시작 (백그라운드)
echo "🚀 새 프로세스 시작..."
cd "$SCRIPT_DIR"

nohup $VENV_PYTHON $MAIN_PY >> "$LOG_FILE" 2>&1 &
PID=$!

echo "✅ PDF Proxy API 배포 완료: v${VERSION} (${GIT_HASH})"
echo ""
echo "📊 프로세스 정보:"
echo "  PID: $PID"
echo "  포트: 8002"
echo ""
echo "📖 로그 확인:"
echo "  tail -f $LOG_FILE"
echo ""
echo "📊 상태 확인:"
echo "  ps aux | grep python | grep $MAIN_PY"
echo ""
echo "🌍 헬스체크:"
echo "  curl http://localhost:8002/health"
echo ""
echo "🛑 프로세스 종료:"
echo "  pkill -f 'python.*$MAIN_PY'"
