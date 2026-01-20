# AR 대량 파일 등록 성능 분석 보고서

> 작성일: 2026-01-21
> 분석 범위: AR 일괄 등록 파이프라인 전체

---

## 1. 개요

AR(Annual Report) 일괄 등록 기능의 대량 파일 처리 시 발생할 수 있는 성능 문제를 분석하고, 개선 방안을 제시합니다.

### 분석 대상 파일

| 파일 | 역할 |
|------|------|
| `hooks/useArBatchAnalysis.ts` | PDF 분석 및 상태 관리 |
| `utils/arGroupingUtils.ts` | 고객명 그룹핑 및 유틸리티 |
| `components/BatchArMappingModal/ArFileTable.tsx` | 테이블 렌더링 |
| `components/BatchArMappingModal/BatchArMappingModal.tsx` | 모달 컨테이너 |

---

## 2. 핵심 병목 지점

### 2.1 O(n²) 복잡도: 고객명 그룹핑

**위치**: `arGroupingUtils.ts:92-98`

```typescript
// 현재 구현 - O(n × m) where n=파일수, m=그룹수
for (const arFile of arFiles) {           // 외부 루프: n회
  const normalizedName = normalizeCustomerName(customerName)

  let foundKey: string | null = null
  for (const [key] of groups) {           // 내부 루프: m회 (최악 n회)
    if (normalizeCustomerName(key) === normalizedName) {
      foundKey = key
      break
    }
  }
  // ...
}
```

**문제점**:
- 파일마다 모든 기존 그룹을 순회하며 비교
- `normalizeCustomerName()` 매 비교마다 2회 호출 (키와 값 모두)
- 500개 파일, 100개 고유 고객 → **50,000회 비교 + 100,000회 정규화**

---

### 2.2 O(n) 반복 조회: getEffectiveMapping

**위치**: `arGroupingUtils.ts:366`

```typescript
export function getEffectiveMapping(row: ArFileTableRow, groups: ArFileGroup[]) {
  // ...
  const group = groups.find(g => g.groupId === row.groupId)  // O(n)
  // ...
}
```

**문제점**:
- 테이블 렌더링 시 **모든 행**에서 호출
- 필터링, 정렬, 매핑 상태 계산에서 반복 호출
- 500행 × 100그룹 → **50,000회 find 비교**

---

### 2.3 순차적 PDF 분석

**위치**: `useArBatchAnalysis.ts:171-206`

```typescript
for (let i = 0; i < files.length; i++) {
  const file = files[i]
  const result = await checkAnnualReportFromPDF(file)  // 순차 대기
  // ...
}
```

**문제점**:
- PDF 분석을 한 번에 하나씩 순차 처리
- 청크 분할 없음 → 메모리 해제 기회 없음
- 500개 파일 × 200ms = **100초 (1분 40초)**

---

### 2.4 순차적 고객 검색 API

**위치**: `useArBatchAnalysis.ts:242-248`

```typescript
for (let i = 0; i < groupEntries.length; i++) {
  const [customerName, files] = groupEntries[i]
  matchingCustomers = await AnnualReportApi.searchCustomersByName(customerName, userId)
  // ...
}
```

**문제점**:
- 고유 고객명마다 순차적 API 호출
- 100명 × 300ms 네트워크 지연 = **30초**
- 병렬 처리 시 6초로 단축 가능 (5배 개선)

---

### 2.5 전체 배열 복사

**위치**: `arGroupingUtils.ts` 전역

```typescript
export function updateRowCustomerMapping(rows, fileId, customerId, customerName) {
  return rows.map(row => {  // 전체 배열 새로 생성
    if (row.fileInfo.fileId !== fileId) return row
    return { ...row, ...updates }
  })
}
```

**문제점**:
- 1개 행 업데이트 → 1,000개 행 전체 map 실행
- 100개 행 일괄 업데이트 → 100,000개 객체 할당
- GC 부하 증가

---

## 3. 파일 수별 예상 성능

| 파일 수 | 고유 고객 | 그룹핑 비교 | 분석 시간 | API 호출 | 총 시간 | 메모리 |
|---------|-----------|------------|----------|----------|---------|--------|
| 50 | 10 | 500 | 10초 | 3초 | ~15초 | ~100MB |
| 100 | 20 | 2,000 | 20초 | 6초 | ~30초 | ~200MB |
| 200 | 40 | 8,000 | 40초 | 12초 | ~1분 | ~400MB |
| **500** | 100 | **50,000** | **100초** | **30초** | **~2.5분** | **~1GB** |
| 1,000 | 200 | 200,000 | 200초 | 60초 | ~5분 | ~2GB |

