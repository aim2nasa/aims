# 추가 크레딧 구매 기능 구현

## 개요

AIMS에 SaaS 표준 방식의 **추가 크레딧 구매 기능**을 구현합니다.

### 핵심 정책

| 항목 | 월정액 크레딧 | 추가 크레딧 |
|------|-------------|------------|
| 할당 방식 | 티어별 고정 | 구매/부여 |
| 이월 | ❌ 불가 (매월 리셋) | ✅ 가능 (무제한) |
| 사용 순서 | **1순위** | 2순위 |
| 유효기간 | 해당 월 | 무제한 |

### 크레딧 패키지 (TIER_PRICING_POLICY.md)

| 패키지 | 크레딧 | 가격 | 크레딧당 |
|--------|--------|------|----------|
| 소량 (small) | 300 | 1,900원 | 6.3원 |
| 기본 (basic) | 1,000 | 4,900원 | 4.9원 |
| 대량 (bulk) | 5,000 | 19,900원 | 3.98원 |
| 벌크 (mega) | 20,000 | 59,000원 | 2.95원 |

---

## 구현 현황

### Phase 1: 데이터베이스 스키마 ✅ 완료

- [x] `users.bonus_credits` 필드 추가
- [x] `credit_transactions` 컬렉션 생성
- [x] `credit_packages` 컬렉션 생성
- [x] 마이그레이션 스크립트 작성: `backend/api/aims_api/migrations/add-bonus-credits.js`

### Phase 2: 백엔드 API ✅ 완료

- [x] `creditService.js` 확장 (추가 크레딧 함수)
- [x] `bonus-credits-routes.js` 생성
- [x] server.js에 라우트 등록

### Phase 3: aims-admin UI ✅ 완료

- [x] CreditManagementPage 구현 (`/dashboard/credits`)
- [x] CreditHistoryPage 구현 (`/dashboard/credits/history`)
- [x] CreditPackagesPage 구현 (`/dashboard/credits/packages`)
- [x] 사이드바 네비게이션 메뉴 추가
- [ ] UsersPage 확장 (추후)

### Phase 4: 프론트엔드 (aims-uix3) - 추후 구현

- [ ] CreditExceededDialog 활성화
- [ ] UsageQuotaWidget 확장

---

## MongoDB 스키마

### 1. users.bonus_credits (신규 필드)

```javascript
{
  // 기존 필드...
  bonus_credits: {
    balance: 0,                 // 현재 추가 크레딧 잔액
    total_purchased: 0,         // 누적 구매/부여량 (통계용)
    total_used: 0,              // 누적 사용량 (통계용)
    last_purchase_at: null,     // 마지막 충전일
    updated_at: ISODate
  }
}
```

### 2. credit_transactions (신규 컬렉션)

```javascript
{
  _id: ObjectId,
  user_id: ObjectId,                     // 사용자 ID

  // 트랜잭션 유형
  type: "purchase" | "admin_grant" | "usage" | "refund" | "expiry",

  // 금액 정보
  amount: 1000,                          // 변동 크레딧 (양수: 충전, 음수: 사용)
  balance_before: 500,                   // 거래 전 잔액
  balance_after: 1500,                   // 거래 후 잔액

  // 충전 정보 (type: purchase | admin_grant)
  package: {                             // 구매 패키지 정보 (purchase만)
    code: "basic",
    name: "기본",
    credits: 1000,
    price_krw: 4900
  },

  // 관리자 부여 정보 (type: admin_grant)
  admin: {
    granted_by: ObjectId,                // 부여한 관리자 ID
    granted_by_name: "관리자명",         // 표시용
    reason: "프로모션 지급"              // 부여 사유
  },

  // 사용 정보 (type: usage)
  usage: {
    resource_type: "ocr" | "ai" | "embedding",
    resource_id: ObjectId,               // files._id 등
    credits_used: 5,
    description: "OCR 5페이지 처리"
  },

  // 메타
  description: "기본 패키지 구매",       // 요약 설명
  created_at: ISODate,
  created_by: ObjectId | "system"
}

// 인덱스
db.credit_transactions.createIndex({ user_id: 1, created_at: -1 })
db.credit_transactions.createIndex({ type: 1, created_at: -1 })
db.credit_transactions.createIndex({ created_at: -1 })
```

