# 고객·계약 일괄등록 UX 분석

> 작성일: 2025.12.05
> 대상: ExcelRefiner 컴포넌트 (`frontend/aims-uix3/src/components/ContractViews/components/ExcelRefiner.tsx`)

---

## 1. 사용자 플로우

### 현재 플로우
```
파일 업로드 → 포맷 준수 검사 → 컬럼 검증 → 동명이인 처리 → 일괄등록
```

### 문제점

| 단계 | 문제 | 영향도 |
|------|------|--------|
| 파일 업로드 후 | 다음 단계 안내 불명확 | 높음 |
| 검증 방식 | 개별 클릭 vs 전체 검증 버튼 혼재 | 중간 |
| 동명이인 모달 | 진행 상황 (1/3) 표시 없음 | 중간 |
| 등록 결과 | 실패 행의 구체적 사유 확인 어려움 | 중간 |

---

## 2. 버그 및 엣지 케이스

### 2.1 상태 동기화 문제 (높음)

```typescript
// productMatchResult는 Map 객체 포함으로 JSON 직렬화 불가
// 새로고침 시 검증 재실행 필요 → 타이밍 문제 가능
const needsProductValidation = useRef<{ sheetIndex: number; colIndex: number } | null>(null)
```

**증상**: 새로고침 후 상품명 검증 상태가 일시적으로 초기화됨

### 2.2 빠른 연속 검증 경쟁 상태 (높음)

```typescript
// 두 컬럼을 빠르게 연속 클릭 시
const result = await validateProductNames(currentSheet.data, colIndex)
setProductMatchResult(result)  // 이전 검증 결과 덮어씌움
```

**증상**: 첫 검증 완료 전 두 번째 검증 시작 시 결과 충돌

### 2.3 동명이인 모달 데이터 불일치 (높음)

```typescript
// 모달 열린 상태에서 행 삭제 시
// individualCustomers의 rowIndex 변경 → corporateSheet rowIndex와 불일치
```

**증상**: 잘못된 고객 데이터가 매칭될 수 있음

### 2.4 컬럼 삭제 후 편집 상태 (중간)

```typescript
// 컬럼 삭제 후 editingCell에 삭제된 컬럼 인덱스 남아있음
// 같은 위치 편집 시도 시 오류 발생 가능
```

### 2.5 시트 전환 시 필터 유지 (낮음)

```typescript
const handleSheetChange = useCallback((index: number) => {
  setActiveSheetIndex(index)
  // productStatusFilter 초기화 안 함 → 다른 시트에 적용됨
}, [])
```

---

## 3. 에러 처리 및 피드백

### 현재 상태

| 메커니즘 | 용도 | 문제점 |
|----------|------|--------|
| 액션 로그 | 작업 결과 표시 | 일시적, 덮어씌워짐 |
| AppleConfirm | 파괴적 작업 확인 | 정상 |
| 검증 상태 색상 | 컬럼/시트 상태 | 색상 의미 혼동 |
| 결과 모달 | 등록 결과 | 실패 사유 불명확 |

### 개선 필요

1. **네트워크 에러 재시도 UI 없음**
   ```typescript
   catch (error) {
     console.error('상품명 검증 오류:', error)
     showAlert({ message: '오류 발생' })  // 재시도 옵션 없음
   }
   ```

2. **셀 편집 유효성 검사 없음**
   - 날짜 형식 등 잘못된 값 저장 가능
   - 나중에 검증에서 실패

3. **삭제 후 자동 재검증 안 함**
   - 행/컬럼 삭제 후 수동 재검증 필요
   - 휴먼 에러 가능성

---

## 4. 상태 표시 명확성

### 색상 사용 현황

| 색상 | 의미 | 사용처 |
|------|------|--------|
| 초록 | success, valid, original | 시트탭, 컬럼헤더, 셀 |
| 주황 | warning, modified | 시트탭, 컬럼헤더, 셀 |
| 빨강 | error, invalid, unmatched | 시트탭, 컬럼헤더, 셀 |
| 파랑 | primary, selected, validating | 행 선택, 로딩 |

### 문제점

1. **색상 과다**: 사용자가 색상 의미 혼동
2. **상태 우선순위 불명확**: 행이 여러 상태 동시 보유 시
3. **위자드 불완전**: 동명이인 처리 단계 미표시
4. **진행률 부족**: "3/5 시트 검증 완료" 같은 표시 없음

---

## 5. 접근성

### 현재 상태

| 항목 | 지원 여부 |
|------|----------|
| 드래그앤드롭 | O |
| 마우스/터치 | O |
| Enter/Esc 단축키 | O (셀 편집) |
| 다크 테마 | O |
| Tab 키 네비게이션 | X |
| Arrow 키 셀 이동 | X |
| ARIA 속성 | X |
| 대용량 파일 가상화 | X |

### 개선 필요

