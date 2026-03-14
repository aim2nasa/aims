# AIMS 로그인 UX 재설계 제안서

**작성자**: Dana (UX Design Advisor, 전 Apple Principal Designer)
**작성일**: 2026.03.14
**대상**: AIMS (Agent Intelligent Management System)
**버전**: 3.1 (보안/품질/UX 3자 리뷰 반영)
**리뷰**: Security Auditor, Gini (QA), Sora (보험 설계사)

---

## 설계 철학

> "보안과 편의성은 대립하지 않습니다. 올바른 패턴을 선택하면 둘 다 얻을 수 있습니다."

보험 설계사의 업무 환경을 고려했습니다. 하루에도 수십 번 AIMS에 접속하는 설계사에게, 매번 소셜 로그인 전체를 반복시키는 것은 과도합니다. 반면, 브라우저를 열었을 때 아무런 확인 없이 바로 진입되는 것은 보험 문서의 민감도를 고려할 때 위험합니다.

토스, 카카오뱅크가 이 문제를 해결한 방식을 AIMS에 맞게 적용합니다:
- **첫 진입**: 소셜 로그인으로 본인 확인 (강한 인증)
- **재진입**: PIN 4자리로 빠르게 확인 (간편 인증)
- **타인 접근**: PIN을 모르면 진입 불가 (보안 유지)

---

## 1. 현황 분석

### 1.1 현재 인증 흐름

    최초 방문:  사용자 -> /login -> 소셜 로그인 -> OAuth 콜백 -> 토큰 저장 -> / (메인)
    재방문:     사용자 -> / -> ProtectedRoute -> 토큰 있음 -> 즉시 메인 (로그인 우회!)

**문제점**: authStore가 persist 미들웨어로 localStorage에 토큰을 저장합니다. 브라우저를 닫았다 열어도 토큰이 남아 있으므로, 다른 사람이 같은 PC에서 브라우저만 열면 바로 진입할 수 있습니다.

### 1.2 기술 구조

| 파일 | 역할 | 현재 동작 |
|------|------|----------|
| authStore.ts | Zustand + persist | 토큰을 localStorage에 영구 저장 |
| ProtectedRoute.tsx | 라우트 가드 | 토큰 존재 여부만 확인, 로그인 페이지로 리다이렉트 |
| LoginPage.tsx | 로그인 화면 | 소셜 로그인 3개 + 계정 전환 |
| AppRouter.tsx | 라우팅 | isAuthenticated면 /login을 /로 리다이렉트 |
| HeaderView.tsx | 헤더 | 사용자 아바타 + 프로필 메뉴 표시 |

### 1.3 핵심 보안 결함

| # | 결함 | 심각도 |
|---|------|--------|
| 1 | 토큰이 localStorage에 영구 저장 -- 브라우저 닫아도 유지 | Critical |
| 2 | ProtectedRoute가 토큰 존재만 확인 -- 재인증 절차 없음 | Critical |
| 3 | AppRouter에서 isAuthenticated면 /login 자체를 우회 | Major |

---

## 2. 로그인 페이지 와이어프레임

### 2.1 상태 A: 신규 사용자 / 기기 기억 안 함

소셜 로그인만 표시됩니다. 가장 깨끗한 첫인상을 줍니다.

```
+------------------------------------------+
|                                          |
|                                          |
|                 AIMS                     |
|      메트라이프 설계사 AI 플랫폼           |
|                                          |
|                                          |
|  +------------------------------------+  |
|  |    (K)  카카오 로그인                |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  |    (N)  네이버 로그인                |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  |    (G)  구글 로그인                  |  |
|  +------------------------------------+  |
|                                          |
|   [v] 다음에 PIN으로 빠르게 로그인        |
|   체크하면 → 다음엔 숫자 4개만 누르면 됩니다 |
|   체크 안 하면 → 다음에도 소셜 로그인 필요   |
|                                          |
|  다른 카카오 계정 | 다른 네이버 | 다른 구글 |
|                                          |
+------------------------------------------+
```

**설계 의도**:
- ~~"이 기기 기억하기"~~ → **"다음에 PIN으로 빠르게 로그인"**으로 변경 (설계사 UX 리뷰: "이 기기 기억하기"가 무슨 뜻인지 직관적이지 않음)
- 체크박스 하단에 체크/미체크 시 차이를 한 줄로 안내합니다
- 체크박스는 기본 해제 상태입니다 (공용 PC 안전)
- 체크 시 소셜 로그인 성공 후 PIN 설정 화면으로 전환됩니다

### 2.2 상태 B: 재방문 (기기 기억 O) - PIN 입력

기기를 기억한 사용자가 재방문했을 때 표시됩니다. 토스/카카오뱅크와 동일한 패턴입니다.

```
+------------------------------------------+
|                                          |
|                                          |
|              +------+                    |
|              | 아바타 |                    |
|              +------+                    |
|             김소라 님                     |
|                                          |
|        간편 비밀번호를 입력하세요           |
|                                          |
|          ●  ●  ○  ○                     |
|                                          |
|                                          |
|     (숫자 키보드 또는 물리 키보드 입력)     |
|                                          |
|                                          |
|          다른 계정으로 로그인              |
|       비밀번호를 잊으셨나요?               |
|                                          |
+------------------------------------------+
```

**설계 의도**:
- 아바타와 이름으로 "내 계정"임을 시각적으로 즉시 확인합니다
- ~~"PIN을 입력하세요"~~ → **"간편 비밀번호를 입력하세요"**로 변경 (설계사 UX 리뷰: "PIN"이라는 용어가 직관적이지 않음. UI에 노출되는 모든 텍스트에서 "PIN" 대신 "간편 비밀번호" 사용)
- 입력은 4개의 원형 dot으로 표시합니다 (비밀번호 마스킹)
- 입력할 때마다 빈 원이 채워진 원으로 전환됩니다
- 4자리 모두 입력되면 자동으로 검증을 시작합니다 (확인 버튼 불필요)
- "다른 계정으로 로그인" 링크로 소셜 로그인 화면으로 전환할 수 있습니다
- **"비밀번호를 잊으셨나요?"** 링크 추가 — 탭하면 안내 문구 표시: "카카오/네이버/구글 로그인 후 새로 만들 수 있습니다" (설계사 리뷰: 잠김 상태에서 "이제 못 쓰는 건가?" 불안감 해소)

**PIN Dot 상태 전이**:
```
입력 0자리:  ○  ○  ○  ○    (초기 상태)
입력 1자리:  ●  ○  ○  ○    (첫 번째 입력)
입력 2자리:  ●  ●  ○  ○    (두 번째 입력)
입력 3자리:  ●  ●  ●  ○    (세 번째 입력)
입력 4자리:  ●  ●  ●  ●    (자동 검증 시작)
검증 성공:   ●  ●  ●  ●    -> 메인 페이지로 전환
검증 실패:   ●  ●  ●  ●    -> 흔들림 애니메이션 -> ○  ○  ○  ○ 초기화
```

**흔들림 애니메이션** (PIN 실패 시):
- iOS 잠금 화면의 틀렸을 때 좌우 흔들림과 동일한 패턴입니다
- @keyframes shake: translateX(-10px) -> 10px -> -6px -> 6px -> 0
- 400ms 동안 재생 후 dot 초기화 (구현 기준, 자연스러운 느낌을 위해 300→400ms 조정)

### 2.3 상태 C: 재방문 (기기 기억 X)

기기를 기억하지 않았거나 sessionStorage 토큰이 만료된 경우입니다. 상태 A와 동일한 화면이 표시됩니다.

---

## 3. PIN 설정 플로우

### 3.1 최초 PIN 등록

"이 기기 기억하기"를 체크한 상태로 소셜 로그인에 성공하면, PIN 설정 화면이 표시됩니다.

