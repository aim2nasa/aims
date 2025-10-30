#!/bin/bash

###############################################################################
# AIMS 데이터베이스 정리 검증 스크립트 (의존성 없음)
#
# 목적: clean_database.js 실행 후 데이터가 올바르게 삭제되었는지 확인
#
# 실행 방법:
#   chmod +x verify_clean_simple.sh
#   ./verify_clean_simple.sh
###############################################################################

echo "========================================"
echo "AIMS 데이터베이스 정리 검증"
echo "========================================"
echo ""

# MongoDB 연결 정보
MONGO_HOST="tars:27017"
MONGO_DB="docupload"

# 1. files 컬렉션 문서 수 확인
echo "[1/4] files 컬렉션 문서 수 확인..."
FILES_COUNT=$(mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.files.countDocuments()")
echo "  files 문서 수: $FILES_COUNT"

# 2. customers 컬렉션 문서 수 확인
echo ""
echo "[2/4] customers 컬렉션 문서 수 확인..."
CUSTOMERS_COUNT=$(mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.customers.countDocuments()")
echo "  customers 문서 수: $CUSTOMERS_COUNT"

# 3. files 인덱스 확인
echo ""
echo "[3/4] files 컬렉션 인덱스 확인..."
mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.files.getIndexes().forEach(idx => print('  - ' + idx.name + ': ' + JSON.stringify(idx.key)))"

HAS_OWNER_ID=$(mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.files.getIndexes().some(idx => idx.key.owner_id)")
if [ "$HAS_OWNER_ID" = "true" ]; then
  echo "  ✅ owner_id 인덱스 확인됨"
else
  echo "  ❌ owner_id 인덱스 없음!"
fi

# 4. customers 인덱스 확인
echo ""
echo "[4/4] customers 컬렉션 인덱스 확인..."
mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.customers.getIndexes().forEach(idx => print('  - ' + idx.name + ': ' + JSON.stringify(idx.key)))"

HAS_CREATED_BY=$(mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.customers.getIndexes().some(idx => idx.key['meta.created_by'])")
if [ "$HAS_CREATED_BY" = "true" ]; then
  echo "  ✅ meta.created_by 인덱스 확인됨"
else
  echo "  ❌ meta.created_by 인덱스 없음!"
fi

# 5. 파일 시스템 확인
echo ""
echo "[추가] 파일 시스템 확인..."
if [ -d "/data/files" ]; then
  FILE_COUNT=$(find /data/files -type f 2>/dev/null | wc -l)
  echo "  /data/files 파일 개수: $FILE_COUNT"
else
  echo "  ❌ /data/files 디렉토리 없음!"
  FILE_COUNT=-1
fi

# 최종 결과
echo ""
echo "========================================"
echo "검증 결과"
echo "========================================"

if [ "$FILES_COUNT" = "0" ] && [ "$CUSTOMERS_COUNT" = "0" ] && [ "$HAS_OWNER_ID" = "true" ] && [ "$HAS_CREATED_BY" = "true" ] && [ "$FILE_COUNT" = "0" ]; then
  echo "✅ 데이터베이스 정리 완료!"
  echo "✅ 모든 컬렉션이 비어있습니다."
  echo "✅ 필수 인덱스가 생성되었습니다."
  echo "✅ 파일 디렉토리가 비어있습니다."
  echo ""
  echo "다음 단계: 백엔드 API 수정 진행"
  EXIT_CODE=0
else
  echo "❌ 정리가 완전히 완료되지 않았습니다:"
  [ "$FILES_COUNT" != "0" ] && echo "  - files 문서 ${FILES_COUNT}개 남아있음"
  [ "$CUSTOMERS_COUNT" != "0" ] && echo "  - customers 문서 ${CUSTOMERS_COUNT}개 남아있음"
  [ "$HAS_OWNER_ID" != "true" ] && echo "  - owner_id 인덱스 없음"
  [ "$HAS_CREATED_BY" != "true" ] && echo "  - meta.created_by 인덱스 없음"
  [ "$FILE_COUNT" != "0" ] && echo "  - 파일 ${FILE_COUNT}개 남아있음"
  EXIT_CODE=1
fi

echo "========================================"
echo ""

exit $EXIT_CODE
