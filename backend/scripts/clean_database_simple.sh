#!/bin/bash

###############################################################################
# AIMS 데이터베이스 정리 스크립트 (의존성 없음)
#
# 목적: 사용자 계정 기능 도입을 위해 기존 데이터를 깨끗하게 삭제
#
# 실행 방법:
#   chmod +x clean_database_simple.sh
#   ./clean_database_simple.sh
#
# 주의: 이 스크립트는 files와 customers 컬렉션을 완전히 삭제합니다!
###############################################################################

echo "========================================"
echo "AIMS 데이터베이스 정리 시작"
echo "========================================"
echo ""

# MongoDB 연결 정보
MONGO_HOST="tars:27017"
MONGO_DB="docupload"

# 1. files 컬렉션 삭제 전 문서 수 확인
echo "[1/5] files 컬렉션 현재 문서 수 확인..."
FILES_COUNT=$(mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.files.countDocuments()")
echo "  files 문서 수: $FILES_COUNT"

# 2. customers 컬렉션 삭제 전 문서 수 확인
echo "[2/5] customers 컬렉션 현재 문서 수 확인..."
CUSTOMERS_COUNT=$(mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.customers.countDocuments()")
echo "  customers 문서 수: $CUSTOMERS_COUNT"

echo ""
echo "⚠️  경고: 3초 후 컬렉션을 삭제합니다..."
echo ""
sleep 3

# 3. files 컬렉션 드롭
echo "[3/5] files 컬렉션 삭제 중..."
mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.files.drop()" > /dev/null 2>&1
echo "  ✅ files 컬렉션 삭제 완료"

# 4. customers 컬렉션 드롭
echo "[4/5] customers 컬렉션 삭제 중..."
mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.customers.drop()" > /dev/null 2>&1
echo "  ✅ customers 컬렉션 삭제 완료"

# 5. 인덱스 재생성
echo "[5/5] 인덱스 생성 중..."

mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.files.createIndex({ owner_id: 1 })" > /dev/null 2>&1
echo "  ✅ files.owner_id 인덱스 생성 완료"

mongosh --quiet --host "$MONGO_HOST" "$MONGO_DB" --eval "db.customers.createIndex({ 'meta.created_by': 1 })" > /dev/null 2>&1
echo "  ✅ customers.meta.created_by 인덱스 생성 완료"

echo ""
echo "========================================"
echo "데이터베이스 정리 완료! ✨"
echo "========================================"
echo "삭제된 files 문서: ${FILES_COUNT}개"
echo "삭제된 customers 문서: ${CUSTOMERS_COUNT}개"
echo "생성된 인덱스: 2개"
echo "========================================"
echo ""