```
+------------------------------------------+
|                                          |
|                                          |
|       간편 비밀번호를 설정하세요            |
|    다음 방문 시 빠르게 로그인할 수 있습니다  |
|                                          |
|          ○  ○  ○  ○                     |
|                                          |
|     (숫자 키보드 또는 물리 키보드 입력)     |
|                                          |
|                                          |
|           나중에 설정하기                  |
|                                          |
+------------------------------------------+
```

**플로우**:

```
[1] PIN 4자리 입력
        |
        v
  PIN 번호를 다시 입력하세요 (확인을 위해 한번 더)
        |
  일치? --YES--> PIN 저장 -> 메인 페이지 진입
        |
       NO -> "PIN이 일치하지 않습니다" -> [1]로 복귀
```

**"나중에 설정하기" 선택 시** (설계사 리뷰: "건너뛰기"보다 "나중에 설정하기"가 덜 불안함):
- "다음에 PIN으로 빠르게 로그인"이 해제됩니다
- 토큰은 sessionStorage에만 저장됩니다
- 다음 방문 시 소셜 로그인을 다시 해야 합니다

### 3.2 PIN 변경

프로필 메뉴(HeaderView 우측 아바타 클릭)에서 접근합니다.

```
UserProfileMenu
+-- 계정 설정
+-- PIN 변경          <-- 새로 추가
+-- 기기 기억 해제     <-- 새로 추가 (기기 기억 중일 때만 표시)
+-- ────────────
+-- 로그아웃
```

PIN 변경 플로우: 현재 PIN 입력 -> 새 PIN 입력 -> 새 PIN 확인 -> 변경 완료

---

## 4. 보안 설계

### 4.1 PIN 저장 방식

**권장안: 서버 저장 (bcrypt 해시)**

| 항목 | 설명 |
|------|------|
| 저장 위치 | MongoDB users 컬렉션, pinHash 필드 |
| 해시 알고리즘 | bcrypt (salt rounds: 10) |
| 검증 방식 | POST /api/auth/verify-pin API 호출 |
| 장점 | PIN이 클라이언트에 절대 저장되지 않음. 가장 안전 |
| 단점 | 네트워크 요청 필요 (오프라인 불가) |

**서버 API 설계**:

> **[SEC-002 반영]** verify-pin API에서 userId를 body에 받으면 브루트포스 공격이 가능합니다.
> 반드시 Authorization 헤더의 JWT에서 userId를 추출해야 합니다.

```
POST /api/auth/set-pin
  Headers: Authorization: Bearer <token>
  Body: { pin: "1234" }
  Response: { success: true }
  동작: bcrypt.hash(pin, 10) -> users.pinHash에 저장
  검증: 취약 PIN(1234, 0000, 1111, 연속/반복 숫자) 등록 차단

POST /api/auth/verify-pin
  Headers: Authorization: Bearer <token>   ← userId를 body가 아닌 JWT에서 추출
  Body: { pin: "1234" }
  Response: { success: true, sessionToken: "<1시간 TTL 세션 토큰>" }
  동작: bcrypt.compare(pin, users.pinHash) → 성공 시 세션 토큰 발급
  Rate Limit: userId 기준 5분간 5회 (IP 기준 아님)
  실패 시: pinFailCount 증가 + 지수 백오프(1회=즉시, 2회=2초, 5회=잠금)

POST /api/auth/reset-pin
  Headers: Authorization: Bearer <token>  (소셜 로그인 직후 토큰)
  Body: { newPin: "5678" }
  Response: { success: true }
  동작: 소셜 로그인 인증된 상태에서만 호출 가능

DELETE /api/auth/pin
  Headers: Authorization: Bearer <token>
  Response: { success: true }
  동작: pinHash 필드 삭제 + 기기 기억 해제
```

**대안: 프론트엔드 로컬 저장 (Web Crypto API)**

서버 의존 없이 동작해야 하는 경우의 대안입니다.

| 항목 | 설명 |
|------|------|
| 저장 위치 | localStorage, 키: aims-pin-hash |
| 해시 알고리즘 | PBKDF2 (Web Crypto API, SHA-256, 100,000 iterations) |
| 검증 방식 | 클라이언트에서 해시 비교 |
| 장점 | 서버 의존 없음, 오프라인 동작 |
| 단점 | 해시가 localStorage에 노출됨. DevTools로 삭제/조작 가능 |

```javascript
// Web Crypto API를 이용한 PIN 해시 (대안)
async function hashPin(pin, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt),
      iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}
```

**Dana의 권장**: 서버 저장 방식을 기본으로 채택합니다. AIMS는 보험 문서를 다루는 시스템이므로, PIN 해시가 클라이언트에 노출되는 것은 바람직하지 않습니다. 프론트엔드 방식은 서버 장애 시 fallback으로만 고려합니다.

### 4.2 PIN 실패 처리

> **[설계사 리뷰 반영]** 3회→5회로 변경. "급할 때 손떨려서 틀릴 수 있다"는 피드백 반영.
> **[보안 리뷰 반영]** 지수 백오프 적용. 실패 횟수는 서버(MongoDB)에서만 관리.

```
1회 실패: "비밀번호가 올바르지 않습니다" + dot 흔들림 + 초기화 (즉시 재시도)
2회 실패: "비밀번호가 올바르지 않습니다 (2/5)" + dot 흔들림 (즉시 재시도)
3회 실패: "비밀번호가 올바르지 않습니다 (3/5)" + 2초 대기 후 재시도 허용
4회 실패: "비밀번호가 올바르지 않습니다 (4/5)" + 5초 대기 후 재시도 허용
5회 실패: 잠김 -> 기기 기억 데이터 삭제 -> 소셜 로그인 화면으로 전환
```

> **실패 횟수 관리**: 서버(users.pinFailCount)에서만 관리. 클라이언트 카운터는 UX 표시 전용.
> localStorage의 aims-pin-fail-count를 사용하지 않음 — DevTools로 조작 가능하므로 보안 무의미.

잠김 상태 화면:
```
+------------------------------------------+
|                                          |
|   비밀번호를 여러 번 틀렸습니다             |
|   카카오/네이버/구글 로그인으로              |
|   다시 확인해주세요                        |
|                                          |
|  +------------------------------------+  |
|  |    (K)  카카오 로그인                |  |
|  +------------------------------------+  |
|  +------------------------------------+  |
|  |    (N)  네이버 로그인                |  |
|  +------------------------------------+  |
|  +------------------------------------+  |
|  |    (G)  구글 로그인                  |  |
|  +------------------------------------+  |
|                                          |
+------------------------------------------+
```

### 4.3 토큰 저장 전략

> **[SEC-009 반영]** JWT 만료를 7일→1일로 단축. Refresh Token(30일, DB 저장)을 별도 운용.
> 로그아웃/PIN 잠금 시 서버에 토큰 무효화 요청(tokenVersion 증가).

| 시나리오 | 토큰 저장 위치 | 토큰 수명 | 재방문 시 |
|---------|---------------|----------|----------|
| 기기 기억 X | sessionStorage | 브라우저 닫으면 삭제 | 소셜 로그인 필수 |
| 기기 기억 O | localStorage | JWT 1일 + Refresh Token 30일 | PIN 입력 필수 |
| PIN 5회 실패 | localStorage 삭제 + 서버 tokenVersion++ | 즉시 무효화 | 소셜 로그인 필수 |

**토큰 무효화 메커니즘**:
```javascript
// users 컬렉션에 tokenVersion 필드 추가
// JWT payload에 tokenVersion 포함
// 검증 시: decoded.tokenVersion === user.tokenVersion 확인
// 강제 로그아웃/PIN 잠금: user.tokenVersion++ → 모든 기존 토큰 즉시 무효화
```

