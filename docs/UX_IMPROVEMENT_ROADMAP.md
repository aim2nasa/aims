# UX 개선 로드맵

> 2025.12.10 | 테스트 오픈 전 사용자 관점 개선사항
> **완료일: 2025.12.11** | 모든 태스크 구현 완료

---

## 완료 현황

| # | 태스크 | 우선순위 | 상태 | 커밋 |
|---|--------|----------|------|------|
| 1 | Empty State CTA 버튼 | P0 | ✅ 완료 | `244e0e3f` |
| 2 | 고객명 실시간 중복검사 | P0 | ✅ 완료 | `de4dfa40` |
| 3 | 성공 피드백 개선 (reload 제거) | P0 | ✅ 완료 | `f07369cc` |
| 4 | 폼 임시저장 (Draft) | P1 | ✅ 완료 | `556f0d90` |
| 5 | 고객↔문서 크로스링크 | P1 | ⏭️ 스킵 | - |
| 6 | Breadcrumb 네비게이션 | P1 | ✅ 완료 | `f611ca53` |
| 7 | 첫 방문 가이드 투어 | P2 | ✅ 완료 | `7504a1ba` |
| 8 | 뷰 전환 애니메이션 | P2 | ✅ 완료 | `6e40aad6` |
| 9 | 빠른검색 분리 (QuickSearch) | P2 | ✅ 완료 | `3bbf4de1` |

---

## P0: 즉시 (사용자가 막히는 부분)

### 1. Empty State에 CTA 버튼 추가 ✅

**현재**: 빈 화면에 텍스트만 표시, 다음 행동 유도 없음

**구현 위치**: `features/customer/views/CustomerDetailView/tabs/EmptyTab.tsx`

**현재 코드**:
```tsx
interface EmptyTabProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}
```

**개선 코드**:
```tsx
interface EmptyTabProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;      // 추가: "문서 등록하기"
  onAction?: () => void;     // 추가: 클릭 핸들러
}

// 컴포넌트 내부
{actionLabel && onAction && (
  <Button variant="primary" onClick={onAction}>
    {actionLabel}
  </Button>
)}
```

**적용 위치**:
- `DocumentLibraryView` 빈 상태 → "문서 등록하기" → `documents-register` 뷰
- `CustomerAllView` 빈 상태 → "첫 고객 등록하기" → `customers-register` 뷰
- `ContractAllView` 빈 상태 → "계약 등록하기" → `contracts-import` 뷰

---

### 2. 고객명 실시간 중복 검사 ✅

**현재**: 폼 제출 시점에만 중복 체크 → 전체 폼 작성 후 실패하면 사용자 짜증

**구현 위치**:
- `features/customer-registration/components/BasicInfoSection.tsx` - 이름 input 필드
- API: 기존 `/api/customers` 또는 신규 `/api/customers/check-duplicate?name={name}`

**구현 방식**:
```tsx
// BasicInfoSection.tsx 내부
const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'available' | 'duplicate'>('idle');
const [debouncedName] = useDebounce(formData.name, 300);

useEffect(() => {
  if (!debouncedName || debouncedName.length < 2) {
    setNameStatus('idle');
    return;
  }

  setNameStatus('checking');
  checkDuplicateName(debouncedName)
    .then(isDuplicate => {
      setNameStatus(isDuplicate ? 'duplicate' : 'available');
    });
}, [debouncedName]);

// 필드 아래 피드백 UI
{nameStatus === 'checking' && <span className="field-status--checking">확인 중...</span>}
{nameStatus === 'available' && <span className="field-status--success">사용 가능</span>}
{nameStatus === 'duplicate' && <span className="field-status--error">이미 등록된 고객</span>}
```

**주의**: CLAUDE.md "고객명 유일성 철칙" - 같은 설계사(userId) 내 고객명 중복 불가

---

### 3. 성공 피드백 개선 (reload 제거) ✅

**현재**: 성공 시 `window.location.reload()` 호출 → 사용자 문맥 손실

**발생 위치** (실제 코드에서 확인됨):
- `features/customer/views/CustomerRegistrationView/CustomerRegistrationView.tsx:44`
- `features/customer/views/CustomerEditModal/CustomerEditModal.tsx:85`
- `stores/user.ts:234`

**개선 방향**:
```tsx
// 현재
onSuccess: () => {
  window.location.reload();
}

// 개선
onSuccess: (newCustomer) => {
  showToast({ type: 'success', message: '고객이 등록되었습니다' });
  // React Query invalidation으로 데이터 갱신
  queryClient.invalidateQueries({ queryKey: ['customers'] });
  // 필요 시 해당 고객 상세로 이동
  setView('customers-detail', { customerId: newCustomer._id });
}
```

