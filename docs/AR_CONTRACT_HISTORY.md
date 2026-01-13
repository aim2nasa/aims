# AR 기반 계약 이력 추적 시스템

## 1. 개요

Annual Report(AR)를 활용한 **증권번호 중심의 보험계약 이력 추적 시스템**.

여러 발행일의 AR을 업로드하면, 동일 증권번호의 계약이 시간에 따라 어떻게 변경되었는지 자동으로 추적합니다.

---

## 2. 핵심 개념

### 2.1 Annual Report (AR)

AR은 특정 발행일 기준으로 고객이 보유한 **모든 보험계약의 스냅샷**입니다.

```
AR 발행일 2024.01.21
├── 계약 A (증권번호: 0013224973) → 보험료 121,920원
├── 계약 B (증권번호: 0013535928) → 보험료 31,920원
└── 계약 C (증권번호: 0013667842) → 보험료 45,000원
```

### 2.2 증권번호 = 유일 식별자

증권번호는 보험계약을 유일하게 식별하는 키입니다.

```
증권번호 "0013224973"의 이력:
├── AR 2024.01.21 발행 → 스냅샷 #1: 보험료 121,920원
├── AR 2024.08.15 발행 → 스냅샷 #2: 보험료 125,000원 (변경!)
└── AR 2025.08.29 발행 → 스냅샷 #3: 보험료 130,000원 (변경!)
```

### 2.3 스냅샷

각 AR 발행일 기준의 계약 정보 기록입니다.

| 필드 | 설명 |
|------|------|
| `issueDate` | AR 발행일 |
| `status` | 계약상태 (정상, 해지, 실효 등) |
| `premium` | 보험료(원) |
| `coverageAmount` | 가입금액(만원) |
| `insurancePeriod` | 보험기간 |
| `paymentPeriod` | 납입기간 |

---

## 3. 데이터 모델

### 3.1 ContractSnapshot

```typescript
interface ContractSnapshot {
  arReportId: string;         // 원본 AR ID
  issueDate: string;          // AR 발행일 (YYYY-MM-DD)
  parsedAt: string;           // AR 파싱 시점 (ISO 8601)
  status: string;             // 계약상태
  premium: number;            // 보험료(원)
  coverageAmount: number;     // 가입금액(만원)
  insurancePeriod: string;    // 보험기간
  paymentPeriod: string;      // 납입기간
}
```

### 3.2 ContractHistory

```typescript
interface ContractHistory {
  policyNumber: string;       // 증권번호 (유일 키)
  insurerName: string;        // 보험사명
  productName: string;        // 보험상품명
  holder: string;             // 계약자
  insured: string;            // 피보험자
  contractDate: string;       // 계약일
  snapshots: ContractSnapshot[];  // 발행일별 스냅샷 (최신순)
  latestSnapshot: ContractSnapshot;  // 가장 최근 스냅샷
}
```

---

## 4. UI 구조

### 4.1 보험계약 탭 (아코디언)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 순번  증권번호     보험상품              계약자  계약상태  보험료           │
├─────────────────────────────────────────────────────────────────────────────┤
│ ▶ 1   0013224973  메트라이프 변액유니버셜  정부균   정상    130,000원       │
│ ▶ 2   0013535928  메트라이프 360 암보험    정부균   정상     31,920원       │
│ ▼ 3   0013667842  삼성생명 건강보험        정부균   정상     45,000원       │
│   ┌─────────────────────────────────────────────────────────────────────────│
│   │ 발행일      계약상태   보험료      가입금액    보험기간   납입기간      │
│   ├─────────────────────────────────────────────────────────────────────────│
│   │ 2025.08.29  정상      45,000원    5,000만원   종신      20년납        │
│   │ 2024.08.15  정상      43,000원    5,000만원   종신      20년납  ←변경 │
│   │ 2024.01.21  정상      40,000원    3,000만원   종신      20년납  ←변경 │
│   └─────────────────────────────────────────────────────────────────────────│
│ ▶ 4   0014112233  한화생명 실손보험        정부균   정상     28,500원       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 변경 필드 하이라이트