**중요**: 현재 authStore.ts의 persist 미들웨어는 항상 localStorage를 사용합니다. 이를 동적으로 전환해야 합니다.

### 4.4 세션 관리 — 서버 발급 세션 토큰

> **[SEC-004 반영]** `sessionStorage["aims-pin-verified"] = "true"` 방식은 DevTools에서 1초 안에 우회 가능.
> PIN 검증 성공 시 서버가 별도 세션 토큰을 발급하고, ProtectedRoute에서 서버 검증하는 방식으로 변경.

```
PIN 검증 성공 → 서버에서 session_token (1시간 TTL, MongoDB 저장) 발급
→ sessionStorage에 session_token 저장
→ ProtectedRoute에서 session_token을 서버에 검증 요청 (GET /api/auth/verify-session)
→ 서버: session_token 존재 + 만료 안 됨 → 통과 / 없음 → PIN 재입력
```

**session_token 생명주기**:
- PIN 검증 성공 시 서버에서 발급 (crypto.randomBytes(32))
- 브라우저 탭/창 닫으면 sessionStorage에서 자동 삭제
- 서버 TTL 1시간 초과 시 만료 → PIN 재입력 필요
- 새 탭을 열면 다시 PIN 입력 필요

### 4.5 팝업 라우트 처리

AI Assistant(/ai-assistant), Annual Report(/annual-report), Customer Review(/customer-review)는 window.open()으로 열리는 팝업 라우트입니다.

> **[SEC-007 반영]** noopener를 제거하면 window.opener를 통한 부모 창 hijacking이 가능합니다.
> noopener를 유지하고, BroadcastChannel API로 인증 상태를 전파합니다.

**해결 방안: BroadcastChannel API** (noopener 유지):
```typescript
// 메인 창 (PIN 검증 성공 시)
const channel = new BroadcastChannel('aims-auth');
channel.postMessage({ type: 'PIN_VERIFIED', sessionToken: token });

// 팝업 창 (ProtectedRoute에서)
const channel = new BroadcastChannel('aims-auth');
channel.onmessage = (e) => {
  if (e.data.type === 'PIN_VERIFIED') {
    sessionStorage.setItem('aims-session-token', e.data.sessionToken);
  }
};

// window.open() 시 반드시 noopener 유지:
window.open(url, '_blank', 'noopener,noreferrer');
```

### 4.6 Idle Timeout — 자동 잠금 (신규)

> **[설계사 리뷰 반영]** "브라우저 안 닫으면 PIN도 안 물어보잖아요? 토스처럼 자동 잠금이 필요해요"

브라우저를 닫지 않아도 일정 시간 미사용 시 자동으로 PIN 재입력을 요구합니다.

| 환경 | Idle Timeout | 이유 |
|------|-------------|------|
| PC | 30분 | 사무실 자리 비움 대응 |
| 모바일 | 5분 | 분실/도난 위험이 더 높음 |

**구현 방식**:
```typescript
// 마우스/키보드/터치 이벤트로 마지막 활동 시각 갱신
let lastActivity = Date.now();
const IDLE_TIMEOUT = isMobile ? 5 * 60_000 : 30 * 60_000;

const resetTimer = () => { lastActivity = Date.now(); };
['mousemove', 'keydown', 'touchstart', 'scroll'].forEach(evt =>
  window.addEventListener(evt, resetTimer, { passive: true })
);

// 1분마다 체크
setInterval(() => {
  if (Date.now() - lastActivity > IDLE_TIMEOUT) {
    sessionStorage.removeItem('aims-session-token');
    // → ProtectedRoute가 PIN 재입력 요구
  }
}, 60_000);
```

### 4.7 OAuth 콜백 보안 — JWT 전달 방식 (신규)

> **[SEC-003 반영]** 현재 JWT가 URL 쿼리 파라미터(`?token=...`)로 전달되어 브라우저 히스토리, Referer 헤더, 서버 로그에 노출됩니다.

**현재 (취약)**:
```javascript
res.redirect(`${frontendUrl}/login?token=${token}`);
// → 브라우저 히스토리에 토큰 평문 저장, Referer 헤더로 유출 가능
```

**변경 (안전) — URL hash fragment 사용**:
```javascript
res.redirect(`${frontendUrl}/login#token=${token}`);
// hash fragment는 서버로 전송되지 않으며 Referer에도 포함되지 않음
```

프론트엔드에서:
```typescript
const hash = window.location.hash;
const token = hash.startsWith('#token=') ? hash.slice(7) : null;
// 읽은 즉시 URL에서 제거
window.history.replaceState(null, '', window.location.pathname);
```

### 4.8 취약 PIN 차단 (신규)

> **[SEC-011 반영]** 4자리 PIN(10,000 조합) 중 흔한 패턴이 상위 20%를 차지합니다.

PIN 설정 시 다음 패턴을 서버에서 차단합니다:
```
차단 목록:
- 같은 숫자 반복: 0000, 1111, 2222, ..., 9999
- 연속 숫자: 1234, 2345, 3456, ..., 6789, 9876, 8765, ...
- 흔한 패턴: 1004, 1212, 0101, 1122, 2580 (키패드 세로줄)
```

차단 시 안내: "너무 쉬운 비밀번호입니다. 다른 숫자를 입력해주세요"

### 4.9 멀티탭 로그아웃 동기화 (신규)

> **[Gini 리뷰 반영]** 탭 A에서 로그아웃 시 탭 B가 여전히 인증 상태로 동작하는 문제.

**BroadcastChannel API로 동기화**:
```typescript
// 로그아웃 시
const channel = new BroadcastChannel('aims-auth');
channel.postMessage({ type: 'LOGOUT' });

// 모든 탭에서 수신
channel.onmessage = (e) => {
  if (e.data.type === 'LOGOUT') {
    useAuthStore.getState().logout();
    window.location.href = '/login';
  }
};
```

### 4.10 Safari 개인정보 보호 모드 대응 (신규)

> **[Gini 리뷰 반영]** Safari 개인정보 보호 모드에서 localStorage 쓰기 시 QuotaExceededError 발생.

```typescript
const getStorage = (): Storage => {
  try {
    const rememberDevice = localStorage.getItem("aims-remember-device");
    if (rememberDevice === "true") {
      // localStorage 쓰기 가능 여부 테스트
      localStorage.setItem("aims-storage-test", "1");
      localStorage.removeItem("aims-storage-test");
      return localStorage;
    }
  } catch {
    // Safari 개인정보 보호 모드 → localStorage 불가
    console.warn('[Auth] localStorage 접근 불가, sessionStorage로 fallback');
  }
  return sessionStorage;
};
```

---

## 5. 헤더 이름 표시

현재 HeaderView.tsx의 아바타 영역에 이름이 표시되지 않습니다. 서비스 내에서 "나"의 정체성을 명확히 하기 위해, 아바타 옆에 이름을 표시합니다.

```
현재:   [아바타]
변경:   [아바타] 김소라

헤더 우측 영역:
  [빠른검색] [AI] [테마] [아바타] 김소라
```

**구현 위치**: HeaderView.tsx 304~346행 부근

```tsx
<div className="header-user-avatar" ...>
  <div className="header-user-avatar-circle">
    {avatarUrl ? <img ... /> : userInitial}
  </div>
  <span className="header-user-name">{userName}</span>
</div>
```

**CSS**:
```css
.header-user-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-left: 6px;
  white-space: nowrap;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**모바일**: 화면 폭이 좁을 때 이름을 숨기고 아바타만 표시합니다.
```css
@media (max-width: 768px) {
  .header-user-name { display: none; }
}
```

---

## 6. 전체 인증 흐름 다이어그램

