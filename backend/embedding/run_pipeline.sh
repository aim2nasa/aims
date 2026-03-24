#!/bin/bash
# 임베딩 파이프라인 실행 래퍼 (크론 + 수동 실행 모두 로그 기록)
set -a
source /home/rossi/aims/.env.shared
set +a

LOG_FILE="/home/rossi/logs/embedding_pipeline.log"
mkdir -p "$(dirname "$LOG_FILE")"

cd /home/rossi/aims/backend/embedding
/home/rossi/aims/venv/bin/python full_pipeline.py 2>&1 | tee -a "$LOG_FILE"
