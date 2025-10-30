#!/bin/bash

###############################################################################
# aims_api userId 필터링 테스트 스크립트
#
# 실행 방법:
#   bash test_userid_filter.sh
###############################################################################

API_URL="http://tars.giize.com:3010"

echo "========================================"
echo "AIMS API userId 필터링 테스트"
echo "========================================"
echo ""

# 테스트 1: GET /api/documents (userId 없음)
echo "[1/4] GET /api/documents (userId 없음 - 400 에러 예상)"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "${API_URL}/api/documents")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

if [ "$HTTP_CODE" = "400" ]; then
  echo "  ✅ 400 에러 반환 (정상)"
  echo "  응답: $BODY"
else
  echo "  ❌ 예상과 다름: HTTP $HTTP_CODE"
  echo "  응답: $BODY"
fi
echo ""

# 테스트 2: GET /api/documents (userId=tester)
echo "[2/4] GET /api/documents?userId=tester (성공 예상)"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "${API_URL}/api/documents?userId=tester&limit=5")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✅ 200 성공 (정상)"
  # documents 개수 확인
  DOC_COUNT=$(echo "$BODY" | grep -o '"documents":\[' | wc -l)
  echo "  문서 배열 존재: $DOC_COUNT"
else
  echo "  ❌ 예상과 다름: HTTP $HTTP_CODE"
  echo "  응답: $BODY"
fi
echo ""

# 테스트 3: GET /api/customers (userId 없음)
echo "[3/4] GET /api/customers (userId 없음 - 400 에러 예상)"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "${API_URL}/api/customers")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

if [ "$HTTP_CODE" = "400" ]; then
  echo "  ✅ 400 에러 반환 (정상)"
  echo "  응답: $BODY"
else
  echo "  ❌ 예상과 다름: HTTP $HTTP_CODE"
  echo "  응답: $BODY"
fi
echo ""

# 테스트 4: GET /api/customers (userId=tester)
echo "[4/4] GET /api/customers?userId=tester (성공 예상)"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "${API_URL}/api/customers?userId=tester&limit=5")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

if [ "$HTTP_CODE" = "200" ]; then
  echo "  ✅ 200 성공 (정상)"
else
  echo "  ❌ 예상과 다름: HTTP $HTTP_CODE"
  echo "  응답: $BODY"
fi
echo ""

echo "========================================"
echo "테스트 완료"
echo "========================================"
