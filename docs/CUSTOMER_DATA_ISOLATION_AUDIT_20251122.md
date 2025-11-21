# AIMS 고객 데이터 격리(Multi-tenancy) 보안 감사 보고서

**작성일**: 2025-11-22
**감사 범위**: AIMS UIX3 백엔드/프론트엔드 전체
**감사 목적**: 설계사별 고객 데이터 격리 취약점 식별

---

## 📋 Executive Summary

| 항목 | 결과 |
|------|------|
| **전체 위험도** | 🔴 **심각 (Critical)** |
| **발견된 취약점** | 총 13개 |
| **심각 (Critical)** | 6개 |
| **높음 (High)** | 4개 |
| **주의 (Medium)** | 3개 |
| **즉시 조치 필요** | ✅ **예** |

### 핵심 문제

**다른 설계사의 고객 정보를 열람, 수정, 삭제할 수 있는 심각한 보안 취약점이 존재합니다.**

- 백엔드 API 6개에서 `userId` 검증 누락
- 프론트엔드 4개 파일에서 `x-user-id` 헤더 누락
- 문서-고객 연결 API 3개에서 소유권 검증 누락

---

## 🔴 심각 취약점 (Critical) - 6개

### 1. GET /api/customers/:id - 고객 상세 조회

| 항목 | 내용 |
|------|------|
| **파일** | `backend/api/aims_api/server.js` |
| **라인** | 1896-1929 |
| **문제** | userId 검증 없이 고객 ID만으로 조회 가능 |
| **영향** | 고객 ID를 알면 **모든 설계사**의 고객 정보 열람 가능 |

**현재 코드**:
```javascript
const customer = await db.collection(CUSTOMERS_COLLECTION)
  .findOne({ _id: new ObjectId(id) });
// ❌ userId 검증 없음
```

**수정 필요**:
```javascript
const userId = req.query.userId || req.headers['x-user-id'];
if (!userId) {
  return res.status(400).json({ success: false, error: 'userId required' });
}

const customer = await db.collection(CUSTOMERS_COLLECTION)
  .findOne({
    _id: new ObjectId(id),
    'meta.created_by': userId  // ✅ 소유권 검증
  });

if (!customer) {
  return res.status(403).json({
    success: false,
    error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
  });
}
```

---

### 2. PUT /api/customers/:id - 고객 정보 수정

| 항목 | 내용 |
|------|------|
| **파일** | `backend/api/aims_api/server.js` |
| **라인** | 1934-2020 |
| **문제** | userId 검증 없이 고객 정보 수정 가능 |
| **영향** | **다른 설계사의 고객 정보를 임의로 수정** 가능 |

**악용 시나리오**:
1. 설계사 A가 설계사 B의 고객 ID를 획득
2. `PUT /api/customers/{B의_고객_ID}` 호출
3. 전화번호, 이메일, 주소 등 개인정보 변조

---

### 3. DELETE /api/customers/:id - 고객 삭제

| 항목 | 내용 |
|------|------|
| **파일** | `backend/api/aims_api/server.js` |
| **라인** | 2025-2074 |
| **문제** | userId 검증 없이 고객 삭제 가능 |
| **영향** | **다른 설계사의 고객을 삭제** 가능 (가장 위험) |

**악용 시나리오**:
1. 경쟁 설계사의 고객 ID 목록 획득
2. 대량 삭제 공격으로 비즈니스 방해
3. 복구 불가능한 데이터 손실

---

### 4. POST /api/customers/:id/documents - 문서-고객 연결

| 항목 | 내용 |
|------|------|
| **파일** | `backend/api/aims_api/server.js` |
| **라인** | 2271-2354 |
| **문제** | 고객 소유권 검증 없이 문서 연결 가능 |
| **영향** | **다른 설계사의 고객에 문서를 강제 연결** 가능 |

---

### 5. GET /api/customers/:customerId/annual-reports/pending - AR 대기 목록

| 항목 | 내용 |
|------|------|
| **파일** | `backend/api/aims_api/server.js` |
| **라인** | 3108-3153 |
| **문제** | userId 검증 없이 AR 대기 목록 조회 가능 |
| **영향** | **다른 설계사의 고객 AR 파싱 상태 모니터링** 가능 |

---

### 6. GET /api/customers/:id/address-history - 주소 이력 조회

| 항목 | 내용 |
|------|------|
| **파일** | `backend/api/aims_api/server.js` |
| **라인** | 3347-3415 |
| **문제** | userId 검증 없이 주소 이력 조회 가능 |
| **영향** | **다른 설계사 고객의 주소 변화 이력 열람** (개인정보 유출) |

---

## 🟠 높음 취약점 (High) - 4개

### 프론트엔드 직접 fetch 사용 (x-user-id 헤더 누락)

