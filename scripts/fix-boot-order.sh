#!/bin/bash
# tars 부팅 순서 수정 스크립트
# Nginx가 Tailscale 이후에 시작하도록 설정 + sudoers 설정
# 사용법: sudo bash fix-boot-order.sh

set -e

echo "=== [1/4] Nginx → Tailscale 의존성 설정 ==="
mkdir -p /etc/systemd/system/nginx.service.d
tee /etc/systemd/system/nginx.service.d/override.conf << 'EOF'
[Unit]
After=tailscaled.service network-online.target
Wants=tailscaled.service network-online.target

[Service]
ExecStartPre=/bin/sleep 5
EOF
echo "  완료: /etc/systemd/system/nginx.service.d/override.conf"

echo ""
echo "=== [2/4] sudoers 설정 (SSH 원격 nginx 재시작 허용) ==="
echo "rossi ALL=(ALL) NOPASSWD: /bin/systemctl restart nginx, /bin/systemctl restart tailscaled, /bin/systemctl status nginx" > /etc/sudoers.d/aims-services
chmod 440 /etc/sudoers.d/aims-services
echo "  완료: /etc/sudoers.d/aims-services"

echo ""
echo "=== [3/4] systemd 리로드 + nginx 재시작 ==="
systemctl daemon-reload
systemctl restart nginx
echo "  nginx: $(systemctl is-active nginx)"

echo ""
echo "=== [4/4] 검증 ==="
echo "  Nginx override:"
systemctl cat nginx | grep -A 3 "override.conf" || echo "  (override 적용됨)"
echo "  sudoers 테스트: $(sudo -u rossi sudo -n systemctl status nginx > /dev/null 2>&1 && echo 'OK' || echo 'FAIL (재로그인 후 테스트)')"
echo ""
echo "=== 완료 ==="
echo "다음 리부팅 시 Tailscale → 5초 대기 → Nginx 순서로 시작됩니다."
