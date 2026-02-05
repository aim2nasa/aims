# Batch Progress 현재 문제점

> 커밋: `feat(credit): batchId 기반 진행률 추적 및 credit_pending UX 개선 (WIP)`
> 작성일: 2026-02-05

---

## 1. batchId 생명주기 관리 부재

| 항목 | 상태 | 설명 |
|------|------|------|
| 생성 시점 | ✅ 구현됨 | `DocumentRegistrationView`에서 업로드 시작 시 생성 |
| 삭제 시점 | ❌ **미구현** | sessionStorage에 영원히 남아있음 |
| 영향 | 🔴 심각 | 다음 방문 시에도 이전 배치 통계가 계속 표시됨 |

**문제 코드:**
```typescript
// DocumentRegistrationView.tsx:560
sessionStorage.setItem('aims-current-batch-id', newBatchId)
// 지우는 로직이 어디에도 없음!
```

**해결 필요:**
- 배치 100% 완료 시 삭제
- 또는 새 업로드 시작 시 이전 batchId 교체 (현재는 덮어쓰기만 함)
- 또는 일정 시간(예: 1시간) 후 자동 만료

---

## 2. batchId 변경 감지 안됨

| 항목 | 현재 | 문제 |
|------|------|------|
| 읽기 방식 | `useState` 초기값 | 최초 1회만 실행 |
| 변경 감지 | ❌ 안됨 | sessionStorage 변경되어도 컴포넌트는 모름 |

**문제 코드:**
```typescript
// DocumentLibraryView.tsx:108
const [currentBatchId] = React.useState<string | null>(() => {
  return sessionStorage.getItem('aims-current-batch-id')  // 최초 1회만 실행
})
```

**시나리오:**
1. 사용자가 DocumentLibraryView에 있음 (batchId = null)
2. 새 탭에서 업로드 시작 → sessionStorage에 batchId 저장
3. DocumentLibraryView는 여전히 batchId = null로 인식
4. 새로고침해야만 새 batchId 감지

**해결 방안:**
- `useSyncExternalStore` 사용
- 또는 `storage` 이벤트 구독
- 또는 업로드 완료 시 페이지 새로고침 (현재 AIMS 패턴)

---

## 3. 배치 완료 후 UX 미정의

| 상태 | `batchIsActive` | `isVisible` | 현재 동작 |
|------|-----------------|-------------|-----------|
| 진행 중 (50%) | true | true | 표시 ✅ |
| 완료 (100%) | false | ??? | **미정의** |
| 완료 + credit_pending | false | true | 표시되지만... |

**질문:**
- 100% 완료 후 Status Bar를 언제까지 표시?
- credit_pending이 있으면 영원히 표시?
- 사용자가 "확인했음" 버튼으로 닫을 수 있어야 하나?

**현재 로직:**
```typescript
// DocumentProcessingStatusBar.tsx:67-70
if (hasBatch && (batchProcessing > 0 || batchPending > 0 || batchCreditPending > 0)) {
  return true  // 표시
}
```
→ 100% 완료되면 `batchProcessing = 0`, `batchPending = 0`이므로 숨겨짐
→ 하지만 `batchCreditPending > 0`이면 계속 표시됨

---

## 4. 해결 우선순위

| 순위 | 문제 | 심각도 | 난이도 |
|------|------|--------|--------|
| 1 | batchId 삭제 로직 | 🔴 높음 | 쉬움 |
| 2 | 배치 완료 후 UX | 🟡 중간 | 설계 필요 |
| 3 | batchId 변경 감지 | 🟢 낮음 | 현재 AIMS는 새로고침 패턴 사용 |

---

## 5. 제안 해결책

### 5.1 batchId 삭제 로직 추가

```typescript
// 옵션 A: 100% 완료 시 삭제 (DocumentProcessingStatusBar에서)
useEffect(() => {
  if (batchPct === 100 && batchCreditPending === 0) {
    sessionStorage.removeItem('aims-current-batch-id')
  }
}, [batchPct, batchCreditPending])

// 옵션 B: 새 업로드 시작 시 이전 배치 무시 (현재 구현됨 - 덮어쓰기)
// 문제: 이전 배치 통계가 남아있음
```

### 5.2 배치 완료 후 UX

**제안: Progressive Disclosure**
1. 100% 완료 + credit_pending 없음 → 3초 후 자동 숨김
2. 100% 완료 + credit_pending 있음 → "⏸ X건 크레딧 대기" 계속 표시
3. credit_pending 해소되면 → 3초 후 자동 숨김 + batchId 삭제

---

## 6. 테스트 시나리오

### 6.1 정상 플로우
1. [ ] 업로드 시작 → batchId 생성됨
2. [ ] DocumentLibraryView에서 "이번 업로드" 진행률 표시
3. [ ] 100% 완료 → Status Bar 숨겨짐
4. [ ] batchId 삭제됨

### 6.2 credit_pending 플로우
1. [ ] 크레딧 부족 상태에서 업로드
2. [ ] "이번 업로드 100% + ⏸ X건 크레딧대기" 표시
3. [ ] 크레딧 충전 후 자동 처리
4. [ ] 처리 완료 후 Status Bar 숨겨짐

### 6.3 엣지 케이스
1. [ ] 페이지 새로고침 후 batchId 유지되는지
2. [ ] 새 업로드 시 이전 batchId 교체되는지
3. [ ] 다른 탭에서 업로드 시 현재 탭 반영되는지
