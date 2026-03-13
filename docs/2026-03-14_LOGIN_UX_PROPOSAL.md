# AIMS 로그인 UX 재설계 제안서

**작성자**: Dana (UX Design Advisor, 전 Apple Principal Designer)
**작성일**: 2026.03.14
**대상**: AIMS (Agent Intelligent Management System)
**버전**: 3.0 (PIN 간편 인증 + 기기 기억하기)

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
|         [v] 이 기기 기억하기             |
|                                          |
|  다른 카카오 계정 | 다른 네이버 | 다른 구글 |
|                                          |
+------------------------------------------+
```

**설계 의도**:
- "이 기기 기억하기" 체크박스는 소셜 로그인 버튼 아래, 계정 전환 링크 위에 배치합니다
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
|           PIN을 입력하세요                |
|                                          |
|          ●  ●  ○  ○                     |
|                                          |
|                                          |
|     (숫자 키보드 또는 물리 키보드 입력)     |
|                                          |
|                                          |
|          다른 계정으로 로그인              |
|                                          |
+------------------------------------------+
```

**설계 의도**:
- 아바타와 이름으로 "내 계정"임을 시각적으로 즉시 확인합니다
- PIN 입력은 4개의 원형 dot으로 표시합니다 (비밀번호 마스킹)
- 입력할 때마다 빈 원이 채워진 원으로 전환됩니다
- 4자리 모두 입력되면 자동으로 검증을 시작합니다 (확인 버튼 불필요)
- "다른 계정으로 로그인" 링크로 소셜 로그인 화면으로 전환할 수 있습니다

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
- 300ms 동안 재생 후 dot 초기화

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
|          PIN 번호를 설정하세요            |
|    다음 방문 시 빠르게 로그인할 수 있습니다  |
|                                          |
|          ○  ○  ○  ○                     |
|                                          |
|     (숫자 키보드 또는 물리 키보드 입력)     |
|                                          |
|                                          |
|              건너뛰기                     |
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

**"건너뛰기" 선택 시**:
- "이 기기 기억하기"가 해제됩니다
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

```
POST /api/auth/set-pin
  Headers: Authorization: Bearer <token>
  Body: { pin: "1234" }
  Response: { success: true }
  동작: bcrypt.hash(pin, 10) -> users.pinHash에 저장

POST /api/auth/verify-pin
  Body: { userId: "...", pin: "1234" }
  Response: { success: true, token: "<new-jwt>" }
  동작: bcrypt.compare(pin, users.pinHash) -> 성공 시 새 JWT 발급
  Rate Limit: 분당 5회

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

```
1회 실패: "PIN이 올바르지 않습니다" + dot 흔들림 + 초기화
2회 실패: "PIN이 올바르지 않습니다 (2/3)" + dot 흔들림
3회 실패: PIN 잠김 -> 기기 기억 데이터 삭제 -> 소셜 로그인 화면으로 전환
```

잠김 상태 화면:
```
+------------------------------------------+
|                                          |
|          PIN 입력이 잠겼습니다             |
|     보안을 위해 소셜 로그인이 필요합니다    |
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

**실패 횟수 관리**:
- 서버 방식: users.pinFailCount 필드에 저장. 서버에서 3회 초과 시 거부
- 프론트엔드 방식: localStorage의 aims-pin-fail-count에 저장 (조작 가능하나 해시 자체가 안전하므로 허용)

### 4.3 토큰 저장 전략

| 시나리오 | 토큰 저장 위치 | 토큰 수명 | 재방문 시 |
|---------|---------------|----------|----------|
| 기기 기억 X | sessionStorage | 브라우저 닫으면 삭제 | 소셜 로그인 필수 |
| 기기 기억 O | localStorage | JWT 만료까지 (7일) | PIN 입력 필수 |
| PIN 3회 실패 | localStorage 삭제 | 즉시 무효화 | 소셜 로그인 필수 |

**중요**: 현재 authStore.ts의 persist 미들웨어는 항상 localStorage를 사용합니다. 이를 동적으로 전환해야 합니다.

### 4.4 세션 관리 플래그

PIN 검증을 통과한 후, 현재 브라우저 탭/세션에서는 반복 인증하지 않아야 합니다.

```
sessionStorage: "aims-pin-verified" = "true"
```

이 플래그의 생명주기:
- PIN 검증 성공 시 설정
- 브라우저 탭/창 닫으면 자동 삭제 (sessionStorage 특성)
- 새 탭을 열면 다시 PIN 입력 필요