| # | 파일 | 라인 | 문제 |
|---|------|------|------|
| 1 | `features/customer/controllers/useCustomersController.ts` | 93 | 직접 fetch, 헤더 없음 |
| 2 | `providers/DocumentStatusProvider.tsx` | 144 | 직접 fetch, 헤더 없음 |
| 3 | `services/searchService.ts` | 111, 172 | 직접 fetch, 헤더 없음 (2곳) |
| 4 | `features/customer/views/CustomerDetailView/tabs/AnnualReportTab.tsx` | - | 직접 fetch, 헤더 없음 |

**문제점**:
- `api.ts`는 자동으로 `x-user-id` 헤더를 추가하지만
- 위 파일들은 직접 `fetch()`를 사용하여 헤더가 누락됨
- 백엔드가 userId 필터링을 하더라도 프론트에서 헤더를 안 보내면 실패

**수정 방법**:
```typescript
// ❌ 현재 (위험)
const response = await fetch(`http://tars.giize.com:3010/api/customers/${customerId}`);

// ✅ 수정 (안전)
import { api } from '@/shared/lib/api';
const response = await api.get(`/api/customers/${customerId}`);
```

---

## 🟡 주의 취약점 (Medium) - 3개

### 1. DELETE /api/customers/:id/documents/:document_id

| 항목 | 내용 |
|------|------|
| **파일** | `backend/api/aims_api/server.js` |
| **라인** | 2359-2442 |
| **문제** | 고객 존재 확인만, 소유권(created_by) 검증 없음 |

---

### 2. PATCH /api/customers/:id/documents/:document_id

| 항목 | 내용 |
|------|------|
| **파일** | `backend/api/aims_api/server.js` |
| **라인** | 2447-2530 |
| **문제** | 소유권 검증 없이 메모 수정 가능 |

---

### 3. RAG 검색 API (user_id 선택적)

| 항목 | 내용 |
|------|------|
| **파일** | `backend/api/aims_rag_api/rag_search.py` |
| **라인** | 74-98 |
| **문제** | `user_id`가 Optional로 설정되어 있어 전체 문서 검색 가능 |

---

## 🟢 안전한 API (검증 완료)

| API 엔드포인트 | 파일/라인 | 보호 방식 |
|---------------|----------|----------|
| GET /api/customers | server.js:1638-1740 | `meta.created_by: userId` 필터 |
| GET /api/documents | server.js:224-539 | `ownerId: userId` 필터 |
| GET /api/documents/status | server.js:542+ | `ownerId: userId` 필터 |
| GET /api/customers/:customerId/annual-reports | Python API | `meta.created_by` 검증 |
| DELETE /api/customers/:customerId/annual-reports | Python API | `meta.created_by` 검증 |

---

## 📊 취약점 분포 요약

```
백엔드 API 취약점: 9개
├── 고객 CRUD API: 3개 (GET/PUT/DELETE :id)
├── 문서-고객 연결 API: 3개 (POST/DELETE/PATCH)
├── Annual Report API: 1개 (pending)
├── 주소 이력 API: 1개
└── RAG 검색 API: 1개

프론트엔드 취약점: 4개
├── useCustomersController.ts: 1개
├── DocumentStatusProvider.tsx: 1개
├── searchService.ts: 2개
└── AnnualReportTab.tsx: 1개
```

---

## 🔧 수정 권장사항

### P0 - 즉시 수정 (오늘 내)

| 우선순위 | API | 수정 내용 |
|---------|-----|----------|
| P0-1 | GET /api/customers/:id | userId + created_by 필터 추가 |
| P0-2 | PUT /api/customers/:id | userId + created_by 필터 추가 |
| P0-3 | DELETE /api/customers/:id | userId + created_by 필터 추가 |

### P1 - 긴급 (1-2일 내)

| 우선순위 | 대상 | 수정 내용 |
|---------|------|----------|
| P1-1 | POST /api/customers/:id/documents | 소유권 검증 추가 |
| P1-2 | DELETE /api/customers/:id/documents/:doc_id | 소유권 검증 추가 |
| P1-3 | PATCH /api/customers/:id/documents/:doc_id | 소유권 검증 추가 |
| P1-4 | GET /api/customers/:customerId/annual-reports/pending | userId 검증 추가 |

### P2 - 높음 (3일 내)

| 우선순위 | 대상 | 수정 내용 |
|---------|------|----------|
| P2-1 | useCustomersController.ts | fetch → api.get() |
| P2-2 | DocumentStatusProvider.tsx | fetch → api.get() |
| P2-3 | searchService.ts | fetch → api.get() (2곳) |
| P2-4 | AnnualReportTab.tsx | fetch → api.get() |

### P3 - 중간 (1주 내)

| 우선순위 | 대상 | 수정 내용 |
|---------|------|----------|
| P3-1 | GET /api/customers/:id/address-history | userId 검증 추가 |
| P3-2 | RAG 검색 API | user_id 필수로 변경 |

---

## 📝 수정 코드 템플릿

### 백엔드 API 수정 패턴

모든 고객 관련 API에 아래 패턴 적용:

```javascript
// 1. userId 추출 및 필수 검증
const userId = req.query.userId || req.headers['x-user-id'];
if (!userId) {
  return res.status(400).json({
    success: false,
    error: 'userId is required'
  });
}