```
사용자가 AIMS 접속
        |
        v
  localStorage에 토큰 있는가?
        |
   YES  |  NO
   |    |    |
   |    |    v
   |    |  sessionStorage에 토큰 있는가?
   |    |       |
   |    |  YES  |  NO
   |    |   |   |    |
   |    |   |   |    v
   |    |   |   |  [상태 A/C] 소셜 로그인 페이지
   |    |   |   |    |
   |    |   |   |    v
   |    |   |   |  "이 기기 기억하기" 체크?
   |    |   |   |    |
   |    |   |   |  YES -> 소셜 로그인 -> PIN 설정 -> localStorage 저장 -> 메인
   |    |   |   |  NO  -> 소셜 로그인 -> sessionStorage 저장 -> 메인
   |    |   |   |
   |    |   v   |
   |    |  sessionStorage에 pin-verified?
   |    |       |
   |    |  YES  |  NO
   |    |   |   |    |
   |    |   v   |    v
   |    | 메인   |  ProtectedRoute가 토큰 검증 -> 메인
   |    |
   v    |
  서버에 PIN 등록 여부 확인
        |
   YES  |  NO (비정상)
   |    |    |
   |    |    v
   |    |  기기 기억 데이터 삭제 -> 소셜 로그인 페이지
   |    |
   v
  sessionStorage에 pin-verified?
        |
   YES  |  NO
   |    |    |
   v    |    v
 메인   | [상태 B] PIN 입력 화면
        |    |
        |  PIN 검증 성공?
        |    |
        |  YES -> 서버 session_token 발급 → sessionStorage에 저장 -> 메인
        |  NO  -> 실패 횟수 증가 (5회 시 잠금, 지수 백오프)
```

---

## 7. Phase별 구현 계획

### Phase 1: 토큰 저장 분리 + 강제 로그인 (2~3일)

> **[Gini 리뷰 반영]** 1~2일 추정은 과소. 아래 4가지 추가 작업으로 2~3일이 현실적.

**목표**: "브라우저를 열면 항상 로그인 페이지" 요구사항 충족

**변경 파일**:
- authStore.ts: persist 미들웨어의 스토리지를 동적 전환
- ProtectedRoute.tsx: 세션 검증 로직 추가
- LoginPage.tsx: "다음에 PIN으로 빠르게 로그인" 체크박스 추가
- LoginPage.css: 체크박스 스타일

**[Gini 반영] Phase 1에서 반드시 처리할 추가 작업**:
1. **persist key는 `auth-storage-v2` 유지** — key를 v3으로 변경하면 기존 사용자 전원 즉시 로그아웃 + 고아 데이터 발생. storage 커스텀 어댑터만 변경.
2. **`isAuthenticated` rehydration** — persist는 `token`만 저장하므로 복원 후 `isAuthenticated = false`. `onRehydrateStorage` 콜백에서 token → isAuthenticated 파생 처리 필요.
3. **`aims-remember-device` 저장 시점** — 체크박스 체크 시 즉시 `localStorage.setItem("aims-remember-device", "true")` 저장 (소셜 로그인 버튼 클릭 전). OAuth redirect 후에도 플래그 유지를 보장.
4. **localStorage 접근 불가 대응** — `getStorage()` 함수에 try-catch + Safari 개인정보 보호 모드 fallback (4.10절 참조).

**핵심 변경 -- authStore.ts**:
```typescript
// 기기 기억 여부에 따라 스토리지 동적 선택 (4.10절 Safari 대응 포함)
const getStorage = (): Storage => {
  try {
    const rememberDevice = localStorage.getItem("aims-remember-device");
    if (rememberDevice === "true") {
      localStorage.setItem("aims-storage-test", "1");
      localStorage.removeItem("aims-storage-test");
      return localStorage;
    }
  } catch {
    console.warn('[Auth] localStorage 접근 불가, sessionStorage로 fallback');
  }
  return sessionStorage;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // ... 기존 상태/액션 동일

      // 로그아웃 시 모든 인증 데이터 정리 + 멀티탭 동기화
      logout: () => {
        localStorage.removeItem("aims-remember-device");
        localStorage.removeItem("aims-remembered-user");
        sessionStorage.removeItem("aims-session-token");
        // 멀티탭 로그아웃 동기화 (4.9절)
        try {
          const channel = new BroadcastChannel('aims-auth');
          channel.postMessage({ type: 'LOGOUT' });
          channel.close();
        } catch {}
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: "auth-storage-v2",  // ← v2 유지! key 변경 시 기존 사용자 로그아웃됨
      partialize: (state) => ({ token: state.token }),
      // isAuthenticated rehydration
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          state.isAuthenticated = true;
        }
      },
      storage: {
        getItem: (name) => {
          const storage = getStorage();
          const value = storage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => {
          const storage = getStorage();
          storage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
          sessionStorage.removeItem(name);
        },
      },
    }
  )
);
```

**[Gini 반영] Phase 1 배포 전략**: Phase 3(서버 PIN API) 완료 전까지 "다음에 PIN으로 빠르게 로그인" 체크박스를 `disabled` 상태로 두고, Phase 3 완료 후 활성화합니다 (feature flag 대체).

**핵심 변경 -- ProtectedRoute.tsx**:
```typescript
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token, user, setUser, logout } = useAuthStore();
  const { updateCurrentUser } = useUserStore();  // [Gini 반영] 동기화 누락 방지
  const [isLoading, setIsLoading] = useState(true);

  const rememberDevice = localStorage.getItem("aims-remember-device") === "true";
  const sessionToken = sessionStorage.getItem("aims-session-token");

  useEffect(() => {
    const fetchUser = async () => {
      if (token && !user) {
        try {
          const userData = await getCurrentUser(token);
          setUser(userData);
          // [Gini 반영] useUserStore 동기화 (기존 LoginPage 패턴 유지)
          updateCurrentUser({
            id: userData._id, name: userData.name || '',
            email: userData.email || '', role: userData.role,
            avatarUrl: userData.avatarUrl || undefined,
          });
        } catch {
          logout();
        }
      }
      setIsLoading(false);
    };
    fetchUser();
  }, [token, user, setUser, updateCurrentUser, logout]);

  if (isLoading && token && !user) {
    return <div>...</div>;
  }

  // 토큰 없음 -> 로그인 페이지
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // 기기 기억 O + 서버 세션 토큰 없음 -> PIN 입력 페이지
  // [SEC-004 반영] sessionStorage 단순 플래그 대신 서버 발급 세션 토큰 검증
  if (rememberDevice && !sessionToken) {
    return <Navigate to="/login?mode=pin" replace />;
  }

  return <>{children}</>;
}
```

이 Phase만으로도 핵심 요구사항("브라우저 열면 항상 로그인")이 충족됩니다.

**[Gini 반영] profileCompleted와 PIN 설정 순서**: 신규 사용자(`profileCompleted: false`)가 "다음에 PIN으로 빠르게 로그인"을 체크한 경우, **프로필 설정을 먼저** 완료한 후 PIN 설정 화면으로 전환합니다 (프로필 → PIN 순서).

### Phase 2: PIN 설정/검증 UI (2~3일)

**목표**: PIN 입력 화면, PIN 설정 화면, 실패 처리

**변경/추가 파일**:
- LoginPage.tsx: PIN 입력 모드 추가
- PinInput.tsx (신규): PIN 4자리 입력 컴포넌트
- PinSetup.tsx (신규): PIN 설정 플로우 컴포넌트
- LoginPage.css: PIN 관련 스타일

**PinInput 컴포넌트 설계**:
```typescript
interface PinInputProps {
  length?: number;           // 기본 4
  onComplete: (pin: string) => void;
  error?: string | null;
  disabled?: boolean;
}
```

