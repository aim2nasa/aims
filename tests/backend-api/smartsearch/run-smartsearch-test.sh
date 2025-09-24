#!/bin/bash

# AIMS SmartSearch Webhook 자동화 테스트 실행 스크립트

echo "🚀 AIMS SmartSearch 자동화 테스트 시작"
echo "================================="

# 현재 디렉토리 확인
if [ ! -f "smartsearch-automation.test.js" ]; then
    echo "❌ 테스트 파일을 찾을 수 없습니다. tests 디렉토리에서 실행하세요."
    exit 1
fi

# Node.js 의존성 확인
if [ ! -d "node_modules" ]; then
    echo "📦 의존성 설치 중..."
    npm install
fi

# 테스트 실행
echo "🔧 테스트 환경 체크..."
echo "- MongoDB: mongodb://tars:27017/"
echo "- Webhook: https://n8nd.giize.com/webhook/smartsearch"
echo ""

echo "🧪 테스트 실행 시작..."
node smartsearch-automation.test.js

TEST_RESULT=$?

echo ""
echo "================================="
if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ 테스트 성공!"
else
    echo "❌ 테스트 실패!"
fi

exit $TEST_RESULT