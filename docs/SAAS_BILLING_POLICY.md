# SaaS 과금 방식 가이드

## 개요

AIMS는 업계 표준 SaaS 과금 방식을 채택합니다. 독창적인 방식 대신 **보편적이고 검증된 방식**을 사용하여 사용자 혼란을 최소화합니다.

---

## 일반적인 SaaS 과금 방식 비교

### 1. 일할 계산 (Pro-rata) ✅ **채택**

가장 보편적이고 공정한 방식. Netflix, AWS, Slack 등 대부분의 SaaS가 사용.

| 가입일 | 첫 달 크레딧 | 첫 달 요금 | 다음 달부터 |
|--------|-------------|-----------|------------|
| 1월 15일 | 2,000 × (17/31) ≈ **1,097** | 9,900 × (17/31) ≈ **5,426원** | 매월 1일 전액 |
| 1월 25일 | 2,000 × (7/31) ≈ **452** | 9,900 × (7/31) ≈ **2,235원** | 매월 1일 전액 |
| 1월 1일 | **2,000** (전액) | **9,900원** (전액) | 매월 1일 전액 |

**장점:**
- 공정함 (사용 기간만큼만 과금)
- 예측 가능 (매월 1일 리셋)
- 관리 단순 (모든 사용자 동일 사이클)

**단점:**
- 첫 달 계산 로직 필요

### 2. 첫 달 무료 체험

Netflix, Spotify 등에서 사용. 마케팅 목적.

| 가입일 | 첫 달 | 다음 달부터 |
|--------|-------|------------|
| 1월 15일 | 무료 (2/1까지) | 매월 1일 전액 결제 |

**장점:** 가입 유도 효과
**단점:** 매출 지연, 악용 가능성

### 3. 가입일 기준 월간 사이클 ❌ **기존 방식**

각 사용자의 가입일 기준으로 매월 리셋.

| 사용자 | 가입일 | 리셋일 |
|--------|--------|--------|
| A | 1월 5일 | 매월 5일 |
| B | 1월 15일 | 매월 15일 |
| C | 1월 31일 | 매월 28~31일 (가변) |

**단점:**
- 관리 복잡 (사용자마다 다른 리셋일)
- 말일 가입자 문제 (2월 28일 vs 3월 31일)
- 고객 지원 어려움 ("리셋 언제?"에 답변이 다름)

### 4. 즉시 전액 + 1일 리셋

| 가입일 | 첫 달 | 리셋 |
|--------|-------|------|
| 1월 25일 | 9,900원 전액 | 2/1에 리셋 (6일만 사용) |

**단점:** 말일 가입자에게 매우 불리 → 거의 사용 안 함

---

## AIMS 적용 방식: 일할 계산 (Pro-rata)

### 한 줄 요약

> **"가입한 날부터 그 달 말일까지만 계산해서 첫 달 크레딧을 줍니다. 다음 달부터는 매월 1일에 전체 크레딧이 지급됩니다."**

### 쉬운 예시

```
📅 1월 15일에 일반 티어(월 2,000 크레딧)로 가입했다면?

1월: 15일~31일 = 17일 사용 가능
     → 2,000 × (17/31) = 1,097 크레딧 지급

2월: 1일~28일 = 28일 (한 달 전체)
     → 2,000 크레딧 지급 (전액)

3월: 1일~31일 = 31일 (한 달 전체)
     → 2,000 크레딧 지급 (전액)
```

### 왜 이렇게 하나요?

| 문제 | 해결 |
|------|------|
| 1월 25일 가입 → 6일만 쓰고 2월 1일 리셋? | 첫 달은 6일치만 지급 (공정) |
| 1월 1일 가입 → 31일 다 쓰는데 같은 요금? | 1일 가입은 전액 지급 (당연) |
| 리셋일이 사람마다 달라서 헷갈림 | 모두 매월 1일 리셋 (단순) |

### 핵심 규칙

1. **리셋 시점**: 매월 1일 00:00:00 KST 고정
2. **첫 달**: 남은 일수 비율로 크레딧/요금 계산
3. **다음 달부터**: 매월 1일 전액 지급/결제

### 계산 공식

```
첫 달 크레딧 = 월 크레딧 × (남은 일수 / 해당 월 총 일수)
첫 달 요금 = 월 요금 × (남은 일수 / 해당 월 총 일수)

남은 일수 = 해당 월 총 일수 - 가입일 + 1 (가입일 포함)
```