- 숨겨진 input (type="password" inputMode="numeric") 하나로 실제 입력 처리
- 시각적으로는 4개의 dot만 표시
- 모바일에서 숫자 키보드 자동 표시 (inputMode="numeric")
- 물리 키보드 입력도 지원 (숫자 키 + 백스페이스)
- 자동 포커스 (화면 진입 시 바로 입력 가능)

### Phase 3: 서버 API + PIN 해시 저장 (2~3일)

> **[Gini 리뷰 반영]** 1~2일→2~3일. bcrypt 의존성 추가 + rate limit 미들웨어 + 세션 토큰 관리 포함.

**목표**: PIN을 서버에 안전하게 저장하고 검증

**변경/추가 파일**:
- backend/aims_api/routes/auth-routes.js: PIN 관련 API 4개 + 세션 검증 API 추가
- backend/aims_api/models/User.js: pinHash, pinFailCount, tokenVersion 필드 추가
- backend/aims_api/middleware/rateLimiter.js: userId 기반 rate limit

**MongoDB users 컬렉션 변경**:
```javascript
{
  // ... 기존 필드
  pinHash: String,        // bcrypt 해시 (null이면 PIN 미설정)
  pinFailCount: Number,   // 실패 횟수 (기본 0, 5 이상이면 잠김)
  pinLockedAt: Date,      // 잠긴 시점 (null이면 잠기지 않음)
  tokenVersion: Number    // [SEC-009] 토큰 무효화용 버전 (기본 0)
}
```

**추가 API**:
```
GET /api/auth/verify-session
  Headers: Authorization: Bearer <token>
  Query: ?sessionToken=<session_token>
  Response: { valid: true }
  동작: MongoDB sessions 컬렉션에서 sessionToken 존재 + TTL 확인
```

### Phase 4: 프로필 메뉴 확장 + 기기 기억 해제 (0.5~1일)

**목표**: PIN 변경, 기기 기억 해제 기능

**변경 파일**:
- UserProfileMenu.tsx: 메뉴 항목 추가
- PinChangeModal.tsx (신규): PIN 변경 모달

### Phase 5: 마무리 + 접근성 + 테스트 (1일)

**목표**: 엣지 케이스 처리, 키보드 접근성, 테스트

**체크리스트**:
- 키보드만으로 PIN 입력 완료 가능한가
- 스크린리더가 PIN 입력 상태를 읽어주는가
- PIN 실패 시 에러 메시지를 스크린리더가 읽어주는가
- 다크 모드에서 PIN dot이 잘 보이는가
- 모바일에서 숫자 키보드가 올라오는가

---

## 8. 기기 기억 시 localStorage에 저장하는 데이터

```javascript
// 기기 기억 플래그
localStorage["aims-remember-device"] = "true";

// 기억된 사용자 정보 (PIN 화면에서 이름/이니셜 표시용)
// [SEC-010 반영] avatarUrl(외부 CDN)은 저장하지 않고 이니셜만 사용 권장
localStorage["aims-remembered-user"] = JSON.stringify({
  userId: "69ae12aff0e011bda4cbffc3",
  name: "김소라",
  authProvider: "kakao"
});

// 인증 토큰 (JWT) — key는 auth-storage-v2 유지!
localStorage["auth-storage-v2"] = JSON.stringify({
  state: { token: "eyJhbG..." },
  version: 0
});
```

**sessionStorage** (PIN 검증 후):
```javascript
// [SEC-004 반영] 단순 "true" 플래그가 아닌 서버 발급 세션 토큰 저장
sessionStorage["aims-session-token"] = "a3f8c9d2e1...";  // crypto.randomBytes(32)
```

---

## 9. 검증 체크리스트

### 보안 검증

| # | 항목 | 기대 결과 | 통과 |
|---|------|----------|------|
| S1 | 브라우저 닫고 다시 열기 (기기 기억 X) | 소셜 로그인 페이지 표시 | [ ] |
| S2 | 브라우저 닫고 다시 열기 (기기 기억 O) | PIN 입력 화면 표시 (자동 진입 아님) | [ ] |
| S3 | PIN 5회 실패 | 잠김 -> 소셜 로그인만 가능 | [ ] |
| S4 | localStorage의 토큰을 직접 삭제 | 소셜 로그인 페이지로 이동 | [ ] |
| S5 | localStorage의 기기 기억 플래그를 직접 삭제 | 소셜 로그인 페이지로 이동 | [ ] |
| S6 | 다른 사람이 URL 직접 입력으로 / 접속 시도 | 로그인 페이지로 리다이렉트 | [ ] |
| S7 | PIN 없이 클릭만으로 진입 불가 | PIN 입력 필수 | [ ] |
| S8 | DevTools에서 sessionStorage 조작으로 PIN 우회 시도 | 서버 세션 토큰 검증으로 차단 | [ ] |
| S9 | JWT URL 쿼리 노출 | hash fragment 방식으로 히스토리/Referer 미노출 | [ ] |
| S10 | OAuth state CSRF 검증 | state에 CSRF nonce 포함, 콜백에서 대조 | [ ] |
| S11 | 취약 PIN(1234, 0000) 등록 시도 | 서버에서 차단, 안내 메시지 | [ ] |
| S12 | Idle timeout(PC 30분, 모바일 5분) 후 | PIN 재입력 요구 | [ ] |

### UX 검증

| # | 항목 | 기대 결과 | 통과 |
|---|------|----------|------|
| U1 | 소셜 로그인 -> "기기 기억" 체크 -> PIN 설정 | PIN 등록 후 메인 진입 | [ ] |
| U2 | PIN 입력 시 dot 채워지는 애니메이션 | 자연스러운 전환 (150ms) | [ ] |
| U3 | PIN 실패 시 흔들림 애니메이션 | iOS 잠금화면과 동일한 느낌 | [ ] |
| U4 | "다른 계정으로 로그인" 클릭 | 소셜 로그인 화면으로 전환 | [ ] |
| U5 | PIN 4자리 입력 완료 -> 자동 검증 | 확인 버튼 없이 자동 처리 | [ ] |
| U6 | "나중에 설정하기" 선택 시 | 기기 기억 해제, sessionStorage만 사용 | [ ] |
| U7 | 헤더에 사용자 이름 표시 | 아바타 우측에 이름 표시 | [ ] |

### 팝업/멀티탭 검증

| # | 항목 | 기대 결과 | 통과 |
|---|------|----------|------|
| P1 | 메인에서 AI Assistant 팝업 열기 | 팝업에서 재인증 없이 사용 가능 | [ ] |
| P2 | 새 탭에서 AIMS 직접 접속 (기기 기억 O) | PIN 입력 필요 | [ ] |
| P3 | 새 탭에서 AIMS 직접 접속 (기기 기억 X) | 소셜 로그인 필요 | [ ] |
| P4 | 탭 A에서 로그아웃 후 탭 B | 탭 B도 즉시 로그인 페이지로 이동 | [ ] |
| P5 | PIN 설정 중 브라우저 닫힘 후 재방문 | 기기 기억 플래그 + PIN 미등록 → 소셜 로그인 페이지 | [ ] |
| P6 | profileCompleted:false + 기기 기억 체크 | 프로필 설정 먼저 → PIN 설정 순서 | [ ] |
| P7 | Safari 개인정보 보호 모드 | localStorage 불가 → sessionStorage fallback, 정상 로그인 | [ ] |

### 접근성 검증

| # | 항목 | 기대 결과 | 통과 |
|---|------|----------|------|
| A1 | 키보드만으로 PIN 입력 | Tab으로 포커스 -> 숫자 키 입력 가능 | [ ] |
| A2 | 스크린리더 | "PIN 입력, 4자리 중 2자리 입력됨" 읽기 | [ ] |
| A3 | 색상 대비 (다크/라이트) | PIN dot이 배경과 4.5:1 이상 대비 | [ ] |
| A4 | 모바일 숫자 키보드 | inputMode="numeric"으로 자동 표시 | [ ] |

