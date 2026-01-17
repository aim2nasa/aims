#!/bin/bash
# AIMS Nginx - index.html 캐시 방지 설정
# 문제: index.html이 캐시되어 오래된 JS 번들을 로드함
# 해결: index.html에 no-cache 헤더 추가

NGINX_CONF="/etc/nginx/sites-available/aims"
BACKUP_FILE="/etc/nginx/sites-available/aims.bak.$(date +%Y%m%d%H%M%S)"

echo "=== AIMS Nginx index.html 캐시 방지 설정 ==="

# 1. 백업
echo "[1/4] 설정 파일 백업 중..."
sudo cp "$NGINX_CONF" "$BACKUP_FILE"
echo "    백업 완료: $BACKUP_FILE"

# 2. 기존 location / 블록을 수정된 버전으로 교체
echo "[2/4] index.html 캐시 방지 설정 추가 중..."

# sed로 location / 블록 수정
sudo sed -i '/# React 정적 파일 서빙/,/^    }$/c\
    # React 정적 파일 서빙 (개발 디렉토리 직접 참조)\
    location / {\
        root /home/rossi/aims/frontend/aims-uix3/dist;\
        try_files $uri $uri/ /index.html;\
\
        # ⭐ index.html 캐시 방지 (항상 최신 JS 번들 로드)\
        location = /index.html {\
            add_header Cache-Control "no-cache, no-store, must-revalidate";\
            add_header Pragma "no-cache";\
            add_header Expires "0";\
        }\
\
        # JS/CSS 등 해시 파일명 에셋은 장기 캐싱\
        location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\
            expires 1y;\
            add_header Cache-Control "public, immutable";\
        }\
    }' "$NGINX_CONF"

# 3. 설정 검증
echo "[3/4] Nginx 설정 검증 중..."
sudo nginx -t
if [ $? -ne 0 ]; then
    echo "[!] 설정 검증 실패! 백업 복원 중..."
    sudo cp "$BACKUP_FILE" "$NGINX_CONF"
    exit 1
fi

# 4. Nginx 재시작
echo "[4/4] Nginx 재시작 중..."
sudo systemctl reload nginx

echo ""
echo "=== 완료! ==="
echo "index.html은 이제 캐시되지 않습니다."
echo "브라우저에서 Ctrl+Shift+R로 새로고침하세요."