### 예시

**일반 티어 (월 2,000 크레딧, 9,900원)**

| 가입일 | 남은 일수 | 비율 | 첫 달 크레딧 | 첫 달 요금 |
|--------|----------|------|-------------|-----------|
| 1월 1일 | 31일 | 100% | 2,000 | 9,900원 |
| 1월 15일 | 17일 | 54.8% | 1,097 | 5,426원 |
| 1월 25일 | 7일 | 22.6% | 452 | 2,235원 |
| 1월 31일 | 1일 | 3.2% | 65 | 317원 |

### 사이클 예시

```
사용자 A: 1월 15일 가입

[1월 사이클] 1/15 ~ 1/31 (17일)
- 크레딧: 1,097 (일할 계산)
- 요금: 5,426원

[2월 사이클] 2/1 ~ 2/28 (28일)
- 크레딧: 2,000 (전액)
- 요금: 9,900원

[3월 사이클] 3/1 ~ 3/31 (31일)
- 크레딧: 2,000 (전액)
- 요금: 9,900원
```

---

## UI 표시 규칙

### 사이클 표시

| 기존 | 변경 |
|------|------|
| `~02/05` (혼란) | `2/1 ~ 2/28` 또는 `~2/28` |

### 첫 달 표시

```
📊 이번 달 사용량 (첫 달 - 일할 계산 적용)

크레딧      ██░░░░░░░░  220 / 1,097 (20%)
           ※ 1/15 가입, 17일분 지급

다음 달부터: 2,000 크레딧 (매월 1일 리셋)
```

---

## 엣지 케이스 처리

### 1. 월말 가입 (28~31일)

| 가입일 | 남은 일수 | 크레딧 | 비고 |
|--------|----------|--------|------|
| 1월 28일 | 4일 | 258 | 정상 계산 |
| 1월 31일 | 1일 | 65 | 최소 1일분 지급 |

### 2. 윤년 2월

| 년도 | 2월 일수 | 2/15 가입 시 |
|------|---------|-------------|
| 2024 | 29일 | 15일분 (51.7%) |
| 2025 | 28일 | 14일분 (50.0%) |

### 3. 티어 변경 (업/다운그레이드)

- **즉시 적용**: 변경 시점부터 새 티어 크레딧 일할 계산
- **기존 크레딧**: 소멸 (이월 불가)

```
예: 1월 15일 일반 → 프리미엄 업그레이드
- 1/1~1/14: 일반 크레딧 소멸
- 1/15~1/31: 프리미엄 8,000 × (17/31) = 4,387 크레딧
```

### 4. 해지 후 재가입

- 신규 가입과 동일하게 처리
- 이전 크레딧/데이터 복구 불가

---

## 구현 체크리스트

- [x] 문서 작성
- [x] `calculateOcrCycle()` → 매월 1일 기준으로 변경
- [x] 첫 달 일할 계산 로직 추가
- [x] 프론트엔드 사이클 표시 수정
- [ ] 티어 변경 시 일할 계산 적용 (향후)

---

## 구현 상세

### 백엔드 변경 사항

#### 1. `storageQuotaService.js` - 사이클 계산 함수

**파일**: `backend/api/aims_api/lib/storageQuotaService.js`

```javascript
/**
 * 매월 1일 기준 사이클 계산 (KST)
 * 업계 표준 SaaS 과금 방식: 매월 1일 리셋 + 첫 달 일할 계산
 */
function calculateOcrCycle(subscriptionStartDate) {
  // KST 기준 현재 월의 1일 ~ 말일
  const cycleStartKST = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const cycleEndKST = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  // 첫 달 여부 확인 (가입월과 현재월이 같은지)
  const isFirstMonth = (가입년월 === 현재년월);

  // 일할 계산 비율
  if (isFirstMonth) {
    const subscriptionDay = 가입일;
    remainingDaysInCycle = totalDaysInMonth - subscriptionDay + 1;
    proRataRatio = remainingDaysInCycle / totalDaysInMonth;
  }

  return {
    cycleStart, cycleEnd, daysUntilReset,
    isFirstMonth, proRataRatio,
    totalDaysInCycle, remainingDaysInCycle
  };
}
```