### 3. credit_packages (신규 컬렉션)

```javascript
{
  _id: ObjectId,
  code: "basic",                         // 패키지 코드 (unique)
  name: "기본",                          // 표시명
  credits: 1000,                         // 크레딧 수
  price_krw: 4900,                       // 가격 (원)
  price_per_credit: 4.9,                 // 크레딧당 단가
  sort_order: 2,                         // 정렬 순서
  is_active: true,                       // 판매 활성화 여부
  description: "가장 인기 있는 패키지",
  created_at: ISODate,
  updated_at: ISODate
}

// 인덱스
db.credit_packages.createIndex({ code: 1 }, { unique: true })
db.credit_packages.createIndex({ sort_order: 1 })
```

---

## API 설계

### 크레딧 패키지 API

| 메서드 | 엔드포인트 | 설명 | 권한 |
|--------|-----------|------|------|
| GET | `/api/credit-packages` | 활성 패키지 목록 | 인증 사용자 |
| GET | `/api/admin/credit-packages` | 전체 패키지 (비활성 포함) | admin |
| POST | `/api/admin/credit-packages` | 패키지 생성 | admin |
| PUT | `/api/admin/credit-packages/:code` | 패키지 수정 | admin |
| DELETE | `/api/admin/credit-packages/:code` | 패키지 비활성화 | admin |

### 추가 크레딧 관리 API

| 메서드 | 엔드포인트 | 설명 | 권한 |
|--------|-----------|------|------|
| GET | `/api/users/me/bonus-credits` | 내 추가 크레딧 | 인증 사용자 |
| GET | `/api/users/me/credit-transactions` | 내 이력 | 인증 사용자 |
| GET | `/api/admin/users/:id/bonus-credits` | 사용자 추가 크레딧 | admin |
| POST | `/api/admin/users/:id/bonus-credits/grant` | 크레딧 부여 | admin |
| GET | `/api/admin/credits/overview` | 전체 현황 요약 | admin |
| GET | `/api/admin/credit-transactions` | 전체 이력 | admin |

---

## 크레딧 사용 로직

### 사용 순서

```
크레딧 사용 요청 (예: OCR 10크레딧)
    ↓
1. 월정액 잔여 확인 (credit_quota - credits_used)
    ├─ 충분 → 월정액에서 차감 (기존 방식, 실제 차감 없음 - 집계 기반)
    └─ 부족 → 다음 단계
    ↓
2. 추가 크레딧 잔액 확인 (bonus_credits.balance)
    ├─ 충분 → 월정액 전부 소진 처리 + 추가 크레딧에서 부족분 차감
    └─ 부족 → 크레딧 부족 에러 (credit_exceeded)
    ↓
3. 트랜잭션 기록 (추가 크레딧 사용 시만)
    - credit_transactions에 usage 타입 기록
    - users.bonus_credits.balance 차감
```

### 예시

**상황**: 월정액 잔여 50, 추가 크레딧 100, 사용 요청 80

```
1. 월정액 50 < 요청 80 → 부족
2. 추가 필요: 80 - 50 = 30
3. 추가 잔액 100 >= 30 → 충분
4. 결과:
   - 월정액: 50 전부 사용 (집계 기반)
   - 추가 크레딧: 30 차감 → 잔액 70
   - 트랜잭션 기록: { type: "usage", amount: -30 }
```

---

## aims-admin UI 설계

### 1. CreditManagementPage (`/dashboard/credits`)

