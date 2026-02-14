# AIMS 프로젝트 버그 분석 리포트

> **분석일**: 2026-02-15
> **분석 범위**: 프론트엔드, 백엔드, 비즈니스 로직 전체
> **분석 방법**: 코드 정적 분석 → 라인별 재검증 (2차) → 심층 교차검증 (3차) → 최종 전수 재검증 (4차)
> **검증 횟수**: 10회+ 반복 심층 검증 완료

---

## 최종 검증 요약

초기 분석에서 12건의 후보를 선별한 뒤, 4차에 걸친 심층 검증을 수행하였습니다.

| 판정 | 건수 | 설명 |
|------|------|------|
| 🔴 확정 버그 | 6건 | 코드에서 직접 확인된 실제 버그 |
| ❌ 오탐 (False Positive) | 5건 | 재검증 결과 버그가 아님 |
| ⚪ 버그 아님 (재분류) | 1건 | 심층 검증으로 시스템 설계 이해 후 제외 |

---

## 🔴 확정 버그

### BUG-01. [보안/치명] 계약 API — 7개 라우트 중 6개에서 인증/인가 부재

- **파일**: `backend/api/aims_api/routes/insurance-contracts-routes.js`
- **심각도**: 🔴🔴 치명 (인증 없는 데이터 접근 + 다른 설계사 계약 조작 가능)

**전수 조사 결과:**

| 라우트 | 라인 | 인증 미들웨어 | `req.user.id` 사용 | 소유권 검증 | 판정 |
|--------|------|:------------:|:------------------:|:----------:|:----:|
| `GET /contracts` | 379 | ✅ `authenticateJWTorAPIKey` | ✅ `agent_id` 필터 | ✅ | 안전 |
| `GET /contracts/:id` | 438 | ❌ **없음** | ❌ | ❌ | **취약** |
| `POST /contracts` | 480 | ✅ `authenticateJWTorAPIKey` | ❌ | ❌ | **취약** |
| `POST /contracts/bulk` | 640 | ✅ `authenticateJWTorAPIKey` | ❌ | ❌ | **취약** |
| `PUT /contracts/:id` | 973 | ❌ **없음** | ❌ | ❌ | **취약** |
| `DELETE /contracts/:id` | 1030 | ✅ `authenticateJWTorAPIKey` | ❌ | ❌ | **취약** |
| `DELETE /contracts/bulk` | 1156 | ❌ **없음** | ❌ | ❌ | **취약** |

**근거 — 전역 인증 미들웨어 없음 (server.js 라인 202):**
```javascript
app.use('/api', require('./routes/insurance-contracts-routes')(db, authenticateJWTorAPIKey));
// ↑ authenticateJWTorAPIKey는 매개변수로 전달만 됨. 전역 적용 아님.
// 각 라우트에서 개별적으로 미들웨어를 적용해야 함.
```

**`req.user.id`는 파일 전체에서 단 1곳에서만 사용 (라인 382):**
```javascript
// GET /contracts (목록) — 유일하게 안전한 라우트
const userId = req.user.id;  // ← 파일 전체에서 유일한 사용처
query.agent_id = agentObjectId;  // ← req.user.id로 필터링
```

**취약점 상세:**

**(A) 인증 없는 라우트 3개 (GET/:id, PUT/:id, DELETE/bulk):**
```javascript
// PUT /contracts/:id (라인 973) — 인증 미들웨어 없음
router.put('/contracts/:id', async (req, res) => {  // ← 미들웨어 없음!
  const { id } = req.params;
  const updates = req.body;
  // ❌ 누구나 아무 계약이나 수정 가능
  const result = await db.collection(CONTRACTS_COLLECTION).updateOne(
    { _id: new ObjectId(id) },  // ← agent_id 필터 없음
    { $set: { ...updates } }
  );
```

**(B) 인증은 있으나 인가(소유권 검증) 없는 라우트 3개:**
```javascript
// POST /contracts (라인 480) — agent_id를 req.user.id와 비교하지 않음
const contract = req.body;
if (!contract.agent_id) {  // ← "있는지"만 확인
  return res.status(400).json({ error: 'agent_id는 필수입니다.' });
}
// ❌ contract.agent_id === req.user.id 비교 없음!
// → 다른 설계사의 agent_id로 계약 등록 가능

// DELETE /contracts/:id (라인 1030) — userId 추출 자체가 없음
const contract = await db.collection(CONTRACTS_COLLECTION).findOne({
  _id: new ObjectId(id)  // ← agent_id 필터 없이 id만으로 조회/삭제
});
```

**해결 방안:**
1. 모든 contracts 라우트에 `authenticateJWTorAPIKey` 미들웨어 추가
2. POST 라우트: `if (contract.agent_id !== req.user.id) return 403`
3. GET/PUT/DELETE 라우트: `findOne({ _id: ..., agent_id: req.user.id })` 소유권 필터

