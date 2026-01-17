#!/bin/bash
# AIMS Nginx에 pdf-proxy 설정 추가 스크립트
# 사용법: sudo ./fix_nginx_pdf_proxy.sh

NGINX_CONF="/etc/nginx/sites-available/aims"
BACKUP_FILE="/etc/nginx/sites-available/aims.bak.$(date +%Y%m%d%H%M%S)"

echo "=== AIMS Nginx pdf-proxy 설정 추가 ==="

# 1. 백업
echo "[1/4] 설정 파일 백업 중..."
cp "$NGINX_CONF" "$BACKUP_FILE"
echo "    백업 완료: $BACKUP_FILE"

# 2. 이미 pdf-proxy 설정이 있는지 확인
if grep -q "location /pdf-proxy/" "$NGINX_CONF"; then
    echo "[!] pdf-proxy 설정이 이미 존재합니다. 종료합니다."
    exit 0
fi

# 3. pdf-proxy location 추가 (location /api/ 앞에)
echo "[2/4] pdf-proxy 설정 추가 중..."
sed -i '/# API 리버스 프록시/i\
    # PDF Proxy - 썸네일 및 PDF 관련 API\
    location /pdf-proxy/ {\
        proxy_pass http://localhost:8002/;\
        proxy_http_version 1.1;\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto $scheme;\
        proxy_read_timeout 60;\
        add_header Access-Control-Allow-Origin * always;\
    }\
' "$NGINX_CONF"

# 4. 설정 검증
echo "[3/4] Nginx 설정 검증 중..."
nginx -t
if [ $? -ne 0 ]; then
    echo "[!] 설정 검증 실패! 백업 복원 중..."
    cp "$BACKUP_FILE" "$NGINX_CONF"
    exit 1
fi

# 5. Nginx 재시작
echo "[4/4] Nginx 재시작 중..."
systemctl reload nginx

echo ""
echo "=== 완료! ==="
echo "iPad에서 문서 미리보기를 다시 테스트해 주세요."
