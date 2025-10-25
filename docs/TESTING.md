# AIMS 테스트 가이드

문서 삭제 시 고객 참조 자동 정리 기능에 대한 유닛테스트 문서입니다.

## 📋 목차

- [테스트 개요](#테스트-개요)
- [로컬 테스트 실행](#로컬-테스트-실행)
- [CI/CD 자동 테스트](#cicd-자동-테스트)
- [테스트 상세](#테스트-상세)
- [문제 해결](#문제-해결)

---

## 테스트 개요

### 테스트 목적

문서 삭제 시 해당 문서를 참조하는 **모든 고객의 `documents` 배열에서 참조가 자동으로 제거**되는지 검증합니다.

### 테스트 범위

#### 1:1 관계
- ✅ 한 문서를 한 명의 고객이 참조
- ✅ 문서 삭제 시 고객의 `documents` 배열에서 제거
- ✅ 참조 없는 문서 삭제 시 정상 처리

#### 1:N 관계
- ✅ 한 문서를 여러 명(3명)의 고객이 참조
- ✅ 문서 삭제 시 모든 고객에서 참조 제거
- ✅ 10명 이상 대량 참조 처리
- ✅ 여러 문서 중 특정 문서만 선택적 제거

#### 메타데이터
- ✅ `meta.updated_at` 자동 갱신

---

## 로컬 테스트 실행

### 방법 1: 전체 테스트 한 번에 실행 (권장)

#### Windows
```bash
scripts\test-all.bat
```

#### Linux/Mac
```bash
./scripts/test-all.sh
```

**출력 예시:**
```
========================================
  AIMS 전체 테스트 실행
========================================

[1/2] Node.js API 테스트 실행 중...
----------------------------------------
✅ 2 test suites: 2 passed
✅ 23 tests: 23 passed

✅ Node.js API 테스트 통과!


[2/2] Python API 테스트 실행 중...
----------------------------------------
✅ 6 tests passed

✅ Python API 테스트 통과!

========================================
  테스트 결과 요약
========================================

✅ 모든 테스트 통과!
```

---

### 방법 2: 개별 테스트 실행

#### Node.js API 테스트만 실행
```bash
cd backend/api/aims_api
npm test
```

**특정 테스트 파일만:**
```bash
npm test -- __tests__/documentDeletion.test.js
```

#### Python API 테스트만 실행
```bash
cd backend/api/doc_status_api
python -m pytest -v
```

**특정 테스트만:**
```bash
python -m pytest tests/test_document_deletion.py -v
```

**특정 테스트 클래스만:**
```bash
python -m pytest tests/test_document_deletion.py::TestDocumentDeletionOneToMany -v
```

---

## CI/CD 자동 테스트

### GitHub Actions

**트리거:**
- `main` 또는 `develop` 브랜치에 푸시
- `main` 또는 `develop` 브랜치로 PR 생성

**자동 실행:**
1. ✅ MongoDB 서비스 시작
2. ✅ Frontend 테스트
3. ✅ Node.js Backend 테스트
4. ✅ Python API 테스트

**확인:**
```
https://github.com/aim2nasa/aims/actions
```

**실패 시:**
- 🔴 빨간색 X 표시
- 📧 이메일 알림 (설정된 경우)
- PR 머지 차단

---

## 테스트 상세

### Node.js API 테스트 (Jest)

**파일:** `backend/api/aims_api/__tests__/documentDeletion.test.js`

**테스트 케이스:**

#### 1. 1:1 관계
```javascript
test('문서 삭제 시 해당 고객의 documents 배열에서 참조 제거', async () => {
  // Given: 문서 1개 + 고객 1명
  // When: 문서 삭제
  // Then: 고객의 documents 배열이 비어있음
});

test('참조가 없는 문서 삭제 시 오류 없이 정상 처리', async () => {
  // Given: 참조 없는 문서
  // When: 문서 삭제
  // Then: 정상 삭제, 업데이트된 고객 0명
});
```

#### 2. 1:N 관계
```javascript
test('문서 삭제 시 모든 고객의 documents 배열에서 참조 제거', async () => {
  // Given: 문서 1개 + 고객 3명
  // When: 문서 삭제
  // Then: 3명 모두의 documents 배열이 비어있음
});

test('여러 문서를 참조하는 고객에서 특정 문서만 제거', async () => {
  // Given: 문서 2개 + 고객 1명 (2개 모두 참조)
  // When: 문서 1개만 삭제
  // Then: 삭제된 문서만 제거, 나머지 1개는 유지
});

test('10명 이상의 고객이 참조하는 문서 삭제 (대량 처리)', async () => {
  // Given: 문서 1개 + 고객 10명
  // When: 문서 삭제
  // Then: 10명 모두의 documents 배열이 비어있음
});
```

#### 3. 메타데이터
```javascript
test('고객 참조 정리 시 meta.updated_at이 갱신되는지 확인', async () => {
  // Given: 초기 updated_at 설정
  // When: 문서 삭제
  // Then: updated_at이 갱신됨
});
```

**실행:**
```bash
cd backend/api/aims_api
npm test -- __tests__/documentDeletion.test.js
```

**결과:**
```
✅ 6 tests passed
```

---

### Python API 테스트 (pytest)

**파일:** `backend/api/doc_status_api/tests/test_document_deletion.py`

**테스트 클래스:**

#### TestDocumentDeletionOneToOne (1:1 관계)
```python
def test_delete_document_removes_customer_reference(self):
    """문서 삭제 시 해당 고객의 documents 배열에서 참조 제거"""
    # Given: 문서 1개 + 고객 1명
    # When: 문서 삭제
    # Then: 고객의 documents 배열이 비어있음

def test_delete_document_without_reference(self):
    """참조가 없는 문서 삭제 시 오류 없이 정상 처리"""
    # Given: 참조 없는 문서
    # When: 문서 삭제
    # Then: 정상 삭제, 업데이트된 고객 0명
```

#### TestDocumentDeletionOneToMany (1:N 관계)
```python
def test_delete_document_removes_all_customer_references(self):
    """문서 삭제 시 모든 고객의 documents 배열에서 참조 제거"""
    # Given: 문서 1개 + 고객 3명
    # When: 문서 삭제
    # Then: 3명 모두의 documents 배열이 비어있음

def test_delete_one_document_keeps_other_references(self):
    """여러 문서를 참조하는 고객에서 특정 문서만 제거"""
    # Given: 문서 2개 + 고객 1명 (2개 모두 참조)
    # When: 문서 1개만 삭제
    # Then: 삭제된 문서만 제거, 나머지 1개는 유지

def test_delete_document_with_many_customers(self):
    """10명 이상의 고객이 참조하는 문서 삭제 (대량 처리)"""
    # Given: 문서 1개 + 고객 10명
    # When: 문서 삭제
    # Then: 10명 모두의 documents 배열이 비어있음
```

#### TestMetaUpdatedAt (메타데이터)
```python
def test_meta_updated_at_is_refreshed(self):
    """고객 참조 정리 시 meta.updated_at이 갱신되는지 확인"""
    # Given: 초기 updated_at 설정
    # When: 문서 삭제
    # Then: updated_at이 갱신됨
```

**실행:**
```bash
cd backend/api/doc_status_api
python -m pytest tests/test_document_deletion.py -v
```

**결과:**
```
✅ 6 tests passed
```

---

## 문제 해결

### Node.js 테스트 실패

#### MongoDB 연결 실패
```bash
Error: connect ECONNREFUSED 127.0.0.1:27017
```

**해결:**
```bash
# MongoDB가 실행 중인지 확인
mongosh

# 없다면 MongoDB 설치 또는 Docker로 실행
docker run -d -p 27017:27017 mongo:7.0
```

#### Jest 실행 안 됨
```bash
# 의존성 재설치
cd backend/api/aims_api
rm -rf node_modules package-lock.json
npm install
```

---

### Python 테스트 실패

#### pytest 없음
```bash
ModuleNotFoundError: No module named 'pytest'
```

**해결:**
```bash
cd backend/api/doc_status_api
pip install -r requirements.txt
```

#### pymongo 연결 실패
```bash
ServerSelectionTimeoutError: localhost:27017
```

**해결:**
- MongoDB가 실행 중인지 확인
- `MONGO_URI` 환경변수 확인

---

### 테스트 데이터 정리

테스트는 각 실행 후 자동으로 정리됩니다:

**Node.js:**
```javascript
afterEach(async () => {
  await filesCollection.deleteMany({ _id: { $regex: /^test-/ } });
  await customersCollection.deleteMany({ _id: { $regex: /^test-/ } });
});
```

**Python:**
```python
@pytest.fixture(autouse=True)
def cleanup(files_collection, customers_collection):
    yield
    files_collection.delete_many({"_id": {"$regex": "^test-"}})
    customers_collection.delete_many({"_id": {"$regex": "^test-"}})
```

---

## 테스트 추가 방법

### Node.js 테스트 추가

1. `backend/api/aims_api/__tests__/` 디렉토리에 `*.test.js` 파일 생성
2. Jest 테스트 작성
3. `npm test` 실행 → 자동 감지

### Python 테스트 추가

1. `backend/api/doc_status_api/tests/` 디렉토리에 `test_*.py` 파일 생성
2. pytest 테스트 작성 (`test_` 또는 `Test*` 클래스)
3. `pytest` 실행 → 자동 감지

---

## 참고 자료

- **Jest 문서:** https://jestjs.io/
- **pytest 문서:** https://docs.pytest.org/
- **GitHub Actions:** https://docs.github.com/en/actions
- **MongoDB 테스팅:** https://www.mongodb.com/docs/manual/core/testing/

---

## 문의

테스트 관련 문제가 있으면 GitHub Issues에 등록해주세요:
```
https://github.com/aim2nasa/aims/issues
```