---

## 10. 디자인 상세 명세

### 10.1 PIN Dot 스타일

```css
.pin-dots {
  display: flex;
  gap: 16px;
  justify-content: center;
  align-items: center;
}

.pin-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--color-border-secondary);
  background: transparent;
  transition: all 0.15s ease;
}

.pin-dot--filled {
  background: var(--color-text-primary);
  border-color: var(--color-text-primary);
  transform: scale(1.1);
}

.pin-dot--error {
  border-color: var(--color-status-error);
  background: var(--color-status-error);
}

/* 흔들림 애니메이션 */
@keyframes pin-shake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-10px); }
  30% { transform: translateX(10px); }
  45% { transform: translateX(-6px); }
  60% { transform: translateX(6px); }
  75% { transform: translateX(-2px); }
  90% { transform: translateX(2px); }
}

.pin-dots--shake {
  animation: pin-shake 0.4s ease-in-out;
}
```

### 10.2 PIN 화면 레이아웃

```css
.login-pin-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 48px 32px;
}

.login-pin-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
}

.login-pin-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.login-pin-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.login-pin-message {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
}

.login-pin-error {
  font-size: 12px;
  color: var(--color-status-error);
  min-height: 18px;
}

.login-pin-switch {
  font-size: 12px;
  color: var(--color-text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  margin-top: 16px;
}

.login-pin-switch:hover {
  color: var(--color-text-secondary);
  text-decoration: underline;
}
```

### 10.3 "이 기기 기억하기" 체크박스

```css
.login-remember-device {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  margin-top: 8px;
}

.login-remember-device input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.login-remember-device label {
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
}
```

### 10.4 색상 (CSS 변수만 사용)

| 요소 | 변수 | 용도 |
|------|------|------|
| PIN dot 빈 상태 | var(--color-border-secondary) | 테두리 |
| PIN dot 채운 상태 | var(--color-text-primary) | 배경 + 테두리 |
| PIN dot 에러 | var(--color-status-error) | 배경 + 테두리 |
| 안내 텍스트 | var(--color-text-secondary) | 13px |
| 에러 텍스트 | var(--color-status-error) | 12px |
| 링크 텍스트 | var(--color-text-tertiary) | 12px |
| 아바타 배경 | var(--color-bg-tertiary) | fallback |

---

## 11. UX 레퍼런스 비교

| 서비스 | 인증 방식 | AIMS 적용 |
|--------|----------|----------|
| 토스 | 앱 열면 항상 PIN/생체 | PIN 4자리 (기기 기억 시) |
| 카카오뱅크 | 앱 열면 항상 PIN/생체 | PIN dot 4개 UI |
| iCloud.com | 기기 신뢰 + 2FA 코드 | "이 기기 기억하기" 개념 |
| 보험사 포털 | 매번 ID/PW 입력 | 기기 기억 X일 때 소셜 로그인 |

AIMS는 토스/카카오뱅크의 "빠른 재인증"과 보험사 포털의 "매번 인증"을 결합합니다. 사용자가 직접 선택할 수 있으므로, 보안 의식이 높은 사용자는 매번 소셜 로그인을, 편의를 원하는 사용자는 PIN 간편 인증을 사용합니다.

---

## 12. 모바일 웹 설계

보험 설계사는 외근 중 스마트폰으로 AIMS에 접속하는 경우가 많습니다. 모바일 웹 환경의 특수성을 반영한 설계입니다.

### 12.1 모바일 레이아웃

**로그인 페이지 (상태 A — 소셜 로그인)**:
- `login-container`의 `max-width: 400px` + `border-radius: 16px`는 PC용 카드 형태입니다
- 모바일에서는 카드를 제거하고 **전체 화면으로 전환**합니다 (토스/카카오뱅크 동일 패턴)

```css
@media (max-width: 480px) {
  .login-container {
    max-width: 100%;
    border-radius: 0;
    box-shadow: none;
    background: var(--color-bg-primary);   /* 배경과 통합 */
    padding: 64px 24px 32px;               /* 상단 여유, 좌우 축소 */
    min-height: 100vh;
    min-height: 100dvh;                    /* iOS Safari 주소창 대응 */
  }
}
```

**PIN 입력 화면 (상태 B)**:
- PIN dot과 아바타를 화면 상단 1/3 지점에 배치합니다
- 하단에 가상 키보드가 올라와도 PIN dot이 가려지지 않아야 합니다

```css
@media (max-width: 480px) {
  .login-pin-container {
    padding: 80px 24px 32px;
    justify-content: flex-start;   /* 상단 정렬 — 키보드에 밀리지 않도록 */
  }
}
```

### 12.2 터치 영역 (Apple HIG 준수)

모바일에서 소셜 로그인 버튼, PIN dot, 링크 등 모든 인터랙티브 요소는 **최소 44×44px 터치 영역**을 확보합니다.

| 요소 | 현재 크기 | 모바일 최소 | 조치 |
|------|----------|------------|------|
| 소셜 로그인 버튼 | padding 14px (높이 ~48px) | 44px | OK (충분) |
| "다른 계정으로 로그인" 링크 | padding 8px 4px (~32px) | 44px | 모바일에서 padding 증가 필요 |
| PIN dot (14×14px) | 클릭 불필요 | — | 해당 없음 (숨겨진 input으로 입력) |
| "다른 계정으로 로그인" (PIN 화면) | font 12px | 44px | 터치 영역 확보 필요 |
| "건너뛰기" 링크 | — | 44px | 터치 영역 확보 필요 |

```css
@media (max-width: 480px) {
  .switch-account-button {
    padding: 12px 8px;              /* 터치 영역 확대 */
    font-size: 13px;
  }

  .login-pin-switch {
    padding: 12px 16px;
    font-size: 13px;
  }
}
```

### 12.3 가상 키보드 대응

**PIN 입력 시 숫자 키보드 강제 표시**:
```html
<input
  type="password"
  inputMode="numeric"
  pattern="[0-9]*"
  autoComplete="one-time-code"
/>
```

- `inputMode="numeric"`: Android/iOS 모두 숫자 전용 키패드 표시
- `pattern="[0-9]*"`: iOS Safari에서 숫자 키패드 강제 (fallback)
- `autoComplete="one-time-code"`: iOS에서 PIN 자동완성 UI 방지

**키보드 올라올 때 레이아웃 밀림 방지**:
- `100vh` 대신 `100dvh` (Dynamic Viewport Height) 사용
- `visualViewport` API로 키보드 높이 감지하여 PIN 영역 위치 조정

```typescript
// 가상 키보드 높이 감지 (PIN 입력 화면에서만)
useEffect(() => {
  if (!window.visualViewport) return;
  const handleResize = () => {
    const keyboardHeight = window.innerHeight - window.visualViewport!.height;
    if (keyboardHeight > 100) {
      // 키보드가 올라온 상태 — PIN 영역을 위로 이동
      pinContainerRef.current?.style.setProperty(
        'padding-top', '40px'
      );
    }
  };
  window.visualViewport.addEventListener('resize', handleResize);
  return () => window.visualViewport?.removeEventListener('resize', handleResize);
}, []);
```

### 12.4 소셜 로그인 모바일 특이사항

**인앱 브라우저 문제**:
카카오톡, 네이버 앱 내 웹뷰에서 AIMS를 열면 OAuth 리다이렉트가 인앱 브라우저에서 처리됩니다.

