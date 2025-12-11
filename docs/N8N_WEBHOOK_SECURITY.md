# n8n Webhook 보안 취약점 분석 및 대응 방안

> 작성일: 2025.12.11
> 최종 수정: 2025.12.11
> 상태: **✅ 적용 완료**

## 1. 현재 상황

### 1.1 노출된 Webhook 엔드포인트

| 용도 | URL | 인증 |
|------|-----|------|
| 스마트 검색 | `https://n8nd.giize.com/webhook/smartsearch` | ❌ 없음 |
| 문서 업로드 | `https://n8nd.giize.com/webhook/docprep-main` | ❌ 없음 |

### 1.2 현재 인프라 구성

```
[외부]
브라우저 (aims.giize.com)
    ↓ HTTPS
nginx (n8nd.giize.com:443)
    ↓ proxy_pass
n8n (localhost:5678)
```

**현재 nginx 설정** (`/etc/nginx/sites-enabled/n8n`):
```nginx
server {
    listen 443 ssl;
    server_name n8nd.giize.com;

    ssl_certificate /etc/letsencrypt/live/n8nd.giize.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8nd.giize.com/privkey.pem;

    location / {
        client_max_body_size 50M;
        proxy_pass http://localhost:5678;
        # ... 기타 설정
    }
}
```

⚠️ **문제점**: nginx가 외부 요청을 그대로 n8n으로 전달 → 누구나 접근 가능

### 1.3 호출 위치

```
frontend/aims-uix3/src/App.tsx:388
frontend/aims-uix3/src/services/searchService.ts:16
frontend/aims-uix3/src/features/batch-upload/api/batchUploadApi.ts:13
frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/services/userContextService.ts:167
```

## 2. 보안 위험

### 2.1 공격 시나리오

| 공격 유형 | 설명 | 위험도 |
|----------|------|--------|
| **DoS/DDoS** | 대량 요청으로 서버 과부하 | 🔴 높음 |
| **악성 데이터 주입** | 잘못된 데이터로 워크플로우/DB 오염 | 🔴 높음 |
| **리소스 남용** | AI 검색, OCR 처리 등 고비용 작업 무단 사용 | 🟠 중간 |
| **URL 무차별 탐색** | 다른 webhook 경로 발견 가능 | 🟠 중간 |
| **데이터 유출** | 검색 결과를 통한 정보 노출 | 🟠 중간 |

### 2.2 검증 테스트

```bash
# 인증 없이 직접 호출 가능 확인
curl -X POST "https://n8nd.giize.com/webhook/smartsearch" \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}'

# 결과: [] (응답 반환됨 - 인증 없이 접근 가능)
```

## 3. 권장 해결책

### 3.1 방안 비교

| 방안 | 보안 수준 | 구현 난이도 | 권장 |
|------|----------|------------|------|
| **내부망 제한 + aims_api 프록시** | 🟢 높음 | 낮음 | ⭐⭐ **최우선** |
| aims_api 프록시만 | 🟢 높음 | 중간 | ⭐ 2순위 |
| n8n Header Auth | 🟡 중간 | 낮음 | 프론트엔드 노출 문제 |
| nginx rate limiting | 🟡 중간 | 낮음 | 보조 수단 |

### 3.2 ⭐ 최우선 권장안: 내부망 제한 + aims_api 프록시

**핵심 아이디어**: tars 서버 내부에서만 n8n 접근 가능하게 제한

이 방식이 **가장 간단하면서 효과적**인 이유:
1. nginx 설정 한 줄로 외부 접근 완전 차단
2. aims_api가 이미 JWT 인증을 처리하고 있음
3. n8n 워크플로우 수정 불필요
4. 프론트엔드에 API 키 노출 없음

#### 아키텍처 변경

```
[현재]
브라우저 → https://n8nd.giize.com/webhook/* (외부 노출)

[변경 후]
브라우저 → aims_api (JWT 인증) → n8n (localhost만 바인딩)
```

#### 구현 단계

**1단계: aims_api에 프록시 엔드포인트 추가**

