#!/bin/bash

###############################################################################
# AIMS 파일 디렉토리 정리 스크립트
#
# 목적: 사용자 계정 기능 도입을 위해 기존 파일을 깨끗하게 삭제
#
# 실행 방법:
#   chmod +x clean_files.sh
#   ./clean_files.sh
#
# 주의: 이 스크립트는 /data/files 디렉토리를 완전히 삭제합니다!
###############################################################################

set -e  # 오류 발생 시 즉시 중단

echo "========================================"
echo "AIMS 파일 디렉토리 정리 시작"
echo "========================================"
echo ""

# 파일 디렉토리 경로
OLD_BASE="/data/files"

# 1. 현재 상태 확인
echo "[1/4] 현재 디렉토리 상태 확인..."
if [ -d "$OLD_BASE" ]; then
  FILE_COUNT=$(find "$OLD_BASE" -type f 2>/dev/null | wc -l)
  DIR_SIZE=$(du -sh "$OLD_BASE" 2>/dev/null | cut -f1)
  echo "  디렉토리: $OLD_BASE"
  echo "  파일 개수: $FILE_COUNT"
  echo "  총 크기: $DIR_SIZE"
else
  echo "  ℹ️  디렉토리가 존재하지 않습니다: $OLD_BASE"
  exit 0
fi

echo ""
echo "⚠️  경고: 5초 후 파일을 삭제합니다..."
echo ""
sleep 5

# 2. 파일 삭제
echo "[2/4] 파일 디렉토리 삭제 중..."
rm -rf "$OLD_BASE"
echo "  ✅ 삭제 완료: $OLD_BASE"

# 3. 새 디렉토리 생성
echo "[3/4] 새 디렉토리 구조 생성 중..."
mkdir -p "$OLD_BASE"
echo "  ✅ 생성 완료: $OLD_BASE"

# 4. 권한 설정 (필요 시)
echo "[4/4] 권한 설정 중..."
chmod 755 "$OLD_BASE"
echo "  ✅ 권한 설정 완료"

echo ""
echo "========================================"
echo "파일 디렉토리 정리 완료! ✨"
echo "========================================"
echo "삭제된 파일: $FILE_COUNT 개"
echo "정리된 공간: $DIR_SIZE"
echo "새 디렉토리: $OLD_BASE (빈 상태)"
echo "========================================"
echo ""
