#!/bin/bash
#
# AIMS 서비스 백업 스크립트
# 백업 대상: 버전정보, 환경파일, MongoDB, Qdrant, 업로드 파일
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

# 실패 시 정리 함수
cleanup_on_failure() {
    if [ -d "$BACKUP_DIR" ]; then
        warn "백업 실패 - 임시 디렉토리 정리 중..."
        rm -rf "$BACKUP_DIR"
        warn "임시 디렉토리 정리 완료: $BACKUP_DIR"
    fi
}

# 실패 시 cleanup 실행
trap cleanup_on_failure ERR

# 백업 디렉토리 생성
mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_BASE"

log "===== AIMS 백업 시작 ====="
log "백업 위치: $BACKUP_FILE"

# 1. 버전 정보 수집
log "1/6. 버전 정보 수집 중..."

# Git 저장소 정보
AIMS_DIR="/home/rossi/aims"
GIT_COMMIT=$(cd "$AIMS_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(cd "$AIMS_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Frontend 버전 (package.json에서)
FRONTEND_VERSION=$(cat "$AIMS_DIR/frontend/aims-uix3/package.json" 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "unknown")

# Backend API 버전들 (package.json에서)
AIMS_API_VERSION=$(cat "$AIMS_DIR/backend/api/aims_api/package.json" 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "unknown")
RAG_API_VERSION=$(cat "$AIMS_DIR/backend/api/aims_rag_api/package.json" 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "unknown")
AR_API_VERSION=$(cat "$AIMS_DIR/backend/api/annual_report_api/package.json" 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "unknown")
PDF_PROXY_VERSION=$(cat "$AIMS_DIR/backend/api/pdf_proxy/package.json" 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "unknown")
MCP_VERSION=$(cat "$AIMS_DIR/backend/api/aims_mcp/package.json" 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/' || echo "unknown")

# versions.json 생성
cat > "$BACKUP_DIR/versions.json" << EOF
{
  "backup_date": "$(date -Iseconds)",
  "git": {
    "commit": "$GIT_COMMIT",
    "branch": "$GIT_BRANCH"
  },
  "frontend": {
    "aims_uix3": "$FRONTEND_VERSION"
  },
  "backend": {
    "aims_api": "$AIMS_API_VERSION",
    "aims_rag_api": "$RAG_API_VERSION",
    "annual_report_api": "$AR_API_VERSION",
    "pdf_proxy": "$PDF_PROXY_VERSION",
    "aims_mcp": "$MCP_VERSION"
  }
}
EOF

log "  - Git: $GIT_BRANCH @ $GIT_COMMIT"
log "  - Frontend: $FRONTEND_VERSION"
log "  - aims_api: $AIMS_API_VERSION"
log "  - aims_rag_api: $RAG_API_VERSION"
log "  - annual_report_api: $AR_API_VERSION"
log "  - pdf_proxy: $PDF_PROXY_VERSION"
log "  - aims_mcp: $MCP_VERSION"

# 2. 환경 파일 백업
log "2/6. 환경 파일 백업 중..."
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

# 3. MongoDB 백업
log "3/6. MongoDB 백업 중..."
MONGO_DIR="$BACKUP_DIR/mongodb"
mkdir -p "$MONGO_DIR"

mongodump --db docupload --out "$MONGO_DIR" --quiet 2>/dev/null || error "MongoDB docupload 백업 실패"
log "  - docupload DB 완료"

mongodump --db aims_analytics --out "$MONGO_DIR" --quiet 2>/dev/null || warn "  - aims_analytics DB 백업 실패 (데이터 없을 수 있음)"
log "  - aims_analytics DB 완료"

# 4. Qdrant 백업
log "4/6. Qdrant 벡터 DB 백업 중..."
QDRANT_DIR="$BACKUP_DIR/qdrant"
mkdir -p "$QDRANT_DIR"

if [ -d "/home/rossi/qdrant/qdrant_storage" ]; then
    cp -r /home/rossi/qdrant/qdrant_storage/* "$QDRANT_DIR/"
    log "  - qdrant_storage 완료"
else
    warn "  - Qdrant 저장소 없음"
fi

# 5. 업로드 파일 백업
log "5/6. 업로드 파일 백업 중..."
FILES_DIR="$BACKUP_DIR/files"
mkdir -p "$FILES_DIR"

if [ -d "/data/files" ]; then
    # temp 폴더 제외하고 복사
    rsync -a --exclude='temp' /data/files/ "$FILES_DIR/"
    log "  - /data/files 완료 (temp 제외)"
else
    warn "  - /data/files 디렉토리 없음"
fi

# 6. tar.gz 압축
log "6/6. 압축 중..."
cd "$BACKUP_BASE"
tar -czf "$BACKUP_FILE" -C "$BACKUP_BASE" "$DATE"

# 임시 디렉토리 삭제
rm -rf "$BACKUP_DIR"

# 백업 파일 크기 확인
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "백업 완료: $BACKUP_FILE ($BACKUP_SIZE)"

# 오래된 백업 삭제
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
