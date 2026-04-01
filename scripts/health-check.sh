#!/bin/bash
# AIMS 서비스 헬스체크 스크립트
# 사용법: bash ~/aims/scripts/health-check.sh
# Claude /health-check 스킬에서 자동 호출

PASS=0
FAIL=0
RESULTS=""

check() {
  local category="$1"
  local name="$2"
  local status="$3"
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS + 1))
    RESULTS="${RESULTS}| ${category} | ${name} | ✅ PASS |\n"
  else
    FAIL=$((FAIL + 1))
    RESULTS="${RESULTS}| ${category} | ${name} | ❌ FAIL — ${status} |\n"
  fi
}

echo "=== AIMS 헬스체크 시작 ($(date '+%Y.%m.%d %H:%M:%S')) ==="
echo ""

# 1. Systemd 서비스
echo "[1/6] Systemd 서비스 점검..."
for svc in mongod redis-server nginx tailscaled teamviewerd docker; do
  st=$(systemctl is-active "$svc" 2>/dev/null)
  if [ "$st" = "active" ]; then
    check "Systemd" "$svc" "PASS"
  else
    check "Systemd" "$svc" "$st"
  fi
done

# 2. Docker 컨테이너
echo "[2/6] Docker 컨테이너 점검..."
for ctn in aims-api aims-rag-api qdrant portainer; do
  st=$(docker inspect -f '{{.State.Running}}' "$ctn" 2>/dev/null)
  if [ "$st" = "true" ]; then
    check "Docker" "$ctn" "PASS"
  else
    check "Docker" "$ctn" "not running"
  fi
done

# 3. PM2 프로세스
echo "[3/6] PM2 프로세스 점검..."
PM2_JSON=$(pm2 jlist 2>/dev/null)
for proc in aims-mcp aims-health-monitor pdf_proxy pdf_converter annual_report_api document_pipeline xpipe-web rustdesk-service; do
  st=$(echo "$PM2_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data:
    if p['name'] == '$proc':
        print(p.get('pm2_env', {}).get('status', 'unknown'))
        break
else:
    print('not found')
" 2>/dev/null)
  if [ "$st" = "online" ]; then
    check "PM2" "$proc" "PASS"
  else
    check "PM2" "$proc" "$st"
  fi
done

# 4. Health Endpoint
echo "[4/6] Health Endpoint 점검..."
declare -A ENDPOINTS
ENDPOINTS[aims_api]="http://localhost:3010/api/health"
ENDPOINTS[aims_rag_api]="http://localhost:8000/health"
ENDPOINTS[annual_report_api]="http://localhost:8004/health"
ENDPOINTS[document_pipeline]="http://localhost:8100/health"

for name in aims_api aims_rag_api annual_report_api document_pipeline; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "${ENDPOINTS[$name]}" 2>/dev/null)
  if [ "$code" = "200" ]; then
    check "Health" "$name" "PASS"
  else
    check "Health" "$name" "HTTP $code"
  fi
done

# 5. 데이터 서비스
echo "[5/6] 데이터 서비스 점검..."

# MongoDB
mongo_ok=$(mongosh --quiet --eval "db.adminCommand({ping:1}).ok" 2>/dev/null)
if [ "$mongo_ok" = "1" ]; then
  check "Data" "MongoDB" "PASS"
else
  check "Data" "MongoDB" "ping failed"
fi

# Redis
redis_ok=$(redis-cli ping 2>/dev/null)
if [ "$redis_ok" = "PONG" ]; then
  check "Data" "Redis" "PASS"
else
  check "Data" "Redis" "ping failed"
fi

# Qdrant
qdrant_info=$(curl -s --connect-timeout 3 http://localhost:6333/collections/docembed 2>/dev/null)
qdrant_status=$(echo "$qdrant_info" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['status'])" 2>/dev/null)
qdrant_points=$(echo "$qdrant_info" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['points_count'])" 2>/dev/null)
if [ "$qdrant_status" = "green" ] && [ -n "$qdrant_points" ] && [ "$qdrant_points" -gt 0 ] 2>/dev/null; then
  check "Data" "Qdrant ($qdrant_points pts)" "PASS"
else
  check "Data" "Qdrant" "status=$qdrant_status points=$qdrant_points"
fi

# 6. 인프라
echo "[6/6] 인프라 점검..."

# 크론
cron_count=$(crontab -l 2>/dev/null | grep "full_pipeline\|embedding" | grep -v "^#" | wc -l)
if [ "$cron_count" -ge 1 ]; then
  check "Infra" "임베딩 크론" "PASS"
else
  check "Infra" "임베딩 크론" "not found"
fi

# 디스크
disk_pct=$(df / --output=pcent | tail -1 | tr -d ' %')
if [ "$disk_pct" -lt 90 ]; then
  check "Infra" "디스크 (${disk_pct}%)" "PASS"
else
  check "Infra" "디스크 (${disk_pct}%)" "usage >= 90%"
fi

# 메모리
mem_avail=$(free -m | awk '/Mem:/ {print $7}')
if [ "$mem_avail" -gt 1024 ]; then
  check "Infra" "메모리 (${mem_avail}MB free)" "PASS"
else
  check "Infra" "메모리 (${mem_avail}MB free)" "< 1GB"
fi

# 결과 출력
echo ""
echo "=========================================="
echo "  AIMS 헬스체크 결과"
echo "=========================================="
echo ""
echo "| 카테고리 | 항목 | 상태 |"
echo "|---------|------|------|"
echo -e "$RESULTS"
echo ""
echo "PASS: $PASS / FAIL: $FAIL / 총: $((PASS + FAIL))"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "⚠️  FAIL 항목이 있습니다. 확인이 필요합니다."
  exit 1
else
  echo ""
  echo "✅ 모든 서비스 정상!"
  exit 0
fi