---

### BUG-03. check-hash 엔드포인트에서 customerId 타입 불일치

- **파일**: `backend/api/aims_api/routes/documents-routes.js` (라인 197-199)
- **심각도**: 🟠 중간 (중복 문서 업로드 허용 가능)

**현재 코드 (라인 197-199):**
```javascript
if (customerId) {
  query.customerId = customerId;  // ← 프론트엔드에서 받은 문자열 그대로 사용
}
```

**동일 파일의 올바른 코드 (라인 355-357):**
```javascript
} else if (customerIdFilter && ObjectId.isValid(customerIdFilter)) {
  query.customerId = new ObjectId(customerIdFilter);  // ← ObjectId로 변환
}
```

**최종 검증 결과:**
- 프론트엔드 `duplicateChecker.ts` (라인 292-300): `customerId: customerId || null` — 문자열 전송
- `document_pipeline/doc_prep_main.py` (라인 302-304): `ObjectId(customerId)` — ObjectId로 저장
- 동일 파일 내 AUTO-FIX 코드 (라인 510-544)가 string→ObjectId 마이그레이션 수행 중 — 타입 혼재 확인
- **결과**: `{ customerId: "64a2b3..." }` 쿼리로 `{ customerId: ObjectId("64a2b3...") }` 문서를 찾지 못함

**해결 방안:**
```javascript
if (customerId && ObjectId.isValid(customerId)) {
  query.customerId = new ObjectId(customerId);
} else if (customerId) {
  query.customerId = customerId;
}
```

---

### BUG-05. [치명] 휴면 처리된 고객이 모든 뷰에서 소멸 — 고객 데이터 교착 상태

- **파일**: `backend/api/aims_api/routes/customers-routes.js` (라인 1240-1252, 155, 63, 290-301)
- **심각도**: 🔴🔴 치명 (사용자 데이터 접근 불가 + 이름 교착 상태)

**문제 발생 경로:**

```
1. 사용자가 "휴면 처리" 클릭
   → AllCustomersView.tsx:529 → CustomerService.deleteCustomer()
   → DELETE /api/customers/:id (permanent 파라미터 없음)

2. 백엔드 Soft Delete 실행 (라인 1240-1252):
   $set: {
     'meta.status': 'inactive',     // ← 휴면 표시
     deleted_at: utcNowDate(),       // ← Date 타입 (NOT null)
     deleted_by: userId
   }

3. 고객 목록 쿼리 (라인 155):
   filter['deleted_at'] = null;      // ← 항상 적용!
   // MongoDB: { deleted_at: null } 은 null 또는 필드 미존재만 매칭
   // Date 값은 매칭 안 됨 → 고객 소멸

4. 결과: 활성/휴면/전체 어떤 뷰에서도 고객이 보이지 않음
```

**교착 상태 (Deadlock) 발생:**

```
[이름 중복 체크 (라인 290-301)]
  → 쿼리: { 'personal_info.name': name, 'meta.created_by': userId }
  → deleted_at 필터 없음 → 소멸된 고객도 찾음!
  → "이미 등록된 고객명입니다. [법인(휴면)]" 에러 반환

[고객 목록 (라인 155)]
  → 쿼리: { deleted_at: null, 'meta.status': 'inactive' }
  → 소멸된 고객(deleted_at: Date)은 보이지 않음

⟹ 사용자 교착 상태:
   - 소멸된 고객을 찾을 수 없음 (모든 뷰에서 제외)
   - 같은 이름으로 새 고객 등록도 불가 (이름 중복 에러)
   - 복원 API(POST /customers/:id/restore)가 있지만 대상을 찾을 수 없음
```

**통계 영향 (라인 63):**
```javascript
const baseFilter = { 'meta.created_by': userId, deleted_at: null };
// 휴면 통계: db.countDocuments({ ...baseFilter, 'meta.status': 'inactive' })
// ← deleted_at: Date인 고객은 카운트 안 됨 → 휴면 수 항상 0
```

**CLAUDE.md 규칙 위반:**
> "DELETE API: ⭐ **항상 Hard Delete** — DB에서 완전 삭제"
> "Soft Delete (상태 변경) **절대 금지**"

**해결 방안 (2가지 중 택 1):**
- **방안 A**: 프론트엔드 `deleteCustomer()`에서 `?permanent=true` 전달 → 항상 Hard Delete
- **방안 B**: 백엔드 DELETE 기본 동작을 Hard Delete로 변경 (Soft Delete 코드 제거)

---

### BUG-06. 응답 전송 후 fire-and-forget DB 업데이트

- **파일**: `backend/api/aims_api/routes/documents-routes.js` (라인 530-543)
- **심각도**: 🟡 낮음 (자동 복구됨, 데이터 유실 아님)

