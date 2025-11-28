# 인증 방식 비교: x-user-id vs JWT 토큰

## 문서 정보

| 항목 | 내용 |
|------|------|
| 작성일 | 2025-11-28 |
| 목적 | 두 인증 방식의 차이점과 보안성 비교 |
| 관련 문서 | [SECURITY_USER_ID_HEADER_VULNERABILITY.md](./SECURITY_USER_ID_HEADER_VULNERABILITY.md) |

---

## 1. 핵심 차이: "누가 말하느냐" vs "증명서가 있느냐"

```
┌─────────────────────────────────────────────────────────────────┐
│  x-user-id 방식 (취약)                                          │
│  ══════════════════                                             │
│                                                                 │
│  클라이언트: "나는 홍길동이야" (헤더: x-user-id: hong123)        │
│  서버: "알겠어, 홍길동 데이터 줄게"                              │
│                                                                 │
│  ⚠️ 문제: 아무나 "나는 홍길동" 이라고 말할 수 있음!              │
│                                                                 │
│  공격자: "나는 홍길동이야" (헤더: x-user-id: hong123)            │
│  서버: "알겠어, 홍길동 데이터 줄게" ← 털림!                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  JWT 토큰 방식 (안전)                                           │
│  ════════════════                                               │
│                                                                 │
│  클라이언트: "내 신분증이야" (헤더: Authorization: Bearer 토큰)  │
│  서버: 신분증 검증 → "진짜 홍길동이네, 데이터 줄게"             │
│                                                                 │
│  ✅ 해결: 위조 불가능한 신분증(토큰)이 있어야만 통과            │
│                                                                 │
│  공격자: "나는 홍길동이야" (가짜 토큰)                           │
│  서버: 신분증 검증 실패 → "403 거부!" ← 차단됨!                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 비유로 이해하기

| 상황 | x-user-id 방식 | JWT 토큰 방식 |
|------|---------------|--------------|
| **비유** | 이름표 붙이기 | 여권 제시 |
| **신원 확인** | ❌ 안 함 (말만 믿음) | ✅ 암호화 서명 검증 |
| **위조 가능** | ✅ 누구나 가능 | ❌ 비밀키 없이 불가능 |
| **은행 비유** | "나 홍길동인데 돈 줘" | "신분증 + 도장 확인 후 출금" |

### 2.1 은행 창구 비유

**x-user-id 방식 (위험한 은행)**
```
고객: "저 김철수입니다. 제 계좌에서 100만원 출금해주세요."
은행원: "네, 김철수님 100만원 여기 있습니다."  ← 신분증 확인 안 함!

사기꾼: "저 김철수입니다. 제 계좌에서 전액 출금해주세요."
은행원: "네, 김철수님 전액 여기 있습니다."  ← 털림!
```

**JWT 토큰 방식 (정상적인 은행)**
```
고객: "여기 제 신분증입니다. 100만원 출금해주세요."
은행원: (신분증 확인) "김철수님 맞으시네요. 100만원 여기 있습니다."

사기꾼: "저 김철수입니다. 전액 출금해주세요."
은행원: "신분증 보여주세요."
사기꾼: (위조 신분증 제시)
은행원: (확인) "위조 신분증입니다. 경찰 부르겠습니다."  ← 차단!
```

---

## 3. 기술적 비교

### 3.1 x-user-id 방식 (취약한 코드)

```javascript
// 프론트엔드 요청
fetch('/api/customers', {
  headers: {
    'x-user-id': '692319ceca93bbee80bd227c'  // 그냥 텍스트
  }
})

// 백엔드 처리
app.get('/api/customers', (req, res) => {
  const userId = req.headers['x-user-id'];  // 검증 없이 그대로 사용

  // 누구든 헤더만 바꾸면 다른 사람 데이터 접근 가능!
  db.collection('customers').find({ agent_id: userId });
});
```

**문제점:**
- 브라우저 DevTools에서 1초면 헤더 조작 가능
- 서버가 클라이언트를 100% 신뢰 (위험!)
- 인증과 인가(Authorization)가 완전히 분리됨

### 3.2 JWT 토큰 방식 (안전한 코드)

```javascript
// 프론트엔드 요청
fetch('/api/customers', {
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIs...'  // 암호화된 토큰
  }
})

