#!/bin/bash
#
# AIMS 서비스 백업 스크립트
# 백업 대상: 환경파일, MongoDB, Qdrant, 업로드 파일
#
# 사용법: ./backup_aims.sh
# cron 예시: 0 3 * * * /home/rossi/aims/backend/scripts/backup_aims.sh
#

set -e

# 설정
BACKUP_BASE="/data/backup"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE/$DATE"
BACKUP_FILE="$BACKUP_BASE/aims_backup_$DATE.tar.gz"
LOG_FILE="$BACKUP_BASE/backup_$DATE.log"

# 보관 기간 (일)
RETENTION_DAYS=7

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

# 백업 디렉토리 생성
mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_BASE"

log "===== AIMS 백업 시작 ====="
log "백업 위치: $BACKUP_FILE"

# 1. 환경 파일 백업
log "1/6. 환경 파일 백업 중..."
ENV_DIR="$BACKUP_DIR/env"
mkdir -p "$ENV_DIR"

if [ -f "/home/rossi/aims/backend/api/aims_api/.env" ]; then
    cp /home/rossi/aims/backend/api/aims_api/.env "$ENV_DIR/aims_api.env"
    log "  - aims_api.env 완료"
else
    warn "  - aims_api/.env 파일 없음"
fi

if [ -f "/home/rossi/aims/backend/api/annual_report_api/.env" ]; then
    cp /home/rossi/aims/backend/api/annual_report_api/.env "$ENV_DIR/annual_report_api.env"
    log "  - annual_report_api.env 완료"
else
    warn "  - annual_report_api/.env 파일 없음"
fi

if [ -f "/home/rossi/aims/backend/api/aims_mcp/.env" ]; then
    cp /home/rossi/aims/backend/api/aims_mcp/.env "$ENV_DIR/aims_mcp.env"
    log "  - aims_mcp.env 완료"
else
    warn "  - aims_mcp/.env 파일 없음"
fi

# 2. MongoDB 백업
log "2/6. MongoDB 백업 중..."
MONGO_DIR="$BACKUP_DIR/mongodb"
mkdir -p "$MONGO_DIR"

mongodump --db docupload --out "$MONGO_DIR" --quiet 2>/dev/null || error "MongoDB docupload 백업 실패"
log "  - docupload DB 완료"

mongodump --db aims_analytics --out "$MONGO_DIR" --quiet 2>/dev/null || warn "  - aims_analytics DB 백업 실패 (데이터 없을 수 있음)"
log "  - aims_analytics DB 완료"

# 3. Qdrant 백업
log "3/6. Qdrant 벡터 DB 백업 중..."
QDRANT_DIR="$BACKUP_DIR/qdrant"
mkdir -p "$QDRANT_DIR"

if [ -d "/home/rossi/qdrant/qdrant_storage" ]; then
    cp -r /home/rossi/qdrant/qdrant_storage/* "$QDRANT_DIR/"
    log "  - qdrant_storage 완료"
else
    warn "  - Qdrant 저장소 없음"
fi

# 4. 업로드 파일 백업
log "4/6. 업로드 파일 백업 중..."
FILES_DIR="$BACKUP_DIR/files"
mkdir -p "$FILES_DIR"

if [ -d "/data/files" ]; then
    # temp 폴더 제외하고 복사
    rsync -a --exclude='temp' /data/files/ "$FILES_DIR/"
    log "  - /data/files 완료 (temp 제외)"
else
    warn "  - /data/files 디렉토리 없음"
fi

# 5. n8n 워크플로우 백업
log "5/6. n8n 워크플로우 백업 중..."
N8N_DIR="$BACKUP_DIR/n8n"
mkdir -p "$N8N_DIR"

if [ -d "/home/rossi/n8n-docker/n8n_data" ]; then
    cp -r /home/rossi/n8n-docker/n8n_data/* "$N8N_DIR/"
    log "  - n8n_data 완료"
else
    warn "  - n8n_data 디렉토리 없음"
fi

# 6. tar.gz 압축
log "압축 중..."
cd "$BACKUP_BASE"
tar -czf "$BACKUP_FILE" -C "$BACKUP_BASE" "$DATE"

# 임시 디렉토리 삭제
rm -rf "$BACKUP_DIR"

# 백업 파일 크기 확인
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "백업 완료: $BACKUP_FILE ($BACKUP_SIZE)"

# 6. 오래된 백업 삭제
log "오래된 백업 정리 중 (${RETENTION_DAYS}일 이상)..."
find "$BACKUP_BASE" -name "aims_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null
find "$BACKUP_BASE" -name "backup_*.log" -mtime +$RETENTION_DAYS -delete 2>/dev/null
log "정리 완료"

# 백업 목록 출력
log "===== 현재 백업 목록 ====="
ls -lh "$BACKUP_BASE"/aims_backup_*.tar.gz 2>/dev/null | tail -5 | while read line; do
    log "  $line"
done

log "===== AIMS 백업 완료 ====="

# 로그 파일 위치 안내
echo ""
echo "로그 파일: $LOG_FILE"