1. **키보드 네비게이션**: Tab/Arrow로 셀 이동
2. **스크린 리더**: ARIA 레이블 추가
3. **성능**: 수천 행 시 가상화 필요

---

## 6. 개선 우선순위

| 순위 | 문제 | 영향도 | 난이도 | 권장 조치 |
|------|------|--------|--------|-----------|
| 1 | 초기 상태 가이드 부족 | 높음 | 낮음 | 단계별 안내 툴팁 추가 |
| 2 | 빠른 연속 검증 경쟁 | 높음 | 낮음 | debounce 또는 로딩 중 클릭 차단 |
| 3 | 동명이인 모달 진행률 | 중간 | 낮음 | "1/3 처리 중" 표시 추가 |
| 4 | 시트 전환 시 필터 초기화 | 낮음 | 낮음 | handleSheetChange에서 초기화 |
| 5 | 에러 메시지 히스토리 | 중간 | 중간 | 액션 로그 누적 표시 |
| 6 | 키보드 네비게이션 | 중간 | 중간 | Tab/Arrow 키 지원 |
| 7 | 색상 단순화 | 중간 | 낮음 | 아이콘/텍스트 병행 |
| 8 | 대용량 파일 가상화 | 낮음 | 높음 | react-window 도입 |

---

## 7. 권장 개선 코드

### 7.1 빠른 연속 클릭 방지

```typescript
// 검증 진행 중이면 클릭 무시
const handleColumnClick = useCallback(async (colIndex: number, columnName: string) => {
  if (validatingInProgress.size > 0) return  // 추가
  // ...기존 로직
}, [validatingInProgress, ...])
```

### 7.2 시트 전환 시 필터 초기화

```typescript
const handleSheetChange = useCallback((index: number) => {
  setActiveSheetIndex(index)
  setSelectedRows(new Set())
  setProductStatusFilter(null)  // 추가
  setLastClickedColumn(null)    // 추가
}, [])
```

### 7.3 동명이인 모달 진행률

```tsx
// HomonymResolutionModal에 추가
<div className="homonym-modal__progress">
  {currentIndex + 1} / {totalCount} 처리 중
</div>
```

---

## 8. 결론

ExcelRefiner는 복잡한 데이터 처리 기능을 갖추었으나, 다음 영역에서 UX 개선이 필요합니다:

1. **초기 진입점**: 파일 업로드 후 다음 단계 명확히 안내
2. **에러 처리**: 재시도, 상세 메시지, 작업 이력 유지
3. **상태 표시**: 색상 줄이고 명확한 우선순위 정의
4. **접근성**: 키보드 네비게이션, ARIA 속성 추가
5. **버그 수정**: 상태 동기화, 경쟁 조건 해결

---

## 9. 고객명 유일성 정책 (TODO)

> **정책**: 고객명은 전역 유일 식별자 (개인/법인/DB 전체에서 중복 불가)

### 9.1 현재 구현 상태

| 체크 범위 | 현재 구현 | 필요 기능 |
|----------|----------|----------|
| 개인 시트 내 중복 | ✓ (validateColumn) | - |
| 법인 시트 내 중복 | ✓ (validateColumn) | - |
| 개인↔법인 간 중복 | ✓ (동명이인 모달) | - |
| **DB 기존 고객과 중복** | ❌ | **추가 필요** |

### 9.2 DB 중복 검사 정책

| 상황 | 결과 | 동작 |
|------|------|------|
| 엑셀 개인 + DB 개인 (동일명) | ✅ 허용 | 기존 고객 정보 UPDATE |
| 엑셀 법인 + DB 법인 (동일명) | ✅ 허용 | 기존 고객 정보 UPDATE |
| 엑셀 법인 + DB 개인 (동일명) | ❌ 에러 | 고유성 위반 - 이름 변경 필요 |
| 엑셀 개인 + DB 법인 (동일명) | ❌ 에러 | 고유성 위반 - 이름 변경 필요 |

### 9.3 UPDATE 대상 필드

동일 타입의 기존 고객인 경우 아래 필드 업데이트:

**개인고객**: 이메일, 연락처, 주소, 생년월일
**법인고객**: 이메일, 연락처, 주소, 사업자번호, 대표자명

### 9.4 동명이인 처리

다른 사람인데 이름이 같은 경우, 설계사가 고객명을 구분해야 함:
- 예: `홍길동 일산`, `홍길동 서울`, `홍길동1`, `홍길동2`

---

## 10. 작업 이력

| 날짜 | 작업 | 커밋 | 상태 |
|------|------|------|------|
| 2025.12.05 | 새로고침 시 상품명 검증 상태 복원 | `9911689c` | 완료 |
| 2025.12.05 | 빠른 연속 검증 차단 (경쟁 상태 방지) | `b93ca262` | 완료 |
| 2025.12.05 | 시트 전환 시 필터 초기화 | `b93ca262` | 완료 |
| 2025.12.05 | 버그 수정 자동화 테스트 추가 (8 tests) | `b93ca262` | 완료 |
