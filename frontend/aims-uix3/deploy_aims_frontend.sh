#!/bin/bash

# AIMS Frontend 배포 스크립트
# 사용법: ./deploy_aims_frontend.sh

set -e

echo "=== AIMS Frontend 배포 시작 ==="

# 빌드 디렉토리 확인
BUILD_DIR="/home/rossi/aims/frontend/aims-uix3/dist"
DEPLOY_DIR="/var/www/aims"

if [ ! -d "$BUILD_DIR" ]; then
    echo "❌ 빌드 디렉토리가 없습니다: $BUILD_DIR"
    echo "먼저 로컬에서 빌드 후 scp로 전송하세요."
    exit 1
fi

echo "✓ 빌드 디렉토리 확인: $BUILD_DIR"

# 배포 디렉토리 생성
echo "→ 배포 디렉토리 준비 중..."
sudo mkdir -p $DEPLOY_DIR

# 기존 파일 백업 (선택사항)
if [ -d "$DEPLOY_DIR" ] && [ "$(ls -A $DEPLOY_DIR)" ]; then
    BACKUP_DIR="/var/www/aims_backup_$(date +%Y%m%d_%H%M%S)"
    echo "→ 기존 파일 백업: $BACKUP_DIR"
    sudo cp -r $DEPLOY_DIR $BACKUP_DIR
fi

# 빌드 파일 복사
echo "→ 빌드 파일 복사 중..."
sudo rm -rf $DEPLOY_DIR/*
sudo cp -r $BUILD_DIR/* $DEPLOY_DIR/

# 권한 설정
echo "→ 권한 설정 중..."
sudo chown -R www-data:www-data $DEPLOY_DIR
sudo chmod -R 755 $DEPLOY_DIR

echo "✓ 파일 복사 완료"

# nginx 설정 업데이트 (필요시)
NGINX_CONFIG="/etc/nginx/sites-available/aims"
if grep -q "/home/rossi/aims" $NGINX_CONFIG; then
    echo "→ nginx 설정 업데이트 중..."
    sudo sed -i 's|root /home/rossi/aims/frontend/aims-uix3/dist;|root /var/www/aims;|g' $NGINX_CONFIG
    echo "✓ nginx 설정 업데이트 완료"
fi

# nginx 설정 테스트 및 재시작
echo "→ nginx 재시작 중..."
sudo nginx -t
sudo systemctl restart nginx

echo ""
echo "=== ✅ AIMS Frontend 배포 완료! ==="
echo "배포 위치: $DEPLOY_DIR"
echo "접속 URL: https://aims.giize.com"
echo ""
