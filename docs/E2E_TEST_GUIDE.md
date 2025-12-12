# E2E 테스트 가이드

## 개요

Playwright 기반 E2E 테스트로 고객 CRUD 및 다중 고객 시나리오를 검증합니다.

## 테스트 구조

```
tests/
├── fixtures/
│   ├── index.ts          # Export
│   ├── auth.ts           # 인증 헬퍼
│   └── test-data.ts      # 데이터 팩토리
├── e2e/
│   └── multi-customer.spec.ts  # 다중 고객 테스트
└── customer-crud-simple.spec.ts # 기본 CRUD 테스트
```

## 핵심 Fixture

### auth.ts
```typescript
// 개발용 로그인 건너뛰기
export async function skipDevLogin(page: Page): Promise<void>

// 온보딩 가이드 닫기
export async function closeOnboarding(page: Page): Promise<void>

// 전체 로그인 프로세스
export async function loginAndSetup(page: Page): Promise<void>
```

### test-data.ts
```typescript
// 고객 데이터 생성
export function generateCustomer(prefix: string, index: number): TestCustomer

// 여러 고객 생성
export function generateCustomers(prefix: string, count: number): TestCustomer[]
```

## 테스트 실행

```bash
cd frontend/aims-uix3

# 기본 CRUD 테스트
npx playwright test customer-crud-simple.spec.ts

# 다중 고객 테스트
npx playwright test e2e/multi-customer.spec.ts

# UI 모드 (디버깅)
npx playwright test --ui

# 리포트 확인
npx playwright show-report
```

## 인증 처리

현재 "개발용 로그인 건너뛰기" 버튼을 통해 인증을 우회합니다.

```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/');

  // 개발용 로그인 건너뛰기
  const skipBtn = page.locator('button:has-text("개발용 로그인 건너뛰기")');
  if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(2000);
  }

  // 온보딩 닫기
  const onboarding = page.locator('.onboarding-tour');
  if (await onboarding.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
  }
});
```

## 테스트 시나리오

| 시나리오 | 파일 | 설명 |
|---------|------|------|
| 고객 생성 | customer-crud-simple.spec.ts | 단일 고객 등록 |
| 고객 조회 | customer-crud-simple.spec.ts | 고객 목록 확인 |
| 다중 고객 생성 | multi-customer.spec.ts | 여러 고객 연속 등록 |
| 중복 검증 | multi-customer.spec.ts | 동일 이름 등록 차단 확인 |

## 주의사항

1. **개발 서버 필수**: `npm run dev`로 5177 포트에서 실행 중이어야 함
2. **모달 처리**: 고객 등록 후 모달이 열리면 ESC 또는 확인 버튼으로 닫아야 함
3. **단일 사용자**: 현재 한 명의 테스트 사용자로만 테스트 가능

## 다중 설계사 테스트 (향후)

백엔드에 테스트용 인증 API 추가 시 가능:

```javascript
// POST /api/auth/test-login
{ "userId": "agent-001", "secret": "TEST_KEY" }
```

## 설정 파일

`playwright.config.ts` 주요 설정:
- baseURL: `http://localhost:5177`
- timeout: 60초
- actionTimeout: 30초
- 브라우저: Chromium