**반환 필드 추가**:
| 필드 | 타입 | 설명 |
|------|------|------|
| `is_first_month` | boolean | 첫 달 여부 |
| `pro_rata_ratio` | number | 일할 계산 비율 (0~1) |
| `total_days_in_cycle` | number | 해당 월 총 일수 |
| `remaining_days_in_cycle` | number | 남은 일수 (첫 달만 해당) |

#### 2. `creditService.js` - 크레딧 정보 조회

**파일**: `backend/api/aims_api/lib/creditService.js`

```javascript
async function getUserCreditInfo(db, analyticsDb, userId, tier, creditQuota,
                                  cycleStart, cycleEnd, daysUntilReset, proRataInfo = {}) {
  const { isFirstMonth = false, proRataRatio = 1.0 } = proRataInfo;

  // 일할 계산 적용된 크레딧 한도
  const effectiveCreditQuota = isUnlimited ? -1 : Math.round(creditQuota * proRataRatio);

  return {
    credit_quota: effectiveCreditQuota,      // 일할 계산 적용된 한도
    credit_quota_full: creditQuota,          // 원래 월간 한도 (참고용)
    is_first_month: isFirstMonth,
    pro_rata_ratio: proRataRatio,
    // ...
  };
}
```

#### 3. `storage-routes.js` - API 엔드포인트

**파일**: `backend/api/aims_api/routes/storage-routes.js`

```javascript
// GET /api/users/me/storage
const creditInfo = await getUserCreditInfo(
  db, analyticsDb, userId, storageInfo.tier, creditQuota,
  cycleStart, cycleEnd, storageInfo.ocr_days_until_reset,
  {
    isFirstMonth: storageInfo.is_first_month,
    proRataRatio: storageInfo.pro_rata_ratio
  }
);
```

### 프론트엔드 변경 사항

#### 1. `userService.ts` - 타입 정의

**파일**: `frontend/aims-uix3/src/services/userService.ts`

```typescript
export interface StorageInfo {
  // 크레딧 정보 (일할 계산 적용)
  credit_quota: number                    // 월 크레딧 한도 (일할 계산 적용)
  credit_quota_full?: number              // 원래 월간 한도 (참고용)
  credit_cycle_start: string              // "YYYY-MM-DD" (매월 1일)
  credit_cycle_end: string                // "YYYY-MM-DD" (해당 월 말일)

  // 일할 계산 정보 (Pro-rata)
  is_first_month?: boolean                // 첫 달 여부
  pro_rata_ratio?: number                 // 일할 계산 비율 (0~1)
  total_days_in_cycle?: number            // 해당 월 총 일수
  remaining_days_in_cycle?: number        // 사이클 내 남은 일수
}
```

#### 2. `UsageQuotaWidget.tsx` - UI 표시

**파일**: `frontend/aims-uix3/src/shared/ui/UsageQuotaWidget/UsageQuotaWidget.tsx`

```tsx
// 첫 달 표시 (일할 계산 적용 시)
const isFirstMonth = storageInfo.is_first_month ?? false
const proRataPercent = storageInfo.pro_rata_ratio
  ? Math.round(storageInfo.pro_rata_ratio * 100) : 100

// 크레딧 툴팁 (매월 1일 리셋, 사이클 종료일 표시)
const creditTooltip = `크레딧: 1,097 / 2,000 (55%) [첫 달 55%] ~2/28`
```

### API 응답 예시

```json
{
  "success": true,
  "data": {
    "tier": "standard",
    "tierName": "일반",

    "credit_quota": 1097,
    "credit_quota_full": 2000,
    "credits_used": 220,
    "credits_remaining": 877,
    "credit_usage_percent": 20.05,

    "credit_cycle_start": "2026-02-01",
    "credit_cycle_end": "2026-02-28",
    "credit_days_until_reset": 23,

    "is_first_month": true,
    "pro_rata_ratio": 0.5484,
    "total_days_in_cycle": 28,
    "remaining_days_in_cycle": 17
  }
}

---

## 참고: 업계 사례

| 서비스 | 과금 방식 | 리셋 시점 |
|--------|----------|----------|
| AWS | 일할 계산 | 매월 1일 |
| Slack | 일할 계산 | 매월 1일 |
| Netflix | 가입일 기준 | 가입 기념일 |
| Notion | 일할 계산 | 매월 1일 |
| GitHub | 일할 계산 | 매월 1일 |

> 대부분의 B2B SaaS는 매월 1일 리셋 + 일할 계산 방식 사용

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-02-05 | 초안 작성 - 일할 계산 방식 채택 결정 |
