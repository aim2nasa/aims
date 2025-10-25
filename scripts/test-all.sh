#!/bin/bash
# ========================================
# AIMS 전체 테스트 실행 스크립트 (Linux/Mac)
# ========================================

set -e  # 에러 발생 시 즉시 종료

echo ""
echo "========================================"
echo "  AIMS 전체 테스트 실행"
echo "========================================"
echo ""

FAILED=0

# ========================================
# 1. Node.js API 테스트
# ========================================
echo "[1/2] Node.js API 테스트 실행 중..."
echo "----------------------------------------"
cd backend/api/aims_api
if npm test; then
    echo ""
    echo "✅ Node.js API 테스트 통과!"
else
    echo ""
    echo "❌ Node.js API 테스트 실패!"
    FAILED=1
fi
cd ../../..

echo ""
echo ""

# ========================================
# 2. Python API 테스트
# ========================================
echo "[2/2] Python API 테스트 실행 중..."
echo "----------------------------------------"
cd backend/api/doc_status_api
if python3 -m pytest -v; then
    echo ""
    echo "✅ Python API 테스트 통과!"
else
    echo ""
    echo "❌ Python API 테스트 실패!"
    FAILED=1
fi
cd ../../..

echo ""
echo "========================================"
echo "  테스트 결과 요약"
echo "========================================"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo "✅ 모든 테스트 통과!"
    echo ""
    exit 0
else
    echo ""
    echo "❌ 일부 테스트 실패!"
    echo ""
    exit 1
fi
