#!/bin/bash
# ========================================
# AIMS All Tests Runner (Linux/Mac)
# ========================================

set -e  # Exit on error

echo ""
echo "========================================"
echo "  AIMS All Tests Runner"
echo "========================================"
echo ""

FAILED=0

# ========================================
# 1. Node.js API Tests
# ========================================
echo "[1/2] Running Node.js API tests..."
echo "----------------------------------------"
cd backend/api/aims_api
if npm test; then
    echo ""
    echo "[PASSED] Node.js API tests passed!"
else
    echo ""
    echo "[FAILED] Node.js API tests failed!"
    FAILED=1
fi
cd ../../..

echo ""
echo ""

# ========================================
# 2. Python API Tests
# ========================================
echo "[2/2] Running Python API tests..."
echo "----------------------------------------"
cd backend/api/doc_status_api
if python3 -m pytest -v; then
    echo ""
    echo "[PASSED] Python API tests passed!"
else
    echo ""
    echo "[FAILED] Python API tests failed!"
    FAILED=1
fi
cd ../../..

echo ""
echo "========================================"
echo "  Test Results Summary"
echo "========================================"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo "[SUCCESS] All tests passed!"
    echo ""
    exit 0
else
    echo ""
    echo "[ERROR] Some tests failed!"
    echo ""
    exit 1
fi
