# [TODO] 개발자 모드 사용자 전환 — localStorage 직접 참조 통일

**등록일**: 2026-03-17
**심각도**: Medium
**상태**: Open

## 문제

`getAuthHeaders()` (`shared/lib/api.ts`)는 `aims-dev-user-override`를 우선 적용하지만,
여러 서비스/컴포넌트에서 `localStorage.getItem('aims-current-user-id')`를 직접 읽어
dev override가 무시되는 버그가 발생한다.

## 수정 완료

- `DocumentFullTextModal.tsx` — `getAuthHeaders()` 사용으로 수정 (커밋 `6a34770c`)
- `DocumentSummaryModal.tsx` — `getAuthHeaders()` 사용으로 수정 (커밋 `6a34770c`)

## 수정 필요 (19개 파일)

`localStorage.getItem('aims-current-user-id')` 를 직접 사용하는 파일 목록:

### API 호출에 직접 사용 (수정 필수)
1. `services/personalFilesService.ts` — `getHeaders()` 함수 + `getDownloadUrl()` 메서드
2. `services/searchService.ts`
3. `services/DocumentService.ts`
4. `features/customer/components/DocumentContentSearchModal/DocumentContentSearchModal.tsx`
5. `components/DocumentViews/DocumentRegistrationView/services/uploadService.ts`
6. `components/DocumentViews/DocumentRegistrationView/services/userContextService.ts`
7. `components/DocumentViews/DocumentRegistrationView/utils/annualReportProcessor.ts`
8. `components/DocumentViews/DocumentRegistrationView/utils/customerReviewProcessor.ts`
9. `features/batch-upload/api/batchUploadApi.ts`
10. `components/DocumentViews/PersonalFilesView/PersonalFilesView.tsx`

### 비-API 용도 (확인 후 판단)
11. `stores/user.ts` — 초기값 복원 용도 (정상)
12. `shared/lib/api.ts` — `getAuthHeaders()` fallback (정상)
13. `App.tsx` — 사용자 로그인 확인
14. `pages/LoginPage.tsx`
15. `features/AccountSettings/AccountSettingsView.tsx`
16. `shared/store/useRecentCustomersStore.ts`
17. `utils/recentSearchQueries.ts`

## 수정 원칙

- API 호출 헤더에 `x-user-id`를 설정하는 곳: `getAuthHeaders()` 사용
- URL 파라미터에 `x-user-id`를 넣는 곳: `getAuthHeaders()`에서 userId만 추출하여 사용
- 비-API 용도 (UI 표시, 로컬 캐시 키 등): 현행 유지 가능

## 근본 해결 (권장)

`getCurrentUserId()` 유틸 함수를 만들어 dev override를 포함한 userId 반환:
```typescript
export function getCurrentUserId(): string {
  const devOverride = localStorage.getItem('aims-dev-user-override')
  return devOverride || localStorage.getItem('aims-current-user-id') || ''
}
```
모든 직접 참조를 이 함수로 교체.