---

## 4. 사용자 체감 영향

### 4.1 분석 단계 (500개 파일 기준)

| 단계 | 소요 시간 | 사용자 체감 |
|------|----------|------------|
| PDF 분석 | 1분 40초 | 진행률 표시되어 대기 가능 |
| 고객 그룹핑 | 2-5초 | UI 블로킹 발생 |
| 고객 검색 API | 30초 | 진행률 표시됨 |
| **총합** | **~2.5분** | **답답함** |

### 4.2 테이블 상호작용

| 동작 | 예상 지연 | 사용자 체감 |
|------|----------|------------|
| 고객 드롭다운 열기 | 200-500ms | 약간 느림 |
| 1개 행 매핑 변경 | 1-2초 | 불편함 |
| 100개 행 일괄 매핑 | 5-10초 | 매우 불편 |
| 정렬/필터 변경 | 1-3초 | 불편함 |

### 4.3 등록 단계

| 상황 | 소요 시간 | 사용자 체감 |
|------|----------|------------|
| 기존 고객만 (500개) | 2-3분 | 진행률 표시됨 |
| 신규 고객 50명 포함 | 3-4분 | 답답함 |
| 신규 고객 100명 포함 | 5분+ | 매우 답답함 |

---

## 5. 개선 방안

### 5.1 P0 (즉시 수정 - 100배 성능 개선)

#### 1) O(n²) → O(n) 그룹핑 알고리즘

```typescript
// Before: O(n × m)
for (const arFile of arFiles) {
  for (const [key] of groups) {
    if (normalizeCustomerName(key) === normalizedName) { ... }
  }
}

// After: O(n)
export function groupArFilesByCustomerName(arFiles: ArFileInfo[]): Map<string, ArFileInfo[]> {
  const normalizedMap = new Map<string, { originalName: string; files: ArFileInfo[] }>()

  for (const arFile of arFiles) {
    const customerName = arFile.metadata.customer_name
    if (!customerName) {
      // __UNKNOWN__ 처리
      continue
    }

    const normalized = normalizeCustomerName(customerName)

    if (normalizedMap.has(normalized)) {
      normalizedMap.get(normalized)!.files.push(arFile)
    } else {
      normalizedMap.set(normalized, {
        originalName: customerName,
        files: [arFile]
      })
    }
  }

  // 원본 형태로 변환
  const result = new Map<string, ArFileInfo[]>()
  for (const { originalName, files } of normalizedMap.values()) {
    result.set(originalName, files)
  }
  return result
}
```

**효과**: 50,000회 비교 → 500회 (100배 개선)

#### 2) groupId → group Map 캐싱

```typescript
// ArFileTable.tsx 또는 useArBatchAnalysis.ts에서
const groupMap = useMemo(
  () => new Map(groups.map(g => [g.groupId, g])),
  [groups]
)

// getEffectiveMapping 수정
export function getEffectiveMapping(
  row: ArFileTableRow,
  groupMap: Map<string, ArFileGroup>  // groups 배열 대신 Map
) {
  const group = groupMap.get(row.groupId)  // O(1)
  // ...
}
```

**효과**: 50,000회 find → 500회 Map.get (100배 개선)

---

### 5.2 P1 (사용자 체감 개선)

#### 3) 청크 기반 PDF 분석

```typescript
const CHUNK_SIZE = 50

async function analyzeArFilesChunked(files: File[]) {
  const results: ArFileInfo[] = []

  for (let i = 0; i < files.length; i += CHUNK_SIZE) {
    const chunk = files.slice(i, i + CHUNK_SIZE)

    // 청크 내 병렬 처리
    const chunkResults = await Promise.all(
      chunk.map(file => analyzeFile(file))
    )
    results.push(...chunkResults.filter(Boolean))

    // 청크 간 GC 기회 제공
    await new Promise(resolve => setTimeout(resolve, 0))

    // 진행률 업데이트
    updateProgress((i + chunk.length) / files.length * 50)
  }

  return results
}
```

**효과**: 메모리 피크 50% 감소, 분석 시간 30% 단축

#### 4) 고객 검색 병렬화 (동시성 제한)

```typescript
import pLimit from 'p-limit'

const limit = pLimit(5)  // 최대 5개 동시 요청

async function searchCustomersParallel(customerNames: string[], userId: string) {
  const results = await Promise.all(
    customerNames.map(name =>
      limit(() => AnnualReportApi.searchCustomersByName(name, userId))
    )
  )
  return results
}
```

