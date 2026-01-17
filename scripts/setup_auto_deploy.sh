#!/bin/bash
# AIMS 자동 배포 설정 스크립트
# 5분마다 git pull 확인 후 변경 시 자동 배포

AIMS_DIR="/home/rossi/aims"
LOG_FILE="/var/log/aims-auto-deploy.log"

echo "=== AIMS 자동 배포 설정 ==="

# 1. 자동 배포 스크립트 생성
cat > "$AIMS_DIR/scripts/auto_deploy_check.sh" << 'EOF'
#!/bin/bash
AIMS_DIR="/home/rossi/aims"
LOG_FILE="/var/log/aims-auto-deploy.log"

cd "$AIMS_DIR" || exit 1

# 현재 commit hash
CURRENT_HASH=$(git rev-parse HEAD)

# 원격에서 최신 정보 가져오기
git fetch origin main --quiet

# 원격 commit hash
REMOTE_HASH=$(git rev-parse origin/main)

# 변경이 있으면 배포
if [ "$CURRENT_HASH" != "$REMOTE_HASH" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 변경 감지: $CURRENT_HASH → $REMOTE_HASH" >> "$LOG_FILE"

    # 전체 배포 실행
    cd "$AIMS_DIR" && ./deploy_all.sh >> "$LOG_FILE" 2>&1

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 배포 완료" >> "$LOG_FILE"
fi
EOF

chmod +x "$AIMS_DIR/scripts/auto_deploy_check.sh"

# 2. Cron 작업 등록 (5분마다)
CRON_JOB="*/5 * * * * $AIMS_DIR/scripts/auto_deploy_check.sh"

# 기존 cron에 추가 (중복 방지)
(crontab -l 2>/dev/null | grep -v "auto_deploy_check.sh"; echo "$CRON_JOB") | crontab -

echo "✅ 자동 배포 설정 완료!"
echo "   - 5분마다 git 변경 확인"
echo "   - 변경 시 deploy_all.sh 자동 실행"
echo "   - 로그: $LOG_FILE"
