# 코드 리뷰 보고서 — AIMS 로그인 UX 재설계

**리뷰일**: 2026.03.14
**대상**: Phase 1~5 전체 구현 (커밋 6652932c..7fef5019, 20개 파일, +1816줄)
**리뷰어**: Code Reviewer

---

## 요약

- 검토 파일: 10개 (+ 테스트 5개)
- Critical: 5개
- Warning: 8개
- Suggestion: 5개

---

## Critical Issues (5건)

### 1. PIN 세션 토큰을 클라이언트에서만 검증 (보안 우회 가능)

- **위치**: `ProtectedRoute.tsx:70`
- **문제**: `sessionStorage.getItem('aims-session-token')` 존재 여부만 확인. 서버 `GET /api/auth/verify-session` 호출하지 않음. DevTools에서 `sessionStorage.setItem('aims-session-token', 'fake')` 한 줄로 PIN 우회 가능.
- **수정**: ProtectedRoute 마운트 시 서버에 세션 유효성 검증 API 호출 추가.

### 2. admin-login 엔드포인트에 인증 없음

- **위치**: `auth.js:799-872`
- **문제**: `POST /api/auth/admin-login`이 비밀번호 없이 role=admin 계정에 즉시 JWT 발급. 주석에 `TODO: 추후 비밀번호 인증 추가`로 남아 있으나 프로덕션에 그대로 배포.
- **수정**: 엔드포인트 비활성화 또는 개발 환경 전용으로 제한.

### 3. JWT 토큰이 URL 쿼리 파라미터로 전달

- **위치**: `auth.js:219,345,471`, `LoginPage.tsx:89-146`
- **문제**: OAuth 콜백 후 `?token=<JWT>`로 URL에 노출. 브라우저 히스토리, Referrer 헤더, 서버 로그에 토큰 잔류.
- **수정**: 토큰 처리 시작 시점에 URL에서 즉시 제거. `setSearchParams({}, { replace: true })`

### 4. CSS 하드코딩 색상 (CLAUDE.md 위반)

- **위치**: `LoginPage.css:75,88-116`
- **문제**: 카카오/네이버/구글 브랜드 색상과 `rgba()` 값이 CSS 변수 없이 직접 하드코딩. `색상은 var(--color-*) CSS 변수만` 규칙 위반.
- **수정**: `variables.css`에 브랜드 전용 변수 정의 후 참조.

### 5. HTML `<button>` 직접 사용 (CLAUDE.md 위반 가능)

- **위치**: `LoginPage.tsx` 전체 (10곳)
- **문제**: AIMS 프로젝트에서 `<Button>` 컴포넌트 사용을 권장하는데 네이티브 `<button>` 사용.
- **수정**: 프로젝트 컨벤션에 맞게 `<Button>` 컴포넌트로 교체 검토.

---

## Warnings (8건)

### 1. ProtectedRoute에 inline style 사용

- **위치**: `ProtectedRoute.tsx:58`
- **문제**: CLAUDE.md inline style 금지 위반.

### 2. UserProfileMenu에 inline style 사용

- **위치**: `UserProfileMenu.tsx:279-283`
- **문제**: 메뉴 위치 계산 `style={{ position: 'fixed', top, right }}`. 동적 위치값이므로 완전 CSS 이전은 어려우나 정적 속성은 분리 가능.

### 3. pinRateLimit 메모리 기반 — 서버 재시작 시 초기화

- **위치**: `auth.js:28-39`
- **문제**: `new Map()`으로 관리되어 서버 재시작 시 카운터 초기화. DB `pinFailCount`와 이중 방어이므로 즉각 위협은 아니지만 rate limit 목적이 퇴색.
- **수정 권장**: Redis 또는 MongoDB에 저장.

### 4. `mode=pin-setup` 라우트 미처리 (기능 버그)

- **위치**: `UserProfileMenu.tsx:175`, `LoginPage.tsx`
- **문제**: `navigate('/login?mode=pin-setup')`으로 이동하지만 `isPinMode = searchParams.get('mode') === 'pin'`만 체크. `pin-setup` 미인식 → 소셜 로그인 화면 표시.
- **수정**: `['pin', 'pin-setup'].includes(mode)` 또는 URL 파라미터 통일.

