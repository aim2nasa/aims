# 보너스 크레딧 사후 정산 버그 수정 보고서

**작성일**: 2026-03-23
**커밋**: `454a6b60` — `fix(credit): 보너스 크레딧 사후 정산 연결 + race condition 해결`
**심각도**: Critical (과금 정확성 직결)
**상태**: 해결 완료 + 실환경 검증 통과

---

## 1. 문제 발견

### 증상
사용자(곽승철)가 2월에 보너스 크레딧 96,150C를 구매했으나, 3월에도 동일한 잔액이 표시됨.
하단 위젯: `크레딧: 3,110 / 106,150 (월정액 10,000+추가 96,150) ~3/31`

### 기대 동작
- 월정액(10,000C) 먼저 소비 → 초과분은 보너스에서 차감 → 남은 보너스는 이월
- 2월에 월정액 초과 사용 시, 초과분이 보너스 96,150에서 차감되어야 함
- 3월에는 차감된 잔액이 표시되어야 함

### 실제 동작
- 보너스 잔액이 **영구적으로 96,150C로 고정** (DB `total_used: 0`)
- 매월 1일 사이클 리셋 시 가상 차감도 0으로 복귀 → 보너스가 "부활"
- 결과적으로 보너스 크레딧이 **무한 재사용 가능한 상태**

---

## 2. 근본 원인

### 아키텍처 불일치

AIMS 크레딧 시스템은 두 가지 방식이 혼재:

| 구분 | 월정액 크레딧 | 보너스 크레딧 |
|------|-------------|-------------|
| 저장 방식 | 집계 기반 (aggregation) | 잔액 기반 (balance) |
| 리셋 | 매월 1일 사이클 리셋 | 리셋 없음 (영구 잔액) |
| 사용 추적 | `files.ocr.done_at` + `ai_token_usage` 집계 | `users.bonus_credits.balance` 차감 |

### 핵심 버그: `consumeCredits()` 미연결

```
creditService.js 내 함수 관계도:

  consumeCredits()          ← 구현됨, 호출부 0개 (데드코드)
    └── useBonusCredits()   ← 구현됨, consumeCredits 내부에서만 호출 (데드코드)

  checkCreditWithBonus()    ← 5곳에서 호출, 체크만 수행 (차감 없음)
  checkCreditForDocumentProcessing() ← 내부 API에서 호출, 체크만 수행
```

- `consumeCredits()`: 보너스 차감 로직이 완벽하게 구현되어 있었으나, **어떤 라우트나 서비스에서도 호출하지 않음**
- 크레딧 소비 5개 경로(AI 채팅, OCR, 임베딩, RAG, Summary) 모두 **체크(check)만 하고 차감(deduct)은 하지 않는 상태**
- `credit_transactions` 컬렉션에 `type: 'usage'` 레코드가 **0건** — 한 번도 차감이 실행된 적 없음

### 표시 로직의 가상 차감 문제

```javascript
// storage-routes.js (수정 전)
const monthlyOverage = Math.max(0, credits_used - credit_quota);
const effectiveBonusBalance = Math.max(0, bonusBalance - monthlyOverage);
```

- `effectiveBonusBalance`는 요청 시점마다 계산되는 **가상 값**
- DB의 `bonus_credits.balance`는 변하지 않음
- 새 달 → `credits_used = 0` → `monthlyOverage = 0` → `effectiveBonusBalance = 전체 잔액` → **보너스 부활**

---

## 3. 해결 방안: 사후 정산 (Post-Settlement)

### 설계 결정

5개 크레딧 소비 경로에 개별적으로 `consumeCredits`를 끼워넣는 대신, **사후 정산 패턴**을 채택:

```
크레딧 체크 시점에 자동 정산:
1. 현재 사이클 총 사용량 집계 (getCycleCreditsUsed)
2. 월정액 초과분 = max(0, total_used - credit_quota)
3. 이미 차감된 보너스 = credit_transactions type='usage' 합산
4. 추가 차감 필요분 = 월정액 초과분 - 이미 차감된 보너스
5. 추가 차감 필요분 > 0 이면 useBonusCredits() 실차감
```

### 장점
- 기존 5개 소비 경로를 개별 수정할 필요 없음
- 이중 차감 위험 없음 (`getCycleSettledAmount`로 기정산 추적)
- 새 소비 경로 추가 시에도 자동으로 정산됨

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `creditService.js` | `settleBonusCredits()` 함수 추가 (사후 정산), `getCycleSettledAmount()` 함수 추가 (이중 차감 방지), `useBonusCredits()` 원자적 패턴 전환, `checkCreditWithBonus()` + `checkCreditForDocumentProcessing()`에 정산 호출 연결 |
| `storage-routes.js` | `/users/me/storage`에 정산 호출 추가, `getCycleSettledAmount` import 통합 |
| `creditService.test.js` | settleBonusCredits mock 통합 테스트 8개 + useBonusCredits 원자적 패턴 테스트 3개 추가 |

