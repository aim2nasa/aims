#!/bin/bash
# Document Pipeline Deployment Script

set -e

SERVICE_NAME="document_pipeline"
SERVICE_DIR="/home/rossi/aims/backend/api/document_pipeline"
VENV_DIR="$SERVICE_DIR/venv"
AIMS_DIR="/home/rossi/aims"
PORT=8100

echo "=== Deploying $SERVICE_NAME ==="

cd "$SERVICE_DIR"

# 이전 smoke_test 프로세스 정리
pkill -f "smoke_test.py" 2>/dev/null || true

# 공유 API 키 로드 (독립 실행 대비 - deploy_all.sh에서 이미 로드됨)
if [ -z "$OPENAI_API_KEY" ] && [ -f "$AIMS_DIR/.env.shared" ]; then
  export $(cat "$AIMS_DIR/.env.shared" | grep -v '^#' | grep -v '^$' | xargs)
fi

# Create virtual environment if not exists
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate and install dependencies (uv + 해시 비교)
source "$VENV_DIR/bin/activate"
REQ_HASH=$(md5sum requirements.txt | cut -d' ' -f1)
SAVED_HASH=$(cat .requirements_hash 2>/dev/null || echo "")
if [ "$REQ_HASH" != "$SAVED_HASH" ]; then
    echo "Installing dependencies (requirements.txt changed)..."
    if command -v uv &> /dev/null; then
        uv pip install -q -r requirements.txt
    else
        pip install -q -r requirements.txt
    fi
    echo "$REQ_HASH" > .requirements_hash
else
    echo "requirements.txt unchanged, skipping pip install"
fi

# Stop existing process
echo "Stopping existing process..."
pm2 delete "$SERVICE_NAME" 2>/dev/null || true

# Start with PM2 (OPENAI_API_KEY를 환경변수로 전달)
echo "Starting $SERVICE_NAME on port $PORT..."
OPENAI_API_KEY="$OPENAI_API_KEY" pm2 start "$VENV_DIR/bin/uvicorn" \
    --name "$SERVICE_NAME" \
    --cwd "$SERVICE_DIR" \
    --interpreter "$VENV_DIR/bin/python" \
    -- main:app --host 0.0.0.0 --port $PORT

pm2 save

# Health check
sleep 3
if curl -s "http://localhost:$PORT/health" | grep -q "healthy"; then
    echo "✅ $SERVICE_NAME is running on port $PORT"
else
    echo "❌ Health check failed"
    pm2 logs "$SERVICE_NAME" --lines 20
    exit 1
fi

# Smoke test (경고만, 배포는 계속 진행)
if [ -f "$SERVICE_DIR/tests/smoke_test.py" ]; then
    echo ""
    echo "🔍 Running smoke test (--skip-ocr)..."
    timeout 60 "$VENV_DIR/bin/python" "$SERVICE_DIR/tests/smoke_test.py" --skip-ocr --timeout 30 || {
        echo "⚠️  Smoke test failed (non-blocking)"
    }
fi

echo "=== Deployment complete ==="