**참고**: 기존 테스트 파일 `data-refresh.test.tsx`가 reload 동작을 검증하고 있음 → 테스트도 함께 수정 필요

---

## P1: 단기 (효율성)

### 4. 폼 임시저장 (Draft) ✅

**현재**: 폼 작성 중 실수로 뒤로가면 데이터 전체 손실

**구현 위치**:
- `features/customer-registration/hooks/useCustomerRegistrationController.ts`
- 공통화하려면 `shared/hooks/useDraftForm.ts` 생성

**구현 방식**:
```tsx
const DRAFT_KEY = 'customer-registration-draft';

// 마운트 시 draft 복원
useEffect(() => {
  const draft = localStorage.getItem(DRAFT_KEY);
  if (draft) {
    try {
      const parsed = JSON.parse(draft);
      setFormData(parsed);
      showToast({ type: 'info', message: '이전 작성 내용을 불러왔습니다' });
    } catch {}
  }
}, []);

// formData 변경 시 저장 (debounce)
useEffect(() => {
  const timer = setTimeout(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
  }, 500);
  return () => clearTimeout(timer);
}, [formData]);

// 제출 성공 시 삭제
onSuccess: () => {
  localStorage.removeItem(DRAFT_KEY);
}
```

**페이지 이탈 경고** (선택사항):
```tsx
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [isDirty]);
```

---

### 5. 고객 ↔ 문서 크로스링크 ⏭️ (스킵)

**현재**: CustomerDetailView에서 해당 고객의 문서로 바로 이동 어려움

**구현 위치**: `features/customer/views/CustomerDetailView/CustomerDetailView.tsx`

**구현**:
```tsx
// 헤더 또는 문서 탭 상단에 버튼 추가
<Button
  variant="secondary"
  onClick={() => setView('documents-library', { customerId: customer._id })}
>
  이 고객의 문서 보기
</Button>
```

**DocumentLibraryView 수정**: URL params에서 `customerId` 받아서 필터 적용
```tsx
const { customerId } = useSearchParams();
// customerId가 있으면 해당 고객 문서만 필터링
```

---

### 6. Breadcrumb 경로 표시 ✅

**현재**: 깊은 뷰(예: 고객 > 상세 > 계약)에서 현재 위치 파악 어려움

**구현 위치**: `App.tsx` 또는 `shared/ui/Breadcrumb/Breadcrumb.tsx` 신규 생성

**구현 예시**:
```tsx
interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

// 사용
<Breadcrumb items={[
  { label: '고객', onClick: () => setView('customers-all') },
  { label: customer.name },
  { label: '기본정보' }
]} />

// 렌더링: 고객 > 홍길동 > 기본정보
```

---

## P2: 중기 (완성도)

### 7. 첫 방문 가이드 투어 ✅

**구현 위치**: `App.tsx` 및 `shared/components/OnboardingTour/`

**구현 방식**:
- localStorage로 `hasCompletedOnboarding` 체크
- react-joyride 또는 자체 구현
- 3-5단계: 문서등록 → 고객연결 → 조회 순서 안내

```tsx
const [showTour, setShowTour] = useState(() => {
  return !localStorage.getItem('hasCompletedOnboarding');
});

// 투어 완료 시
localStorage.setItem('hasCompletedOnboarding', 'true');
```

---

### 8. 뷰 전환 애니메이션 ✅

**구현 위치**: `App.tsx` 및 `styles/layout.css`

**구현 방식**:
- framer-motion: `AnimatePresence` + `motion.div`
- 또는 CSS: `@keyframes fadeIn` + 조건부 클래스

```tsx
// framer-motion 예시
<AnimatePresence mode="wait">
  <motion.div
    key={currentView}
    initial={{ opacity: 0, x: 10 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -10 }}
    transition={{ duration: 0.15 }}
  >
    {renderView()}
  </motion.div>
</AnimatePresence>
```

---

### 9. 빠른검색 vs AI검색 분리 ✅

**현재**: DocumentSearchView가 AI/의미론적 검색 중심 → 신규 사용자에게 복잡

**개선**:
- 헤더 또는 상단에 간단한 검색바 (고객명/문서명 즉시 검색)
- 기존 AI 검색은 "고급 검색" 버튼으로 진입

**구현 위치**:
- `components/QuickSearch/QuickSearch.tsx` 신규
- `App.tsx` 헤더 영역에 배치

---

## 이미 구현된 것 (확인됨)

- **메뉴 그룹화**: CustomMenu.tsx에서 빠른 작업/고객/계약/문서로 그룹화됨
- **메뉴 하이라이트**: `isSelected` 클래스로 활성 메뉴 표시됨
- **Progressive Disclosure**: 메뉴 확장/축소 애니메이션 구현됨

---

## 제외 (사용자 확보 후)

보안, 토큰, OCR 권한, 디스크 정책, 시스템 모니터링