---

## 4. Race Condition 해결

### 문제 (Gini 1차 검증에서 발견)

`useBonusCredits`의 기존 패턴:

```javascript
// 비원자적 3단계 — 동시 요청 시 잔액 음수 가능
const user = await collection.findOne({ _id: userId });     // 1. 읽기
if (user.balance < amount) return { success: false };        // 2. 비교
await collection.updateOne({ _id: userId }, { $inc: ... });  // 3. 쓰기
```

### 해결

```javascript
// 원자적 단일 연산 — $gte 필터로 잔액 보장
const result = await collection.findOneAndUpdate(
  { _id: userId, 'bonus_credits.balance': { $gte: amount } },  // 조건 + 차감 통합
  { $inc: { 'bonus_credits.balance': -amount, 'bonus_credits.total_used': amount } },
  { returnDocument: 'after' }
);
if (!result) return { success: false, reason: 'insufficient_balance' };
```

MongoDB `findOneAndUpdate`는 문서 수준 잠금으로 처리되므로, 동시 요청 중 하나만 성공하고 나머지는 `null` 반환.

---

## 5. 검증 결과

### 5-1. 자동화 테스트

| 테스트 | 결과 |
|--------|------|
| creditService 단위 테스트 | **57/57 PASS** |
| aims_api 전체 테스트 (pre-commit) | **1,076/1,076 PASS** |

### 5-2. Gini 품질 검증

| 차수 | 결과 | 지적 사항 |
|------|------|-----------|
| 1차 | **FAIL** | Race Condition (Major), 테스트 부족 (Major) |
| 2차 (수정 후) | **PASS** | 5대 품질 기준 전부 충족 |

### 5-3. 실환경 검증 (서버 v0.1.150)

서버에 배포 후 실제 MongoDB에서 시뮬레이션 실행:

| 테스트 시나리오 | 결과 | 상세 |
|----------------|------|------|
| 월정액 내 사용 → 정산 안 함 | **PASS** | `{ settled: false, reason: 'within_quota' }`, 잔액 변동 없음 |
| 월정액 초과 → 보너스 실차감 | **PASS** | 초과 2,110.39C → DB에서 실차감 → 잔액 94,039.61C |
| DB `credit_transactions` 기록 | **PASS** | `type: 'usage'` 레코드 1건 생성, `resource_type: 'monthly_overage_settlement'` |
| 동일 사이클 재호출 → 이중 차감 방지 | **PASS** | `{ settled: false, reason: 'already_settled' }` |
| 데이터 복원 | **PASS** | 잔액 96,150, total_used 0으로 원복 완료 |

---

## 6. 크레딧 소비 흐름 (수정 후)

```
사용자 행동 (OCR, AI 채팅 등)
  │
  ▼
사용 기록 저장 (files.ocr.done_at / ai_token_usage)
  │
  ▼
크레딧 체크 시점 (checkCreditWithBonus / checkCreditForDocumentProcessing / storage API)
  │
  ├── settleBonusCredits() 자동 호출
  │     │
  │     ├── 월정액 내 사용 → 정산 안 함 (within_quota)
  │     │
  │     └── 월정액 초과 →
  │           ├── getCycleSettledAmount()로 기정산분 확인
  │           ├── 추가 차감 필요분 계산
  │           └── useBonusCredits()로 DB 실차감 (findOneAndUpdate 원자적)
  │                 ├── bonus_credits.balance 감소
  │                 ├── bonus_credits.total_used 증가
  │                 └── credit_transactions type='usage' 기록
  │
  ▼
크레딧 허용/차단 판정 (월정액 잔여 + 보너스 실잔액 합산)
```

---

## 7. 영향 범위

### 변경 없는 부분
- 월정액 크레딧 집계 방식 (기존 유지)
- 프론트엔드 표시 로직 (bonus_balance가 실잔액을 반영하므로 자동 정확)
- credit_pending 문서 처리 흐름
- 관리자(admin) 무제한 크레딧

### 과거 데이터
- 2월 초과 사용분은 소급 차감되지 않음 (사이클 리셋으로 집계 범위 밖)
- 현재 보너스 잔액 96,150C는 그대로 유지
- 향후 월정액 초과 사용 시부터 정상 차감 시작

---

## 8. 관련 파일

| 파일 | 역할 |
|------|------|
| `backend/api/aims_api/lib/creditService.js` | 크레딧 서비스 핵심 로직 |
| `backend/api/aims_api/routes/storage-routes.js` | 스토리지/크레딧 API |
| `backend/api/aims_api/lib/__tests__/creditService.test.js` | 크레딧 서비스 테스트 (57개) |
| `frontend/aims-uix3/src/shared/ui/UsageQuotaWidget/UsageQuotaWidget.tsx` | 크레딧 표시 위젯 |
| `docs/SAAS_BILLING_POLICY.md` | 과금 정책 문서 |
