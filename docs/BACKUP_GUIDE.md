# AIMS 서비스 백업 가이드

## 개요

AIMS 서비스의 데이터 백업 및 복원 절차를 정의합니다.

---

## 백업 대상

| 대상 | 경로 | 크기 (약) | 설명 |
|------|------|----------|------|
| **환경 파일** | `/home/rossi/aims/backend/api/*/. env` | ~2KB | API 키, OAuth, JWT 시크릿 |
| **MongoDB** | `tars:27017` | ~16MB | 사용자, 고객, 문서 메타데이터 |
| **Qdrant** | `/home/rossi/qdrant/qdrant_storage` | ~49MB | 벡터 임베딩 (RAG 검색) |
| **업로드 파일** | `/data/files` | ~162MB | 사용자 업로드 문서 원본 |

### 소스 코드
- GitHub에서 관리되므로 **별도 백업 불필요**
- 복구: `git clone` 후 `npm install`

---

## 백업 상세

### 1. 환경 파일 (Git에 포함되지 않음)

```
/home/rossi/aims/backend/api/aims_api/.env
/home/rossi/aims/backend/api/annual_report_api/.env
```

| 파일 | 포함 내용 |
|------|----------|
| `aims_api/.env` | JWT_SECRET, SESSION_SECRET, OAuth 키 (카카오/네이버/구글), 네이버 Maps API, n8n API |
| `annual_report_api/.env` | MongoDB URI, OpenAI API 키 |

### 2. MongoDB

| DB | 용도 |
|----|------|
| `docupload` | 메인 DB (users, customers, files, contracts, insuranceProducts 등) |
| `aims_analytics` | 분석/통계 데이터 |

### 3. Qdrant (벡터 DB)

```
/home/rossi/qdrant/qdrant_storage/
├── aliases/
├── collections/      # 벡터 임베딩 데이터
│   └── docembed/     # 문서 임베딩 컬렉션
├── .deleted/
└── raft_state.json
```

- Docker로 실행: `qdrant/qdrant:v1.9.0`
- 포트: 6333-6334

### 4. 업로드 파일

```
/data/files/
├── inquiries/           # 1:1 문의 첨부파일
│   ├── {inquiryId}/     # 문의별 폴더
│   └── temp/            # 임시 파일 (백업 제외)
└── users/               # 사용자별 문서
    └── {userId}/
        └── {year}/{month}/
            └── *.pdf, *.jpg, *.hwp, *.xlsx ...
```

---

## 백업 스크립트

### 위치
```
/home/rossi/aims/backend/scripts/backup_aims.sh
```

### 실행 방법
```bash
# 수동 실행
/home/rossi/aims/backend/scripts/backup_aims.sh

# 또는
cd /home/rossi/aims/backend/scripts
./backup_aims.sh
```

### 백업 결과
```
/data/backup/
├── aims_backup_20251219_041228.tar.gz    # 백업 파일
├── backup_20251219_041228.log            # 로그
└── cron.log                              # cron 실행 로그
```

### 백업 파일 구조
```
aims_backup_YYYYMMDD_HHMMSS.tar.gz
└── YYYYMMDD_HHMMSS/
    ├── env/                    # 환경 파일
    │   ├── aims_api.env
    │   └── annual_report_api.env
    ├── mongodb/                # MongoDB 덤프
    │   ├── docupload/
    │   └── aims_analytics/
    ├── qdrant/                 # Qdrant 벡터 DB
    │   ├── collections/
    │   └── ...
    └── files/                  # 업로드 파일
        ├── inquiries/
        └── users/
```

---

## 자동 백업 설정 (cron)

### 설정 방법
```bash
# crontab 편집
crontab -e

# 매일 새벽 3시 백업
0 3 * * * /home/rossi/aims/backend/scripts/backup_aims.sh >> /data/backup/cron.log 2>&1
```

