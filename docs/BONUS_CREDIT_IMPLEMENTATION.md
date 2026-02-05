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

## 구현 로그

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