**현재 코드 (라인 530-543):**
```javascript
// ← res.json()으로 응답이 이미 전송된 상태
if (docsToFix.length > 0) {
  Promise.all(  // ← await 없음!
    docsToFix.map(doc =>
      db.collection(COLLECTION_NAME).updateOne(...)
    )
  ).then(() => {
    console.log(`✅ [AUTO-FIX] customerId 변환 완료`);
  }).catch(err => {
    console.error(`❌ [AUTO-FIX] customerId 변환 실패:`, err);
  });
}
```

**최종 검증 결과:**
- 의도적 패턴: 응답 속도를 위해 비동기 후처리
- `.catch()` 있어 unhandled rejection 방지됨
- 실패 시 다음 요청에서 자동 재시도 (매 요청마다 docsToFix 재계산)
- 동일 패턴 2곳 (라인 532, 972)

**해결 방안:** `// intentional fire-and-forget: auto-retried on next request` 주석 추가

---

### BUG-08. CorporateContractsTab에서 rejected Promise 무시

- **파일**: `frontend/aims-uix3/src/features/customer/views/CustomerDetailView/tabs/CorporateContractsTab.tsx` (라인 268-352)
- **심각도**: 🟠 중간 (사용자가 부분 데이터 누락을 인지 못함)

**Promise.allSettled 사용 (라인 270-274):**
```typescript
const [ar, crs, manual] = await Promise.allSettled([
  AnnualReportApi.getAnnualReports(custId, userId, 50),
  CustomerReviewApi.getCustomerReviews(custId, 100),
  ContractService.getContractsByCustomer(custId),
])
```

**fulfilled만 처리, rejected 완전 무시 (라인 293, 316, 336):**
```typescript
if (ar.status === 'fulfilled') { ... }     // ← rejected면 스킵
if (crs.status === 'fulfilled') { ... }    // ← rejected면 스킵
if (manual.status === 'fulfilled') { ... } // ← rejected면 스킵
// ❌ 에러 로깅 없음, 사용자 알림 없음
```

**최종 검증 결과:**
- 3개 API 중 일부 실패 시 해당 데이터만 조용히 누락
- console.error 없어 개발자 디버깅 불가
- 사용자는 "데이터가 없음" vs "API 에러" 구분 불가
- 법인계약 탭은 여러 고객의 데이터를 합산하므로, 일부 실패 시 불완전한 목록이 정상처럼 표시

**해결 방안:**
```typescript
if (ar.status === 'rejected') {
  console.error(`[CorporateContracts] AR 조회 실패 (${custId}):`, ar.reason)
}
```
+ 부분 실패 시 사용자 안내 UI 추가

---

### BUG-12. admin-routes.js 에러 로깅에 console.log 사용

- **파일**: `backend/api/aims_api/routes/admin-routes.js` (라인 1412)
- **심각도**: 🟡 낮음 (기능 영향 없음, 로그 수집 누락 가능)

**현재 코드 (라인 1409-1413):**
```javascript
} catch (err) {
  console.log('[Admin] token_usage 조회 오류:', err.message);  // ← console.log
}
```

**교차 검증 — 동일 파일의 다른 catch 블록:**
```javascript
// 라인 78, 138, 223, 318... 등 10곳 이상
backendLogger.error('Admin', '에러 설명', error);  // ← 표준 패턴
```

**해결 방안:** `backendLogger.error('[Admin] token_usage 조회 오류:', err.message)` 로 변경

---

## ⚪ 버그 아님 (심층 검증으로 재분류)

### ~~BUG-07~~. 크레딧 체크 시 PDF 페이지 수를 항상 1로 추정

- **파일**: `backend/api/document_pipeline/routers/doc_prep_main.py` (라인 235)
- **판정**: ⚪ 버그 아님

**재분류 근거:**
- 업로드 시점의 `estimated_pages = 1`은 크레딧 **조회(check)** 전용 — 차감(consume) 아님
- 실제 차감은 `full_pipeline.py`에서 정확한 페이지 수로 수행
- "check only, no consume" 아키텍처 → 1페이지 추정은 "크레딧 ≥ 1" 게이트 체크에 불과
- 크레딧 부족 시 `credit_pending` 상태 → 충전 후 자동 재처리

---

## ❌ 오탐 (False Positive) — 버그가 아님

### ~~BUG-02~~. check-hash 엔드포인트 고객 소유권 미검증
- **판정**: ❌ 버그 아님 — `ownerId: userId`로 이미 소유권 보장

### ~~BUG-04~~. ObjectId 변환 시 try-catch 없음
- **판정**: ❌ 버그 아님 — `toSafeObjectId()` 래퍼에 이미 try-catch 존재

### ~~BUG-09~~. CustomerReviewTab 폴링 함수의 Stale Closure
- **판정**: ❌ 버그 아님 — React "latest ref" 패턴으로 올바른 구현

