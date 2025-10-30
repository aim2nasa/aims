# 빠른 시작 가이드

Node.js 의존성 없이 바로 실행 가능한 간단한 방법입니다.

---

## 🚀 3단계 실행 (추천)

```bash
# tars 서버에서 실행

# 1단계: MongoDB 정리
chmod +x clean_database_simple.sh
./clean_database_simple.sh

# 2단계: 파일 시스템 정리
chmod +x clean_files.sh
./clean_files.sh

# 3단계: 검증
chmod +x verify_clean_simple.sh
./verify_clean_simple.sh
```

---

## 📝 각 단계별 설명

### 1단계: clean_database_simple.sh

- **의존성**: mongosh만 필요 (Node.js 불필요)
- **대기 시간**: 3초
- **기능**: files/customers 컬렉션 삭제 + 인덱스 생성

### 2단계: clean_files.sh

- **의존성**: 없음 (bash 표준)
- **대기 시간**: 5초
- **기능**: /data/files 디렉토리 삭제 및 재생성

### 3단계: verify_clean_simple.sh

- **의존성**: mongosh만 필요 (Node.js 불필요)
- **기능**: MongoDB + 파일 시스템 검증
- **Exit Code**: 0=성공, 1=실패

---

## ⚡ 한 번에 실행 (고급)

```bash
chmod +x clean_database_simple.sh clean_files.sh verify_clean_simple.sh && \
./clean_database_simple.sh && \
./clean_files.sh && \
./verify_clean_simple.sh
```

---

## 🔍 문제: mongosh가 없는 경우

### 확인 방법
```bash
which mongosh
```

### 없으면 mongo 사용
`clean_database_simple.sh`와 `verify_clean_simple.sh`에서 `mongosh`를 `mongo`로 변경:

```bash
# 전체 파일에서 mongosh를 mongo로 변경
sed -i 's/mongosh/mongo/g' clean_database_simple.sh
sed -i 's/mongosh/mongo/g' verify_clean_simple.sh
```

---

## ✅ 성공 확인

`verify_clean_simple.sh` 실행 후 다음과 같이 출력되면 성공:

```
========================================
검증 결과
========================================
✅ 데이터베이스 정리 완료!
✅ 모든 컬렉션이 비어있습니다.
✅ 필수 인덱스가 생성되었습니다.
✅ 파일 디렉토리가 비어있습니다.

다음 단계: 백엔드 API 수정 진행
========================================
```

---

## 🎯 다음 단계

Phase 1 완료! 이제 백엔드 API 수정:
- `backend/api/aims_api/server.js`
- `backend/api/doc_status_api/main.py`
- `backend/api/annual_report_api/routes/query.py`

---

**작성일**: 2025-10-30
