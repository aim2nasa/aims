# AIMS SmartSearch Webhook 자동화 테스트

## 개요

이 테스트 스위트는 다음 워크플로우를 자동화합니다:

1. **시드 데이터 삽입**: MongoDB에 테스트용 문서 삽입
2. **웹훅 호출**: SmartSearch 엔드포인트 호출
3. **결과 검증**: 기대값(스냅샷)과 비교
4. **데이터 정리**: 테스트 후 삽입한 데이터 삭제

## 빠른 시작

### 1. 의존성 설치
```bash
cd tests/backend-api/smartsearch
npm install
```

### 2. 테스트 실행 (크로스 플랫폼 지원)

#### 🌟 **권장: 크로스 플랫폼 실행기** (Windows/Linux/macOS 모두 지원)
```bash
node ../../../run-test.js
```

#### 📋 **플랫폼별 실행 방법**

**Windows (명령 프롬프트/PowerShell):**
```batch
# 배치 파일 실행
run-smartsearch-test.bat

# 또는 npm 스크립트
npm run test:win
```

**Linux/macOS/WSL:**
```bash
# 셸 스크립트 실행
./run-smartsearch-test.sh

# 또는 npm 스크립트
npm run test:unix
```

**범용 실행 (모든 플랫폼):**
```bash
# 기본 실행
npm test

# 상세 로깅
npm run test:verbose

# 감시 모드 (개발용)
npm run test:watch
```

## 테스트 데이터

테스트는 다음과 같은 시드 데이터를 사용합니다:

- `TEST_SMARTSEARCH_보험청구서_001.pdf`: 홍길동의 보험청구서
- `TEST_SMARTSEARCH_진단서_002.pdf`: 김영희의 의사진단서
- `TEST_SMARTSEARCH_사고경위서_003.jpg`: 교통사고 경위서

모든 테스트 데이터는 `TEST_SMARTSEARCH_` 접두사로 식별되어 정리 시 안전하게 삭제됩니다.

## 테스트 쿼리

다음 쿼리들로 검색 기능을 검증합니다:

- `"보험청구서"` → 1개 문서 예상
- `"진단서"` → 1개 문서 예상
- `"사고"` → 1개 문서 예상
- `"홍길동"` → 1개 문서 예상
- `"교통사고"` → 1개 문서 예상
- `"존재하지않는문서"` → 0개 문서 예상

## 설정

`smartsearch-automation.test.js`의 `TEST_CONFIG` 객체에서 설정을 변경할 수 있습니다:

```javascript
const TEST_CONFIG = {
  MONGO_URI: 'mongodb://tars:27017/',
  DB_NAME: 'docupload',
  COLLECTION_NAME: 'files',
  WEBHOOK_URL: 'https://n8nd.giize.com/webhook/smartsearch',
  TEST_PREFIX: 'TEST_SMARTSEARCH_'
};
```

## 안전성

- 모든 테스트 데이터는 특별한 접두사(`TEST_SMARTSEARCH_`)로 식별
- 테스트 완료 후 자동으로 삽입된 데이터만 삭제
- 실제 운영 데이터에 영향 없음

## 문제 해결

### MongoDB 연결 오류
```
✅ MongoDB가 tars:27017에서 실행 중인지 확인
✅ 네트워크 연결 확인
```

### 웹훅 호출 오류
```
✅ n8nd.giize.com이 접근 가능한지 확인
✅ 방화벽 설정 확인
```

### 테스트 데이터 정리 실패
```bash
# 수동으로 테스트 데이터 정리
mongo mongodb://tars:27017/docupload --eval "
db.files.deleteMany({
  'upload.originalName': {
    \$regex: '^TEST_SMARTSEARCH_',
    \$options: 'i'
  }
});
"
```

## 결과 해석

테스트 성공 시:
```
✅ 테스트 성공!
총 쿼리 수: 6
성공한 쿼리: 6/6
스냅샷 비교: ✅ 일치
```

테스트 실패 시:
```
❌ 테스트 실패!
❌ "보험청구서": 0개 테스트 문서 발견 (1개 예상)
스냅샷 비교: ❌ 불일치
```

## 고급 사용법

### 커스텀 스냅샷 비교

```javascript
const SmartSearchTestSuite = require('./smartsearch-automation.test');

const testSuite = new SmartSearchTestSuite();

// 기존 스냅샷과 비교
const expectedSnapshot = [
  { success: true, testDocsFound: 1 },
  // ... 더 많은 예상 결과
];

testSuite.runFullTest(expectedSnapshot);
```

### 개별 기능 테스트

```javascript
const testSuite = new SmartSearchTestSuite();

await testSuite.setup();
await testSuite.seedData();
const result = await testSuite.testSmartSearchEndpoint("보험청구서");
await testSuite.cleanup();
await testSuite.teardown();
```