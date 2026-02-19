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

# 공유 API 키 로드 (독립 실행 대비 - deploy_all.sh에서 이미 로드됨)
if [ -z "$OPENAI_API_KEY" ] && [ -f "$AIMS_DIR/.env.shared" ]; then
  export $(cat "$AIMS_DIR/.env.shared" | grep -v '^#' | grep -v '^$' | xargs)
fi

# Create virtual environment if not exists
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate and install dependencies
echo "Installing dependencies..."
source "$VENV_DIR/bin/activate"
pip install -q -r requirements.txt

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

echo "=== Deployment complete ==="
