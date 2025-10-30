# AIMS 데이터 수동 정리 가이드

스크립트를 사용하지 않고 직접 MongoDB와 파일 시스템을 정리하는 방법입니다.

---

## 📋 목차

1. [MongoDB 수동 정리](#1-mongodb-수동-정리)
2. [파일 시스템 수동 정리](#2-파일-시스템-수동-정리)
3. [검증 방법](#3-검증-방법)
4. [롤백 방법](#4-롤백-방법)

---

## 1. MongoDB 수동 정리

### 1.1 MongoDB Shell 접속

```bash
# tars 서버에 SSH 접속
ssh tars.giize.com

# MongoDB Shell 실행
mongo tars:27017/docupload
```

### 1.2 컬렉션 삭제

MongoDB Shell에서 다음 명령어를 실행:

```javascript
// 현재 상태 확인
db.files.countDocuments()
db.customers.countDocuments()

// files 컬렉션 삭제
db.files.drop()

// customers 컬렉션 삭제
db.customers.drop()

// 결과 확인
db.files.countDocuments()       // 0이어야 함
db.customers.countDocuments()   // 0이어야 함
```

### 1.3 인덱스 생성

```javascript
// files 컬렉션에 owner_id 인덱스 생성
db.files.createIndex({ owner_id: 1 })

// customers 컬렉션에 created_by 인덱스 생성
db.customers.createIndex({ "meta.created_by": 1 })

// 인덱스 확인
db.files.getIndexes()
db.customers.getIndexes()
```

**기대 결과**:

`db.files.getIndexes()`:
```json
[
  { "v": 2, "key": { "_id": 1 }, "name": "_id_" },
  { "v": 2, "key": { "owner_id": 1 }, "name": "owner_id_1" }
]
```

`db.customers.getIndexes()`:
```json
[
  { "v": 2, "key": { "_id": 1 }, "name": "_id_" },
  { "v": 2, "key": { "meta.created_by": 1 }, "name": "meta.created_by_1" }
]
```

### 1.4 MongoDB Shell 종료

```javascript
exit
```

---

## 2. 파일 시스템 수동 정리

### 2.1 현재 상태 확인

```bash
# tars 서버에 SSH 접속 (이미 접속했다면 생략)
ssh tars.giize.com

# 파일 개수 확인
find /data/files -type f | wc -l

# 디스크 사용량 확인
du -sh /data/files
```

### 2.2 파일 삭제

**⚠️ 주의**: 이 명령은 모든 파일을 영구적으로 삭제합니다!

```bash
# 백업 (선택적)
tar -czf /data/backups/files-backup-$(date +%Y%m%d-%H%M%S).tar.gz /data/files

# 파일 삭제
rm -rf /data/files

# 새 디렉토리 생성
mkdir -p /data/files

# 권한 설정
chmod 755 /data/files
```

### 2.3 결과 확인

```bash
# 디렉토리 존재 확인
ls -la /data/files

# 빈 디렉토리인지 확인
find /data/files -type f | wc -l  # 0이어야 함
```

---

## 3. 검증 방법

### 3.1 MongoDB 검증

```bash
# MongoDB Shell 실행
mongo tars:27017/docupload

# 다음 명령어 실행
db.files.countDocuments()       // 0이어야 함
db.customers.countDocuments()   // 0이어야 함

db.files.getIndexes()           // owner_id 인덱스 확인
db.customers.getIndexes()       // meta.created_by 인덱스 확인

exit
```

### 3.2 파일 시스템 검증

```bash
# 파일 개수 확인 (0이어야 함)
find /data/files -type f | wc -l

# 디렉토리 존재 확인
ls -la /data/files
```

### 3.3 스크립트로 검증 (권장)

```bash
# verify_clean.js 실행
cd /home/rossi/aims/backend/scripts
node verify_clean.js
```

**기대 출력**:
```
========================================
AIMS 데이터베이스 정리 검증
========================================

[1/4] files 컬렉션 문서 수: 0
[2/4] customers 컬렉션 문서 수: 0

[3/4] files 컬렉션 인덱스:
  - _id_: { _id }
  - owner_id_1: { owner_id }
  ✅ owner_id 인덱스 확인됨

[4/4] customers 컬렉션 인덱스:
  - _id_: { _id }
  - meta.created_by_1: { meta.created_by }
  ✅ meta.created_by 인덱스 확인됨

========================================
검증 결과
========================================
✅ 데이터베이스 정리 완료!
✅ 모든 컬렉션이 비어있습니다.
✅ 필수 인덱스가 생성되었습니다.

다음 단계: 백엔드 API 수정 진행
========================================
```

---

## 4. 롤백 방법

### 4.1 MongoDB 롤백

백업이 있는 경우:

```bash
# 백업 디렉토리 확인
ls -la /data/backups/

# mongorestore 실행
mongorestore --host tars:27017 --db docupload --drop /data/backups/migration-YYYYMMDD-HHMMSS/mongodb/docupload
```

### 4.2 파일 시스템 롤백

백업이 있는 경우:

```bash
# 백업 확인
ls -la /data/backups/files-backup-*.tar.gz

# 복원
tar -xzf /data/backups/files-backup-YYYYMMDD-HHMMSS.tar.gz -C /
```

---

## 5. 빠른 명령어 체크리스트

### MongoDB 정리 (한 번에)

```bash
mongo tars:27017/docupload <<EOF
db.files.drop()
db.customers.drop()
db.files.createIndex({ owner_id: 1 })
db.customers.createIndex({ "meta.created_by": 1 })
db.files.countDocuments()
db.customers.countDocuments()
exit
EOF
```

### 파일 시스템 정리 (한 번에)

```bash
rm -rf /data/files && mkdir -p /data/files && chmod 755 /data/files && ls -la /data/files
```

---

## 6. 문제 해결

### 문제: MongoDB 접속 안됨

```bash
# MongoDB 상태 확인
sudo systemctl status mongod

# MongoDB 재시작
sudo systemctl restart mongod
```

### 문제: 권한 부족

```bash
# sudo로 실행
sudo rm -rf /data/files
sudo mkdir -p /data/files
sudo chmod 755 /data/files
```

### 문제: 컬렉션이 삭제되지 않음

```javascript
// MongoDB Shell에서
db.files.deleteMany({})      // 모든 문서 삭제
db.customers.deleteMany({})  // 모든 문서 삭제

// 또는 강제 드롭
db.runCommand({ drop: "files" })
db.runCommand({ drop: "customers" })
```

---

## 7. 안전 확인 사항

실행 전 반드시 확인:

- [ ] 백업 생성 완료 (선택적)
- [ ] 기존 데이터 손실 동의
- [ ] tars 서버 SSH 접속 확인
- [ ] MongoDB 접속 확인
- [ ] 충분한 권한 확인

실행 후 반드시 확인:

- [ ] `db.files.countDocuments()` = 0
- [ ] `db.customers.countDocuments()` = 0
- [ ] `db.files.getIndexes()` - owner_id 인덱스 존재
- [ ] `db.customers.getIndexes()` - meta.created_by 인덱스 존재
- [ ] `find /data/files -type f | wc -l` = 0
- [ ] `ls -la /data/files` - 빈 디렉토리

---

**작성일**: 2025-10-30
**다음 단계**: 백엔드 API 수정 (`server.js`, `main.py` 등)
