#!/bin/bash
# Redis Consumer Groups 자동 생성 스크립트
#
# 사용법:
#   ./init-redis-consumer-groups.sh
#
# 시스템 재시작 시 실행하여 필수 Consumer Groups를 생성합니다.

set -e

echo "🔧 Redis Consumer Groups 초기화 시작..."
echo ""

# Redis 연결 확인
if ! redis-cli ping > /dev/null 2>&1; then
    echo "❌ Redis 서버에 연결할 수 없습니다."
    echo "   Redis가 실행 중인지 확인하세요: docker ps | grep redis"
    exit 1
fi

echo "✅ Redis 연결 확인 완료"
echo ""

# OCR Consumer Group 생성
echo "📦 OCR Consumer Group 생성 중..."
if redis-cli XGROUP CREATE ocr_stream ocr_consumer_group 0 MKSTREAM 2>&1 | grep -q "OK"; then
    echo "   ✅ ocr_consumer_group 생성 완료"
elif redis-cli XGROUP CREATE ocr_stream ocr_consumer_group 0 MKSTREAM 2>&1 | grep -q "BUSYGROUP"; then
    echo "   ℹ️  ocr_consumer_group 이미 존재함"
else
    echo "   ⚠️  ocr_consumer_group 생성 실패"
fi

# 향후 추가될 Consumer Groups (주석 처리)
# echo "📦 DocEmbed Consumer Group 생성 중..."
# redis-cli XGROUP CREATE docembed_stream docembed_consumer_group 0 MKSTREAM 2>&1 | grep -v "BUSYGROUP" || true

# echo "📦 Tagging Consumer Group 생성 중..."
# redis-cli XGROUP CREATE tagging_stream tagging_consumer_group 0 MKSTREAM 2>&1 | grep -v "BUSYGROUP" || true

echo ""
echo "✅ Consumer Groups 초기화 완료"
echo ""

# 상태 확인
echo "📊 현재 Consumer Groups 상태:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if redis-cli XINFO GROUPS ocr_stream > /dev/null 2>&1; then
    echo ""
    echo "🔹 ocr_stream:"
    redis-cli XINFO GROUPS ocr_stream | head -20
else
    echo "⚠️  ocr_stream 정보를 가져올 수 없습니다."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ 초기화 스크립트 실행 완료"