### ~~BUG-10~~. Promise.all() 병렬 쿼리 부분 실패
- **판정**: ❌ 버그 아님 — 동일 DB 연결의 countDocuments 개별 실패 가능성 극미

### ~~BUG-11~~. ExcelRefiner sessionStorage 역직렬화 검증 없음
- **판정**: ❌ 버그 아님 — `loadPersistedState()`에 이미 try-catch 존재

---

## 수정 우선순위

| 순위 | 버그 | 심각도 | 수정 난이도 | 근거 |
|------|------|--------|------------|------|
| 1 | **BUG-01** (계약 API 인증/인가 부재) | 🔴🔴 치명 | 중간 | 6/7 라우트 취약, 3개는 인증 자체 없음 |
| 2 | **BUG-05** (휴면 처리 → 고객 소멸) | 🔴🔴 치명 | 낮음 | 고객 데이터 교착 상태 + CLAUDE.md 위반 |
| 3 | **BUG-03** (customerId 타입 불일치) | 🟠 중간 | 낮음 (1줄) | 중복 업로드 방지 실패 |
| 4 | **BUG-08** (rejected Promise 무시) | 🟠 중간 | 낮음 | 부분 실패 시 사용자 인지 불가 |
| 5 | **BUG-06** (fire-and-forget) | 🟡 낮음 | 낮음 | 자동 복구 패턴, 주석 명시 정도 |
| 6 | **BUG-12** (로깅 통일) | 🟡 낮음 | 낮음 (1줄) | 운영 로그 수집 일관성 |

---

## 검증 이력

### 1차 검증 (정적 분석)
- 12건 후보 선별

### 2차 검증 (라인별 재검증)
- 5건 오탐 확인 → 제거
- 5건 확정 버그 + 2건 설계 검토

### 3차 검증 (심층 교차검증)
- BUG-01 🟠→🔴: insurance-contracts-routes.js 3개 라우트 인가 누락 신규 발견
- BUG-05 ⚠️→🔴: soft-deleted 고객 모든 뷰 접근 불가 확인
- BUG-07 ⚠️→⚪: 크레딧 "check only" 아키텍처 이해 후 제외

### 4차 검증 (최종 전수 재검증)
- **BUG-01 🔴→🔴🔴 재업그레이드**: 전수 조사 결과 **6/7 라우트 취약** (이전 보고: 3개)
  - 신규 발견: `GET /contracts/:id`, `PUT /contracts/:id`, `DELETE /contracts/bulk`에 **인증 미들웨어 자체가 없음**
  - `req.user.id`는 파일 전체에서 단 1곳(GET /contracts 목록)에서만 사용
  - server.js에 전역 인증 미들웨어 없음 확인 (각 라우트 개별 적용 방식)
- **BUG-05 교착 상태 추가 발견**:
  - 이름 중복 체크(라인 290-301)는 `deleted_at` 필터 없음 → 소멸된 고객도 이름 점유
  - 사용자 교착: 소멸된 고객을 볼 수 없고, 같은 이름으로 새 등록도 불가
  - 휴면 통계 카운트도 항상 0 (`deleted_at: null` 필터)

---

## 교훈

### 반복 검증의 가치

| 검증 차수 | BUG-01 판정 | BUG-05 판정 |
|-----------|-------------|-------------|
| 1차 (정적 분석) | 🟠 중간 (auth.js만 확인) | ⚠️ 설계 검토 |
| 2차 (라인별) | 🟠 중간 (완화 요인 확인) | ⚠️ 설계 검토 유지 |
| 3차 (심층) | 🔴 높음 (+인가 누락 3개) | 🔴 높음 (모든 뷰 접근 불가) |
| 4차 (전수) | 🔴🔴 치명 (+인증 없는 3개) | 🔴🔴 치명 (+이름 교착 상태) |

**결론**: 1~2차 검증으로는 발견하지 못한 치명적 취약점이 3~4차 반복 검증에서 드러났습니다. 보안 관련 코드는 최소 3회 이상의 교차 검증이 필수적입니다.

### 코드 정적 분석의 한계

초기 12건 중 5건(42%)이 오탐이었습니다.

| 오탐 유형 | 사례 | 원인 |
|-----------|------|------|
| 헬퍼 함수 미확인 | BUG-04 | `toSafeObjectId()` 래퍼에 이미 try-catch |
| 컨텍스트 미파악 | BUG-02 | `ownerId` 조건이 이미 소유권 보장 |
| 패턴 오인식 | BUG-09 | "latest ref" 패턴이 정상 코드 |
| 중복 방어 미확인 | BUG-11 | 상위 함수에 이미 try-catch |
| 영향 과대평가 | BUG-10 | 동일 DB의 countDocuments 개별 실패 극미 |