// 백엔드 처리
app.get('/api/customers', authenticateJWT, (req, res) => {
  // authenticateJWT 미들웨어가 이미 토큰 검증 완료
  // req.user는 검증된 사용자 정보
  const userId = req.user.id;  // 위조 불가능!

  db.collection('customers').find({ agent_id: userId });
});

// authenticateJWT 미들웨어
function authenticateJWT(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    // 비밀키로 서명 검증 - 위조 불가능!
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;  // { id, name, role }
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
}
```

**장점:**
- 토큰은 서버의 비밀키로만 생성 가능
- 토큰 내용을 조작하면 서명 검증 실패
- 인증과 인가가 하나의 토큰으로 통합

---

## 4. JWT 토큰 구조

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMSIsIm5hbWUiOiLqsJzrsJzsnpAiLCJyb2xlIjoiYWdlbnQiLCJpYXQiOjE3NjQyODQxOTQsImV4cCI6MTc2NDg4ODk5NH0.pQ1XWGQbV-ZUkH0VYDKyL14r60gOAm93rCCkHppgmIE
```

위 토큰을 디코딩하면:

```
┌──────────────────────────────────────────────────────────────┐
│ Header (헤더)                                                │
│ ─────────────                                                │
│ {                                                            │
│   "alg": "HS256",    ← 서명 알고리즘                         │
│   "typ": "JWT"       ← 토큰 타입                             │
│ }                                                            │
├──────────────────────────────────────────────────────────────┤
│ Payload (내용)                                               │
│ ───────────────                                              │
│ {                                                            │
│   "id": "000000000000000000000001",  ← 사용자 ID             │
│   "name": "개발자",                   ← 사용자 이름           │
│   "role": "agent",                   ← 권한                  │
│   "iat": 1764284194,                 ← 발급 시간             │
│   "exp": 1764888994                  ← 만료 시간             │
│ }                                                            │
├──────────────────────────────────────────────────────────────┤
│ Signature (서명)                                             │
│ ──────────────                                               │
│ HMACSHA256(                                                  │
│   base64UrlEncode(header) + "." + base64UrlEncode(payload),  │
│   JWT_SECRET  ← 서버만 알고 있는 비밀키!                      │
│ )                                                            │
└──────────────────────────────────────────────────────────────┘
```

### 4.1 왜 위조가 불가능한가?

1. **Signature는 비밀키로 생성**: 서버의 `JWT_SECRET` 없이는 유효한 서명 생성 불가
2. **Payload 조작 시 서명 불일치**: ID를 바꾸면 서명도 달라져야 하는데, 비밀키 없이 새 서명 생성 불가
3. **서버 검증**: `jwt.verify()`가 서명을 검증하여 조작 여부 판별

```
공격 시도 예시:
────────────────
1. 공격자가 토큰의 Payload에서 id를 "victim_id"로 변경
2. 하지만 Signature는 원래 id로 만들어진 것
3. 서버가 jwt.verify() 실행 → Payload와 Signature 불일치!
4. 403 Forbidden 반환 → 공격 실패
```

---

## 5. 요약 비교표

| 항목 | x-user-id 헤더 | JWT 토큰 |
|------|---------------|----------|
| **보안 수준** | ❌ 없음 | ✅ 암호화 서명 |
| **신원 검증** | 클라이언트 말 그대로 신뢰 | 서버가 토큰 서명 검증 |
| **위조 가능성** | DevTools로 1초면 조작 | 비밀키 없이 불가능 |
| **비유** | 자기소개 | 공인인증서 |
| **OWASP 분류** | Broken Access Control | 표준 인증 방식 |
| **사용처** | 내부 마이크로서비스 간 통신 (제한적) | 클라이언트-서버 인증 |

---

## 6. AIMS 프로젝트 적용

