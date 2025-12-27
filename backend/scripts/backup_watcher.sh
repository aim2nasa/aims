#!/bin/bash
# backup_watcher.sh - 백업 트리거 파일 감시 및 실행
# aims-backup-watcher.service에서 사용

BACKUP_DIR="/data/backup"
TRIGGER_FILE="$BACKUP_DIR/.create_backup"
RESULT_FILE="$BACKUP_DIR/.backup_result"
BACKUP_SCRIPT="/home/rossi/aims/backend/scripts/backup_aims.sh"
LOG_FILE="$BACKUP_DIR/watcher.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# 트리거 파일 확인
if [ -f "$TRIGGER_FILE" ]; then
    log "트리거 파일 발견, 백업 시작..."

    # 트리거 파일 내용 읽기
    TRIGGER_DATA=$(cat "$TRIGGER_FILE")
    log "트리거 데이터: $TRIGGER_DATA"

    # 트리거 파일 삭제 (중복 실행 방지)
    rm -f "$TRIGGER_FILE"

    # 백업 실행
    if bash "$BACKUP_SCRIPT" >> "$LOG_FILE" 2>&1; then
        log "백업 성공"

        # 최신 백업 파일 찾기
        LATEST=$(ls -t "$BACKUP_DIR"/aims_backup_*.tar.gz 2>/dev/null | head -1)
        if [ -n "$LATEST" ]; then
            FILENAME=$(basename "$LATEST")
            SIZE=$(stat -c%s "$LATEST")
            echo "{\"success\":true,\"filename\":\"$FILENAME\",\"size\":$SIZE}" > "$RESULT_FILE"
        else
            echo '{"success":true,"message":"백업 완료"}' > "$RESULT_FILE"
        fi
    else
        log "백업 실패"
        echo '{"success":false,"error":"백업 스크립트 실행 실패"}' > "$RESULT_FILE"
    fi

    log "결과 파일 생성 완료"
fi
