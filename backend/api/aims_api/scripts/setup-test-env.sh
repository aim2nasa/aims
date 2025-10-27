#!/bin/bash
# SSH 터널 설정 스크립트

echo "Checking MongoDB connection..."

# MongoDB 연결 테스트 (크로스 플랫폼)
if mongosh --host localhost:27017 --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1 || \
   mongo --host localhost:27017 --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1 || \
   nc -z localhost 27017 >/dev/null 2>&1; then
    echo "MongoDB connection already available on port 27017"
else
    echo "Setting up SSH tunnel to MongoDB..."
    # SSH 터널 시작
    ssh -f -N -L 27017:localhost:27017 tars.giize.com
    sleep 2
    echo "SSH tunnel established (localhost:27017 -> tars.giize.com:27017)"
fi

# MongoDB URI 설정
export MONGO_URI=mongodb://localhost:27017
