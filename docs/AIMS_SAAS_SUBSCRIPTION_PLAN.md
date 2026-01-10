# AIMS SaaS 구독 모델 구현 계획

> **문서 버전**: 1.0.0
> **작성일**: 2026-01-10
> **상태**: 승인됨 (Phase 1 진행 예정)

---

## 1. 개요

### 1.1 목표

AIMS에 월간 구독 SaaS 모델을 구현하여:
- 티어별 스토리지/크레딧 한도 초과 시 기능 제한
- 유료 구독 결제 처리 (PG 연동)
- 추가 크레딧 충전 기능

### 1.2 현재 상태

| 기능 | 상태 | 비고 |
|------|------|------|
| 티어 정의 (5개) | ✅ 완료 | free_trial, standard, premium, vip, admin |
| 스토리지 한도 체크 | ✅ 완료 | 업로드 시 차단 |
| 크레딧 사용량 계산 | ✅ 완료 | OCR + AI 통합 |
| OCR 한도 체크 | ✅ 완료 | n8n 워크플로우에서 체크 |
| AI 크레딧 한도 차단 | ❌ 미구현 | **Phase 1 목표** |
| 결제/PG 연동 | ❌ 미구현 | Phase 3 |

### 1.3 사용자 요구사항

- **PG 서비스**: 미정 (토스페이먼츠/나이스페이/카카오페이 옵션)
- **결제 주기**: 월정액 + 연정액 + 추가충전
- **무료체험**: 30일 후 자동 standard 전환 (후등록 모델)

---

## 2. 티어 및 크레딧 정책

### 2.1 티어별 할당량

| 티어 | 스토리지 | 크레딧/월 | 월 가격 | 마진 |
|------|----------|----------|---------|------|
| 무료체험 | 512 MB | 300 | 무료 | - |
| 일반 | 20 GB | 2,000 | 9,900원 | 73% |
| 프리미엄 | 40 GB | 8,000 | 29,900원 | 69% |
| VIP | 80 GB | 30,000 | 99,000원 | 67% |
| 관리자 | 무제한 | 무제한 | - | - |

### 2.2 크레딧 환산 기준

| 리소스 | 크레딧 소모 |
|--------|------------|
| OCR 1페이지 | 2 크레딧 |
| AI 1K 토큰 | 0.5 크레딧 |
| 문서 요약/임베딩 | 1 크레딧/문서 |

### 2.3 추가 크레딧 충전 패키지

| 패키지 | 크레딧 | 가격 | 크레딧당 |
|--------|--------|------|----------|
| 소량 | 300 | 1,900원 | 6.3원 |
| 기본 | 1,000 | 4,900원 | 4.9원 |
| 대량 | 5,000 | 19,900원 | 3.98원 |
| 벌크 | 20,000 | 59,000원 | 2.95원 |

### 2.4 크레딧 정책

- **이월**: 월정액 크레딧은 이월 불가, 추가 충전 크레딧은 무제한
- **사용 순서**: 월정액 먼저 → 추가 충전 (FIFO)
- **초과 시**: OCR/AI 기능 제한, 문서 조회/다운로드는 가능

---

## 3. 전문가 검토 결과

### 3.1 검토 참여자 (10명 페르소나)

1. CTO (기술 총괄)
2. 백엔드 시니어 개발자
3. 프론트엔드 시니어 개발자
4. DB/인프라 엔지니어
5. 보안 전문가
6. UX 디자이너
7. 비즈니스 분석가
8. SaaS 전문 컨설턴트
9. QA 매니저
10. DevOps 엔지니어

### 3.2 핵심 권장사항

| 전문가 | 권장사항 | 적용 Phase |
|--------|----------|-----------|
| CTO | AI 크레딧 차단 즉시 구현 | 1 |
| 백엔드 개발자 | `checkCreditAllowed()` AI에서 호출 추가 | 1 |
| 프론트엔드 개발자 | StorageExceededDialog 패턴 재사용 | 1 |
| DB 엔지니어 | 빌링키 별도 컬렉션 분리 | 3 |
| 보안 전문가 | AES-256-GCM 암호화, 웹훅 서명 검증 | 3 |
| UX 디자이너 | 크레딧 80% 사전 경고, 원클릭 충전 | 1-4 |
| 비즈니스 분석가 | 연정액 = 월정액 x 10 (2개월 무료) | 3 |
| SaaS 컨설턴트 | 후등록 모델 채택 (가입 장벽 낮춤) | 5 |
| QA 매니저 | 결제 플로우 테스트 커버리지 100% | 3 |
| DevOps | 분산 락(Redlock) 중복 결제 방지 | 3 |

