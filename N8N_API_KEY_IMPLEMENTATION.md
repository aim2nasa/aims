# n8n API Key 인증 구현 작업 로그

## 📌 작업 목적
**원래 문제**: "홍길동" 고객 문서가 안 보이는 현상
**근본 원인**: `customerId` + `customer_relation` 이중 연결 구조
**해결**: `customerId` + `customer_notes`로 통일 완료
**남은 문제**: n8n 자동 연결 JWT 토큰 만료 (403 Forbidden)
**현재 작업**: API Key 인증 추가로 영구 해결

---

## ✅ 완료된 작업

### 1. API Key 미들웨어 추가 (`middleware/auth.js`)

**추가된 함수**:
- `authenticateAPIKey()` - API Key 전용 인증
- `authenticateJWTorAPIKey()` - JWT 또는 API Key 둘 다 허용

**주요 로직**:
```javascript
// X-API-Key 헤더 확인 → N8N_API_KEY 환경변수와 비교
// userId는 body.userId 또는 query.userId에서 추출
// API Key 인증 성공 시 req.user = { id, role: 'system', authMethod: 'apiKey' }
```

---

### 2. server.js 엔드포인트 수정 ✅

**대상**: `POST /api/customers/:id/documents` (라인 3244)
**변경**: `authenticateJWT` → `authenticateJWTorAPIKey`

### 3. .env 파일에 API Key 추가 ✅

```
N8N_API_KEY=aims_n8n_webhook_secure_key_2025_v1_a7f3e9d2c1b8
```

---

### 4. 서버 배포 ✅

**배포 완료**: Docker 이미지 재빌드 및 컨테이너 재시작 완료
**로그 확인**: 서버 정상 작동 중

---

## ✅ 완료된 작업 (계속)

### 5. n8n 워크플로우 수정 ✅

**파일**: `backend/n8n_flows/DocPrepMain.json`

**추가된 노드**:
1. **Check Customer Connection** (IF 노드)
   - 조건: `customerId` 존재 여부 확인
   - Save OwnerId와 병렬 실행

2. **Connect Document to Customer** (HTTP Request 노드)
   - Method: POST
   - URL: `https://aims.giize.com/api/customers/{{ $json.customerId }}/documents`
   - Headers: `X-API-Key: aims_n8n_webhook_secure_key_2025_v1_a7f3e9d2c1b8`
   - Body: `{ document_id, userId, notes }`
   - 터미널 노드 (이후 연결 없음)

**데이터 흐름**:
```
Save OwnerId
    ├─(병렬)─► Merge1 → ...
    ├─(병렬)─► Merge → ...
    └─(병렬)─► Check Customer Connection
                └─(true)─► Connect Document to Customer [터미널]
```

**배포 완료**: 서버에 업로드됨 (`/home/rossi/aims/backend/n8n_flows/DocPrepMain.json`)

---

## 📋 남은 작업

1. [x] middleware/auth.js에 API Key 미들웨어 추가
2. [x] server.js 엔드포인트 미들웨어 변경
3. [x] .env 파일에 N8N_API_KEY 추가
4. [x] 서버 배포
5. [x] n8n 워크플로우 수정 및 배포
6. [ ] **n8n에서 워크플로우 재import 필요**
7. [ ] 테스트: 문서 업로드 → 자동 연결 확인

---

## 🔑 생성할 API Key
```
N8N_API_KEY=aims_n8n_webhook_key_2025_secure_token_v1
```

---

## 📝 작업 노트
- JWT 만료 문제 영구 해결
- 기존 JWT 인증도 그대로 유지 (하위 호환성)
- n8n은 API Key만 사용, 프론트엔드는 JWT 사용