**레이아웃:**
```
┌─────────────────────────────────────────────────────────────┐
│ 크레딧 관리                                                   │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
│ │ 총 추가잔액  │ │ 이달 부여   │ │ 이달 사용   │             │
│ │ 1,234,567C │ │ 45,000C    │ │ 23,456C    │             │
│ └─────────────┘ └─────────────┘ └─────────────┘             │
├─────────────────────────────────────────────────────────────┤
│ 검색: [________] 티어: [전체 ▼] [크레딧 부여]                  │
├─────────────────────────────────────────────────────────────┤
│ 이름    │ 이메일          │ 티어    │ 월정액잔여 │ 추가잔액 │ 총합  │
│ 홍길동  │ hong@...       │ 일반    │ 1,200C   │ 500C   │ 1,700C│
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

### 2. CreditHistoryPage (`/dashboard/credits/history`)

**레이아웃:**
```
┌─────────────────────────────────────────────────────────────┐
│ 크레딧 이력                                                   │
├─────────────────────────────────────────────────────────────┤
│ 기간: [오늘 ▼] 유형: [전체 ▼] 사용자: [________]             │
├─────────────────────────────────────────────────────────────┤
│ 시각           │ 사용자  │ 유형   │ 크레딧   │ 잔액    │ 상세  │
│ 2026.02.05... │ 홍길동 │ 부여   │ +1,000C │ 1,500C │ 프로모션│
│ 2026.02.04... │ 김철수 │ 사용   │ -50C    │ 450C   │ OCR   │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

### 3. CreditPackagesPage (`/dashboard/credits/packages`)

**레이아웃:**
```
┌─────────────────────────────────────────────────────────────┐
│ 크레딧 패키지 관리                            [+ 패키지 추가]  │
├─────────────────────────────────────────────────────────────┤
│ 이름  │ 코드   │ 크레딧  │ 가격     │ 단가   │ 상태   │ 액션  │
│ 소량  │ small │ 300C   │ 1,900원 │ 6.3원 │ 활성  │ 수정 │
│ 기본  │ basic │ 1,000C │ 4,900원 │ 4.9원 │ 활성  │ 수정 │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

---

---

## 🔥 크레딧 충전 시 credit_pending 문서 자동 처리

### 개요

크레딧 부족으로 `credit_pending` 상태가 된 문서들을 **크레딧 충전 시 자동으로 처리 대기열에 추가**합니다.

### 핵심 원칙

| 원칙 | 설명 |
|------|------|
| 확보된 크레딧만큼만 처리 | 크레딧이 충분한 문서만 pending으로 변경 |
| 부분 처리 허용 | 일부만 처리 가능하면 그것만 처리, 나머지는 유지 |
| 오래된 순서 | `createdAt ASC` - 먼저 업로드된 문서 우선 |

### 로직 흐름

```
grantBonusCredits(userId, amount) 호출
    ↓
1. 크레딧 부여 (기존 로직)
    ↓
2. processCreditPendingDocuments(db, userId) 호출
    ↓
3. credit_pending 문서 조회 (오래된 순)
    ↓
4. 각 문서에 대해:
   a. 페이지 수 기반 예상 크레딧 계산
   b. checkCreditForDocumentProcessing() 실시간 체크
   c. 충분하면 → pending으로 변경
   d. 부족하면 → 루프 종료 (나머지 유지)
    ↓
5. 결과 반환 (credit_pending_processed, remaining)
```

### 예상 크레딧 계산

```javascript
// OCR: 페이지당 2 크레딧
// 임베딩: 페이지당 약 0.5 크레딧
// 버퍼 1.5배 적용
estimatedCredits = ceil((pageCount * 2 + pageCount * 0.5) * 1.5)
                 = ceil(pageCount * 3.75)
