#!/bin/bash
# deploy_pdf_proxy.sh
# PDF Proxy API 배포 스크립트 (PM2 관리)

set -e

PROCESS_NAME="pdf_proxy"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIN_PY="$SCRIPT_DIR/main.py"
VENV_PYTHON="$SCRIPT_DIR/venv/bin/python"
PORT=8002

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

# 1. 가상환경 확인
echo "[1/3] 가상환경 확인..."
if [ ! -f "$VENV_PYTHON" ]; then
    echo "  가상환경 생성 중..."
    cd "$SCRIPT_DIR"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    echo "  가상환경 생성 완료"
else
    echo "  가상환경 확인 완료"
fi

# 2. 기존 nohup 프로세스 정리 (PM2 전환 과도기)
pkill -f "python.*pdf_proxy.*main.py" 2>/dev/null || true

# 3. PM2로 서비스 재시작
echo "[2/3] PM2 서비스 재시작..."
cd "$SCRIPT_DIR"
if pm2 list | grep -q "$PROCESS_NAME"; then
    pm2 restart "$PROCESS_NAME"
else
    pm2 start "$MAIN_PY" --name "$PROCESS_NAME" --interpreter "$VENV_PYTHON"
    pm2 save
fi

# 4. 상태 확인
echo "[3/3] 서비스 상태 확인..."
pm2 status "$PROCESS_NAME"

echo "========================================="
echo "  PDF Proxy API 배포 완료: v${VERSION} (${GIT_HASH})"
echo "========================================="
echo ""
echo "  포트: $PORT"
echo "  헬스체크: curl http://localhost:$PORT/health"
echo "  로그: pm2 logs $PROCESS_NAME"