**효과**: 30초 → 6초 (5배 개선)

---

### 5.3 P2 (추가 최적화)

#### 5) 테이블 가상화 (react-virtual)

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

const rowVirtualizer = useVirtualizer({
  count: filteredRows.length,
  getScrollElement: () => tableContainerRef.current,
  estimateSize: () => 40,
  overscan: 10,
})

// 가시 영역 행만 렌더링
{rowVirtualizer.getVirtualItems().map(virtualRow => (
  <TableRow key={virtualRow.key} row={filteredRows[virtualRow.index]} />
))}
```

**효과**: 500행 전체 렌더 → 20행만 렌더 (25배 DOM 감소)

#### 6) Immer를 통한 불변 업데이트 최적화

```typescript
import { produce } from 'immer'

function updateRowCustomerMapping(rows, fileId, customerId, customerName) {
  return produce(rows, draft => {
    const row = draft.find(r => r.fileInfo.fileId === fileId)
    if (row) {
      row.individualCustomerId = customerId
      row.individualCustomerName = customerName
    }
  })
}
```

**효과**: 구조적 공유로 메모리 할당 90% 감소

---

## 6. 개선 우선순위 요약

| 순위 | 작업 | 예상 효과 | 난이도 | 소요 시간 |
|------|------|----------|--------|----------|
| P0-1 | O(n²) 그룹핑 수정 | 100배 빠름 | 낮음 | 30분 |
| P0-2 | groupMap 캐싱 | 100배 빠름 | 낮음 | 1시간 |
| P1-1 | 청크 PDF 분석 | 30% 빠름, 메모리 50% 감소 | 중간 | 2시간 |
| P1-2 | 고객 검색 병렬화 | 5배 빠름 | 낮음 | 1시간 |
| P2-1 | 테이블 가상화 | DOM 25배 감소 | 높음 | 1일 |
| P2-2 | Immer 도입 | 메모리 90% 감소 | 중간 | 3시간 |

---

## 7. 권장 파일 수 제한

| 상황 | 권장 파일 수 | 사유 |
|------|-------------|------|
| **현재 상태** | 100개 이하 | 2분 이내 완료 |
| P0 수정 후 | 300개 이하 | 그룹핑/렌더링 쾌적 |
| P0+P1 수정 후 | 500개 이하 | 전체 파이프라인 쾌적 |
| 전체 최적화 후 | 1,000개+ | 가상화로 UI 쾌적 |

---

## 8. 테스트 시나리오

### 8.1 그룹핑 성능 테스트

```typescript
// 콘솔에서 실행
const testFiles = Array(500).fill(null).map((_, i) => ({
  metadata: { customer_name: `테스트고객${i % 100}` },
  fileId: `file_${i}`,
  file: new File([], `test_${i}.pdf`),
  duplicateStatus: { isHashDuplicate: false, isIssueDateDuplicate: false },
  included: true,
}))

console.time('grouping')
groupArFilesByCustomerName(testFiles)
console.timeEnd('grouping')

// 목표: < 100ms
// 현재 예상: 2-5초
```

### 8.2 getEffectiveMapping 성능 테스트

```typescript
const testGroups = Array(100).fill(null).map((_, i) => ({
  groupId: `group_${i}`,
  customerNameFromAr: `고객${i}`,
  files: [],
  matchingCustomers: [],
  matchStatus: 'auto',
  selectedCustomerId: `cust_${i}`,
}))

const testRows = Array(500).fill(null).map((_, i) => ({
  fileInfo: { fileId: `file_${i}` },
  groupId: `group_${i % 100}`,
  individualCustomerId: null,
}))

console.time('mapping')
testRows.forEach(row => getEffectiveMapping(row, testGroups))
console.timeEnd('mapping')

// 목표: < 50ms
// 현재 예상: 500ms+
```

---

## 9. 결론

현재 AR 일괄 등록 시스템은 **100개 이하 파일**에서는 원활하게 동작하지만, **500개 이상**에서는 사용자 경험이 크게 저하됩니다.

**즉시 적용 가능한 P0 수정**(O(n²) 그룹핑 + groupMap 캐싱)만으로도 **100배 성능 개선**이 가능하며, 이는 약 **1.5시간** 작업으로 완료할 수 있습니다.

---

## 참조 문서

- [AR/CRS 일괄 등록 프로세스 비교](AR_CRS_BATCH_REGISTRATION_COMPARISON.md)
- [AR 다중 업로드 UX 분석](AR_MULTI_UPLOAD_UX_ANALYSIS.md)
