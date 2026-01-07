# AIMS Frontend (aims-uix3) 보안 취약점 분석 보고서

**분석 일자**: 2026-01-07
**분석 대상**: `frontend/aims-uix3/` (567개 TypeScript/JavaScript 파일)
**분석 도구**: 정적 코드 분석

---

## 개요

aims-uix3 프론트엔드 코드베이스에 대한 종합적인 보안 취약점 분석을 수행했습니다. OWASP Top 10 및 프론트엔드 보안 모범 사례를 기준으로 검토하였습니다.

---

## 취약점 요약

| 심각도 | 개수 | 즉시 조치 필요 |
|--------|------|---------------|
| 🔴 HIGH | 4건 | ✅ |
| 🟠 MEDIUM | 6건 | ⚠️ |
| 🟡 LOW | 3건 | - |

---

## 🔴 HIGH - 즉시 조치 필요

### 1. JWT 토큰 localStorage 저장

**파일**: `src/shared/stores/authStore.ts:68-75`

```typescript
persist(
  (set) => { ... },
  {
    name: 'auth-storage-v2', // localStorage에 토큰 저장
    partialize: (state) => ({
      token: state.token, // ⚠️ JWT 토큰
    }),
  }
)
```

**위험성**:
- XSS 공격 시 `localStorage.getItem('auth-storage-v2')`로 토큰 탈취 가능
- 브라우저 개발자 도구에서 직접 확인 가능
- 탭/브라우저 종료 후에도 토큰 유지

**권장 조치**:
1. HttpOnly 쿠키 사용 (JavaScript 접근 불가)
2. 또는 sessionStorage 사용 (탭 닫힘 시 삭제)
3. Access Token (단기) + Refresh Token (HttpOnly) 분리

---

### 2. 토큰 URL 쿼리 파라미터 노출

**파일**:
- `src/services/inquiryService.ts:131, 183`
- `src/shared/lib/sseWorkerClient.ts:268`

```typescript
// inquiryService.ts
return `${baseUrl}?token=${encodeURIComponent(token)}`;

// sseWorkerClient.ts
url.searchParams.set('token', encodeURIComponent(token))
```

**위험성**:
- 브라우저 히스토리에 토큰 저장
- 서버 액세스 로그에 토큰 노출
- 프록시/CDN 로그에 기록
- Referrer 헤더로 외부 유출 가능

**권장 조치**:
```typescript
// ✅ Authorization 헤더 사용
fetch(baseUrl, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
})
```

---

### 3. x-user-id 클라이언트 조작 가능

**파일**: `src/shared/lib/api.ts:81`

```typescript
const currentUserId = localStorage.getItem('aims-current-user-id')
if (currentUserId) {
  headers['x-user-id'] = currentUserId // ⚠️ 클라이언트에서 수정 가능
}
```

**위험성**:
- 개발자 도구에서 `localStorage.setItem('aims-current-user-id', 'other-user-id')` 실행
- 다른 사용자의 데이터에 접근 가능 (권한 상승)

**권장 조치**:
1. 백엔드에서 JWT 토큰의 userId와 x-user-id 헤더 일치 검증
2. 또는 x-user-id 헤더 제거, JWT에서만 userId 추출

---

### 4. innerHTML XSS 취약점

**파일**: `src/utils/appleConfirm.ts:83-100, 276-290`

```typescript
modal.innerHTML = `
  ${title ? `
    <div style="padding: 18px 20px 10px 20px; text-align: center;">
      <h2 ...>${title}</h2>  // ⚠️ title 직접 삽입
    </div>
  ` : ''}
  ...
`;
```

**위험성**:
- `title` 파라미터에 `<script>` 태그 삽입 시 XSS 공격 가능
- `<img src=x onerror="alert(1)">` 같은 이벤트 핸들러 공격

**권장 조치**:
```typescript
// ✅ textContent 사용
const h2 = document.createElement('h2');
h2.textContent = title;

// 또는 DOMPurify 라이브러리 사용
import DOMPurify from 'dompurify';
modal.innerHTML = DOMPurify.sanitize(htmlContent);
```

---

## 🟠 MEDIUM - 조치 권장

### 5. postMessage 출처 검증 부재

**파일**:
- `src/pages/AIAssistantPage.tsx:51-73`
- `src/components/ChatPanel/ChatPanel.tsx:453-459`

```typescript
// 송신 - 모든 출처 허용
window.opener.postMessage({ type: 'AIMS_POPUP_READY' }, '*');

// 수신 - 출처 검증 없음
const handleMessage = (event: MessageEvent) => {
  if (event.data?.type === 'AIMS_AUTH_SYNC') {
    localStorage.setItem('auth-storage-v2', ...);
    // ❌ event.origin 검증 없음
  }
};
```

**위험성**:
- 악의적 웹사이트에서 메시지 탈취/주입 가능
- 토큰 탈취 또는 가짜 토큰 주입