### 3.3 Critical Issues

| 항목 | 현재 상태 | 위험도 | 해결 Phase |
|------|----------|--------|-----------|
| AI 크레딧 차단 미구현 | 무제한 사용 가능 | **높음** | 1 |
| 결제 멱등성 없음 | 중복 결제 가능 | **높음** | 3 |

---

## 4. 구현 로드맵

### Phase 1: AI 크레딧 한도 차단 (1주)

**목표**: AI 호출 시 크레딧 부족하면 차단

**작업 내용**:
1. `creditService.js`에 `checkAndBlockIfExceeded()` 함수 추가
2. `aims_rag_api`의 `/chat` 엔드포인트에 체크 로직 삽입
3. `CreditExceededDialog` 컴포넌트 구현
4. 테스트 케이스 작성

**수정/생성 파일**:
```
backend/api/aims_api/lib/creditService.js (수정)
backend/api/aims_rag_api/app.py (수정)
frontend/aims-uix3/src/shared/ui/CreditExceededDialog/ (신규)
frontend/aims-uix3/src/features/chat/ChatPanel.tsx (수정)
```

---

### Phase 2: 구독 관리 UI (2주)

**목표**: 사용자가 구독 상태 확인 및 관리

**작업 내용**:
1. `subscriptions` 컬렉션 생성 (마이그레이션)
2. 구독 관리 API 구현 (조회)
3. SubscriptionPage 구현
4. UsageQuotaWidget 클릭 연동

**신규 파일**:
```
backend/api/aims_api/routes/subscription-routes.js
backend/api/aims_api/migrations/create-subscriptions.js
frontend/aims-uix3/src/pages/SubscriptionPage/
frontend/aims-uix3/src/services/subscriptionService.ts
```

---

### Phase 3: PG 연동 (3주)

**목표**: 실제 결제 처리

**PG 후보**:
| PG | 장점 | 수수료 |
|----|------|--------|
| 토스페이먼츠 (**권장**) | API 우수, 문서 좋음 | 2.8%+VAT |
| 나이스페이 | 점유율 1위 | 2.5%+VAT |
| 카카오페이 | 간편결제 UX | 2.5%+VAT |

**작업 내용**:
1. 토스페이먼츠 연동 라이브러리 구현
2. 빌링키 발급/저장/암호화 (AES-256-GCM)
3. 웹훅 처리 (결제 성공/실패, 서명 검증)
4. 정기결제 스케줄러 (agenda.js + Redlock)
5. 결제 내역 관리

**신규 파일**:
```
backend/api/aims_api/lib/tossPaymentsService.js
backend/api/aims_api/lib/billingService.js
backend/api/aims_api/routes/payment-routes.js
backend/api/aims_api/routes/webhook-routes.js
backend/api/aims_api/cron/billingScheduler.js
frontend/aims-uix3/src/features/payment/
```

---

### Phase 4: 추가 크레딧 충전 (1주)

**목표**: 크레딧 부족 시 추가 구매

**작업 내용**:
1. `credit_purchases` 컬렉션 생성
2. 크레딧 차감 로직 수정 (월정액 우선 → FIFO)
3. 충전 API 및 UI 구현

**신규 파일**:
```
backend/api/aims_api/routes/credit-routes.js
frontend/aims-uix3/src/features/credit-purchase/
```

---

### Phase 5: 무료체험 자동 전환 (1주)

**목표**: 30일 후 자동 유료 전환

**정책**:
- 후등록 모델: 체험 중 카드 등록 불필요
- 체험 종료 시: 결제 수단 등록 유도
- 미등록 시: 기능 제한 (데이터 유지 30일)

**작업 내용**:
1. 무료체험 만료 스케줄러
2. 이메일 알림 (7일/3일/1일 전)
3. 기능 제한 로직 (read-only 모드)
4. 카드 등록 유도 UI

**신규 파일**:
```
backend/api/aims_api/cron/trialExpirationScheduler.js
backend/api/aims_api/lib/emailService.js (수정)
frontend/aims-uix3/src/features/trial-expired/
```

---

## 5. 데이터베이스 스키마

### 5.1 subscriptions 컬렉션

```javascript
{
  _id: ObjectId,
  user_id: ObjectId,
  tier: 'free_trial' | 'standard' | 'premium' | 'vip',
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'paused',
  billing_cycle: 'monthly' | 'yearly',
  price: number,

  // 기간
  trial_start: Date,
  trial_end: Date,
  current_period_start: Date,
  current_period_end: Date,

  // 결제 정보
  billing_key_id: ObjectId | null,
  auto_renew: boolean,
  next_billing_date: Date | null,

  // 재시도
  retry_count: number,
  last_retry_at: Date | null,

  // 메타
  created_at: Date,
  updated_at: Date,
  canceled_at: Date | null
}
```

