#!/bin/bash
# Qdrant customer_id 동기화 간단한 테스트 스크립트

set -e

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 함수 정의
log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# API 베이스 URL
API_URL="http://localhost:3010/api"

echo "======================================================================"
echo "Qdrant customer_id 동기화 통합 테스트"
echo "======================================================================"

# 1. MongoDB에서 테스트용 문서 ID 찾기
log_info "1. 테스트용 문서 찾기 (최근 업로드된 문서 사용)"

DOC_ID=$(docker exec aims-api node -e "
const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient('mongodb://localhost:27017/');
  await client.connect();
  const db = client.db('docupload');
  const doc = await db.collection('files').findOne(
    {},
    { sort: { 'upload.uploaded_at': -1 } }
  );
  if (doc) console.log(doc._id.toString());
  await client.close();
})();
" 2>/dev/null)

if [ -z "$DOC_ID" ]; then
    log_error "테스트용 문서를 찾을 수 없습니다"
    exit 1
fi

log_success "테스트 문서 ID: $DOC_ID"

# 2. MongoDB에서 테스트용 고객 찾기 (2명)
log_info "2. 테스트용 고객 찾기 (2명)"

CUSTOMERS=$(docker exec aims-api node -e "
const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient('mongodb://localhost:27017/');
  await client.connect();
  const db = client.db('docupload');
  const customers = await db.collection('customers').find({}).limit(2).toArray();
  if (customers.length >= 2) {
    console.log(customers[0]._id.toString() + ',' + customers[1]._id.toString());
  }
  await client.close();
})();
" 2>/dev/null)

if [ -z "$CUSTOMERS" ]; then
    log_error "테스트용 고객을 찾을 수 없습니다"
    exit 1
fi

CUSTOMER_A=$(echo $CUSTOMERS | cut -d',' -f1)
CUSTOMER_B=$(echo $CUSTOMERS | cut -d',' -f2)

log_success "고객 A: $CUSTOMER_A"
log_success "고객 B: $CUSTOMER_B"

# 3. Qdrant에서 문서의 청크 개수 확인
log_info "3. Qdrant에서 문서의 청크 개수 확인"

CHUNK_COUNT=$(docker exec qdrant-db sh -c "
python3 -c \"
from qdrant_client import QdrantClient
client = QdrantClient(url='http://localhost:6333')
try:
    result = client.scroll(
        collection_name='docembed',
        scroll_filter={'must': [{'key': 'doc_id', 'match': {'value': '$DOC_ID'}}]},
        limit=1000,
        with_payload=False,
        with_vector=False
    )
    print(len(result[0]) if result[0] else 0)
except Exception as e:
    print('0')
\"
" 2>/dev/null)

if [ "$CHUNK_COUNT" = "0" ]; then
    log_warning "문서가 Qdrant에 임베딩되지 않았습니다 (테스트 건너뜀)"
    log_info "임베딩을 생성하려면: cd ~/aims/backend/embedding && python3 full_pipeline.py"
    exit 0
fi

log_success "Qdrant에 $CHUNK_COUNT 개 청크 발견"

# 4. 시나리오 1: 신규 연결
echo ""
log_info "======================================================================"
log_info "시나리오 1: 신규 연결 테스트 (고객 A)"
log_info "======================================================================"

log_info "4-1. 고객 A에 문서 연결"
RESPONSE=$(curl -s -X POST "$API_URL/customers/$CUSTOMER_A/documents" \
  -H "Content-Type: application/json" \
  -d "{
    \"document_id\": \"$DOC_ID\",
    \"relationship_type\": \"test\",
    \"notes\": \"자동화 테스트\"
  }")

SUCCESS=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")
QDRANT_CHUNKS=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('qdrant_sync', {}).get('chunksUpdated', 0))")

if [ "$SUCCESS" = "True" ]; then
    log_success "API 호출 성공"
    log_info "Qdrant 동기화: $QDRANT_CHUNKS 개 청크 업데이트"
else
    log_error "API 호출 실패: $RESPONSE"
    exit 1
fi

sleep 1