이전 스냅샷 대비 변경된 필드는 **오렌지색**으로 하이라이트됩니다.

| CSS 클래스 | 설명 |
|-----------|------|
| `.snapshot-item--changed` | 변경된 필드 (오렌지색, font-weight: 600) |

---

## 5. 주요 함수

### 5.1 groupContractsByPolicyNumber()

AR 목록을 증권번호별 계약 이력으로 변환합니다.

```typescript
import { groupContractsByPolicyNumber } from '@/features/customer/api/annualReportApi'

const arReports = await AnnualReportApi.getAnnualReports(customerId)
const contractHistories = groupContractsByPolicyNumber(arReports)
```

**동작:**
1. 모든 AR의 계약을 순회
2. 증권번호별로 그룹화
3. 각 그룹의 스냅샷을 최신순 정렬
4. `latestSnapshot` 설정

### 5.2 getChangedFields()

두 스냅샷 간 변경된 필드를 감지합니다.

```typescript
import { getChangedFields } from '@/features/customer/api/annualReportApi'

const changedFields = getChangedFields(currentSnapshot, previousSnapshot)
// ['premium', 'coverageAmount'] - 보험료와 가입금액이 변경됨
```

---

## 6. 파일 구조

| 파일 | 역할 |
|------|------|
| `frontend/.../annualReportApi.ts` | 타입 정의, 변환 함수 |
| `frontend/.../ContractsTab.tsx` | UI 컴포넌트 |
| `frontend/.../ContractsTab.css` | 스타일 (11컬럼 그리드) |

---

## 7. 칼럼 구성 (11컬럼)

| # | 컬럼 | 설명 | 폭 범위 |
|---|------|------|---------|
| 1 | 순번 | 행 번호 | 28-50px (고정) |
| 2 | 증권번호 | 계약 유일 식별자 | 70-150px |
| 3 | 보험상품 | 상품명 | 100-350px |
| 4 | 계약자 | 계약자명 | 40-100px |
| 5 | 피보험자 | 피보험자명 | 40-100px |
| 6 | 계약일 | 최초 계약일 | 60-100px |
| 7 | 계약상태 | 정상/해지/실효 | 45-80px |
| 8 | 가입금액 | 만원 단위 | 50-100px |
| 9 | 보험기간 | 종신/80세 등 | 40-80px |
| 10 | 납입기간 | 20년납/전기납 등 | 40-80px |
| 11 | 보험료 | 원 단위 | 60-120px |

---

## 8. 칼럼 폭 기능

### 8.1 자동 폭 조정

데이터 로드 시 각 컬럼의 내용을 분석하여 최적 폭을 자동 계산합니다.

```typescript
// 한글: 12px/문자, 영문/숫자: 7px/문자
const calculateTextWidth = (text: string): number => {
  let width = 0
  for (const char of text) {
    if (/[\u3131-\uD79D\u4E00-\u9FFF]/.test(char)) {
      width += 12  // 전각 문자
    } else {
      width += 7   // 반각 문자
    }
  }
  return width
}
```

### 8.2 드래그 리사이즈

- 헤더 경계에 마우스를 가져가면 리사이즈 커서 표시
- 드래그로 폭 조절 가능
- 조절한 폭은 `localStorage`에 저장 (키: `ar-history-tab`)

---

## 9. 사용 흐름

```
1. AR 문서 업로드
   └── Annual Report 탭에서 PDF 업로드

2. 자동 파싱 및 등록
   └── 파싱 완료 시 보험계약 탭에 자동 등록

3. 보험계약 탭에서 확인
   └── 증권번호별 아코디언으로 이력 조회

4. 다른 발행일 AR 업로드
   └── 동일 증권번호의 스냅샷이 추가됨

5. 변경 이력 추적
   └── 아코디언 펼쳐서 시간순 스냅샷 확인
   └── 변경된 필드는 오렌지색 하이라이트
```

---

## 10. 관련 문서

| 문서 | 내용 |
|------|------|
| [CLAUDE.md](../CLAUDE.md) | 프로젝트 규칙 |
| [CSS_SYSTEM.md](../frontend/aims-uix3/CSS_SYSTEM.md) | CSS 시스템 |
