#!/bin/bash
# Qdrant customer_id 동기화 통합 테스트 (간소화 버전)

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }

API_URL="http://localhost:3010/api"

DOC_ID="69168cc787ee81782a90d6a0"
CUSTOMER_A="69168cc787ee81782a90d6a1"
CUSTOMER_B="69168cc787ee81782a90d6a2"

check_qdrant_customer_id() {
    local expected=$1
    local result=$(docker run --rm --network host python:3.11-slim sh -c "
        pip install -q qdrant-client >/dev/null 2>&1 && python3 -c \"
from qdrant_client import QdrantClient
client = QdrantClient(url='http://localhost:6333', check_compatibility=False)
result = client.scroll(
    collection_name='docembed',
    scroll_filter={'must': [{'key': 'doc_id', 'match': {'value': '$DOC_ID'}}]},
    limit=1,
    with_payload=True
)
if result[0]:
    cid = result[0][0].payload.get('customer_id', 'NONE')
    print(cid if cid else 'NONE')
else:
    print('NONE')
\"
    " 2>/dev/null)

    if [ "$expected" = "NONE" ]; then
        if [ "$result" = "NONE" ]; then
            return 0
        else
            log_error "customer_id가 있으면 안됨 (실제: $result)"
            return 1
        fi
    else
        if [ "$result" = "$expected" ]; then
            return 0
        else
            log_error "customer_id 불일치 (예상: $expected, 실제: $result)"
            return 1
        fi
    fi
}

echo "======================================================================"
log_info "Qdrant customer_id 동기화 통합 테스트"
echo "======================================================================"

# 시나리오 1: 신규 연결
echo ""
log_info "시나리오 1: 신규 연결 (고객 A)"
log_info "----------------------------------------------------------------------"

log_info "1. 고객 A에 문서 연결"
RESPONSE=$(curl -s -X POST "$API_URL/customers/$CUSTOMER_A/documents" \
  -H "Content-Type: application/json" \
  -d "{\"document_id\": \"$DOC_ID\", \"relationship_type\": \"test\", \"notes\": \"자동화 테스트\"}")

if echo "$RESPONSE" | grep -q '"success":true'; then
    log_success "API 호출 성공"
else
    log_error "API 호출 실패: $RESPONSE"
    exit 1
fi

sleep 2

log_info "2. Qdrant에서 customer_id 확인"
if check_qdrant_customer_id "$CUSTOMER_A"; then
    log_success "✓ 신규 연결 성공: customer_id=$CUSTOMER_A 설정됨"
else
    exit 1
fi

# 시나리오 2: 관계 변경
echo ""
log_info "시나리오 2: 관계 변경 (A → B)"
log_info "----------------------------------------------------------------------"

log_info "1. 고객 A에서 문서 연결 해제"
RESPONSE=$(curl -s -X DELETE "$API_URL/customers/$CUSTOMER_A/documents/$DOC_ID")

if echo "$RESPONSE" | grep -q '"success":true'; then
    log_success "연결 해제 성공"
else
    log_error "연결 해제 실패: $RESPONSE"
    exit 1
fi

sleep 2

log_info "2. 고객 B에 문서 연결"
RESPONSE=$(curl -s -X POST "$API_URL/customers/$CUSTOMER_B/documents" \
  -H "Content-Type: application/json" \
  -d "{\"document_id\": \"$DOC_ID\", \"relationship_type\": \"test\", \"notes\": \"관계 변경 테스트\"}")

if echo "$RESPONSE" | grep -q '"success":true'; then
    log_success "API 호출 성공"
else
    log_error "API 호출 실패: $RESPONSE"
    exit 1
fi

sleep 2

log_info "3. Qdrant에서 customer_id 확인"
if check_qdrant_customer_id "$CUSTOMER_B"; then
    log_success "✓ 관계 변경 성공: customer_id=$CUSTOMER_B로 업데이트됨"
else
    exit 1
fi

# 시나리오 3: 연결 해제
echo ""
log_info "시나리오 3: 연결 해제"
log_info "----------------------------------------------------------------------"

log_info "1. 고객 B에서 문서 연결 해제"
RESPONSE=$(curl -s -X DELETE "$API_URL/customers/$CUSTOMER_B/documents/$DOC_ID")

if echo "$RESPONSE" | grep -q '"success":true'; then
    log_success "연결 해제 성공"
else
    log_error "연결 해제 실패: $RESPONSE"
    exit 1
fi

sleep 2

log_info "2. Qdrant에서 customer_id 확인 (없어야 함)"
if check_qdrant_customer_id "NONE"; then
    log_success "✓ 연결 해제 성공: customer_id 제거됨"
else
    exit 1
fi

# 결과 요약
echo ""
echo "======================================================================"
log_success "🎉 모든 테스트 통과!"
echo "======================================================================"
echo ""
log_success "✓ 시나리오 1: 신규 연결 (customer_id 추가)"
log_success "✓ 시나리오 2: 관계 변경 (customer_id 업데이트)"
log_success "✓ 시나리오 3: 연결 해제 (customer_id 제거)"
echo ""
log_info "Qdrant customer_id 동기화가 정상적으로 작동합니다!"

exit 0
