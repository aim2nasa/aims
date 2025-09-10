#!/bin/bash

# React Cache Clear Script
# React 캐시 문제 해결을 위한 자동 정리 스크립트

echo "🧹 React 캐시 정리 시작..."

# 1. 모든 React 프로세스 종료
echo "📱 React 프로세스 종료 중..."
pkill -f "react-scripts" 2>/dev/null || true
pkill -f "node.*start" 2>/dev/null || true

# 2. 캐시 디렉토리 삭제
echo "🗑️  캐시 파일 삭제 중..."
rm -rf node_modules/.cache 2>/dev/null || true
rm -rf .parcel-cache 2>/dev/null || true
rm -rf build 2>/dev/null || true

# 3. 임시 파일 정리
echo "🧽 임시 파일 정리 중..."
rm -rf .eslintcache 2>/dev/null || true
rm -rf *.log 2>/dev/null || true

echo "✅ 캐시 정리 완료!"
echo "🚀 새로운 개발 서버 시작..."

# 4. 새 서버 시작
PORT=3005 npm start