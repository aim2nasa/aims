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
# 1. Frontend Tests (aims-uix3)
# ========================================
echo "[1/4] Running Frontend tests..."
echo "----------------------------------------"
cd frontend/aims-uix3
if npm test -- --run; then
    echo ""
    echo "[PASSED] Frontend tests passed!"
else
    echo ""
    echo "[FAILED] Frontend tests failed!"
    FAILED=1
fi
cd ../..

echo ""
echo ""

# ========================================
# 0. SSH 터널 설정
# ========================================
echo "[0/4] Setting up SSH tunnel to MongoDB..."
echo "----------------------------------------"
ssh -f -N -L 27017:localhost:27017 tars.giize.com
sleep 3
echo "SSH tunnel established (localhost:27017 -> tars.giize.com:27017)"
echo ""

# ========================================
# 2. Node.js API Tests
# ========================================
echo "[2/4] Running Node.js API tests..."
echo "----------------------------------------"
cd backend/api/aims_api
export MONGO_URI=mongodb://localhost:27017
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
# 3. Python API Tests
# ========================================
echo "[3/4] Running Python API tests..."
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

# ========================================
# 4. SSH 터널 종료
# ========================================
echo "[4/4] Closing SSH tunnel..."
echo "----------------------------------------"
pkill -f "ssh -f -N -L 27017:localhost:27017 tars.giize.com" || true
rm -f tars.giize.com nul 2>/dev/null || true
echo "SSH tunnel closed"
echo ""

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
