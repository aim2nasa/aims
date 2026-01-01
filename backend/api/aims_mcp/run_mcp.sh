#!/bin/bash
# AIMS MCP Server - stdio mode launcher for Claude Desktop
# Usage: ssh user@host /path/to/run_mcp.sh

cd /home/rossi/aims/backend/api/aims_mcp

# 환경변수 로드
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# MongoDB 연결 (기본값)
export MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017/docupload}"

# stdio 모드 (기본)
export MCP_MODE="stdio"

# 사용자 ID 설정 (Claude Desktop에서 전달받거나 기본값 사용)
# - 환경변수로 전달: USER_ID=xxx ./run_mcp.sh
# - 기본값: 곽승철 계정
export USER_ID="${USER_ID:-694f9415a0f94f0a13f49894}"

# JWT Secret
export JWT_SECRET="${JWT_SECRET:-aims-jwt-secret-2024}"

# 실행
exec node dist/index.js