// 2. 고객 조회 시 소유권 필터 포함
const customer = await db.collection(CUSTOMERS_COLLECTION)
  .findOne({
    _id: new ObjectId(id),
    'meta.created_by': userId  // ✅ 핵심: 소유권 검증
  });

// 3. 권한 없는 접근 차단
if (!customer) {
  return res.status(403).json({
    success: false,
    error: '고객을 찾을 수 없거나 접근 권한이 없습니다.'
  });
}
```

### 프론트엔드 수정 패턴

```typescript
// ❌ 위험: 직접 fetch 사용
const response = await fetch(`http://tars.giize.com:3010/api/customers/${id}`);

// ✅ 안전: api 클라이언트 사용 (자동 x-user-id 포함)
import { api } from '@/shared/lib/api';
const response = await api.get(`/api/customers/${id}`);
```

---

## 🧪 검증 테스트 시나리오

### 테스트 1: 다른 설계사 고객 조회 차단

```bash
# 설계사 A (userA)가 설계사 B (userB)의 고객 조회 시도
curl -X GET "http://localhost:3010/api/customers/CUSTOMER_B_ID" \
  -H "x-user-id: userA"

# 예상 결과: 403 Forbidden
# { "success": false, "error": "고객을 찾을 수 없거나 접근 권한이 없습니다." }
```

### 테스트 2: 다른 설계사 고객 수정 차단

```bash
# 설계사 A가 설계사 B의 고객 정보 수정 시도
curl -X PUT "http://localhost:3010/api/customers/CUSTOMER_B_ID" \
  -H "x-user-id: userA" \
  -H "Content-Type: application/json" \
  -d '{"personal_info": {"phone": "010-1234-5678"}}'

# 예상 결과: 403 Forbidden
```

### 테스트 3: 다른 설계사 고객 삭제 차단

```bash
# 설계사 A가 설계사 B의 고객 삭제 시도
curl -X DELETE "http://localhost:3010/api/customers/CUSTOMER_B_ID" \
  -H "x-user-id: userA"

# 예상 결과: 403 Forbidden
```

---

## 📌 향후 권장사항

### 1. 코드 리뷰 체크리스트 추가

```markdown
## 고객 데이터 접근 보안 체크리스트

- [ ] 백엔드 API에서 userId 검증 코드가 있는가?
- [ ] 고객 조회 시 `meta.created_by` 필터가 포함되어 있는가?
- [ ] 프론트엔드에서 `api.ts` 클라이언트를 사용하는가?
- [ ] 직접 `fetch()`를 사용하는 경우 `x-user-id` 헤더가 포함되어 있는가?
```

### 2. 자동화 테스트 추가

```typescript
// 보안 테스트: 다른 설계사 고객 접근 차단
describe('Customer Data Isolation', () => {
  it('should block access to other user customers', async () => {
    const response = await api.get(`/api/customers/${otherUserCustomerId}`, {
      headers: { 'x-user-id': 'currentUser' }
    });
    expect(response.status).toBe(403);
  });
});
```

### 3. 미들웨어 도입 검토

```javascript
// 고객 소유권 검증 미들웨어
const validateCustomerOwnership = async (req, res, next) => {
  const userId = req.headers['x-user-id'];
  const customerId = req.params.id || req.params.customerId;

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  const customer = await db.collection('customers')
    .findOne({ _id: new ObjectId(customerId), 'meta.created_by': userId });

  if (!customer) {
    return res.status(403).json({ error: '접근 권한이 없습니다.' });
  }

  req.customer = customer;
  next();
};

// 사용
app.get('/api/customers/:id', validateCustomerOwnership, async (req, res) => {
  res.json({ success: true, data: req.customer });
});
```

---

## 📎 관련 문서

- [CLAUDE.md](../CLAUDE.md) - 개발 규칙
- [server.js](../backend/api/aims_api/server.js) - 백엔드 API 서버
- [api.ts](../frontend/aims-uix3/src/shared/lib/api.ts) - 프론트엔드 API 클라이언트

---

## ✅ 감사 완료

**감사자**: Claude Code
**검토 상태**: 완료
**다음 단계**: P0 취약점 즉시 수정 필요
