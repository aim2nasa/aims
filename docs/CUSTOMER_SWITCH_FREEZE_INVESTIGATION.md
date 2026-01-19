# 고객 전환 시 UI 프리징 문제 조사 및 해결

## 증상

"최근 검색 고객" 목록에서 고객을 빠르게 연속 클릭하면 UI가 멈추는 현상 발생.
- 2~3번째 클릭에서 로딩 스피너가 무한히 돌며 응답 없음
- 개발 서버(`localhost:5177`)에서만 발생
- 프로덕션(`https://aims.giize.com`)에서는 정상 작동

---

## 근본 원인: HTTP/1.1 연결 제한 (6 concurrent connections per domain)

### 브라우저의 HTTP/1.1 제한

브라우저는 **동일 도메인에 대해 HTTP/1.1 연결을 최대 6개로 제한**합니다.

```
┌─────────────────────────────────────────────────────────────┐
│  Browser Connection Pool (HTTP/1.1)                         │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐           │
│  │ C1  │ │ C2  │ │ C3  │ │ C4  │ │ C5  │ │ C6  │  ← 최대 6개│
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘           │
│                                                             │
│  7번째 요청부터는 앞의 요청이 완료될 때까지 대기 (BLOCKED)   │
└─────────────────────────────────────────────────────────────┘
```

### 고객 전환 시 발생하는 요청들

고객 상세 페이지를 열면 다음 API들이 동시에 호출됩니다:

| 순서 | API | 용도 |
|------|-----|------|
| 1 | `GET /api/customers/:id` | 고객 기본 정보 |
| 2 | `GET /api/customers/:id/relationships` | 관계 정보 |
| 3 | `GET /api/customers/:id/files` | 문서 목록 |
| 4 | `GET /api/customers/:id/contracts` | 계약 목록 |
| 5 | `GET /api/customers/:id/notes` | 메모 |
| 6+ | 기타 | 추가 데이터 |

### 문제 시나리오

```
시간 →
────────────────────────────────────────────────────────────────────

[고객 A 클릭]
  → 요청 1-6 발송 (연결 풀 꽉 참)

[고객 B 클릭] (A 응답 오기 전)
  → 요청 7-12 발송 시도
  → BUT: 연결 풀이 꽉 찼으므로 대기 (BLOCKED!)
  → AbortController.abort() 호출해도 TCP 연결은 응답 올 때까지 점유

[고객 C 클릭] (B도 아직 시작 못함)
  → 요청 13-18 발송 시도
  → 여전히 대기...
  → UI 프리징!
```

### AbortController가 연결을 즉시 해제하지 못하는 이유

```javascript
// AbortController.abort()를 호출해도...
controller.abort();

// 브라우저는 서버 응답이 올 때까지 TCP 연결을 유지합니다.
// "요청 취소"는 JavaScript 레벨에서만 일어나고,
// 네트워크 레벨의 TCP 연결은 서버 응답/타임아웃까지 점유됨.
```

---

## 왜 프로덕션에서는 문제가 없었나?

### HTTP/2의 멀티플렉싱

프로덕션 nginx 설정:
```nginx
listen 443 ssl http2;  # ← HTTP/2 활성화
```

HTTP/2는 **단일 TCP 연결에서 무제한 요청을 동시 처리** (멀티플렉싱):

```
┌─────────────────────────────────────────────────────────────┐
│  HTTP/2 Single Connection (Multiplexed)                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Stream 1: GET /customers/A                         │   │
│  │  Stream 2: GET /customers/A/relationships           │   │
│  │  Stream 3: GET /customers/B                         │   │
│  │  Stream 4: GET /customers/B/relationships           │   │
│  │  Stream 5: GET /customers/C                         │   │
│  │  ...무제한...                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  모든 요청이 하나의 연결에서 병렬 처리 - 대기 없음!          │
└─────────────────────────────────────────────────────────────┘
```

### 개발 vs 프로덕션 환경 비교

| 환경 | 프로토콜 | 연결 제한 | 결과 |
|------|----------|----------|------|
| 개발 (Vite proxy) | HTTP/1.1 | 6개 | 프리징 발생 |
| 프로덕션 (nginx) | HTTP/2 | 무제한 | 정상 작동 |

---

## 해결책: 개발 환경에 HTTP/2 활성화

### 1. @vitejs/plugin-basic-ssl 설치

```bash
npm install @vitejs/plugin-basic-ssl --save-dev
```

### 2. vite.config.ts 수정

```typescript
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    basicSsl(),  // HTTPS + HTTP/2 활성화
  ],
  // ...
})
```

### 3. 백엔드 OAuth 리다이렉트 허용 (auth.js)

HTTPS localhost를 OAuth 콜백 허용 목록에 추가:

```javascript
const ALLOWED_REDIRECT_ORIGINS = [
  'https://aims.giize.com',
  // HTTP 개발 서버
  'http://localhost:5177',
  // HTTPS 개발 서버 (HTTP/2 지원)
  'https://localhost:5177',  // ← 추가
  // ...
];
```

### 4. 결과

```
개발 서버: https://localhost:5177
           ↓
         HTTP/2 (멀티플렉싱)
           ↓
         연결 제한 없음
           ↓
         프리징 해결!
```

---

## 시도했으나 효과 없었던 방법들

| 시도 | 결과 | 이유 |
|------|------|------|
| 50ms 딜레이 | 실패 | TCP 연결 점유는 시간과 무관 |
| 150ms 딜레이 | 실패 | 동일 |
| 300ms 딜레이 | 실패 | 동일 |
| 500ms 딜레이 | 실패 | 서버 응답이 오래 걸리면 여전히 블록 |
| AbortController만 사용 | 부분적 | JS 취소는 되지만 TCP 연결은 유지 |

**결론**: 딜레이는 근본 해결책이 아님. HTTP/2가 유일한 해결책.

---

## 수정된 파일

| 파일 | 변경 내용 |
|------|-----------|
| `frontend/aims-uix3/vite.config.ts` | basicSsl() 플러그인 추가 |
| `backend/api/aims_api/routes/auth.js` | HTTPS localhost 리다이렉트 허용 |
| `frontend/aims-uix3/src/features/customer/views/CustomerFullDetailView/CustomerFullDetailView.tsx` | 임시 딜레이 코드 제거 |
| `frontend/aims-uix3/src/hooks/useRightPaneContent.ts` | 디버그 로그 정리 |

---

## 교훈

1. **개발/프로덕션 환경 일치의 중요성**: 프로토콜(HTTP/1.1 vs HTTP/2)까지 동일해야 같은 동작 보장
2. **브라우저 연결 제한 인식**: HTTP/1.1의 6개 연결 제한은 실제로 문제가 됨
3. **AbortController의 한계**: JavaScript 레벨 취소이지 네트워크 레벨 취소가 아님
4. **근본 원인 해결**: 딜레이 같은 워크어라운드보다 HTTP/2로 근본 해결

---

## 참고 자료

- [HTTP/2 Multiplexing](https://web.dev/performance-http2/)
- [Browser Connection Limits](https://docs.pushtechnology.com/cloud/latest/manual/html/designguide/solution/support/connection_limitations.html)
- [@vitejs/plugin-basic-ssl](https://github.com/nicholaslee119/vite-plugin-basic-ssl)