```javascript
// backend/api/aims_api/server.js

// 스마트 검색 프록시
app.post('/api/search/smart', authenticateJWT, async (req, res) => {
  try {
    const response = await fetch('http://localhost:5678/webhook/smartsearch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...req.body,
        userId: req.user.userId  // 인증된 사용자 정보 주입
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Search service unavailable' });
  }
});

// 문서 업로드 프록시
app.post('/api/documents/upload-webhook', authenticateJWT, async (req, res) => {
  try {
    const response = await fetch('http://localhost:5678/webhook/docprep-main', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...req.body,
        userId: req.user.userId
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Upload service unavailable' });
  }
});
```

**2단계: 프론트엔드 URL 변경**

```typescript
// 변경 전
const SMARTSEARCH_API_URL = 'https://n8nd.giize.com/webhook/smartsearch';

// 변경 후
const SMARTSEARCH_API_URL = '/api/search/smart';
```

**3단계: n8n을 localhost만 바인딩**

```bash
# docker-compose.yml 또는 n8n 설정
N8N_HOST=127.0.0.1
```

**4단계: nginx에서 n8nd.giize.com 외부 접근 차단**

```nginx
# /etc/nginx/sites-available/n8n
server {
    listen 443 ssl;
    server_name n8nd.giize.com;

    # 외부 접근 차단 (내부망만 허용)
    allow 127.0.0.1;
    allow 10.0.0.0/8;
    deny all;

    location / {
        proxy_pass http://localhost:5678;
    }
}
```

### 3.3 대안: n8n Header Auth 활성화

n8n 워크플로우 내에서 Header 검증:

```javascript
// n8n Webhook 노드 설정
// Authentication: Header Auth
// Header Name: X-API-Key
// Header Value: [비밀키]
```

프론트엔드에서 헤더 추가:

```typescript
fetch(url, {
  headers: {
    'X-API-Key': process.env.VITE_N8N_API_KEY
  }
});
```

⚠️ **주의**: 프론트엔드에 API 키를 넣으면 브라우저 개발자 도구로 노출됨

### 3.4 보조 수단: Rate Limiting

```nginx
# nginx rate limiting
limit_req_zone $binary_remote_addr zone=n8n:10m rate=10r/s;

server {
    location /webhook/ {
        limit_req zone=n8n burst=20 nodelay;
        proxy_pass http://localhost:5678;
    }
}
```

## 4. 구현 우선순위

### 4.1 최우선 권장안 (내부망 제한 + aims_api 프록시)

| 순서 | 작업 | 예상 시간 | 비고 |
|------|------|----------|------|
| 1 | nginx webhook 경로 외부 차단 | 10분 | 즉시 효과 |
| 2 | aims_api 프록시 엔드포인트 추가 | 1-2시간 | 백엔드 |
| 3 | 프론트엔드 URL 변경 | 30분 | 프론트엔드 |
| 4 | 테스트 및 검증 | 30분 | |

**총 예상 시간: 2-3시간**

### 4.2 즉시 적용 가능한 nginx 설정

```nginx
# /etc/nginx/sites-enabled/n8n
server {
    listen 443 ssl;
    server_name n8nd.giize.com;

    # ... SSL 설정 ...

    # webhook 경로는 로컬에서만 접근 허용
    location /webhook/ {
        allow 127.0.0.1;
        deny all;

        proxy_pass http://localhost:5678;
        # ... 기타 프록시 설정 ...
    }

    # n8n 에디터 UI는 기존대로 (필요시 IP 제한 추가)
    location / {
        proxy_pass http://localhost:5678;
        # ... 기타 설정 ...
    }
}
```

```bash
# 적용
sudo nginx -t && sudo systemctl reload nginx
```

## 5. 관련 문서

- [N8N_API_KEY_IMPLEMENTATION.md](./N8N_API_KEY_IMPLEMENTATION.md)
- [SECURITY_ROADMAP.md](./SECURITY_ROADMAP.md)
- [SECURITY_FIX_LOG.md](./SECURITY_FIX_LOG.md)

## 6. 결론

현재 n8n webhook이 인증 없이 외부에 노출되어 있어 심각한 보안 취약점이 존재합니다.

### 권장 조치 (우선순위)

1. **즉시**: nginx에서 `/webhook/` 경로 외부 접근 차단
2. **단기**: aims_api에 프록시 엔드포인트 추가
3. **단기**: 프론트엔드 URL을 aims_api 경유로 변경