```

### 문서 상태 변경

```javascript
// credit_pending → pending
{
  $set: {
    overallStatus: 'pending',
    'docembed.status': 'pending',
    'docembed.reprocessed_from_credit_pending': true,
    'docembed.reprocessed_at': ISODate,
    progressStage: 'queued',
    progressMessage: '크레딧 충전 후 재처리 대기'
  },
  $unset: {
    credit_pending_since: '',
    credit_pending_info: ''
  }
}
```

### API 응답 확장

`grantBonusCredits` 결과에 자동 처리 정보 포함:

```javascript
{
  "success": true,
  "user_id": "...",
  "amount_granted": 100,
  "balance_before": 90000,
  "balance_after": 90100,
  "transaction_id": "...",
  // 🔥 신규 필드
  "credit_pending_processed": 3,        // pending으로 변환된 문서 수
  "credit_pending_remaining": 0,        // 아직 credit_pending인 문서 수
  "credit_pending_docs": [              // 처리된 문서 목록
    {
      "doc_id": "...",
      "original_name": "AR_김보성_20250830.pdf",
      "page_count": 1,
      "estimated_credits": 4
    }
  ]
}
```

### 테스트 결과 (2026-02-05)

```
크레딧 부여 전 credit_pending 문서:
credit_pending 문서 수: 3

100 크레딧 부여 중...
[CreditService] processCreditPendingDocuments: 사용자 ...의 credit_pending 문서 3개 발견
[CreditService] processCreditPendingDocuments: 문서 ... (AR_김보성_20250830.pdf) → pending (1/3)
[CreditService] processCreditPendingDocuments: 문서 ... (AR_김보성_20251029.pdf) → pending (2/3)
[CreditService] processCreditPendingDocuments: 문서 ... (AR20260120_...) → pending (3/3)
[CreditService] processCreditPendingDocuments: 완료 - 처리됨: 3, 남음: 0

크레딧 부여 후 credit_pending 문서:
credit_pending 문서 수: 0

pending 상태로 변경된 문서:
재처리 대기 문서 수: 3
```

### 테스트 환경 주의사항

> ⚠️ **Docker 컨테이너 내부에서 테스트해야 함!**
>
> `processCreditPendingDocuments` 함수는 `db.client.db('aims_analytics')`를 사용하여
> 다른 데이터베이스에 접근합니다. Docker 외부에서 테스트할 경우 MongoDB 연결 컨텍스트가
> 달라서 제대로 동작하지 않을 수 있습니다.
>
> ```bash
> # 올바른 테스트 방법 (Docker 내부)
> docker exec aims-api node -e "
> const { MongoClient } = require('mongodb');
> const { grantBonusCredits } = require('/app/lib/creditService');
> // ... (mongodb://tars:27017 사용)
> "
> ```

### 관련 파일

| 파일 | 변경 내용 |
|------|----------|
| `backend/api/aims_api/lib/creditService.js` | `processCreditPendingDocuments()` 함수 추가, `grantBonusCredits()` 확장 |

---

## 구현 로그

### 2026-02-05: credit_pending 자동 처리 기능 완성

**Phase 1: 기본 기능 구현**
- `processCreditPendingDocuments()` 함수 구현
- `grantBonusCredits()` 함수에서 크레딧 부여 후 자동 호출
- 부분 처리 지원 (크레딧 부족 시 처리 가능한 것만 처리)

**Phase 2: 버그 수정 (full_pipeline.py 크레딧 재체크 문제)**

⚠️ **발견된 문제**: 문서를 `pending`으로 변경해도 1분 후 다시 `credit_pending`으로 되돌아감

**근본 원인 분석:**
1. `full_pipeline.py`가 크론탭으로 **매 1분마다** 실행됨
2. `docembed.status: 'pending'`인 문서를 찾아서 임베딩 처리
3. 처리 전 `check_credit_for_embedding()` 호출하여 **크레딧 재체크**
4. 크레딧 부족으로 판단되면 **다시 credit_pending으로 변경**

**해결책:**
1. `full_pipeline.py`에 `reprocessed_from_credit_pending` 플래그 체크 추가
2. 이 플래그가 있으면 **크레딧 체크 스킵** (이미 검증된 문서)

```python
# full_pipeline.py 수정 내용
is_reprocessed = doc_data.get('docembed', {}).get('reprocessed_from_credit_pending', False)

