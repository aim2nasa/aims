#!/bin/bash
#
# 전체 파일 스캔 트리거 스크립트
# cron: 0 4 * * * /home/rossi/aims-virus-scan/scripts/full_scan.sh
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../.env" 2>/dev/null || true

API_URL="${VIRUS_SCAN_HOST:-localhost}:${VIRUS_SCAN_PORT:-8100}"
SECRET="${VIRUS_SCAN_SECRET:-aims-virus-scan-secret-key}"

LOG_FILE="/var/log/aims-virus-scan/full_scan.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "=== Full Scan Started: $(date) ===" >> "$LOG_FILE"

# 전체 스캔 시작 요청
curl -s -X POST "http://${API_URL}/scan/full" \
    -H "X-Scan-Secret: ${SECRET}" \
    >> "$LOG_FILE" 2>&1

echo "" >> "$LOG_FILE"
echo "Scan trigger sent" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
