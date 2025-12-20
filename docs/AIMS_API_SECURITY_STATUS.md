# aims_api 보안 현황

> 작성일: 2025-12-20

## 아키텍처 개요

```
[사용자 브라우저]
       ↓ HTTPS (443)
[nginx - aims.giize.com]
       ↓ localhost:3010
[aims_api] ← 유일하게 외부 노출된 API
       ↓ localhost:8000/8002/8004
[rag_api, ar_api, pdf_proxy] ← 완전 내부 (외부 접근 불가)
```

## 현재 보안 상태

### 적용됨

| 보안 조치 | 상태 | 설명 |
|-----------|------|------|
| JWT 인증 | ✅ | 대부분의 엔드포인트에 `authenticateJWT` 적용 |
| CORS | ✅ | 허용된 origin만 접근 가능 (`ALLOWED_ORIGINS`) |
| 역할 기반 접근제어 | ✅ | `requireRole('admin')` 등 관리자 전용 엔드포인트 |
| 사용자 데이터 격리 | ✅ | userId 기반으로 자신의 데이터만 접근 |
| API Key 인증 | ✅ | 서버간 통신용 (n8n 웹훅) |
| HTTPS | ✅ | nginx에서 SSL/TLS 처리 |

### 미적용 (취약점)

| 보안 조치 | 상태 | 위험도 | 설명 |
|-----------|------|--------|------|
| Helmet | ❌ | 중간 | 보안 헤더 미설정 (XSS, Clickjacking 취약) |
| Rate Limiting | ❌ | 높음 | 무차별 대입 공격, DoS 취약 |
| Input Sanitization | ❌ | 높음 | NoSQL Injection 가능성 |

## 권장 조치

### 1. Helmet 추가 (보안 헤더)

```bash
npm install helmet
```

```javascript
const helmet = require('helmet');
app.use(helmet());
```

설정되는 헤더:
- `X-XSS-Protection`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security`

### 2. Rate Limiting 추가 (요청 제한)

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // IP당 최대 100 요청
  message: { success: false, message: 'Too many requests' }
});

app.use('/api/', limiter);

// 로그인은 더 엄격하게
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 15분에 5번만
});
app.use('/api/auth/login', authLimiter);
```

### 3. NoSQL Injection 방어

```bash
npm install express-mongo-sanitize
```

```javascript
const mongoSanitize = require('express-mongo-sanitize');
app.use(mongoSanitize());
```

## 외부 노출 엔드포인트 목록

### 인증 불필요 (공개)

| 엔드포인트 | 용도 |
|------------|------|
| `GET /api/health` | 헬스체크 |
| `GET /api/system/versions` | 버전 정보 (개발자 도구용) |
| `POST /api/auth/kakao/callback` | 카카오 OAuth 콜백 |

### 인증 필요 (JWT)

대부분의 엔드포인트는 `authenticateJWT` 미들웨어로 보호됨.

### 관리자 전용

| 엔드포인트 | 용도 |
|------------|------|
| `GET /api/admin/*` | 관리자 대시보드, 사용자 관리 |

## 참고

- nginx 설정: `/etc/nginx/sites-available/aims`
- JWT 미들웨어: `backend/api/aims_api/middleware/auth.js`
- CORS 설정: `backend/api/aims_api/server.js` (line 38~)