> **[설계사 리뷰 반영]** "'외부 브라우저로 열기' 안내가 나오면 그냥 포기해요" — 외부 브라우저 유도 대신,
> **해당 앱의 소셜 로그인을 최우선으로 강조**하는 전략으로 변경.

| 시나리오 | 대응 |
|---------|------|
| 카카오톡 내 링크로 접속 | **카카오 로그인 버튼을 최상단에 크게 표시**. 네이버/구글은 "다른 방법으로 로그인" 접힌 영역에 배치 |
| 네이버 앱 내 링크로 접속 | **네이버 로그인 버튼을 최상단에 크게 표시**. 카카오/구글은 접힌 영역에 배치 |
| Safari/Chrome 직접 접속 | 모든 소셜 로그인 동일 크기로 표시 (기본 시나리오) |

**인앱 브라우저 감지 및 UI 조정**:
```typescript
const getInAppBrowserType = (): 'kakao' | 'naver' | null => {
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/NAVER/i.test(ua)) return 'naver';
  return null;
};

// 인앱 브라우저 타입에 따라 해당 소셜 로그인을 강조
const inAppType = getInAppBrowserType();
// inAppType === 'kakao' → 카카오 버튼만 크게, 나머지 접기
// inAppType === 'naver' → 네이버 버튼만 크게, 나머지 접기
// inAppType === null → 기본 레이아웃
```

**OAuth 콜백 URL 모바일 대응**:
- 현재 콜백 URL은 `tars.giize.com:3010`으로 설정되어 있습니다
- 모바일에서도 동일한 콜백 URL을 사용하므로 추가 설정은 불필요합니다
- 단, 프로덕션 배포 시 `aims.giize.com` 도메인으로 통일해야 합니다

### 12.5 모바일 "다음에 PIN으로 빠르게 로그인" 정책

모바일에서 PIN 간편 로그인은 PC보다 **적극적으로 권장**합니다.

| 환경 | 기본값 | 이유 |
|------|--------|------|
| PC 브라우저 | 체크 해제 (OFF) | 공용 PC 위험 |
| 모바일 브라우저 | 체크 해제 (OFF) | 개인 기기지만 보수적 기본값 유지 |

**모바일 전용 안내 문구** (체크박스 하단):
```
모바일: "체크하면 → 다음엔 숫자 4개만 누르면 됩니다"
PC:     "체크하면 → 다음엔 숫자 4개만 누르면 됩니다 / 체크 안 하면 → 다음에도 소셜 로그인 필요"
```

```typescript
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
```

### 12.6 모바일 PIN 입력 UX 상세

**자동 포커스 + 키보드 즉시 표시**:
- PIN 화면 진입 시 숨겨진 input에 `autoFocus`를 설정합니다
- iOS Safari는 사용자 인터랙션 없이 `focus()`가 동작하지 않는 경우가 있습니다
- 대응: PIN 화면 자체를 터치하면 input에 포커스가 이동하도록 컨테이너에 `onClick` 핸들러를 추가합니다

```tsx
<div className="login-pin-container" onClick={() => pinInputRef.current?.focus()}>
  {/* PIN dot 표시 */}
  <input ref={pinInputRef} type="password" inputMode="numeric" ... />
</div>
```

**백스페이스 지원**:
- 모바일 키보드의 백스페이스로 입력 취소 가능해야 합니다
- dot이 역순으로 비워지는 애니메이션 적용

**진동 피드백 (PIN 실패 시)**:
```typescript
// PIN 실패 시 햅틱 피드백 (지원 기기에서만)
if (navigator.vibrate) {
  navigator.vibrate([100, 50, 100]);  // 짧은 진동 2회
}
```

### 12.7 Safe Area 대응 (노치/홈바)

iPhone X 이후 기기, Android 펀치홀 기기에서 콘텐츠가 시스템 UI에 가려지지 않도록 합니다.

```css
@media (max-width: 480px) {
  .login-page {
    padding: env(safe-area-inset-top) env(safe-area-inset-right)
             env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
}
```

