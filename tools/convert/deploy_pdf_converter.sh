#!/bin/bash
# deploy_pdf_converter.sh
# PDF Converter 서비스 배포 스크립트
# 사용법: ./deploy_pdf_converter.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROCESS_NAME="pdf_converter"
MAIN_JS="server.js"
PORT=8005

echo "=========================================="
echo "PDF Converter 배포"
echo "=========================================="

# 1. 의존성 확인
if [ ! -d "node_modules" ]; then
    echo "[1/3] 의존성 설치..."
    npm install --silent
else
    echo "[1/3] 의존성 확인 완료"
fi

# 2. PM2로 서비스 재시작
echo "[2/3] PM2 서비스 재시작..."
if pm2 list | grep -q "$PROCESS_NAME"; then
    pm2 restart "$PROCESS_NAME"
else
    pm2 start "$MAIN_JS" --name "$PROCESS_NAME"
    pm2 save
fi

# 3. 상태 확인
echo "[3/3] 서비스 상태 확인..."
pm2 status "$PROCESS_NAME"

echo "=========================================="
echo "PDF Converter 배포 완료"
echo "=========================================="
echo ""
echo "테스트:"
echo "  curl http://localhost:$PORT/health"
echo "  curl http://localhost:$PORT/formats"
