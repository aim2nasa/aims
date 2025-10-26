#!/bin/bash
# SSH 터널 종료 스크립트

echo "Closing SSH tunnel..."

# SSH 터널 프로세스 종료
pkill -f "ssh -f -N -L 27017:localhost:27017 tars.giize.com" 2>/dev/null || true

# 임시 파일 정리
rm -f tars.giize.com nul 2>/dev/null || true

echo "SSH tunnel closed"