### 5. 에러 처리 시 타입 단언 남용

- **위치**: `LoginPage.tsx:212,264`
- **문제**: `error as { response?: ... }` 직접 단언. `axios.isAxiosError()` 타입 가드 사용 권장.

### 6. BroadcastChannel 리스너 모듈 레벨 생성 (정리 코드 없음)

- **위치**: `authStore.ts:139-147`
- **문제**: `authChannel`이 모듈 레벨에서 생성, `close()` 호출 없음. SPA에서는 큰 문제 아니나 엄밀히 메모리 누수 가능.

### 7. AuthCallbackPage와 LoginPage 토큰 처리 로직 중복

- **위치**: `AuthCallbackPage.tsx`, `LoginPage.tsx:105-143`
- **문제**: `token → getCurrentUser → setUser → updateCurrentUser → localStorage.setItem` 패턴 동일 중복. 한쪽만 수정 시 동기화 문제.
- **수정 권장**: 공통 훅 `useProcessAuthToken(token)` 추출.

### 8. E2E 테스트 TC-12 실제 코드와 불일치

- **위치**: `login-pin-phase2.spec.ts:152`
- **문제**: `await expect(checkbox).toBeDisabled()` 단언하지만 실제는 `enabled`. 실행 시 FAIL.

---

## Suggestions (5건)

1. `LoginPage.tsx:108` — `/api/auth/me` 직접 fetch 대신 기존 `getCurrentUser` 함수 재사용
2. `auth.js:509` — `const { ObjectId } = require('mongodb')` 각 핸들러 내 반복 → 파일 상단 1회 require
3. `auth.js:1122-1131` — TTL 인덱스 생성 즉시 실행 → 별도 초기화 함수로 분리 + 로깅
4. `ProtectedRoute.tsx:24` — `localStorage.getItem` 매 렌더 호출 → useRef 캐싱 고려
5. `LoginPage.tsx:40-60` — `pinSetupStep` 문자열 리터럴 → enum 또는 상수 객체 권장

---

## 보안 검사 결과

| 항목 | 상태 |
|------|------|
| 하드코딩 비밀키 | 없음 (안전) |
| .env 파일 git 포함 | 없음 (안전) |
| admin-login 인증 | FAIL (P0) |
| sessionToken 검증 | FAIL (P0) |
| JWT URL 노출 | WARNING |
| 프로덕션 console.log | `LoginPage.tsx:135` 사용자 이름 노출 |

---

## 잘된 점

1. **bcrypt 해싱**: PIN 저장 시 `bcrypt.hash(pin, 10)` + `bcrypt.compare`로 timing attack 방어
2. **이중 brute-force 방어**: rate limit(메모리) + DB pinFailCount 이중 구성
3. **취약 PIN 차단**: 연속/반복/자주 쓰는 패턴 사전 차단
4. **Open Redirect 방지**: URL 파싱 기반 화이트리스트 검증
5. **세션 TTL 인덱스**: MongoDB TTL로 만료 세션 자동 정리
6. **멀티탭 동기화**: BroadcastChannel 로그아웃 전파
7. **다층 테스트**: vitest + Playwright + 접근성(aria-label)
8. **PinInput 설계**: 숨겨진 native input + dot 시각화 패턴

---

## 우선순위 정리

| 우선순위 | 항목 | 파일 |
|----------|------|------|
| P0 즉시 | admin-login 인증 부재 | `auth.js:799` |
| P0 즉시 | sessionToken 서버 검증 누락 | `ProtectedRoute.tsx:70` |
| P1 | mode=pin-setup 라우트 미처리 | `UserProfileMenu.tsx:175`, `LoginPage.tsx` |
| P1 | JWT URL 노출 후 즉시 제거 | `LoginPage.tsx` |
| P2 | CSS 하드코딩 색상 → CSS 변수 | `LoginPage.css` |
| P2 | `<button>` → `<Button>` 컴포넌트 | `LoginPage.tsx` |
| P3 | E2E TC-12 disabled 단언 오류 | `login-pin-phase2.spec.ts` |
