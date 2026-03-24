---
name: backend-skill
description: AIMS 백엔드 개발 가이드. API, 라우트, 서버, 백엔드, Express, FastAPI 작업 시 자동 사용
---

# AIMS 백엔드 개발 가이드

> 백엔드 API 수정, 라우트 추가, 서비스 작업 시 참조

## 서비스 목록

| 서비스 | 스택 | 포트 | 실행 | 경로 |
|--------|------|:----:|------|------|
| aims_api | Express 5 (Node) | 3010 | PM2 | `backend/api/aims_api/` |
| document_pipeline | FastAPI (Python) | 8100 | PM2 | `backend/api/document_pipeline/` |
| annual_report_api | FastAPI (Python) | 8004 | PM2 | `backend/api/annual_report_api/` |
| aims_rag_api | FastAPI (Python) | 8000 | Docker | `backend/api/aims_rag_api/` |
| pdf_proxy | FastAPI (Python) | 8002 | PM2 | `backend/api/pdf_proxy/` |
| pdf_converter | Node | 8005 | Docker | `tools/convert/` |
| aims_health_monitor | TypeScript (Node) | 3012 | PM2 | `backend/api/aims_health_monitor/` |
| aims_mcp | TypeScript (Node) | - | PM2 | `backend/api/aims_mcp/` |

## aims_api 라우트 규칙

### 라우터 팩토리 패턴
```javascript
// routes/xxx-routes.js
module.exports = function(db, authenticateJWT, ...) {
  const router = express.Router();
  router.get('/endpoint', authenticateJWT, async (req, res) => {
    try {
      // 비즈니스 로직
      res.json({ success: true, data: result, timestamp: utcNowISO() });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message, timestamp: utcNowISO() });
    }
  });
  return router;
};
```

### 등록
```javascript
// server.js
app.use('/api', routerFactory(db, authenticateJWT, ...));
```

- **모든 라우트는 `/api` prefix로 마운트**
- webhooks-routes.js도 `app.use('/api', ...)` → 경로에 `/webhooks/` 접두사 없음

### 인증 미들웨어 (`middleware/auth.js`)

| 함수 | 용도 |
|------|------|
| `authenticateJWT` | 표준 Bearer JWT 인증 |
| `authenticateJWTWithQuery` | JWT를 `?token=xxx`로도 수락 (파일 다운로드용) |
| `authenticateJWTorAPIKey` | JWT 또는 `x-api-key` (서버간 통신) |
| `optionalAuthJWT` | 인증 없어도 통과 |
| `requireRole(...roles)` | RBAC 체크 |
| `authenticateAPIKey` | `x-api-key` 전용 |

### 응답 형식
```javascript
// 성공
{ success: true, data: ..., timestamp: "2026-03-24T..." }

// 실패
{ success: false, error: "메시지", timestamp: "2026-03-24T..." }
```

### 미들웨어 스택 순서
```
CORS → express.json → cookieParser → multer → Content-Type 고정
→ backendLogger → realtimeMetrics → [라우트] → 404 → 500
```

## document_pipeline 라우트

모든 라우트는 `/webhook` prefix:
```
POST /webhook/docupload    — 문서 업로드
POST /webhook/docmeta      — 메타 추출
POST /webhook/docprep-main — 문서 전처리
POST /webhook/docsummary   — AI 요약
POST /webhook/dococr       — OCR
POST /webhook/doc-display-name — 별칭 생성
GET  /health, /health/deep, /queue/status
```

### 백그라운드 Workers (lifespan 자동 시작)
- `upload_worker` — MongoDB upload_queue 폴링 (1초, 최대 3동시)
- `pdf_conversion_worker` — PDF 변환 큐
- `ocr_worker` — Redis Stream (`ocr_stream`)

## API 라우트 추가 시 체크리스트

1. **aims_api 라우트 파일** 생성/수정
2. **server.js**에 `app.use('/api', ...)` 등록
3. **인증 미들웨어** 적용 (authenticateJWT 등)
4. **프론트엔드 URL**과 일치 확인 (`api.get('/api/xxx')`)
5. document_pipeline 관련이면 **pipeline 라우터도 추가 + PM2 재시작**

## SSE (Server-Sent Events)

```javascript
// lib/sseManager.js
// 채널: customerDoc, ar, cr, customerCombined, personalFiles, documentStatus, documentList, userAccount
sseManager.broadcast(channel, targetId, eventType, data)
```

## 공유 스키마

```javascript
// @aims/shared-schema (backend/shared/schema/)
const { COLLECTIONS } = require('@aims/shared-schema');
// COLLECTIONS.USERS, CUSTOMERS, CONTRACTS, FILES, ...
// 컬렉션명 문자열 직접 사용 금지 → 반드시 상수 사용
```

## 로깅

- `backendLogger` — AsyncLocalStorage 기반 요청 컨텍스트 자동 캡처
- 저장: `aims_analytics` DB, 30일 TTL
- 샘플링: debug 1%, info 10%, warn/error 100%
- 민감 정보 자동 마스킹 (password, token, ssn 등)

## 배포

- **배포 스크립트만 사용** (`deploy_all.sh`). pm2 restart / npm start 직접 실행 금지
- 전체 배포: `ssh rossi@100.110.215.65 'cd ~/aims && ./deploy_all.sh'`
- API 키: `~/aims/.env.shared` 한 곳에서만 정의
- 새 라우터 추가 → 반드시 해당 서비스 재시작 필요

## API 확인 방법

추측 금지. 실제 API 호출로 확인:
```bash
ssh rossi@100.110.215.65 'curl -s "http://localhost:3010/api/endpoint" | python3 -m json.tool'
```