### 6.1 변경 전 (취약)

```javascript
// 프론트엔드
const response = await fetch('/api/customers', {
  headers: {
    'x-user-id': localStorage.getItem('aims-current-user-id')
  }
});

// 백엔드
app.get('/api/customers', (req, res) => {
  const userId = req.headers['x-user-id'];  // 검증 없음!
  // ...
});
```

### 6.2 변경 후 (안전)

```javascript
// 프론트엔드
function getAuthHeaders() {
  const authStorage = localStorage.getItem('auth-storage');
  if (authStorage) {
    const { state } = JSON.parse(authStorage);
    if (state?.token) {
      return { 'Authorization': `Bearer ${state.token}` };
    }
  }
  return {};
}

const response = await fetch('/api/customers', {
  headers: getAuthHeaders()
});

// 백엔드
app.get('/api/customers', authenticateJWT, (req, res) => {
  const userId = req.user.id;  // JWT에서 추출, 검증 완료!
  // ...
});
```

### 6.3 검증 결과

| 테스트 | 설명 | 결과 |
|--------|------|------|
| 토큰 없음 | 헤더 없이 요청 | 401 - "No token provided" |
| 잘못된 토큰 | 위조/만료 토큰 | 403 - "Invalid or expired token" |
| x-user-id 조작 | 유효한 토큰 + 다른 ID 헤더 | 헤더 무시, 토큰 소유자 데이터만 반환 |
| 정상 요청 | 유효한 토큰 | 토큰 소유자의 데이터 반환 |

---

## 7. 결론

> **x-user-id는 "나 OOO야"라고 말만 하는 것,**
> **JWT는 위조 불가능한 증명서를 제시하는 것.**

JWT 토큰 방식은:
- 서버의 비밀키로 서명되어 **위조 불가능**
- 토큰 내에 사용자 정보가 포함되어 **추가 DB 조회 불필요**
- 만료 시간이 있어 **탈취되어도 피해 제한**
- 업계 표준으로 **검증된 보안 방식**

---

## 9. Q&A: 토큰은 어디서 어떻게 발행하는가?

### 9.1 토큰 발행 흐름

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        JWT 토큰 발행 흐름                                │
│                                                                         │
│  [1] 사용자                    [2] 카카오                                │
│      │                             │                                    │
│      │  "카카오 로그인" 클릭        │                                    │
│      ├────────────────────────────►│                                    │
│      │                             │                                    │
│      │  ID/PW 입력 → 인증 성공     │                                    │
│      │◄────────────────────────────┤                                    │
│      │  (카카오 사용자 정보 전달)   │                                    │
│      │                             │                                    │
│  [3] AIMS 백엔드                                                        │
│      │                                                                  │
│      │  카카오에서 받은 사용자 정보로                                    │
│      │  JWT 토큰 생성 (비밀키로 서명)                                    │
│      │                                                                  │
│      ▼                                                                  │
│  [4] 프론트엔드                                                         │
│      │                                                                  │
│      │  토큰을 localStorage에 저장                                      │
│      │  이후 모든 API 요청에 토큰 첨부                                   │
│      │                                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 AIMS 백엔드의 토큰 생성 코드

```javascript
// backend/api/aims_api/routes/auth.js

const jwt = require('jsonwebtoken');

// JWT 토큰 생성 함수
function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,           // 사용자 MongoDB ID
      name: user.name,        // 사용자 이름
      role: user.role         // 권한 (agent, admin 등)
    },
    process.env.JWT_SECRET,   // ⭐ 비밀키 (서버만 알고 있음)
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }  // 만료 기간
  );
}

// 카카오 로그인 콜백
router.get('/kakao/callback',
  passport.authenticate('kakao', { session: false }),
  (req, res) => {
    // ⭐ AIMS 백엔드가 토큰 생성!
    const token = generateToken(req.user);

    // 프론트엔드로 토큰 전달
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }
);
```

### 9.3 프론트엔드의 토큰 저장