**권장 조치**:
```typescript
// 송신
window.opener.postMessage(data, window.location.origin);

// 수신
if (event.origin !== window.location.origin) return;
```

---

### 6. CSRF 토큰 부재

**파일**: `src/shared/lib/api.ts` (전체)

**설명**: POST/PUT/DELETE 요청에 CSRF 토큰이 없음

**권장 조치**:
1. 백엔드에서 `SameSite=Strict` 쿠키 설정
2. CSRF 토큰 헤더 추가:
```typescript
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
headers['X-CSRF-Token'] = csrfToken;
```

---

### 7. 개발 모드 프로덕션 노출

**파일**: `src/pages/LoginPage.tsx:24-34, 120-180`

```typescript
// Ctrl+Alt+Shift+D로 개발자 모드 활성화
if (e.ctrlKey && e.altKey && e.shiftKey && e.key === 'D') {
  toggleDevMode();
}

// 개발 로그인 엔드포인트
const response = await fetch(`${API_BASE_URL}/api/dev/ensure-user`, ...);
```

**위험성**:
- 프로덕션에서 개발 모드 활성화 가능
- 인증 우회 가능성

**권장 조치**:
```typescript
if (import.meta.env.PROD) {
  return; // 프로덕션에서 비활성화
}
```

---

### 8. 입력 검증 부재

**파일**:
- `src/stores/user.ts:36-41`
- `src/pages/LoginPage.tsx:40-42`

```typescript
// MongoDB ObjectId 형식 검증 없음
const storedId = localStorage.getItem('aims-current-user-id');
return storedId || '';

// JWT 형식 검증 없음
const token = searchParams.get('token');
setToken(token);
```

**권장 조치**:
```typescript
// ObjectId 검증
const isValidObjectId = (id: string) => /^[a-f\d]{24}$/i.test(id);

// JWT 형식 검증
const isValidJWT = (token: string) =>
  token.length < 2000 && /^[A-Za-z0-9\-_\.]+$/.test(token);
```

---

### 9. 에러 리포팅 민감 정보 마스킹 불완전

**파일**: `src/shared/lib/errorReporter.ts:337-354`

```typescript
const SENSITIVE_KEYS = ['password', 'token', 'secret', ...];
// ❌ 'user_token', 'auth_code' 같은 변형 놓칠 수 있음
```

**권장 조치**:
- 화이트리스트 기반 접근 (전송할 필드만 명시)
- 정규식 기반 마스킹 강화

---

### 10. window.open 보안 설정 부재

**파일**: `src/components/ChatPanel/ChatPanel.tsx:442`

```typescript
const popup = window.open(
  '/ai-assistant',
  'AIMS_AI_Assistant',
  // ❌ noopener, noreferrer 없음
);
```

**권장 조치**:
```typescript
window.open('/ai-assistant', 'popup', 'noopener,noreferrer');
```

---

## 🟡 LOW - 개선 권장

### 11. 환경 변수 검증 부재

**파일**: `src/shared/lib/api.ts:97-103`

```typescript
BASE_URL: import.meta.env['VITE_API_BASE_URL'] || '',
// ❌ 빈 문자열 허용
```

**권장 조치**:
```typescript
if (!import.meta.env['VITE_API_BASE_URL']) {
  throw new Error('VITE_API_BASE_URL is required');
}
```

---

### 12. 로그에 토큰 부분 노출

**파일**: `src/shared/lib/waitForDocumentProcessing.ts:45`

```typescript
console.log('[waitForDocumentProcessing] SSE 연결 시작:', {
  url: url.replace(/token=[^&]+/, 'token=***') // 부분 마스킹
});
```

**권장 조치**:
- 프로덕션에서 민감 정보 로깅 완전 제거
- 개발 환경에서만 상세 로깅

---

### 13. HTTP 보안 헤더 부재 (nginx)

**파일**: `nginx-aims.conf`

**권장 조치**:
```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
```

---

## 조치 우선순위

### 1순위 (즉시)
- [ ] JWT 저장 방식 변경 (localStorage → HttpOnly 쿠키)
- [ ] 토큰 URL 노출 제거 (쿼리 파라미터 → Authorization 헤더)
- [ ] x-user-id 백엔드 검증 강화
- [ ] innerHTML XSS 수정

### 2순위 (1주 내)
- [ ] postMessage 출처 검증 추가
- [ ] CSRF 토큰 구현
- [ ] 개발 모드 프로덕션 비활성화
- [ ] 입력 검증 추가

### 3순위 (2주 내)
- [ ] 보안 헤더 nginx 설정
- [ ] 에러 리포팅 마스킹 강화
- [ ] window.open 보안 설정
- [ ] 의존성 보안 업데이트 (`npm audit fix`)

---

## 참고 자료

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
