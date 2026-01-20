# AR 등록 vs CRS 등록 프로세스 비교 분석

## 개요

AR(Annual Report)과 CRS(Customer Review Service) 등록 프로세스를 비교 분석하여, AR 일괄 등록 로직을 CRS에 적용할 때 **그대로 적용 가능한 부분**과 **수정이 필요한 부분**을 식별합니다.

---

## 1. 현재 구현 상태

| 기능 | AR | CRS |
|------|:--:|:---:|
| 파일 감지 (PDF 판별) | O | O |
| 메타데이터 추출 | O | O |
| 개별 고객 매칭 | O | O |
| CustomerSelectionModal | O | O (재사용) |
| **일괄 등록 모달** | O BatchArMappingModal | X 없음 |
| **분석 훅** | O useArBatchAnalysis | X 없음 |
| 중복 검사 | O 파일해시 | O 파일해시 + 발행일+증권번호 |

---

## 2. 그대로 적용 가능한 부분 (재사용 가능)

### 2.1 100% 재사용 가능한 컴포넌트

| 파일 | 용도 | 재사용 이유 |
|------|------|------------|
| `CustomerDropdown.tsx` | 고객 선택 드롭다운 | 범용 UI, AR/CRS 무관 |
| `CustomerSelectionModal.tsx` | 고객 선택/신규 등록 모달 | 이미 CRS에서도 사용 중 |
| `NewCustomerInputModal.tsx` | 신규 고객 등록 | 이미 CRS에서도 사용 중 |

### 2.2 거의 그대로 사용 가능한 유틸리티 함수

**파일: `arGroupingUtils.ts`** - 95% 재사용 가능

| 함수 | 재사용 | 비고 |
|------|:------:|------|
| `generateFileId()` | O | 범용 |
| `generateGroupId()` | O | 범용 |
| `normalizeCustomerName()` | O | 범용 |
| `determineMatchStatus()` | O | 로직 동일 |
| `isAllGroupsSelected()` | O | 범용 |
| `groupsToTableRows()` | O | 범용 |
| `updateRowCustomerMapping()` | O | 범용 |
| `toggleRowSelection()` | O | 범용 |
| `bulkAssignCustomer()` | O | 범용 |
| `getEffectiveMapping()` | O | 범용 |
| `addCustomerToGroups()` | O | 범용 |

### 2.3 로직 흐름 재사용 가능

```
파일 선택 → PDF 감지 → 메타데이터 추출 → 고객명별 그룹핑 →
고객 검색 → 자동/수동 매핑 → 중복 검사 → 등록
```

이 전체 흐름은 AR과 CRS가 동일합니다.

---

## 3. 수정이 필요한 부분

### 3.1 메타데이터 필드 차이

| 항목 | AR | CRS |
|------|-----|-----|
| **필드 수** | 3개 | 6개 |
| **고객명 소스** | `customer_name` | `contractor_name` |
| **추가 필드** | - | `insured_name`, `fsr_name`, `policy_number` |

**AR 메타데이터:**
```typescript
{
  customer_name: string      // "홍길동 고객님을 위한" 패턴에서 추출
  issue_date: string         // "2025년 9월 9일" → "2025-09-09"
  report_title?: string      // "Annual Review Report"
}
```

**CRS 메타데이터:**
```typescript
{
  product_name?: string      // "무) 실버플랜 변액유니버셜V보험"
  issue_date?: string        // "2025-09-09"
  contractor_name?: string   // 계약자명 (= 고객 매칭용)
  insured_name?: string      // 피보험자명
  fsr_name?: string          // FSR 이름
  policy_number?: string     // "0011423761" (중복 검사용)
}
```

### 3.2 고객명 추출 소스 변경

| 구분 | AR | CRS |
|------|-----|-----|
| 추출 패턴 | "XXX 고객님을 위한" | "계약자 : XXX" |
| 필드명 | `metadata.customer_name` | `metadata.contractor_name` |

**수정 포인트:**
```typescript
// AR (useArBatchAnalysis.ts:193)
const customerName = result.metadata?.customer_name

// CRS (수정 필요)
const customerName = result.metadata?.contractor_name
```

### 3.3 중복 검사 로직 차이

| 검사 | AR | CRS |
|------|-----|-----|
| 1차 | 파일 해시 | 파일 해시 |
| 2차 | 발행일만 | **발행일 + 증권번호** |

**CRS 2차 검사 로직:**
```typescript
// customerReviewProcessor.ts
if (normalizedUploadDate === normalizedExistingDate
    && policyNumber === existingPolicyNumber) {
  isDuplicateIssueDatePolicy = true;
}
```

### 3.4 PDF 감지 함수 차이

| 항목 | AR | CRS |
|------|-----|-----|
| 함수 | `checkAnnualReportFromPDF()` | `checkCustomerReviewFromPDF()` |
| 필수 키워드 | "Annual Review Report" | "Customer Review Service" |
| 반환 필드 | `is_annual_report` | `is_customer_review` |

### 3.5 테이블 컬럼 구성 차이

**AR 테이블:**
`# | 선택 | 파일명 | AR 고객명 | 매핑 고객 | 발행일 | 상태 | 포함`

