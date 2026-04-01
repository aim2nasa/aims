#!/bin/bash
# tars Nginx SSL 및 설정 수정 스크립트
# 사용법: sudo bash scripts/fix-nginx-ssl.sh

set -e

echo "=== [1/4] 불필요한 Nginx 설정 비활성화 ==="
# anythingllm (al.tars.giize.com) — 사용 안 함, SSL 인증서 없음, catch-all로 동작해서 502 유발
if [ -f /etc/nginx/sites-enabled/anythingllm ]; then
  mv /etc/nginx/sites-enabled/anythingllm /etc/nginx/sites-available/anythingllm.disabled
  echo "  비활성화: anythingllm → sites-available/anythingllm.disabled"
else
  echo "  anythingllm: 이미 비활성화됨"
fi

# n8n (n8nd.giize.com) — 삭제 예정
if [ -f /etc/nginx/sites-enabled/n8n ]; then
  mv /etc/nginx/sites-enabled/n8n /etc/nginx/sites-available/n8n.disabled
  echo "  비활성화: n8n → sites-available/n8n.disabled"
fi

# 오래된 백업 파일 정리 (sites-enabled에 .bak 파일이 있으면 Nginx 경고 유발)
for bak in /etc/nginx/sites-enabled/*.bak.*; do
  if [ -f "$bak" ]; then
    mv "$bak" /etc/nginx/sites-available/
    echo "  백업 이동: $(basename $bak) → sites-available/"
  fi
done

echo ""
echo "=== [2/4] SSL 인증서 확인 ==="
if [ -d /etc/letsencrypt/live/aims.giize.com ]; then
  echo "  aims.giize.com: SSL 인증서 존재"
else
  echo "  ⚠️  aims.giize.com SSL 인증서 없음!"
  echo "  Certbot으로 재발급 필요:"
  echo "    sudo certbot --nginx -d aims.giize.com -d tars.giize.com"
  echo ""
  echo "  지금 발급하시겠습니까? (y/n)"
  read -r answer
  if [ "$answer" = "y" ]; then
    certbot --nginx -d aims.giize.com -d tars.giize.com
  fi
fi

echo ""
echo "=== [3/4] Nginx 설정 테스트 ==="
nginx -t 2>&1

echo ""
echo "=== [4/4] Nginx 재시작 ==="
systemctl restart nginx
echo "  nginx: $(systemctl is-active nginx)"

echo ""
echo "=== 검증 ==="
echo "  aims.giize.com: $(curl -s -o /dev/null -w "%{http_code}" -k https://localhost -H "Host: aims.giize.com" --connect-timeout 3)"
echo "  tars:8080: $(curl -s -o /dev/null -w "%{http_code}" http://100.110.215.65:8080 --connect-timeout 3)"

echo ""
echo "=== 완료 ==="