```typescript
// 프론트엔드에서 토큰 저장 (authStore)
const authStorage = {
  state: {
    token: "eyJhbGciOiJIUzI1NiIs...",  // JWT 토큰
    user: { id: "...", name: "홍길동" }
  }
};
localStorage.setItem('auth-storage', JSON.stringify(authStorage));
```

---

## 10. Q&A: 카카오 vs AIMS의 역할

### 10.1 핵심 구분

| 역할 | 카카오 | AIMS |
|------|--------|------|
| **하는 일** | 신원 확인 (ID/PW 검증) | 토큰 발급 (비밀키로 서명) |
| **비유** | 주민센터 (신분 확인) | 회사 (사원증 발급) |
| **결과물** | "이 사람 홍길동 맞아요" | "홍길동용 AIMS 토큰" |

### 10.2 비유: 회사 입사 과정

```
┌─────────────────────────────────────────────────────────────────┐
│  주민센터 (카카오)                                               │
│  ══════════════                                                 │
│  "신분증 확인해볼게요..."                                        │
│  "네, 홍길동 씨 맞습니다. 여기 확인서요."                         │
│                                                                 │
│  → 카카오는 "이 사람이 누구인지" 확인만 해줌                      │
│  → 카카오 토큰은 AIMS에서 사용 불가 (다른 회사 사원증과 같음)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  회사 인사팀 (AIMS 백엔드)                                       │
│  ════════════════════                                           │
│  "주민센터에서 확인됐네요."                                       │
│  "우리 회사 사원증 발급해드릴게요."                               │
│                                                                 │
│  → AIMS가 자체 토큰(사원증) 발급                                 │
│  → 이 토큰으로만 AIMS 서비스 이용 가능                           │
└─────────────────────────────────────────────────────────────────┘
```

### 10.3 왜 AIMS가 별도 토큰을 발급하는가?

1. **권한 관리**: AIMS 내부 권한(agent, admin 등)을 토큰에 포함
2. **독립성**: 카카오 서비스 장애 시에도 기존 토큰으로 서비스 가능
3. **보안**: AIMS 비밀키로 서명하여 위조 방지
4. **커스터마이징**: 필요한 정보만 토큰에 포함

---

## 11. Q&A: JWT_SECRET 보관 위치

### 11.1 위치

```bash
# tars 서버의 환경변수 파일
tars:~/aims/backend/api/aims_api/.env
```

### 11.2 파일 내용

```bash
# JWT 인증 설정
JWT_SECRET=09d0ec3fa027dba25479492f323417f39e13b00437628b82aa12f2e593791c71e88a75097f8ca6bf32ae1cd64ce1020779b2cf6458aa34f013af9c6869e742b4
JWT_EXPIRES_IN=7d
```

### 11.3 보안 조치

| 조치 | 설명 |
|------|------|
| **서버 전용** | .env 파일은 tars 서버에만 존재 |
| **Git 제외** | .gitignore에 포함되어 저장소에 업로드 안 됨 |
| **브라우저 접근 불가** | 프론트엔드에서 절대 접근할 수 없음 |
| **환경변수로 로드** | process.env.JWT_SECRET으로만 접근 |

### 11.4 비밀키가 중요한 이유

```
비밀키를 알면:
├─ 유효한 토큰 생성 가능 → 누구든 원하는 사용자로 위장 가능
├─ 모든 사용자 데이터 접근 가능
└─ 시스템 전체 보안 붕괴

따라서:
├─ 절대 공개 저장소에 업로드 금지
├─ 정기적으로 키 교체 권장
└─ 접근 권한 최소화
```

---

## 12. Q&A: 암호화 vs 서명의 차이

### 12.1 핵심 차이

| 구분 | 암호화 (Encryption) | 서명 (Signature) |
|------|---------------------|------------------|
| **목적** | 내용을 숨김 | 위조를 방지 |
| **내용 공개** | ❌ 읽을 수 없음 | ✅ 누구나 읽을 수 있음 |
| **검증** | 복호화 키 필요 | 공개키 또는 비밀키로 검증 |

### 12.2 JWT는 서명 방식