**핵심**: tars 내부에서만 n8n webhook 접근 가능하게 제한하는 것이 가장 간단하면서 효과적입니다.

---

## 7. ✅ 적용 완료 (2025.12.11)

### 7.1 적용된 보안 체계 (3중 방어)

```
┌─────────────────────────────────────────────────────────────┐
│                     외부 접근 시도                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [공격자] → n8nd.giize.com/webhook/* → ❌ 403 Forbidden     │
│            (nginx 차단)                                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     정상 사용 경로                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [브라우저] → aims_api (/api/n8n/*) → n8n (localhost:5678)  │
│              │                                              │
│              └─ ✅ JWT 인증 필수 (authenticateJWT)          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     내부 서비스 경로                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [aims_rag_api] → localhost:5678/webhook/* → n8n           │
│                   (tars 서버 내부, --network=host)          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 적용된 조치

| 레이어 | 조치 | 파일 |
|--------|------|------|
| **nginx** | `/webhook/` 경로 `allow 127.0.0.1; deny all;` | `/etc/nginx/sites-enabled/n8n` |
| **aims_api** | `/api/n8n/*` 프록시 + `authenticateJWT` | `backend/api/aims_api/server.js:6693-6755` |
| **프론트엔드** | aims_api 프록시 URL 사용 | `frontend/aims-uix3/src/services/searchService.ts` |
| **aims_rag_api** | `localhost:5678` 내부 URL | `backend/api/aims_rag_api/rag_search.py:57` |

### 7.3 aims_api 프록시 구현

```javascript
// backend/api/aims_api/server.js
const N8N_INTERNAL_URL = 'http://localhost:5678';

// 스마트 검색 프록시 (JWT 인증 필수)
app.post('/api/n8n/smartsearch', authenticateJWT, async (req, res) => {
  const response = await axios.post(
    `${N8N_INTERNAL_URL}/webhook/smartsearch`,
    { ...req.body, userId: req.user.userId }
  );
  res.json(response.data);
});

// 문서 업로드 프록시 (JWT 인증 필수)
app.post('/api/n8n/docprep', authenticateJWT, async (req, res) => {
  const response = await axios.post(
    `${N8N_INTERNAL_URL}/webhook/docprep-main`,
    { ...req.body, userId: req.user.userId }
  );
  res.json(response.data);
});
```

### 7.4 프론트엔드 URL 변경

```typescript
// frontend/aims-uix3/src/services/searchService.ts
const SMARTSEARCH_API_URL = `${API_CONFIG.BASE_URL}/api/n8n/smartsearch`

// frontend/aims-uix3/src/features/batch-upload/api/batchUploadApi.ts
const UPLOAD_ENDPOINT = `${API_CONFIG.BASE_URL}/api/n8n/docprep`
```

### 7.5 검증 결과

```bash
# 외부에서 n8n webhook 직접 접근 시도
$ curl -X POST "https://n8nd.giize.com/webhook/smartsearch" \
    -H "Content-Type: application/json" \
    -d '{"query": "test"}'

# 결과: 403 Forbidden ✅ (차단됨)

# 내부 서비스에서 접근 (aims_rag_api)
$ ssh tars.giize.com 'curl -s -X POST "http://localhost:8000/search" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"보험\", \"user_id\": \"test\"}"'

# 결과: {"search_mode":"semantic","answer":"..."} ✅ (정상)
```

### 7.6 결론

| 항목 | 상태 |
|------|------|
| 외부 → n8n webhook 직접 접근 | ❌ **원천 차단됨** (403 Forbidden) |
| 프론트엔드 → aims_api → n8n | ✅ JWT 인증 필수 |
| 내부 서비스 → n8n | ✅ localhost로만 접근 가능 |
| AI 검색 기능 | ✅ 정상 동작 |
| 문서 업로드 기능 | ✅ 정상 동작 |

**외부에서 n8n webhook을 직접 호출할 방법이 없습니다. 근본적으로 해결됨!**

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2025.12.11 | 최초 작성, 현재 인프라 구성 분석 |
| 2025.12.11 | 내부망 제한 방식을 최우선 권장안으로 변경 |
| 2025.12.11 | **✅ 적용 완료** - 3중 방어 체계 구축, 검증 완료 |
