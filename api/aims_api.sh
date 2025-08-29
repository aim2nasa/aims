#!/bin/bash
# aims_api.sh - AIMS API 서버 실행 스크립트 (문서 + 고객 관리)

PORT=3010
export PORT   # 🔑 환경변수 지정

# 로그 디렉토리 생성
LOG_DIR="./logs"
mkdir -p $LOG_DIR

# 실행 (백그라운드)
nohup node server.js > $LOG_DIR/server.out 2> $LOG_DIR/server.err < /dev/null &

# PID 저장
echo $! > $LOG_DIR/server.pid

echo "✅ AIMS API 서버가 포트 $PORT에서 백그라운드 실행됨"
echo "   로그: $LOG_DIR/server.out"
echo "   에러: $LOG_DIR/server.err"
echo "   PID:  $(cat $LOG_DIR/server.pid)"

