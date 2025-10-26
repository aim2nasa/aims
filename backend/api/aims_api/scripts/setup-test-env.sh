#!/bin/bash
# SSH 터널 설정 스크립트

echo "Setting up SSH tunnel to MongoDB..."

# 기존 터널이 있는지 확인
if lsof -ti:27017 >/dev/null 2>&1; then
    echo "Port 27017 already in use (SSH tunnel may already exist)"
else
    # SSH 터널 시작
    ssh -f -N -L 27017:localhost:27017 tars.giize.com
    sleep 2
    echo "SSH tunnel established (localhost:27017 -> tars.giize.com:27017)"
fi

# MongoDB URI 설정
export MONGO_URI=mongodb://localhost:27017