### 4.5 팝업 라우트 처리

AI Assistant(/ai-assistant), Annual Report(/annual-report), Customer Review(/customer-review)는 window.open()으로 열리는 팝업 라우트입니다.

**문제**: sessionStorage는 window.open()으로 열린 자식 창에 복사됩니다 (Same-origin, 단 noopener 아닌 경우). localStorage의 토큰은 공유됩니다.

**해결 방안**:
1. 팝업을 열 때 URL에 일회용 세션 토큰을 쿼리 파라미터로 전달합니다
2. 팝업의 ProtectedRoute에서 이 토큰을 확인합니다
3. 또는 BroadcastChannel API로 메인 창의 인증 상태를 팝업에 전파합니다

**가장 단순한 접근**: window.open() 시 sessionStorage가 자연스럽게 복사되므로, aims-pin-verified 플래그도 함께 전달됩니다. 추가 로직 없이 동작합니다. 단, noopener 옵션을 사용하지 않도록 확인해야 합니다.

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
        |  YES -> sessionStorage에 pin-verified 설정 -> 메인
        |  NO  -> 실패 횟수 증가 (3회 시 잠금)
```

---

## 7. Phase별 구현 계획

### Phase 1: 토큰 저장 분리 + 강제 로그인 (1~2일)

**목표**: "브라우저를 열면 항상 로그인 페이지" 요구사항 충족

**변경 파일**:
- authStore.ts: persist 미들웨어의 스토리지를 동적 전환
- ProtectedRoute.tsx: 세션 검증 로직 추가
- LoginPage.tsx: "이 기기 기억하기" 체크박스 추가
- LoginPage.css: 체크박스 스타일

**핵심 변경 -- authStore.ts**:
```typescript
// 기기 기억 여부에 따라 스토리지 동적 선택
const getStorage = (): Storage => {
  const rememberDevice = localStorage.getItem("aims-remember-device");
  return rememberDevice === "true" ? localStorage : sessionStorage;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // ... 기존 상태/액션 동일
      
      // 로그아웃 시 모든 인증 데이터 정리
      logout: () => {
        localStorage.removeItem("aims-remember-device");
        localStorage.removeItem("aims-remembered-user");
        sessionStorage.removeItem("aims-pin-verified");
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: "auth-storage-v3",
      partialize: (state) => ({ token: state.token }),
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

**핵심 변경 -- ProtectedRoute.tsx**:
```typescript
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { token, user, setUser, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  const rememberDevice = localStorage.getItem("aims-remember-device") === "true";
  const pinVerified = sessionStorage.getItem("aims-pin-verified") === "true";

  useEffect(() => {
    const fetchUser = async () => {
      if (token && !user) {
        try {
          const userData = await getCurrentUser(token);
          setUser(userData);
        } catch {
          logout();
        }
      }
      setIsLoading(false);
    };
    fetchUser();
  }, [token, user, setUser, logout]);

  if (isLoading && token && !user) {
    return <div>...</div>;
  }

  // 토큰 없음 -> 로그인 페이지
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // 기기 기억 O + PIN 미검증 -> PIN 입력 페이지
  if (rememberDevice && !pinVerified) {
    return <Navigate to="/login?mode=pin" replace />;
  }

  return <>{children}</>;
}
```

이 Phase만으로도 핵심 요구사항("브라우저 열면 항상 로그인")이 충족됩니다.

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

### Phase 3: 서버 API + PIN 해시 저장 (1~2일)

**목표**: PIN을 서버에 안전하게 저장하고 검증

**변경/추가 파일**:
- backend/aims_api/routes/auth-routes.js: PIN 관련 API 4개 추가
- backend/aims_api/models/User.js: pinHash, pinFailCount 필드 추가

**MongoDB users 컬렉션 변경**:
```javascript
{
  // ... 기존 필드
  pinHash: String,        // bcrypt 해시 (null이면 PIN 미설정)
  pinFailCount: Number,   // 실패 횟수 (기본 0, 3 이상이면 잠김)
  pinLockedAt: Date       // 잠긴 시점 (null이면 잠기지 않음)
}
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

// 기억된 사용자 정보 (PIN 화면에서 아바타/이름 표시용)
localStorage["aims-remembered-user"] = JSON.stringify({
  userId: "69ae12aff0e011bda4cbffc3",
  name: "김소라",
  avatarUrl: "https://k.kakaocdn.net/...",
  authProvider: "kakao"
});

// 인증 토큰 (JWT)
localStorage["auth-storage-v3"] = JSON.stringify({
  state: { token: "eyJhbG..." },
  version: 0
});
```

**sessionStorage** (PIN 검증 후):
```javascript
sessionStorage["aims-pin-verified"] = "true";
```

---

## 9. 검증 체크리스트

### 보안 검증

| # | 항목 | 기대 결과 | 통과 |
|---|------|----------|------|
| S1 | 브라우저 닫고 다시 열기 (기기 기억 X) | 소셜 로그인 페이지 표시 | [ ] |
| S2 | 브라우저 닫고 다시 열기 (기기 기억 O) | PIN 입력 화면 표시 (자동 진입 아님) | [ ] |
| S3 | PIN 3회 실패 | 잠김 -> 소셜 로그인만 가능 | [ ] |
| S4 | localStorage의 토큰을 직접 삭제 | 소셜 로그인 페이지로 이동 | [ ] |
| S5 | localStorage의 기기 기억 플래그를 직접 삭제 | 소셜 로그인 페이지로 이동 | [ ] |
| S6 | 다른 사람이 URL 직접 입력으로 / 접속 시도 | 로그인 페이지로 리다이렉트 | [ ] |
| S7 | PIN 없이 클릭만으로 진입 불가 | PIN 입력 필수 | [ ] |

### UX 검증

| # | 항목 | 기대 결과 | 통과 |
|---|------|----------|------|
| U1 | 소셜 로그인 -> "기기 기억" 체크 -> PIN 설정 | PIN 등록 후 메인 진입 | [ ] |
| U2 | PIN 입력 시 dot 채워지는 애니메이션 | 자연스러운 전환 (150ms) | [ ] |
| U3 | PIN 실패 시 흔들림 애니메이션 | iOS 잠금화면과 동일한 느낌 | [ ] |
| U4 | "다른 계정으로 로그인" 클릭 | 소셜 로그인 화면으로 전환 | [ ] |
| U5 | PIN 4자리 입력 완료 -> 자동 검증 | 확인 버튼 없이 자동 처리 | [ ] |
| U6 | "건너뛰기" 선택 시 | 기기 기억 해제, sessionStorage만 사용 | [ ] |
| U7 | 헤더에 사용자 이름 표시 | 아바타 우측에 이름 표시 | [ ] |

### 팝업/멀티탭 검증

| # | 항목 | 기대 결과 | 통과 |
|---|------|----------|------|
| P1 | 메인에서 AI Assistant 팝업 열기 | 팝업에서 재인증 없이 사용 가능 | [ ] |
| P2 | 새 탭에서 AIMS 직접 접속 (기기 기억 O) | PIN 입력 필요 | [ ] |
| P3 | 새 탭에서 AIMS 직접 접속 (기기 기억 X) | 소셜 로그인 필요 | [ ] |

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

## 12. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 사용자가 PIN을 잊어버림 | 소셜 로그인으로 재진입 -> PIN 재설정 | 잠김 화면에 안내 문구 |
| 서버 장애 시 PIN 검증 불가 | 로그인 자체 불가 | 서버 응답 없을 시 에러 메시지 + 재시도 안내 |
| JWT 만료(7일) + 기기 기억 | PIN 검증 성공해도 토큰 만료 | 서버에서 401 -> 소셜 로그인으로 전환 |
| 브라우저 개인정보 삭제 | localStorage 삭제됨 | 소셜 로그인으로 자연스럽게 전환 |

---

## 요약

이 설계는 프로젝트 오너의 5가지 확정 요구사항을 모두 충족합니다:

1. **로그인 페이지 필수**: 브라우저를 열면 항상 로그인(소셜 또는 PIN) 페이지가 표시됩니다
2. **클릭만으로 진입 불가**: PIN 4자리 입력이 필수이므로, 단순 클릭으로 진입할 수 없습니다
3. **보안**: 토큰이 있어도 PIN 검증 없이는 진입할 수 없습니다
4. **반복 입력 부담 경감**: 기기 기억 + PIN으로 소셜 로그인보다 훨씬 빠르게 진입합니다
5. **약간의 불편함 허용**: PIN 4자리는 2~3초면 입력 가능하며, 보안을 위한 합리적 불편입니다

---

*Dana, AIMS UX Design Advisor*
*"The best security is the one users actually use."*
