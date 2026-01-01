#!/bin/bash
# AIMS MCP Server - stdio mode launcher for Claude Desktop
# Usage: ssh user@host /path/to/run_mcp.sh

cd /home/rossi/aims/backend/api/aims_mcp

# 환경변수 로드 (.env에서 DB 설정만 가져옴)
if [ -f .env ]; then
  # MCP_MODE는 제외하고 로드 (stdio 모드 강제)
  export $(grep -v '^#' .env | grep -v 'MCP_MODE' | xargs)
fi

# MongoDB 연결 (기본값)
export MONGODB_URI="${MONGO_URI:-mongodb://localhost:27017/}"
export DB_NAME="${DB_NAME:-docupload}"

# stdio 모드 강제 (Claude Desktop용)
export MCP_MODE="stdio"

# 사용자 ID 설정 (Claude Desktop에서 전달받거나 기본값 사용)
# - 환경변수로 전달: USER_ID=xxx ./run_mcp.sh
# - 기본값: 곽승철 계정
export USER_ID="${USER_ID:-694f9415a0f94f0a13f49894}"

# 로깅 (디버그용)
echo "[run_mcp.sh] Starting stdio mode - User: $USER_ID" >&2

# 실행
exec node dist/index.js
