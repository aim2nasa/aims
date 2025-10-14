# Unit Test 작성 중 발견된 이슈 및 개선 사항

> 유닛 테스트 작성 과정에서 발견된 버그, 개선 사항, 주의사항을 기록합니다.
>
> **작성 일자**: 2025-10-14

---

## 🐛 발견된 버그

### 1. useCustomersController - 템플릿 리터럴 escape 버그 ⚠️ HIGH

**파일**: `src/controllers/useCustomersController.tsx:241`

**문제**:
```typescript
const handleDeleteCustomer = useCallback(async (customer: Customer) => {
  const confirmed = await showConfirmation({
    title: '고객 삭제',
    message: `\${customer.personal_info?.name ?? '고객'} 고객을 삭제하시겠습니까?`,
    //      ^ 백슬래시로 escape되어 있어 실제 값으로 치환되지 않음
    confirmText: '삭제',
    cancelText: '취소',
    destructive: true
  });
```

**현재 동작**:
- 삭제 확인 메시지: `"${customer.personal_info?.name ?? '고객'} 고객을 삭제하시겠습니까?"`
- 고객 이름이 표시되지 않고 템플릿 리터럴 코드가 그대로 노출됨

**수정 방안**:
```typescript
message: `${customer.personal_info?.name ?? '고객'} 고객을 삭제하시겠습니까?`,
```

**영향도**:
- 사용자 경험에 영향 (고객 이름이 표시되지 않음)
- 기능은 정상 동작하나 UX 저하

**테스트 코드**: `src/controllers/useCustomersController.test.tsx:499-518`

---

## 📋 테스트 작성 시 주의사항

### 1. React Hook 테스트 - useEffect 초기 로드

**문제 상황**:
- `useCustomersController`는 `useEffect`에서 `customers.length === 0`일 때 자동으로 데이터를 로드함
- 테스트에서 이 초기 로드가 예상치 않게 실행되어 mock 호출 횟수가 맞지 않음

**해결 방법**:
```typescript
// customers를 미리 설정하여 useEffect 초기 로드 방지
mockCustomerContextValue.state.customers = [mockCustomer];

const { result } = renderHook(() => useCustomersController());

// 이제 테스트하려는 함수만 호출됨
act(() => {
  result.current.loadMoreCustomers();
});
```

**관련 테스트**:
- `src/controllers/useCustomersController.test.tsx:277-291` (로딩 중 방지)
- `src/controllers/useCustomersController.test.tsx:293-305` (hasMore 체크)

---

## 💡 개선 제안

### 1. SearchService - 빈 문자열 처리 일관성

**파일**: `src/services/searchService.ts`

**현재 동작**:
- `getOCRConfidence()`: 빈 문자열 `""` → `null` 반환 (falsy 처리)
- `getMimeType()`: 빈 문자열 `""` → `undefined` 반환 (falsy 처리)

**일관성 검토 필요**:
- 모든 getter 메서드가 값이 없을 때 동일한 방식으로 처리하는지 확인 필요
- `null` vs `undefined` vs 빈 문자열 정책 통일

**관련 테스트**: `src/services/searchService.test.ts:442-460`

---

### 2. DownloadHelper - 에러 처리 개선 가능

**파일**: `src/utils/downloadHelper.ts:88-99`

**현재 구조**:
```typescript
catch (error) {
  console.error('DownloadHelper.downloadDocument:', error);

  if (showMessage) {
    console.error('파일 다운로드 중 오류가 발생했습니다:', error);
  }

  return {
    success: false,
    error: error instanceof Error ? error.message : '알 수 없는 오류'
  };
}
```

**개선 제안**:
- `showMessage`와 관계없이 첫 번째 `console.error`는 항상 실행됨
- 두 번째 `console.error`는 사용자에게 보여주는 메시지이므로 Toast/Alert 등으로 변경 고려
- 현재는 console에만 출력되어 사용자가 알 수 없음

---

## 🔍 코드 품질 관찰 사항

### 1. CustomerUtils - 견고한 null 처리

**파일**: `src/entities/customer/model.ts`

**긍정적 사항**:
- 모든 유틸리티 메서드가 `optional chaining`과 `nullish coalescing`을 적절히 사용
- undefined/null 케이스를 안전하게 처리
- 예시:
  ```typescript
  static getDisplayName(customer: Customer): string {
    return customer.personal_info?.name || '이름 없음';
  }
  ```

**테스트 커버리지**: 37개 테스트로 충분히 검증됨

---

### 2. SearchService - Fallback Chain 패턴

**파일**: `src/services/searchService.ts`

**긍정적 사항**:
- 다양한 스키마 버전을 지원하는 깔끔한 fallback chain 구현
- MongoDB vs Qdrant 등 다른 데이터 소스에서 오는 필드를 우아하게 처리
- 예시:
  ```typescript
  static getFilePath(item: SearchResultItem): string {
    // 1. upload.destPath
    if ('upload' in item && item.upload?.destPath) {
      return item.upload.destPath;
    }
    // 2. meta.destPath
    if (item.meta?.destPath) {
      return item.meta.destPath;
    }
    // 3. payload.dest_path (시맨틱 검색)
    if ('payload' in item && item.payload?.dest_path) {
      return item.payload.dest_path;
    }
    return '';
  }
  ```

**테스트 커버리지**: 38개 테스트로 모든 fallback 경로 검증

---

## 📊 테스트 현황 요약

### 완료된 테스트 (Phase 1-1 ~ Phase 2-2)

| Phase | 대상 | 테스트 수 | 상태 | 파일 |
|-------|------|----------|------|------|
| 1-1 | CustomerUtils | 37개 | ✅ | `src/entities/customer/model.test.ts` |
| 1-2 | SearchService | 38개 | ✅ | `src/services/searchService.test.ts` |
| 1-3 | DownloadHelper | 19개 | ✅ | `src/utils/downloadHelper.test.ts` |
| 2-1 | useDocumentSearchController | 18개 | ✅ | `src/controllers/useDocumentSearchController.test.ts` |
| 2-2 | useCustomersController | 27개 | ✅ | `src/controllers/useCustomersController.test.tsx` |

**총 139개 테스트 작성 완료** 🎉

---

## 🔧 수정 우선순위

### HIGH (즉시 수정 권장)
1. ✅ **useCustomersController 템플릿 리터럴 버그** - 사용자에게 직접 노출되는 메시지

### MEDIUM (다음 리팩토링 시 고려)
1. SearchService 빈 문자열 처리 일관성
2. DownloadHelper 사용자 에러 메시지 표시 방식

### LOW (장기 개선)
- 없음

---

## 📝 변경 이력

| 날짜 | 작성자 | 내용 |
|------|--------|------|
| 2025-10-14 | Claude Code | 초기 문서 생성 (Phase 1-1 ~ Phase 2-2 완료 시점) |

---

**다음 업데이트**: Phase 2-3 완료 후
