#!/bin/bash
# 임베딩 파이프라인 실행 래퍼 (크론에서 호출)
set -a
source /home/rossi/aims/.env.shared
set +a

cd /home/rossi/aims/backend/embedding
/home/rossi/aims/venv/bin/python full_pipeline.py