### 5.2 billing_keys 컬렉션

```javascript
{
  _id: ObjectId,
  user_id: ObjectId,
  pg_provider: 'tosspayments' | 'nicepay',
  billing_key_encrypted: string,  // AES-256-GCM
  card_company: string,
  card_number_masked: string,
  card_type: 'credit' | 'debit',
  created_at: Date,
  is_active: boolean
}
```

### 5.3 payment_history 컬렉션

```javascript
{
  _id: ObjectId,
  subscription_id: ObjectId,
  user_id: ObjectId,
  type: 'subscription' | 'credit_purchase' | 'refund',
  amount: number,
  status: 'pending' | 'completed' | 'failed' | 'refunded',
  pg_transaction_id: string,
  receipt_url: string | null,
  created_at: Date,
  completed_at: Date | null
}
```

### 5.4 credit_purchases 컬렉션

```javascript
{
  _id: ObjectId,
  user_id: ObjectId,
  payment_id: ObjectId,
  package: 'small' | 'basic' | 'large' | 'bulk',
  credits: number,
  remaining_credits: number,
  status: 'active' | 'exhausted',
  created_at: Date,
  exhausted_at: Date | null
}
```

### 5.5 인덱스 전략

```javascript
// subscriptions
{ user_id: 1 }
{ status: 1, next_billing_date: 1 }
{ trial_end: 1 }

// billing_keys
{ user_id: 1, is_active: 1 }

// payment_history
{ user_id: 1, created_at: -1 }
{ subscription_id: 1 }

// credit_purchases
{ user_id: 1, status: 1 }
```

---

## 6. 보안 고려사항

### 6.1 PCI-DSS 컴플라이언스

| 항목 | 대응 방안 |
|------|----------|
| 카드 정보 저장 금지 | 빌링키만 토큰화하여 저장 |
| 빌링키 암호화 | AES-256-GCM (환경변수로 키 관리) |
| 웹훅 검증 | IP 화이트리스트 + HMAC-SHA256 서명 |
| 로그 마스킹 | 카드번호, 빌링키 마스킹 처리 |

### 6.2 API 보안

- 결제 관련 API: Rate limiting (분당 10회)
- 웹훅 엔드포인트: 서명 검증 필수
- 민감 정보: HTTPS 필수

---

## 7. 결제 플로우

### 7.1 무료체험 → 유료 전환

```
사용자 가입 (free_trial)
    ↓ 30일
무료체험 종료 7일 전 이메일 알림
    ↓
무료체험 종료 시
    ├─ 카드 등록됨 → 자동 결제 → standard 전환
    └─ 카드 미등록 → 기능 제한 (read-only)
        ↓ 30일
    데이터 보관 기간 만료 → 계정 정리
```

### 7.2 정기결제 실패 처리

```
결제 실패
    ↓ 1일 후
1차 재시도 → 실패
    ↓ 3일 후
2차 재시도 → 이메일 알림 → 실패
    ↓ 7일 후
3차 재시도 → 긴급 알림 → 실패
    ↓
구독 일시정지 (past_due) → 기능 제한
    ↓ 7일 유예
구독 취소 (canceled) → free_trial 다운그레이드
```

---

## 8. 테스트 계획

### 8.1 Phase 1 검증

**단위 테스트**:
- `checkAndBlockIfExceeded()` 함수 테스트
- 무제한 사용자 통과 확인
- 한도 초과 시 차단 확인

**통합 테스트**:
- AI 채팅 요청 → 크레딧 체크 → 차단/허용

**수동 테스트**:
- 테스트 계정 크레딧 소진
- AI 채팅 시도 → 다이얼로그 표시 확인

### 8.2 Phase 3 검증 (결제)

- 토스페이먼츠 테스트 모드 활용
- 카드 등록 → 결제 → 영수증 E2E 테스트
- 결제 실패 재시도 경계 조건 테스트

---

## 9. 참조 문서

| 문서 | 경로 |
|------|------|
| 티어/크레딧 정책 | [TIER_PRICING_POLICY.md](TIER_PRICING_POLICY.md) |
| 스토리지 한도 구현 | [STORAGE_QUOTA_IMPLEMENTATION.md](STORAGE_QUOTA_IMPLEMENTATION.md) |
| 네트워크 보안 | [NETWORK_SECURITY_ARCHITECTURE.md](NETWORK_SECURITY_ARCHITECTURE.md) |

---

## 10. 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-01-10 | 1.0.0 | 초안 작성 - 10명 전문가 검토 완료 |
