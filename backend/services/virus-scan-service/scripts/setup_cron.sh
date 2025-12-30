#!/bin/bash
#
# cron 작업 설정 스크립트
#

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Setting up cron jobs for AIMS Virus Scan..."

# cron 파일 생성
sudo tee /etc/cron.d/aims-virus-scan > /dev/null << EOF
# AIMS Virus Scan Service Cron Jobs
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# 바이러스 DB 업데이트 - 매일 새벽 3시
0 3 * * * rossi $SCRIPT_DIR/freshclam_update.sh

# 전체 파일 스캔 - 매일 새벽 4시
0 4 * * * rossi $SCRIPT_DIR/full_scan.sh
EOF

# 로그 디렉토리 생성
sudo mkdir -p /var/log/aims-virus-scan
sudo chown rossi:rossi /var/log/aims-virus-scan

echo "Cron jobs installed:"
echo "  - freshclam_update.sh: Daily at 03:00"
echo "  - full_scan.sh: Daily at 04:00"
echo ""
echo "View cron: cat /etc/cron.d/aims-virus-scan"
echo "View logs: ls /var/log/aims-virus-scan/"