`index.html`에 viewport 메타 태그 확인:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```
- `viewport-fit=cover`가 있어야 `env(safe-area-inset-*)` 값이 적용됩니다

### 12.8 모바일 와이어프레임

**상태 A — 모바일 소셜 로그인**:
```
+----------------------------+
|        (상태바 영역)         |
|                            |
|                            |
|           AIMS             |
|    보험 문서 AI 플랫폼       |
|                            |
|                            |
| +------------------------+ |
| |  (K)  카카오 로그인      | |
| +------------------------+ |
|                            |
| +------------------------+ |
| |  (N)  네이버 로그인      | |
| +------------------------+ |
|                            |
| +------------------------+ |
| |  (G)  구글 로그인        | |
| +------------------------+ |
|                            |
| [v] 다음에 PIN으로 빠르게    |
|     로그인                  |
| 체크하면 → 다음엔 숫자 4개만 |
| 누르면 됩니다               |
|                            |
| 다른 카카오 | 네이버 | 구글  |
|                            |
|       (홈바 safe area)     |
+----------------------------+
```

**상태 B — 모바일 PIN 입력** (키보드 올라온 상태):
```
+----------------------------+
|        (상태바 영역)         |
|                            |
|          +------+          |
|          | 아바타 |          |
|          +------+          |
|         김소라 님            |
|                            |
|    간편 비밀번호를 입력하세요  |
|                            |
|        ●  ●  ○  ○          |
|                            |
|    다른 계정으로 로그인       |
|                            |
| +------------------------+ |
| |  1  |  2  |  3  |       |
| +------------------------+ |
| |  4  |  5  |  6  |       |
| +------------------------+ |
| |  7  |  8  |  9  |       |
| +------------------------+ |
| |     |  0  |  ⌫  |       |
| +------------------------+ |
+----------------------------+
```

> **참고**: 숫자 키패드는 OS 기본 가상 키보드를 사용합니다. 위 다이어그램은 배치 참고용이며, 커스텀 키패드를 구현하지 않습니다.

### 12.9 모바일 검증 체크리스트

| # | 항목 | 기대 결과 | 통과 |
|---|------|----------|------|
| M1 | iPhone Safari에서 로그인 페이지 | 전체 화면, 카드 없음, Safe Area 대응 | [ ] |
| M2 | Android Chrome에서 로그인 페이지 | 동일 레이아웃, 주소창 겹침 없음 | [ ] |
| M3 | PIN 화면에서 숫자 키패드 표시 | `inputMode="numeric"` 동작 확인 | [ ] |
| M4 | PIN 입력 시 키보드에 PIN dot 가려지지 않음 | `dvh` + `flex-start` 정렬로 상단 유지 | [ ] |
| M5 | PIN 실패 시 진동 피드백 | iOS/Android 햅틱 동작 | [ ] |
| M6 | 카카오톡 인앱 브라우저에서 접속 | 외부 브라우저 안내 또는 정상 동작 | [ ] |
| M7 | 소셜 로그인 버튼 터치 영역 | 44×44px 이상 | [ ] |
| M8 | "다른 계정" 링크 터치 영역 | 44×44px 이상 (오탭 방지) | [ ] |
| M9 | 가로 모드(landscape) | 레이아웃 깨지지 않음, 스크롤 가능 | [ ] |
| M10 | 모바일 "다음에 PIN으로 빠르게 로그인" 안내 문구 | 안내 표시 | [ ] |
| M11 | 카카오톡 인앱에서 카카오 로그인 버튼 강조 | 카카오 버튼 최상단, 나머지 접힌 영역 | [ ] |
| M12 | Idle timeout(모바일 5분) | 5분 미사용 시 PIN 재입력 | [ ] |

---

## 13. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 사용자가 PIN을 잊어버림 | 소셜 로그인으로 재진입 → PIN 재설정 | "비밀번호를 잊으셨나요?" 링크 + 잠김 화면 안내 |
| 서버 장애 시 PIN 검증 불가 | 로그인 자체 불가 | 서버 응답 없을 시 에러 메시지 + 재시도 안내 |
| JWT 만료(1일) + 기기 기억 | PIN 검증 시 토큰 만료 | Refresh Token으로 갱신, 실패 시 소셜 로그인 |
| 브라우저 개인정보 삭제 | localStorage 삭제됨 | 소셜 로그인으로 자연스럽게 전환 |
| 인앱 브라우저 OAuth | 카카오톡/네이버 앱 내에서 다른 소셜 로그인 불가 | 해당 앱의 소셜 로그인 강조 표시 (12.4절) |
| 모바일 키보드로 PIN dot 가림 | PIN 입력 상태 확인 불가 | `dvh` + 상단 정렬로 키보드 위에 유지 |
| iOS Safari autoFocus 제한 | PIN 화면에서 키보드 미표시 | 컨테이너 터치 시 input focus 처리 |
| **[신규]** PIN 설정 중 브라우저 닫힘 | 기기 기억 O + PIN 미등록 비정상 상태 | 서버 PIN 등록 여부 확인 → 미등록이면 플래그 삭제 → 소셜 로그인 |
| **[신규]** 멀티탭 로그아웃 비동기 | 탭 A 로그아웃 후 탭 B 인증 유지 | BroadcastChannel로 즉시 동기화 (4.9절) |
| **[신규]** Safari 개인정보 보호 모드 | localStorage 접근 불가 | try-catch + sessionStorage fallback (4.10절) |
| **[신규]** 소셜 로그인 전체 장애 | PIN 잠김 + 소셜 로그인 불가 → 완전 잠금 | 장애 시 에러 메시지에 "잠시 후 다시 시도" 안내 |
| **[신규]** 어깨 너머 PIN 훔쳐보기 | PIN 노출 | dot 채운 후 300ms 후 흐림 처리 (토스 방식) |

---

## 요약

이 설계는 프로젝트 오너의 5가지 확정 요구사항을 모두 충족합니다:

1. **로그인 페이지 필수**: 브라우저를 열면 항상 로그인(소셜 또는 PIN) 페이지가 표시됩니다
2. **클릭만으로 진입 불가**: PIN 4자리 입력이 필수이므로, 단순 클릭으로 진입할 수 없습니다
3. **보안**: 토큰이 있어도 PIN 검증 없이는 진입할 수 없습니다
4. **반복 입력 부담 경감**: 기기 기억 + PIN으로 소셜 로그인보다 훨씬 빠르게 진입합니다
5. **약간의 불편함 허용**: PIN 4자리는 2~3초면 입력 가능하며, 보안을 위한 합리적 불편입니다
6. **모바일 웹 완전 대응**: 외근 중 스마트폰 접속 시에도 동일한 보안 수준과 최적화된 UX를 제공합니다

---

## 부록: 3자 보안/품질/UX 리뷰 결과 요약 (2026.03.14)

### A. Security Auditor 리뷰 — 등급 B- → 반영 후 A-

| ID | 심각도 | 이슈 | 반영 상태 |
|----|--------|------|----------|
| SEC-001 | CRITICAL | admin-login 비밀번호 없음 | **별도 이슈** (이 설계서 범위 외, 즉시 수정 필요) |
| SEC-002 | CRITICAL | verify-pin userId body 노출 → 브루트포스 | **반영 완료** (4.1절: Authorization 헤더에서 추출) |
| SEC-003 | CRITICAL | JWT가 URL 쿼리로 전달 | **반영 완료** (4.7절: hash fragment 방식) |
| SEC-004 | HIGH | aims-pin-verified DevTools 우회 | **반영 완료** (4.4절: 서버 세션 토큰) |
| SEC-005 | HIGH | OAuth state CSRF nonce 부재 | **반영 완료** (9장 S10 체크리스트 추가) |
| SEC-006 | HIGH | ALLOW_TEST_AUTH 프로덕션 노출 | **별도 이슈** (설계서 범위 외) |
| SEC-007 | HIGH | noopener 제거 권고 → 역방향 위협 | **반영 완료** (4.5절: BroadcastChannel) |
| SEC-008 | HIGH | state가 redirect URL로만 사용 | **반영 완료** (4.7절과 연동) |
| SEC-009 | MEDIUM | JWT 만료 7일 과도 | **반영 완료** (4.3절: 1일 + Refresh Token) |
| SEC-010 | MEDIUM | avatarUrl 외부 CDN 저장 | **반영 완료** (8절: 이니셜 사용 권장) |
| SEC-011 | MEDIUM | PIN 4자리 엔트로피 부족 | **반영 완료** (4.8절: 취약 PIN 차단) |
| SEC-013 | MEDIUM | 어깨 너머 공격 | **반영 완료** (13장 리스크: dot 흐림 처리) |

### B. Gini 품질 검증 — FAIL → 반영 후 조건부 PASS

| # | 이슈 | 반영 상태 |
|---|------|----------|
| 1 | auth-storage-v2→v3 key 충돌 | **반영 완료** (Phase 1: v2 유지) |
| 2 | aims-remember-device 저장 시점 미기술 | **반영 완료** (Phase 1: 체크 즉시 저장) |
| 3 | isAuthenticated rehydration 미처리 | **반영 완료** (Phase 1: onRehydrateStorage) |
| 4 | verify-pin 인증 부재 | **반영 완료** (4.1절: Authorization 헤더) |
| 5 | 멀티탭 로그아웃 동기화 누락 | **반영 완료** (4.9절) |
| 6 | profileCompleted + PIN 순서 충돌 | **반영 완료** (Phase 1 하단: 프로필 → PIN 순서) |
| 7 | Safari 개인정보 보호 모드 | **반영 완료** (4.10절) |
| 8 | Phase 1→3 반쪽 배포 전략 없음 | **반영 완료** (Phase 1 하단: disabled → 활성화) |

### C. Sora (보험 설계사) UX 리뷰

| 피드백 | 반영 상태 |
|--------|----------|
| PIN 실패 3회 → 5회 | **반영 완료** (4.2절) |
| "이 기기 기억하기" 용어 직관적이지 않음 | **반영 완료** → "다음에 PIN으로 빠르게 로그인" |
| "건너뛰기" → "나중에 설정하기" | **반영 완료** (3.1절) |
| "PIN 입력이 잠겼습니다" → 덜 무서운 문구 | **반영 완료** (4.2절) |
| "PIN" → "간편 비밀번호" (UI 표시) | **반영 완료** (2.2절, 와이어프레임 전체) |
| 인앱 브라우저 "외부 브라우저로 열기" 안내 무용 | **반영 완료** (12.4절: 해당 앱 소셜 로그인 강조) |
| 자동 잠금(Idle Timeout) 필요 | **반영 완료** (4.6절: PC 30분, 모바일 5분) |
| PIN 잊었을 때 안내 부족 | **반영 완료** (2.2절: "비밀번호를 잊으셨나요?" 링크) |

### D. 미반영 사항 (별도 이슈로 관리)

| ID | 내용 | 이유 |
|----|------|------|
| SEC-001 | admin-login 비밀번호 추가 | 이 설계서 범위 외. 기존 코드 보안 이슈로 별도 처리 |
| SEC-006 | ALLOW_TEST_AUTH 프로덕션 노출 방지 | 이 설계서 범위 외. 백엔드 보안 강화로 별도 처리 |
| SEC-014 | console.log 사용자 이름 출력 | LOW. 프로덕션 빌드 설정으로 해결 |
| SEC-016 | 주석의 단축키 표기 오류 | LOW. 코드 수정 시 함께 처리 |

---

*Dana, AIMS UX Design Advisor*
*"The best security is the one users actually use."*
