#!/bin/bash
#
# 바이러스 DB 업데이트 스크립트
# cron: 0 3 * * * /home/rossi/aims-virus-scan/scripts/freshclam_update.sh
#

LOG_FILE="/var/log/aims-virus-scan/freshclam.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "=== Freshclam Update: $(date) ===" >> "$LOG_FILE"

# freshclam 실행
sudo freshclam >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo "Update successful" >> "$LOG_FILE"
else
    echo "Update failed" >> "$LOG_FILE"
fi

echo "" >> "$LOG_FILE"