if is_reprocessed:
    print(f"[CREDIT_SKIP] 문서 ID: {doc_id} - 크레딧 충전 후 재처리 문서 (체크 스킵)")
else:
    # 기존 크레딧 체크 로직...
```

**Phase 3: 버그 수정 (credit_pending 문서 full_text 누락)**

⚠️ **발견된 문제**: `credit_pending` 상태 문서에 `full_text`가 저장되지 않음

**근본 원인:**
- `doc_prep_main.py`에서 크레딧 부족 시 `meta.length`만 저장하고 `meta.full_text`는 누락

**해결책:**
```python
# doc_prep_main.py 수정 내용
meta_update = {
    "meta.mime": detected_mime,
    "meta.pdf_pages": meta_result.get("num_pages", 0),
    "meta.length": len(full_text) if full_text else 0,
    "meta.full_text": full_text or "",  # 🔴 추가됨
}
```

**최종 테스트 결과:**
```
[2026-02-05 22:22:01] 시작
총 3개의 문서를 처리할 준비가 완료되었습니다.
[CREDIT_SKIP] 문서 ID: 698490fe66f5baefac3170c6 - 크레딧 충전 후 재처리 문서 (체크 스킵)
--- 문서 ID: 698490fe66f5baefac3170c6 처리 완료 (overallStatus: completed) ---
[CREDIT_SKIP] 문서 ID: 698490fe66f5baefac3170c7 - 크레딧 충전 후 재처리 문서 (체크 스킵)
--- 문서 ID: 698490fe66f5baefac3170c7 처리 완료 (overallStatus: completed) ---
[CREDIT_SKIP] 문서 ID: 698490fe66f5baefac3170c8 - 크레딧 충전 후 재처리 문서 (체크 스킵)
--- 문서 ID: 698490fe66f5baefac3170c8 처리 완료 (overallStatus: completed) ---
[2026-02-05 22:22:11] 끝
```

**수정된 파일:**
| 파일 | 변경 내용 |
|------|----------|
| `backend/embedding/full_pipeline.py` | `reprocessed_from_credit_pending` 플래그 체크 추가 |
| `backend/api/document_pipeline/routers/doc_prep_main.py` | `meta.full_text` 저장 추가 |

### 2026-02-05: Phase 1~3 완료

**Phase 1: 데이터베이스**
- 마이그레이션 스크립트 작성: `backend/api/aims_api/migrations/add-bonus-credits.js`
- MongoDB 스키마 설계 완료
- 초기 패키지 데이터 시드

**Phase 2: 백엔드 API**
- `creditService.js` 확장
  - `getBonusCreditBalance()`, `getBonusCreditInfo()`
  - `grantBonusCredits()`, `useBonusCredits()`
  - `checkCreditWithBonus()`, `consumeCredits()`
  - `getCreditTransactions()`, `getCreditPackages()`, `getCreditOverview()`
- `bonus-credits-routes.js` 생성 (factory function 패턴)
- `server.js`에 라우트 등록

**Phase 3: aims-admin UI**
- `features/credits/api.ts` - API 클라이언트 및 타입 정의
- `CreditManagementPage` - 사용자별 크레딧 현황 및 부여
- `CreditHistoryPage` - 크레딧 이력 조회
- `CreditPackagesPage` - 패키지 CRUD
- 탭 네비게이션 컴포넌트 추가
- 사이드바 메뉴 등록

**빌드 검증**: `npm run build` 성공

---

## 참조 문서

- [TIER_PRICING_POLICY.md](TIER_PRICING_POLICY.md) - 티어/크레딧 가격 정책
- [EMBEDDING_CREDIT_POLICY.md](EMBEDDING_CREDIT_POLICY.md) - 문서 처리 크레딧 정책
- [SAAS_BILLING_POLICY.md](SAAS_BILLING_POLICY.md) - SaaS 과금 정책