```
JWT 토큰 = Header + Payload + Signature

Header와 Payload는 Base64 인코딩 (암호화 아님!)
└─ 누구나 디코딩해서 내용을 볼 수 있음
└─ https://jwt.io 에서 토큰 붙여넣으면 내용 바로 보임

Signature는 비밀키로 생성
└─ 내용을 조작하면 서명이 맞지 않음
└─ 서버가 검증 시 위조 즉시 발각
```

### 12.3 왜 암호화하지 않는가?

```
서명 방식의 장점:
├─ 빠름: 암호화/복호화 비용 없음
├─ 효율적: 서버가 토큰 내용을 바로 읽을 수 있음
└─ 충분함: 민감 정보(비밀번호 등)는 토큰에 안 넣으면 됨

JWT에 넣는 정보:
├─ 사용자 ID ← 공개되어도 괜찮음
├─ 이름 ← 공개되어도 괜찮음
├─ 권한(role) ← 공개되어도 괜찮음
└─ 비밀번호 ← ❌ 절대 넣지 않음!
```

### 12.4 비유: 계약서

```
┌─────────────────────────────────────────────────────────────────┐
│  계약서 (JWT 토큰)                                               │
│  ════════════════                                               │
│                                                                 │
│  계약 내용:                                                      │
│  - 이름: 홍길동                                                  │
│  - 권한: agent                                                  │
│  - 발급일: 2025-01-28                                           │
│                                                                 │
│  ⬆️ 내용은 누구나 읽을 수 있음                                    │
│                                                                 │
│  ─────────────────────────────────────────                      │
│  [AIMS 직인] pQ1XWGQbV-ZUkH0VYDKy...                            │
│                                                                 │
│  ⬆️ 하지만 직인은 AIMS만 찍을 수 있음                             │
│  ⬆️ 내용을 바꾸면 직인이 맞지 않아서 위조 발각                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 13. 최종 요약

> **"카카오에 ID/PW로 인증을 받은 뒤, 통과하면 AIMS에서 사용자 정보를 비밀키로 서명한 토큰을 받는 방식"**

### 13.1 한 줄 요약

```
카카오 = 신분 확인 ("이 사람 맞아요")
AIMS = 토큰 발급 ("우리 서비스용 증명서 줄게요")
토큰 = 서명된 사용자 정보 (내용은 공개, 위조는 불가능)
```

### 13.2 전체 흐름 (최종)

```
[사용자]
    │
    │ (1) 카카오 로그인 클릭
    ▼
[카카오]
    │
    │ (2) ID/PW 확인 → "홍길동 맞음"
    ▼
[AIMS 백엔드]
    │
    │ (3) 홍길동 정보로 JWT 토큰 생성
    │     - 비밀키(JWT_SECRET)로 서명
    │     - 토큰 내용: { id, name, role, exp }
    ▼
[프론트엔드]
    │
    │ (4) 토큰을 localStorage에 저장
    │
    │ (5) 이후 모든 API 요청에 토큰 첨부
    │     Authorization: Bearer eyJhbGci...
    ▼
[AIMS 백엔드]
    │
    │ (6) 토큰 서명 검증 → 유효하면 요청 처리
    │     - 서명 불일치 시 403 거부
    │     - 만료된 토큰 시 401 거부
    ▼
[응답]
```

### 13.3 기억해야 할 핵심

| 항목 | 내용 |
|------|------|
| **토큰 발급자** | AIMS 백엔드 (카카오 아님!) |
| **비밀키 위치** | tars 서버의 .env 파일 |
| **토큰 저장** | 브라우저 localStorage |
| **토큰 전송** | Authorization: Bearer {토큰} |
| **보안 방식** | 서명 (암호화 아님) |
| **위조 가능성** | 비밀키 없이 불가능 |

---

## 14. 참고 자료

- [JWT.io - JSON Web Tokens](https://jwt.io/)
- [OWASP - Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- [RFC 7519 - JSON Web Token](https://datatracker.ietf.org/doc/html/rfc7519)
- [Auth0 - JWT Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)