log_info "4-2. Qdrant에서 customer_id 확인"
CUSTOMER_ID_IN_QDRANT=$(docker exec qdrant-db sh -c "
python3 -c \"
from qdrant_client import QdrantClient
client = QdrantClient(url='http://localhost:6333')
result = client.scroll(
    collection_name='docembed',
    scroll_filter={'must': [{'key': 'doc_id', 'match': {'value': '$DOC_ID'}}]},
    limit=1,
    with_payload=True,
    with_vector=False
)
if result[0]:
    print(result[0][0].payload.get('customer_id', 'NONE'))
else:
    print('NONE')
\"
" 2>/dev/null)

if [ "$CUSTOMER_ID_IN_QDRANT" = "$CUSTOMER_A" ]; then
    log_success "✓ 신규 연결 성공: customer_id가 올바르게 설정됨"
else
    log_error "✗ 신규 연결 실패: customer_id=$CUSTOMER_ID_IN_QDRANT (예상: $CUSTOMER_A)"
    exit 1
fi

# 5. 시나리오 2: 관계 변경 (A → B)
echo ""
log_info "======================================================================"
log_info "시나리오 2: 관계 변경 (A → B) 테스트"
log_info "======================================================================"

log_info "5-1. 고객 A에서 문서 연결 해제"
RESPONSE=$(curl -s -X DELETE "$API_URL/customers/$CUSTOMER_A/documents/$DOC_ID")
SUCCESS=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")

if [ "$SUCCESS" = "True" ]; then
    log_success "고객 A 연결 해제 성공"
else
    log_error "연결 해제 실패: $RESPONSE"
    exit 1
fi

sleep 1

log_info "5-2. 고객 B에 문서 연결"
RESPONSE=$(curl -s -X POST "$API_URL/customers/$CUSTOMER_B/documents" \
  -H "Content-Type: application/json" \
  -d "{
    \"document_id\": \"$DOC_ID\",
    \"relationship_type\": \"test\",
    \"notes\": \"관계 변경 테스트\"
  }")

SUCCESS=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")

if [ "$SUCCESS" = "True" ]; then
    log_success "고객 B 연결 성공"
else
    log_error "연결 실패: $RESPONSE"
    exit 1
fi

sleep 1

log_info "5-3. Qdrant에서 customer_id 확인 (B로 변경되어야 함)"
CUSTOMER_ID_IN_QDRANT=$(docker exec qdrant-db sh -c "
python3 -c \"
from qdrant_client import QdrantClient
client = QdrantClient(url='http://localhost:6333')
result = client.scroll(
    collection_name='docembed',
    scroll_filter={'must': [{'key': 'doc_id', 'match': {'value': '$DOC_ID'}}]},
    limit=1,
    with_payload=True,
    with_vector=False
)
if result[0]:
    print(result[0][0].payload.get('customer_id', 'NONE'))
else:
    print('NONE')
\"
" 2>/dev/null)

if [ "$CUSTOMER_ID_IN_QDRANT" = "$CUSTOMER_B" ]; then
    log_success "✓ 관계 변경 성공: customer_id가 B로 업데이트됨"
else
    log_error "✗ 관계 변경 실패: customer_id=$CUSTOMER_ID_IN_QDRANT (예상: $CUSTOMER_B)"
    exit 1
fi

# 6. 시나리오 3: 연결 해제
echo ""
log_info "======================================================================"
log_info "시나리오 3: 연결 해제 테스트"
log_info "======================================================================"

log_info "6-1. 고객 B에서 문서 연결 해제"
RESPONSE=$(curl -s -X DELETE "$API_URL/customers/$CUSTOMER_B/documents/$DOC_ID")
SUCCESS=$(echo $RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))")

if [ "$SUCCESS" = "True" ]; then
    log_success "연결 해제 성공"
else
    log_error "연결 해제 실패: $RESPONSE"
    exit 1
fi

sleep 1

log_info "6-2. Qdrant에서 customer_id 확인 (없어야 함)"
HAS_CUSTOMER_ID=$(docker exec qdrant-db sh -c "
python3 -c \"
from qdrant_client import QdrantClient
client = QdrantClient(url='http://localhost:6333')
result = client.scroll(
    collection_name='docembed',
    scroll_filter={'must': [{'key': 'doc_id', 'match': {'value': '$DOC_ID'}}]},
    limit=1,
    with_payload=True,
    with_vector=False
)
if result[0]:
    print('customer_id' in result[0][0].payload)
else:
    print('False')
\"
" 2>/dev/null)

if [ "$HAS_CUSTOMER_ID" = "False" ]; then
    log_success "✓ 연결 해제 성공: customer_id가 제거됨"
else
    log_error "✗ 연결 해제 실패: customer_id가 여전히 존재함"
    exit 1
fi

# 7. 결과 요약
echo ""
log_info "======================================================================"
log_success "🎉 모든 테스트 통과!"
log_info "======================================================================"
echo ""
log_success "✓ 시나리오 1: 신규 연결 (customer_id 추가)"
log_success "✓ 시나리오 2: 관계 변경 (customer_id 업데이트)"
log_success "✓ 시나리오 3: 연결 해제 (customer_id 제거)"
echo ""
log_info "Qdrant customer_id 동기화가 정상적으로 작동합니다!"

exit 0
