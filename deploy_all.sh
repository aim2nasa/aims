#!/bin/bash
# AIMS 전체 배포 스크립트 (tars 서버용)
# 사용법: cd ~/aims && ./deploy_all.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

AIMS_DIR="$HOME/aims"

echo "=== AIMS 전체 배포 시작 ==="
echo ""

# 1. Git 정리 및 Pull
echo -n "[1/8] Git 정리 및 Pull ... "
cd "$AIMS_DIR"
git checkout -- . > /dev/null 2>&1
git clean -fd -e deploy_all.sh > /dev/null 2>&1
git pull > /dev/null 2>&1
echo -e "${GREEN}완료${NC}"

# 2. aims_api
echo -n "[2/8] aims_api 배포 ... "
cd "$AIMS_DIR/backend/api/aims_api"
./deploy_aims_api.sh > /dev/null 2>&1
echo -e "${GREEN}완료${NC}"

# 3. aims_rag_api
echo -n "[3/8] aims_rag_api 배포 ... "
cd "$AIMS_DIR/backend/api/aims_rag_api"
./deploy_aims_rag_api.sh > /dev/null 2>&1
echo -e "${GREEN}완료${NC}"

# 4. annual_report_api
echo -n "[4/8] annual_report_api 배포 ... "
cd "$AIMS_DIR/backend/api/annual_report_api"
./deploy_annual_report_api.sh > /dev/null 2>&1
echo -e "${GREEN}완료${NC}"

# 5. pdf_proxy
echo -n "[5/8] pdf_proxy 배포 ... "
cd "$AIMS_DIR/backend/api/pdf_proxy"
./deploy_pdf_proxy.sh > /dev/null 2>&1
echo -e "${GREEN}완료${NC}"

# 6. n8n 워크플로우
echo -n "[6/8] n8n 워크플로우 배포 ... "
cd "$AIMS_DIR/backend/n8n_flows"
source ~/.profile 2>/dev/null || true
./deploy_n8n_workflows.sh > /dev/null 2>&1
echo -e "${GREEN}완료${NC}"

# 7. Frontend
echo -n "[7/8] Frontend 배포 ... "
cd "$AIMS_DIR/frontend/aims-uix3"
./deploy_aims_frontend.sh > /dev/null 2>&1
echo -e "${GREEN}완료${NC}"

# 8. 상태 확인
echo -n "[8/8] 서비스 상태 확인 ... "
pm2 list > /dev/null 2>&1
echo -e "${GREEN}완료${NC}"

echo ""
echo -e "=== ${GREEN}전체 배포 완료${NC} ==="