### 보관 정책
- **기본 보관 기간**: 7일
- 스크립트 내 `RETENTION_DAYS` 변수로 조정 가능
- 7일 이상 된 백업 파일 자동 삭제

---

## 복원 절차

### 1. 환경 파일 복원
```bash
# 백업 파일 압축 해제
tar -xzf aims_backup_YYYYMMDD_HHMMSS.tar.gz

# 환경 파일 복원
cp YYYYMMDD_HHMMSS/env/aims_api.env /home/rossi/aims/backend/api/aims_api/.env
cp YYYYMMDD_HHMMSS/env/annual_report_api.env /home/rossi/aims/backend/api/annual_report_api/.env
```

### 2. MongoDB 복원
```bash
# 전체 복원 (주의: 기존 데이터 덮어씀)
mongorestore --drop YYYYMMDD_HHMMSS/mongodb/

# 특정 DB만 복원
mongorestore --drop --db docupload YYYYMMDD_HHMMSS/mongodb/docupload/
mongorestore --drop --db aims_analytics YYYYMMDD_HHMMSS/mongodb/aims_analytics/
```

### 3. Qdrant 복원
```bash
# Qdrant 컨테이너 중지
docker stop qdrant

# 기존 데이터 백업 (선택)
mv /home/rossi/qdrant/qdrant_storage /home/rossi/qdrant/qdrant_storage_old

# 복원
cp -r YYYYMMDD_HHMMSS/qdrant /home/rossi/qdrant/qdrant_storage

# 권한 설정
sudo chown -R root:root /home/rossi/qdrant/qdrant_storage

# Qdrant 재시작
docker start qdrant
```

### 4. 업로드 파일 복원
```bash
# 기존 파일 백업 (선택)
mv /data/files /data/files_old

# 복원
cp -r YYYYMMDD_HHMMSS/files /data/files

# 권한 설정
sudo chown -R rossi:rossi /data/files/users
sudo chown -R root:root /data/files/inquiries
```

---

## 전체 복원 예시

```bash
#!/bin/bash
# 전체 복원 스크립트 예시

BACKUP_FILE="/data/backup/aims_backup_20251219_041228.tar.gz"
RESTORE_DIR="/tmp/aims_restore"

# 1. 압축 해제
mkdir -p $RESTORE_DIR
tar -xzf $BACKUP_FILE -C $RESTORE_DIR
cd $RESTORE_DIR/*/

# 2. 서비스 중지
pm2 stop all
docker stop qdrant

# 3. 환경 파일 복원
cp env/aims_api.env /home/rossi/aims/backend/api/aims_api/.env
cp env/annual_report_api.env /home/rossi/aims/backend/api/annual_report_api/.env

# 4. MongoDB 복원
mongorestore --drop mongodb/

# 5. Qdrant 복원
rm -rf /home/rossi/qdrant/qdrant_storage
cp -r qdrant /home/rossi/qdrant/qdrant_storage

# 6. 파일 복원
rm -rf /data/files
cp -r files /data/files

# 7. 서비스 재시작
docker start qdrant
pm2 start all

# 8. 정리
rm -rf $RESTORE_DIR

echo "복원 완료!"
```

---

## 주의사항

1. **복원 전 반드시 현재 상태 백업**
2. **MongoDB 복원 시 `--drop` 옵션은 기존 데이터 삭제**
3. **Qdrant 복원 후 권한 설정 필수** (root:root)
4. **업로드 파일 권한 확인** (users: rossi, inquiries: root)
5. **복원 후 서비스 재시작 필수**

---

## 디스크 정보

| 파티션 | 크기 | 용도 |
|--------|------|------|
| `/` | 116GB | 시스템, 애플리케이션 |
| `/data` | 1.8TB | 백업, 업로드 파일 |

백업 저장소: `/data/backup` (1.7TB 여유 공간)

---

## 문의

백업/복원 관련 문제 발생 시 시스템 관리자에게 문의하세요.
