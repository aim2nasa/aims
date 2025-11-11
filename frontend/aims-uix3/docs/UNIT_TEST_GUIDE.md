# 🧪 AIMS UIX3 Unit Test 실행 가이드

**작성일**: 2025-10-14
**대상**: AIMS UIX3 개발자
**테스트 프레임워크**: Vitest v3.2.4

---

## 📋 목차

1. [기본 실행 방법](#-기본-실행-방법)
2. [고급 실행 옵션](#-고급-실행-옵션)
3. [프로젝트 테스트 파일 구조](#-프로젝트-테스트-파일-구조)
4. [실전 예제](#-실전-예제)
5. [테스트 결과 읽기](#-테스트-결과-읽기)
6. [문제 해결 (Troubleshooting)](#-문제-해결-troubleshooting)
7. [package.json 스크립트](#-packagejson-스크립트)
8. [유용한 팁](#-유용한-팁)
9. [CI/CD 통합](#-cicd-통합)

---

## 🚀 기본 실행 방법

### 1. 모든 테스트 실행 (Watch 모드) ⭐ 추천

```bash
cd frontend/aims-uix3
npm test
```

**특징**:
- 파일 변경 감지 시 자동으로 재실행
- 개발 중 가장 많이 사용하는 모드
- 실시간 피드백으로 빠른 개발 가능

**Watch 모드 단축키**:
- `a`: 모든 테스트 재실행
- `f`: 실패한 테스트만 재실행
- `t`: 테스트 이름으로 필터링
- `p`: 파일 경로로 필터링
- `q`: 종료

---

### 2. 모든 테스트 1회 실행 (CI/CD용)

```bash
npm test -- --run
```

**특징**:
- Watch 모드 없이 1회만 실행하고 종료
- CI/CD 파이프라인에서 사용
- 커밋 전 최종 확인용

**출력 예시**:
```
✓ src/entities/customer/model.test.ts (37 tests) 15ms
✓ src/services/searchService.test.ts (38 tests) 12ms

Test Files  10 passed (10)
     Tests  310 passed (310)
  Start at  22:00:00
  Duration  1.50s
```

---

### 3. 특정 파일만 테스트

```bash
# 단일 파일 실행
npm test -- src/entities/customer/model.test.ts

# 디렉토리 내 모든 테스트 실행
npm test -- src/entities/customer/

# 여러 파일 동시 실행
npm test -- src/entities/customer/model.test.ts src/services/searchService.test.ts
```

**활용 시나리오**:
- 특정 기능 개발 중
- 빠른 피드백이 필요할 때
- 디버깅 시

---

### 4. 테스트 이름으로 필터링

```bash
# "Customer"가 포함된 테스트만 실행
npm test -- -t "Customer"

# "getDisplayName" 테스트만 실행
npm test -- -t "getDisplayName"

# 정규표현식 사용
npm test -- -t "get.*Name"
```

**예시**:
```bash
# DocumentUtils의 모든 정렬 테스트 실행
npm test -- -t "sort"

# 출력:
# ✓ sortByFilename
# ✓ sortByUploadDate
# ✓ sortBySize
# ✓ sortByFileType
```

---

## 🎯 고급 실행 옵션

### 커버리지 리포트 생성

```bash
npm test -- --coverage
```

**생성되는 리포트**:
- `coverage/index.html`: HTML 리포트 (브라우저에서 확인)
- `coverage/lcov.info`: LCOV 형식 (CI/CD 도구용)
- `coverage/coverage-final.json`: JSON 형식

**커버리지 확인하기**:
```bash
# 리포트 생성 후 브라우저에서 열기
npm test -- --coverage
open coverage/index.html  # macOS
start coverage/index.html # Windows
```

---

### UI 모드 (Vitest UI) 🎨

```bash
npm test -- --ui
```

**특징**:
- 브라우저에서 테스트 결과 확인
- 테스트 구조를 트리로 시각화
- 개별 테스트 실행 및 디버깅 가능
- 실시간 업데이트

**자동으로 열리는 주소**: `http://localhost:51204/__vitest__/`

---

### Verbose 모드 (상세 로그)

```bash
npm test -- --reporter=verbose
```

**출력 예시**:
```
✓ src/entities/customer/model.test.ts
  ✓ DocumentUtils.getDisplayName
    ✓ originalName이 있으면 우선 반환한다 (2ms)
    ✓ originalName이 없으면 filename을 반환한다 (1ms)
    ✓ 둘 다 없으면 "이름 없음"을 반환한다 (1ms)
```

---

### 병렬 실행 제어

```bash
# 단일 스레드로 실행 (디버깅용)
npm test -- --no-threads

# 최대 워커 수 지정
npm test -- --max-workers=4

# 순차 실행 (테스트 간 의존성이 있을 때)
npm test -- --sequence.concurrent=false
```

---

### 타임아웃 설정

```bash
# 테스트 타임아웃 10초로 설정
npm test -- --test-timeout=10000

# Hook 타임아웃 5초로 설정
npm test -- --hook-timeout=5000
```

---

## 📂 프로젝트 테스트 파일 구조

```
frontend/aims-uix3/
├── src/
│   ├── entities/                    # 도메인 엔티티 (176개 테스트)
│   │   ├── customer/
│   │   │   ├── model.ts
│   │   │   ├── model.test.ts        ✅ 37개 테스트
│   │   │   ├── schema.ts
│   │   │   └── schema.test.ts       ✅ 36개 테스트
│   │   └── document/
│   │       ├── model.ts
│   │       ├── model.test.ts        ✅ 70개 테스트
│   │       ├── DocumentProcessingModule.ts
│   │       └── DocumentProcessingModule.test.ts ✅ 33개 테스트
│   │
│   ├── controllers/                 # React Hooks 컨트롤러 (63개 테스트)
│   │   ├── useDocumentSearchController.ts
│   │   ├── useDocumentSearchController.test.ts ✅ 18개 테스트
│   │   ├── useCustomersController.tsx
│   │   ├── useCustomersController.test.tsx     ✅ 27개 테스트
│   │   ├── useAppleConfirmController.ts
│   │   └── useAppleConfirmController.test.ts   ✅ 18개 테스트
│   │
│   ├── services/                    # 비즈니스 로직 서비스 (38개 테스트)
│   │   ├── searchService.ts
│   │   └── searchService.test.ts    ✅ 38개 테스트
│   │
│   └── utils/                       # 유틸리티 함수 (19개 테스트)
│       ├── downloadHelper.ts
│       └── downloadHelper.test.ts   ✅ 19개 테스트
│
├── vitest.config.ts                 # Vitest 설정 파일
└── package.json                     # npm 스크립트
```

**총 테스트 개수**: **296개 신규 테스트** (기존 14개 포함 총 310개)

---

## 🚀 실전 예제

### 예제 1: 개발 중 특정 파일만 Watch

**시나리오**: Customer 관련 기능 개발 중

```bash
# Customer 유틸리티 테스트만 감시
npm test -- src/entities/customer/model.test.ts

# 파일 저장할 때마다 자동 재실행됨
# ✓ 37 passed
```

---

### 예제 2: 커밋 전 전체 테스트 확인

**시나리오**: Git 커밋 전 모든 테스트 통과 확인

```bash
# 모든 테스트 1회 실행
npm test -- --run

# 결과 확인
# ✅ Test Files  10 passed (10)
# ✅ Tests       310 passed (310)

# 모두 통과하면 커밋
git add .
git commit -m "feat: 새 기능 추가"
```

---

### 예제 3: 특정 카테고리만 실행

**시나리오**: Controller 레이어만 테스트하고 싶을 때

```bash
# Controllers만 테스트 (63개)
npm test -- src/controllers/

# Entities만 테스트 (176개)
npm test -- src/entities/

# Utils & Services만 테스트 (57개)
npm test -- src/utils/ src/services/
```

---

### 예제 4: 특정 기능 테스트 후 커버리지 확인

**시나리오**: DocumentUtils 리팩토링 후 커버리지 확인

```bash
# DocumentUtils 테스트 + 커버리지
npm test -- src/entities/document/model.test.ts --coverage

# 브라우저에서 커버리지 리포트 열기
start coverage/index.html
```

---

### 예제 5: 실패한 테스트만 재실행

**시나리오**: 여러 테스트 중 일부 실패 시

```bash
# 전체 테스트 실행
npm test -- --run

# 실패한 테스트만 다시 실행 (Watch 모드에서 'f' 키)
# 또는 CLI로:
npm test -- --run --changed
```

---

### 예제 6: 디버깅 모드로 실행

**시나리오**: 특정 테스트가 왜 실패하는지 알아야 할 때

```bash
# 1. 특정 파일만 단일 스레드로 실행
npm test -- src/controllers/useCustomersController.test.tsx --no-threads

# 2. Verbose 모드로 상세 로그 확인
npm test -- src/controllers/useCustomersController.test.tsx --reporter=verbose

# 3. console.log 출력 보기
npm test -- src/controllers/useCustomersController.test.tsx --reporter=verbose --silent=false
```

---

## 📊 테스트 결과 읽기

### 성공 시 출력 예시

```
 ✓ src/entities/customer/model.test.ts (37 tests) 15ms
 ✓ src/entities/customer/schema.test.ts (36 tests) 12ms
 ✓ src/entities/document/model.test.ts (70 tests) 18ms
 ✓ src/entities/document/DocumentProcessingModule.test.ts (33 tests) 10ms
 ✓ src/controllers/useDocumentSearchController.test.ts (18 tests) 8ms
 ✓ src/controllers/useCustomersController.test.tsx (27 tests) 14ms
 ✓ src/controllers/useAppleConfirmController.test.ts (18 tests) 12ms
 ✓ src/services/searchService.test.ts (38 tests) 16ms
 ✓ src/utils/downloadHelper.test.ts (19 tests) 9ms

 Test Files  10 passed (10)
      Tests  310 passed (310)
   Start at  22:00:00
   Duration  1.50s (transform 54ms, setup 198ms, collect 73ms, tests 17ms, environment 832ms, prepare 147ms)
```

**항목 설명**:
- **Test Files**: 테스트 파일 수
- **Tests**: 개별 테스트 케이스 수
- **Duration**: 총 실행 시간
- **transform**: TypeScript → JavaScript 변환 시간
- **setup**: 테스트 환경 설정 시간
- **collect**: 테스트 수집 시간
- **tests**: 실제 테스트 실행 시간

---

### 실패 시 출력 예시

```
 ❯ src/entities/customer/model.test.ts (1 failed, 36 passed)
   ✓ getDisplayName - originalName이 있으면 우선 반환한다
   ✗ getAge - 유효한 생년월일로 나이를 계산한다

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/entities/customer/model.test.ts > CustomerUtils.getAge > 유효한 생년월일로 나이를 계산한다
AssertionError: expected 25 to be 30

- Expected: 30
+ Received: 25

 ❯ src/entities/customer/model.test.ts:45:32
    43|   const customer = createMockCustomer({ birth_date: '1995-01-01' });
    44|   const age = CustomerUtils.getAge(customer);
    45|   expect(age).toBe(30);
       |                               ^
    46| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

Test Files  1 failed | 9 passed (10)
     Tests  1 failed | 309 passed (310)
```

**실패 정보 읽기**:
1. **실패한 테스트 위치**: `src/entities/customer/model.test.ts:45:32`
2. **기대값 vs 실제값**: `Expected: 30`, `Received: 25`
3. **실패한 코드**: `expect(age).toBe(30);`
4. **컨텍스트**: 주변 코드 3줄 표시

---

## 🛠️ 문제 해결 (Troubleshooting)

### 문제 1: "Cannot find module" 에러

**증상**:
```
Error: Cannot find module '@/entities/customer'
```

**해결책**:
```bash
# 1. node_modules 재설치
rm -rf node_modules
npm install

# 2. 캐시 삭제
npm test -- --clearCache

# 3. TypeScript 타입 체크
npm run typecheck
```

---

### 문제 2: 테스트가 멈춤 (Hang)

**증상**:
- 테스트가 무한 대기 상태
- 5초 후 타임아웃

**원인**:
- `setInterval` 미정리
- Promise가 resolve/reject 안 됨
- Fake timers 미정리

**해결책**:
```bash
# 타임아웃 시간 증가
npm test -- --test-timeout=10000

# 또는 vitest.config.ts에서 설정
testTimeout: 10000
```

**코드 수정 예시**:
```typescript
// ❌ 잘못된 코드
it('should wait for data', async () => {
  await fetchData(); // Promise가 resolve 안 됨
});

// ✅ 올바른 코드
it('should wait for data', async () => {
  const data = await fetchData();
  expect(data).toBeDefined();
}, 10000); // 개별 테스트 타임아웃 설정
```

---

### 문제 3: 메모리 부족

**증상**:
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed
```

**해결책**:
```bash
# Node.js 메모리 제한 증가 (기본 512MB → 4GB)
NODE_OPTIONS="--max-old-space-size=4096" npm test

# package.json에 스크립트 추가
{
  "scripts": {
    "test:memory": "NODE_OPTIONS='--max-old-space-size=4096' vitest"
  }
}
```

---

### 문제 4: Watch 모드가 작동하지 않음

**증상**:
- 파일 변경해도 테스트가 재실행 안 됨
- WSL, Docker, VirtualBox 환경에서 발생

**해결책**:
```bash
# Polling 모드로 전환
npm test -- --watch --watchOptions.usePolling

# 또는 vitest.config.ts에서 설정
export default defineConfig({
  test: {
    watchOptions: {
      usePolling: true,
      interval: 1000
    }
  }
})
```

---

### 문제 5: "ReferenceError: fetch is not defined"

**증상**:
```
ReferenceError: fetch is not defined
```

**원인**: Node.js 환경에 fetch API가 없음

**해결책**:
```typescript
// 테스트 파일 상단에 추가
import { vi } from 'vitest';

beforeAll(() => {
  global.fetch = vi.fn();
});
```

---

### 문제 6: React Hook 테스트 시 "act() warning"

**증상**:
```
Warning: An update to TestComponent inside a test was not wrapped in act(...)
```

**해결책**:
```typescript
import { act } from '@testing-library/react';

// ❌ 잘못된 코드
result.current.loadData();

// ✅ 올바른 코드
act(() => {
  result.current.loadData();
});
```

---

## 📝 package.json 스크립트

### 현재 설정된 스크립트

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest --run",
    "test:coverage": "vitest --coverage"
  }
}
```

### 추천 추가 스크립트

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest --run",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch",
    "test:entities": "vitest src/entities/",
    "test:controllers": "vitest src/controllers/",
    "test:services": "vitest src/services/",
    "test:utils": "vitest src/utils/",
    "test:changed": "vitest --changed",
    "test:related": "vitest --related",
    "test:ci": "vitest --run --coverage --reporter=verbose"
  }
}
```

### 사용 방법

```bash
# 기본 Watch 모드
npm test

# UI 모드
npm run test:ui

# 1회 실행
npm run test:run

# 커버리지
npm run test:coverage

# Entities만 테스트
npm run test:entities

# 변경된 파일만 테스트
npm run test:changed

# CI/CD용 (커버리지 + Verbose)
npm run test:ci
```

---

## 🔍 유용한 팁

### 1. 특정 describe 블록만 실행

```typescript
// 테스트 파일에서 .only 사용
describe.only('DocumentUtils.getDisplayName', () => {
  it('originalName이 있으면 우선 반환한다', () => {
    // 이 블록만 실행됨
  });
});
```

**주의**: 커밋 전에 `.only` 제거하기!

---

### 2. 특정 테스트 스킵

```typescript
it.skip('나중에 수정할 테스트', () => {
  // 이 테스트는 건너뜀
});

// 또는
it.todo('아직 구현 안 된 기능 테스트');
```

---

### 3. 조건부 테스트 실행

```typescript
// 환경에 따라 테스트 실행
const isCI = process.env.CI === 'true';

(isCI ? it.skip : it)('로컬에서만 실행', () => {
  // CI에서는 스킵됨
});
```

---

### 4. 테스트 그룹화

```typescript
describe('CustomerUtils', () => {
  describe('getDisplayName', () => {
    it('케이스 1', () => {});
    it('케이스 2', () => {});
  });

  describe('getAge', () => {
    it('케이스 1', () => {});
    it('케이스 2', () => {});
  });
});
```

---

### 5. 테스트 데이터 재사용

```typescript
// 테스트 헬퍼 함수 생성
const createMockCustomer = (overrides = {}) => ({
  _id: 'customer-123',
  personal_info: { name: '홍길동' },
  ...overrides
});

// 여러 테스트에서 재사용
it('테스트 1', () => {
  const customer = createMockCustomer({ personal_info: { name: '김철수' } });
  expect(customer.personal_info.name).toBe('김철수');
});
```

---

### 6. 비동기 테스트 패턴

```typescript
// Promise 테스트
it('should fetch data', async () => {
  const data = await fetchData();
  expect(data).toBeDefined();
});

// Callback 테스트
it('should call callback', (done) => {
  fetchData((data) => {
    expect(data).toBeDefined();
    done();
  });
});
```

---

### 7. Mock 재사용 패턴

```typescript
// 공통 Mock 설정
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: 'test' })
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

---

## 🤖 CI/CD 통합

### GitHub Actions 예시

```yaml
# .github/workflows/test.yml
name: Unit Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: |
        cd frontend/aims-uix3
        npm ci

    - name: Run tests
      run: |
        cd frontend/aims-uix3
        npm test -- --run --coverage --reporter=verbose

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        files: ./frontend/aims-uix3/coverage/lcov.info
        flags: unittests
        name: codecov-umbrella

    - name: Comment PR with coverage
      if: github.event_name == 'pull_request'
      uses: romeovs/lcov-reporter-action@v0.3.1
      with:
        lcov-file: ./frontend/aims-uix3/coverage/lcov.info
        github-token: ${{ secrets.GITHUB_TOKEN }}
```

---

### GitLab CI 예시

```yaml
# .gitlab-ci.yml
test:
  stage: test
  image: node:18
  cache:
    paths:
      - frontend/aims-uix3/node_modules/
  script:
    - cd frontend/aims-uix3
    - npm ci
    - npm test -- --run --coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: frontend/aims-uix3/coverage/cobertura-coverage.xml
```

---

## 📚 추가 자료

### 공식 문서
- **Vitest**: https://vitest.dev/
- **React Testing Library**: https://testing-library.com/react
- **Testing Library Best Practices**: https://kentcdodds.com/blog/common-mistakes-with-react-testing-library

### 프로젝트 문서
- **테스트 완료 보고서**: `UNIT_TEST_COMPLETION_REPORT.md`
- **발견된 버그 목록**: `UNIT_TEST_FINDINGS.md`
- **프로젝트 가이드라인**: `CLAUDE.md`

### 유용한 블로그 글
- **Vitest vs Jest**: https://vitest.dev/guide/comparisons.html
- **Testing Best Practices**: https://github.com/goldbergyoni/javascript-testing-best-practices

---

## 🎓 학습 경로

### 초급 (테스트 처음 작성하는 경우)

1. **기본 실행 익히기**
   ```bash
   npm test
   npm test -- --run
   ```

2. **첫 테스트 작성하기**
   - `src/entities/customer/model.test.ts` 예제 참고
   - AAA 패턴 (Arrange-Act-Assert) 적용

3. **테스트 통과 확인하기**
   ```bash
   npm test -- src/your-test-file.test.ts
   ```

---

### 중급 (React Hook 테스트)

1. **renderHook 사용법**
   - `src/controllers/useDocumentSearchController.test.ts` 참고

2. **Mock 작성하기**
   ```typescript
   vi.mock('@/services/searchService', () => ({
     searchDocuments: vi.fn()
   }));
   ```

3. **비동기 테스트**
   ```typescript
   await waitFor(() => {
     expect(result.current.data).toBeDefined();
   });
   ```

---

### 고급 (복잡한 시나리오)

1. **Fake Timers**
   - `src/controllers/useAppleConfirmController.test.ts` 참고

2. **통합 테스트**
   - 여러 모듈 간 상호작용 테스트

3. **커버리지 최적화**
   ```bash
   npm test -- --coverage --coverage.reporter=html
   ```

---

## ⚡ 빠른 참조 (Cheat Sheet)

### 자주 사용하는 명령어

```bash
# 기본 실행
npm test                                    # Watch 모드
npm test -- --run                           # 1회 실행
npm test -- --ui                            # UI 모드

# 파일 지정
npm test -- src/entities/                   # 디렉토리
npm test -- model.test.ts                   # 파일명 패턴

# 필터링
npm test -- -t "Customer"                   # 테스트명
npm test -- --changed                       # 변경된 파일만

# 디버깅
npm test -- --reporter=verbose              # 상세 로그
npm test -- --no-threads                    # 단일 스레드
npm test -- --test-timeout=10000            # 타임아웃

# 커버리지
npm test -- --coverage                      # 커버리지 생성
npm test -- --coverage --ui                 # UI로 확인
```

---

### Vitest API 빠른 참조

```typescript
// 기본 테스트 구조
describe('그룹명', () => {
  it('테스트명', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe('expected');
  });
});

// Assertion
expect(value).toBe(expected);              // 일치
expect(value).toEqual(expected);           // 깊은 비교
expect(value).toBeTruthy();                // truthy
expect(value).toBeDefined();               // undefined 아님
expect(value).toHaveLength(3);             // 길이
expect(array).toContain(item);             // 포함

// Mock
const mock = vi.fn();                      // Mock 함수
vi.mock('./module');                       // 모듈 Mock
vi.spyOn(obj, 'method');                   // Spy

// 비동기
await waitFor(() => {});                   // 조건 대기
await act(async () => {});                 // React act
```

---

## 🎯 마무리

### 핵심 요약

1. **개발 시**: `npm test` (Watch 모드)
2. **커밋 전**: `npm test -- --run` (1회 실행)
3. **디버깅**: `npm test -- --ui` (UI 모드)
4. **커버리지**: `npm test -- --coverage`

### 도움이 필요하면

- 📖 **공식 문서**: https://vitest.dev/
- 📝 **프로젝트 문서**: `UNIT_TEST_COMPLETION_REPORT.md`
- 🐛 **버그 리포트**: `UNIT_TEST_FINDINGS.md`
- 💬 **팀 문의**: 프로젝트 관리자에게 연락

---

**빠른 시작**: `npm test` 입력하고 엔터! 🚀

**Happy Testing!** ✨