**CRS 테이블 (필요):**
`# | 선택 | 파일명 | 계약자명 | 매핑 고객 | 증권번호 | 발행일 | 상태 | 포함`

→ **증권번호 컬럼 추가 필요** (중복 검사 시각화)

### 3.6 API 엔드포인트 차이

| 용도 | AR | CRS |
|------|-----|-----|
| 문서 목록 조회 | `/api/customers/{id}/annual-reports` | `/api/customers/{id}/customer-reviews` |
| 플래그 설정 | `setArFlag()` | `setCrFlag()` |
| 백그라운드 파싱 | `/api/ar-background/trigger-parsing` | `/api/cr-background/trigger-parsing` |

---

## 4. 신규 구현 필요 파일

### 4.1 타입 정의
```
신규: types/crBatchTypes.ts
```
- `CrFileInfo` - CRS 파일 정보 (메타데이터 6개 필드)
- `CrFileGroup` - CRS 파일 그룹
- `CrFileTableRow` - CRS 테이블 행
- `CrAnalysisResult` - CRS 분석 결과

### 4.2 분석 훅
```
신규: hooks/useCrBatchAnalysis.ts
```
- `useArBatchAnalysis.ts` 복사 후 수정
- `checkCustomerReviewFromPDF()` 사용
- `contractor_name` 기반 고객 매칭

### 4.3 그룹핑 유틸 (선택)
```
신규 또는 공통화: utils/crGroupingUtils.ts
```
- `arGroupingUtils.ts` 거의 그대로 사용 가능
- 고객명 추출 소스만 파라미터화하면 공통 사용 가능

### 4.4 일괄 매핑 모달
```
신규: components/BatchCrMappingModal/
  ├── BatchCrMappingModal.tsx
  ├── BatchCrMappingModal.css
  ├── CrFileTable.tsx
  ├── CrFileTable.css
  └── index.ts
```

---

## 5. 구현 전략

### Phase 1: CRS 전용 구현

AR 코드를 복사하여 CRS 전용으로 수정:

1. **타입 정의** - `arBatchTypes.ts` → `crBatchTypes.ts`
2. **분석 훅** - `useArBatchAnalysis.ts` → `useCrBatchAnalysis.ts`
3. **그룹핑 유틸** - `arGroupingUtils.ts` → `crGroupingUtils.ts`
4. **모달 컴포넌트** - `BatchArMappingModal/` → `BatchCrMappingModal/`
5. **DocumentRegistrationView.tsx** - CRS 일괄 등록 플로우 추가

### Phase 2: 공통화 리팩토링

동작 확인 후 공통 추상화:
- `BaseFileInfo<TMetadata>` 제네릭 타입
- `useBatchAnalysis<T>` 제네릭 훅
- `BatchMappingModal<T>` 제네릭 컴포넌트

---

## 6. 수정 포인트 요약 체크리스트

### 타입/인터페이스
- [ ] `ArFileInfo` → `CrFileInfo` (메타데이터 필드 변경)
- [ ] `ArFileGroup` → `CrFileGroup`
- [ ] `ArFileTableRow` → `CrFileTableRow`

### 훅
- [ ] `checkAnnualReportFromPDF` → `checkCustomerReviewFromPDF`
- [ ] `is_annual_report` → `is_customer_review`
- [ ] `customer_name` → `contractor_name`

### 중복 검사
- [ ] 발행일만 → 발행일 + 증권번호

### UI
- [ ] 모달 제목: "AR 일괄 매핑" → "CRS 일괄 매핑"
- [ ] 테이블 컬럼: 증권번호 컬럼 추가
- [ ] 안내 문구 변경

### API
- [ ] `processAnnualReportFile()` → `processCustomerReviewFile()`
- [ ] `setArFlag()` → `setCrFlag()` (이미 존재)

---

## 7. 핵심 파일 참조

| 역할 | AR 파일 (참조) | CRS 파일 (생성/수정) |
|------|---------------|---------------------|
| 타입 | `types/arBatchTypes.ts` | `types/crBatchTypes.ts` |
| 훅 | `hooks/useArBatchAnalysis.ts` | `hooks/useCrBatchAnalysis.ts` |
| 유틸 | `utils/arGroupingUtils.ts` | `utils/crGroupingUtils.ts` |
| 모달 | `components/BatchArMappingModal/` | `components/BatchCrMappingModal/` |
| 프로세서 | `utils/annualReportProcessor.ts` | `utils/customerReviewProcessor.ts` (기존) |
| PDF 파서 | `features/customer/utils/pdfParser.ts` | 동일 파일 (기존) |

---

## 결론

**재사용 가능 비율:** 약 70-80%

- **그대로 사용:** CustomerDropdown, 모달들, 그룹핑 유틸 함수 대부분
- **복사 후 수정:** 타입 정의, 분석 훅, 테이블 컴포넌트
- **새로 작성:** CRS 전용 안내 문구, 증권번호 컬럼

AR 일괄 등록의 아키텍처와 UX 패턴은 CRS에 거의 그대로 적용 가능하며, 주요 변경점은 **메타데이터 필드 구조**와 **중복 검사 조건**입니다.
