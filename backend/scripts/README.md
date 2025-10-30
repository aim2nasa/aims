# AIMS 데이터 정리 스크립트

사용자 계정 기능 도입을 위해 기존 데이터를 깨끗하게 삭제하는 스크립트입니다.

---

## 📁 파일 목록

| 파일 | 용도 | 실행 위치 |
|------|------|-----------|
| `clean_database.js` | MongoDB 컬렉션 삭제 및 인덱스 생성 | tars 서버 |
| `clean_files.sh` | 파일 디렉토리 삭제 | tars 서버 |
| `verify_clean.js` | 정리 결과 검증 | tars 서버 |
| `MANUAL_CLEANUP_GUIDE.md` | 수동 정리 가이드 | 참고용 |

---

## 🚀 빠른 시작

### 방법 1: 자동 스크립트 실행 (권장)

```bash
# 1. tars 서버 접속
ssh tars.giize.com

# 2. 스크립트 디렉토리로 이동
cd /home/rossi/aims/backend/scripts

# 3. MongoDB 정리
node clean_database.js

# 4. 파일 시스템 정리
chmod +x clean_files.sh
./clean_files.sh

# 5. 결과 검증
node verify_clean.js
```

### 방법 2: 수동 실행

`MANUAL_CLEANUP_GUIDE.md` 파일을 참고하세요.

---

## 📝 상세 사용법

### 1. clean_database.js

**목적**: MongoDB의 files와 customers 컬렉션을 삭제하고 새 인덱스 생성

**실행**:
```bash
node clean_database.js
```

**출력 예시**:
```
========================================
AIMS 데이터베이스 정리 시작
========================================

[1/5] files 컬렉션 현재 문서 수: 42
[2/5] customers 컬렉션 현재 문서 수: 15

⚠️  경고: 3초 후 컬렉션을 삭제합니다...

[3/5] ✅ files 컬렉션 삭제 완료
[4/5] ✅ customers 컬렉션 삭제 완료
[5/5] 인덱스 생성 중...
  ✅ files.owner_id 인덱스 생성 완료
  ✅ customers.meta.created_by 인덱스 생성 완료

========================================
데이터베이스 정리 완료! ✨
========================================
삭제된 files 문서: 42개
삭제된 customers 문서: 15개
생성된 인덱스: 2개
========================================
```

**주의사항**:
- 3초 대기 시간 동안 Ctrl+C로 중단 가능
- 컬렉션이 없어도 오류 없이 진행
- 인덱스는 자동으로 재생성

---

### 2. clean_files.sh

**목적**: `/data/files` 디렉토리를 삭제하고 빈 디렉토리 생성

**실행**:
```bash
chmod +x clean_files.sh  # 최초 1회만
./clean_files.sh
```

**출력 예시**:
```
========================================
AIMS 파일 디렉토리 정리 시작
========================================

[1/4] 현재 디렉토리 상태 확인...
  디렉토리: /data/files
  파일 개수: 128
  총 크기: 45M

⚠️  경고: 5초 후 파일을 삭제합니다...

[2/4] 파일 디렉토리 삭제 중...
  ✅ 삭제 완료: /data/files
[3/4] 새 디렉토리 구조 생성 중...
  ✅ 생성 완료: /data/files
[4/4] 권한 설정 중...
  ✅ 권한 설정 완료

========================================
파일 디렉토리 정리 완료! ✨
========================================
삭제된 파일: 128 개
정리된 공간: 45M
새 디렉토리: /data/files (빈 상태)
========================================
```

**주의사항**:
- 5초 대기 시간 동안 Ctrl+C로 중단 가능
- 디렉토리가 없어도 오류 없이 진행
- 권한은 755로 자동 설정

---

### 3. verify_clean.js

**목적**: 정리가 올바르게 완료되었는지 검증

**실행**:
```bash
node verify_clean.js
```

**출력 예시 (성공)**:
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

**출력 예시 (실패)**:
```
========================================
검증 결과
========================================
❌ 정리가 완전히 완료되지 않았습니다:
  - files 문서 5개 남아있음
  - owner_id 인덱스 없음
========================================
```

**Exit Code**:
- `0`: 성공
- `1`: 실패

---

## ⚠️ 주의사항

### 실행 전

1. **백업 생성 (선택적)**:
   ```bash
   # MongoDB 백업
   mongodump --host tars:27017 --db docupload --out /data/backups/backup-$(date +%Y%m%d-%H%M%S)/mongodb

   # 파일 백업
   tar -czf /data/backups/files-backup-$(date +%Y%m%d-%H%M%S).tar.gz /data/files
   ```

2. **데이터 손실 동의**: 이 작업은 **영구적**이며 되돌릴 수 없습니다 (백업 없이는).

3. **서버 확인**: tars 서버에 SSH 접속 가능한지 확인.

### 실행 중

- **대기 시간**: 스크립트는 삭제 전 3-5초 대기합니다. Ctrl+C로 중단 가능.
- **권한 문제**: 권한 부족 시 `sudo`로 실행하세요.

### 실행 후

1. **verify_clean.js 실행** 필수
2. **모든 체크가 ✅인지 확인**
3. **다음 단계**: 백엔드 API 수정 진행

---

## 🔧 문제 해결

### MongoDB 접속 실패

```bash
# MongoDB 상태 확인
sudo systemctl status mongod

# MongoDB 재시작
sudo systemctl restart mongod
```

### 권한 부족

```bash
# sudo로 실행
sudo node clean_database.js
sudo ./clean_files.sh
```

### 스크립트 실행 안됨

```bash
# 실행 권한 부여
chmod +x clean_files.sh

# Node.js 설치 확인
node --version  # v14 이상 필요
```

---

## 📊 체크리스트

실행 전:
- [ ] tars 서버 SSH 접속 확인
- [ ] MongoDB 접속 확인
- [ ] 백업 생성 (선택적)
- [ ] 데이터 손실 동의

실행:
- [ ] `node clean_database.js` 실행
- [ ] `./clean_files.sh` 실행
- [ ] `node verify_clean.js` 실행

실행 후:
- [ ] 모든 검증 체크가 ✅
- [ ] files 컬렉션 0개
- [ ] customers 컬렉션 0개
- [ ] owner_id 인덱스 존재
- [ ] meta.created_by 인덱스 존재
- [ ] /data/files 비어있음

---

## 📚 참고 문서

- [USER_ACCOUNT_MIGRATION_PLAN.md](../../docs/USER_ACCOUNT_MIGRATION_PLAN.md) - 전체 마이그레이션 계획
- [MANUAL_CLEANUP_GUIDE.md](./MANUAL_CLEANUP_GUIDE.md) - 수동 정리 가이드

---

**작성일**: 2025-10-30
**다음 단계**: 백엔드 API 수정 (Phase 1 - Step 2)
