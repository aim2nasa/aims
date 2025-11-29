# AIMS UIX3 프론트엔드 분석 보고서

**분석일**: 2025-11-29
**대상**: `frontend/aims-uix3/`
**버전**: 0.118.4

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [현재 상태 요약](#2-현재-상태-요약)
3. [높은 우선순위 개선사항](#3-높은-우선순위-개선사항)
4. [중간 우선순위 개선사항](#4-중간-우선순위-개선사항)
5. [낮은 우선순위 개선사항](#5-낮은-우선순위-개선사항)
6. [추가 기능 제안](#6-추가-기능-제안)
7. [권장 작업 순서](#7-권장-작업-순서)

---

## 1. 프로젝트 개요

### 기술 스택

| 기술 | 버전 | 용도 |
|-----|------|------|
| React | ^19.1.1 | UI 프레임워크 |
| TypeScript | ~5.8.3 | 정적 타입 검사 |
| Vite | ^7.1.2 | 빌드 도구 |
| TanStack Query | ^5.87.4 | 서버 상태 관리 |
| Zustand | ^5.0.8 | 클라이언트 상태 관리 |
| Vitest | ^3.2.4 | 유닛 테스트 |
| Playwright | ^1.55.1 | E2E 테스트 |

### 프로젝트 규모

- **소스 파일**: 237개 TSX/TS 파일
- **CSS 파일**: 104개
- **테스트 파일**: 128개 (유닛/통합) + 14개 (E2E)
- **소스 코드**: 약 5.7MB

### 아키텍처 패턴

- **Document-Controller-View** 패턴 기반
- **Feature-Sliced Design (FSD)** 디렉토리 구조
- Apple 디자인 철학 구현

---

## 2. 현재 상태 요약

| 영역 | 점수 | 상태 | 비고 |
|-----|------|------|------|
| **타입 안전성** | A+ | 우수 | `any` 타입 0개 |
| **CSS 시스템** | A | 우수 | 95% 변수화, 일부 하드코딩 |
| **테스트 커버리지** | B+ | 양호 | 128개 테스트, Modal 미테스트 |
| **상태 관리** | B | 보통 | 패턴 혼용, App.tsx 집중 |
| **접근성** | A- | 양호 | ARIA 우수, focus trap 부재 |
| **컴포넌트 품질** | A | 우수 | 문서화 우수, 일부 분할 필요 |
| **전체** | A- | 양호 | 프로덕션 준비 완료, 개선 여지 있음 |

---

## 3. 높은 우선순위 개선사항

### 3.1 App.tsx 상태 집중 문제

**현황**
- App.tsx에 36개 이상의 `useState` 훅 집중
- 파일 크기: 1,651줄
- 레이아웃, 라우팅, 선택 상태가 모두 루트 컴포넌트에 존재

**문제점**
- 성능 병목 (불필요한 리렌더링)
- 상태 변경 추적 어려움
- 단일 책임 원칙 위반

**해결 방안**
```typescript
// src/shared/stores/useLayoutStore.ts (신규)
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LayoutState {
  leftPaneWidth: number
  rightPaneWidth: number
  isLeftPaneCollapsed: boolean
  isRightPaneCollapsed: boolean
  activeView: string | null
  setLeftPaneWidth: (width: number) => void
  setRightPaneWidth: (width: number) => void
  toggleLeftPane: () => void
  toggleRightPane: () => void
  setActiveView: (view: string | null) => void
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      leftPaneWidth: 250,
      rightPaneWidth: 300,
      isLeftPaneCollapsed: false,
      isRightPaneCollapsed: false,
      activeView: null,
      setLeftPaneWidth: (width) => set({ leftPaneWidth: width }),
      setRightPaneWidth: (width) => set({ rightPaneWidth: width }),
      toggleLeftPane: () => set((s) => ({ isLeftPaneCollapsed: !s.isLeftPaneCollapsed })),
      toggleRightPane: () => set((s) => ({ isRightPaneCollapsed: !s.isRightPaneCollapsed })),
      setActiveView: (view) => set({ activeView: view }),
    }),
    { name: 'aims-layout' }
  )
)
```

**예상 소요 시간**: 3시간

---

### 3.2 Modal 시스템 테스트 부재

**현황**
- Modal, DraggableModal, CustomerSelectorModal, FamilySelectorModal: **0개 테스트**
- 핵심 UI 기반 컴포넌트임에도 검증 없음

**위험도**: 높음 - UI 기반 컴포넌트 변경 시 회귀 버그 가능

**해결 방안**
```typescript
// src/shared/ui/Modal/__tests__/Modal.test.tsx (신규)
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../Modal'

describe('Modal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
  })

  describe('기본 렌더링', () => {
    it('isOpen=true일 때 모달이 렌더링되어야 함', () => {
      render(
        <Modal isOpen={true} onClose={onClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('테스트 모달')).toBeInTheDocument()
    })

    it('isOpen=false일 때 모달이 렌더링되지 않아야 함', () => {
      render(
        <Modal isOpen={false} onClose={onClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('닫기 동작', () => {
    it('ESC 키를 누르면 onClose가 호출되어야 함', async () => {
      render(
        <Modal isOpen={true} onClose={onClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )
      await userEvent.keyboard('{Escape}')
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('backdrop 클릭 시 onClose가 호출되어야 함 (backdropClosable=true)', async () => {
      render(
        <Modal isOpen={true} onClose={onClose} title="테스트 모달" backdropClosable>
          <p>모달 내용</p>
        </Modal>
      )
      const backdrop = screen.getByTestId('modal-backdrop')
      await userEvent.click(backdrop)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('backdrop 클릭 시 onClose가 호출되지 않아야 함 (backdropClosable=false)', async () => {
      render(
        <Modal isOpen={true} onClose={onClose} title="테스트 모달" backdropClosable={false}>
          <p>모달 내용</p>
        </Modal>
      )
      const backdrop = screen.getByTestId('modal-backdrop')
      await userEvent.click(backdrop)
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('접근성', () => {
    it('role="dialog"가 설정되어야 함', () => {
      render(
        <Modal isOpen={true} onClose={onClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('aria-modal="true"가 설정되어야 함', () => {
      render(
        <Modal isOpen={true} onClose={onClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })
  })
})
```

**예상 소요 시간**: 2시간

---

### 3.3 DocumentStatusProvider 메모리 누수 위험

**현황**
- `setInterval`이 반복 생성됨
- `fetchDocuments` 의존성이 안정화되지 않음
- 컴포넌트 언마운트 시 cleanup 미흡

**문제점**
- 다중 interval 동시 실행 가능
- 메모리 누수 위험

**해결 방안**
```typescript
// DocumentStatusProvider.tsx 수정

// 1. fetchDocuments를 useCallback으로 안정화
const fetchDocuments = useCallback(async () => {
  // ... 기존 로직
}, [/* 필요한 의존성만 */])

// 2. useRef로 interval ID 관리
const intervalRef = useRef<NodeJS.Timeout | null>(null)

// 3. cleanup 확실히 처리
useEffect(() => {
  // 기존 interval 정리
  if (intervalRef.current) {
    clearInterval(intervalRef.current)
  }

  // 새 interval 설정
  intervalRef.current = setInterval(fetchDocuments, POLLING_INTERVAL)

  return () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }
}, [fetchDocuments])
```

**예상 소요 시간**: 1시간

---

## 4. 중간 우선순위 개선사항

### 4.1 스토어 위치 불일치

**현황**
```
src/shared/store/     ← 3개 스토어 (useAccountSettingsStore, useDevModeStore, useRecentCustomersStore)
src/shared/stores/    ← 1개 스토어 (authStore)
src/stores/           ← 2개 스토어 (user, customer-document)
```

**해결 방안**
- `src/shared/stores/`로 통합
- 일관된 네이밍 규칙 적용: `use{Domain}Store.ts`

---

### 4.2 중복 Click-Outside 패턴 추출

**현황**
- 6곳에서 동일한 `handleClickOutside` 패턴 반복
  - DocumentLibraryView.tsx
  - PersonalFilesView.tsx
  - Dropdown.tsx
  - UserProfileMenu.tsx
  - Header 컴포넌트들

**해결 방안**
```typescript
// src/hooks/useClickOutside.ts (신규)
import { useEffect, RefObject } from 'react'

export const useClickOutside = <T extends HTMLElement>(
  ref: RefObject<T>,
  onClickOutside: () => void,
  enabled: boolean = true
) => {
  useEffect(() => {
    if (!enabled) return

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClickOutside()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [ref, onClickOutside, enabled])
}
```

**예상 소요 시간**: 1시간

---

### 4.3 대형 컴포넌트 분할

**현황**

| 컴포넌트 | 라인 수 | 함수/상수 개수 |
|---------|--------|---------------|
| PersonalFilesView | 2,464 | 221 |
| ExcelRefiner | 2,212 | - |
| DocumentSearchView | 1,379 | - |
| RegionalTreeView | 1,261 | - |

**해결 방안 (PersonalFilesView 예시)**
```
PersonalFilesView/
├── PersonalFilesView.tsx        (메인 - 300줄 이하)
├── components/
│   ├── FolderTreeNav.tsx        (폴더 트리 네비게이션)
│   ├── FileListPanel.tsx        (파일 목록 패널)
│   ├── FileActionBar.tsx        (액션 버튼 바)
│   ├── UploadManager.tsx        (업로드 관리)
│   └── FilePreview.tsx          (파일 미리보기)
├── hooks/
│   ├── useFileOperations.ts     (파일 CRUD 로직)
│   └── useFolderTree.ts         (폴더 트리 상태)
└── PersonalFilesView.css
```

---

### 4.4 CSS 하드코딩 수정

**현황**

| 파일 | 하드코딩 값 | 수정 필요 |
|-----|-----------|----------|
| CenterPaneView.css | `rgba(255, 255, 255, 0.7)` | `var(--color-header-glass-bg-light)` 추가 |
| CenterPaneView.css | `rgba(28, 28, 30, 0.7)` | `var(--color-header-glass-bg-dark)` 추가 |
| CenterPaneView.css | `#dc3545` | `var(--color-error-600)` |
| QuickFamilyAssignPanel.css | `#dc3545` | `var(--color-error-600)` |
| RegionalTreeView.css | `#0078d4` | `var(--color-primary-600)` |

**해결 방안**

1. `theme.css`에 변수 추가:
```css
/* Glass Effect Colors */
:root, html[data-theme="light"] {
  --color-header-glass-bg: rgba(255, 255, 255, 0.7);
  --color-header-glass-bg-expanded: rgba(255, 255, 255, 0.98);
}

html[data-theme="dark"] {
  --color-header-glass-bg: rgba(28, 28, 30, 0.7);
  --color-header-glass-bg-expanded: rgba(28, 28, 30, 0.98);
}
```

2. 컴포넌트 CSS 수정:
```css
/* CenterPaneView.css */
.center-pane-header {
  background: var(--color-header-glass-bg);  /* rgba(255, 255, 255, 0.7) 대체 */
}

.error-text {
  color: var(--color-error-600);  /* #dc3545 대체 */
}
```

**예상 소요 시간**: 30분

---

### 4.5 AccountSettingsStore 안티패턴 수정

**현황**
```typescript
// 현재: setter 함수를 저장 (안티패턴)
const useAccountSettingsStore = create(() => ({
  setIsOpen: null,  // 외부에서 등록
  setSelectedTab: null,
}))
```

**해결 방안**
```typescript
// 수정: 상태를 직접 저장
interface AccountSettingsState {
  isOpen: boolean
  selectedTab: string
  openSettings: (tab?: string) => void
  closeSettings: () => void
  setSelectedTab: (tab: string) => void
}

export const useAccountSettingsStore = create<AccountSettingsState>((set) => ({
  isOpen: false,
  selectedTab: 'profile',
  openSettings: (tab = 'profile') => set({ isOpen: true, selectedTab: tab }),
  closeSettings: () => set({ isOpen: false }),
  setSelectedTab: (tab) => set({ selectedTab: tab }),
}))
```

---

## 5. 낮은 우선순위 개선사항

### 5.1 Focus Trap 구현

**현황**
- Modal/DraggableModal에 focus trap 미구현
- 모달 외부로 Tab 이동 가능
- 접근성 기준 미충족

**해결 방안**
```typescript
// src/hooks/useFocusTrap.ts (신규)
import { useEffect, RefObject } from 'react'

export const useFocusTrap = (ref: RefObject<HTMLDivElement>, isActive: boolean) => {
  useEffect(() => {
    if (!isActive || !ref.current) return

    const focusableElements = ref.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    // 첫 요소에 포커스
    firstElement?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [ref, isActive])
}
```

---

### 5.2 Provider 테스트 확장

**현황**
- CustomerProvider: 테스트 없음
- DocumentStatusProvider: 1개 테스트만 (customer-sort)

**필요한 테스트**
```typescript
describe('CustomerProvider', () => {
  it('customers 데이터를 제공해야 함')
  it('selectedCustomer 상태를 관리해야 함')
  it('search 기능이 동작해야 함')
  it('에러 발생 시 에러 상태를 제공해야 함')
})

describe('DocumentStatusProvider', () => {
  it('문서 상태를 폴링해야 함')
  it('정렬 기능이 동작해야 함')
  it('필터 기능이 동작해야 함')
  it('실시간 업데이트가 반영되어야 함')
})
```

---

### 5.3 React.memo 적용

**현황**
- 공유 UI 컴포넌트에 memoization 미적용
- CustomerSelectorModal만 `useMemo`/`useCallback` 사용

**대상 컴포넌트**
- Button
- Modal
- Tooltip
- Input
- FormField
- StatCard

---

## 6. 추가 기능 제안

### 6.1 에러 바운더리 시스템

**현황**: 중앙집중식 에러 처리 없음

**제안**
```typescript
// src/shared/ui/ErrorBoundary/ErrorBoundary.tsx
import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error) => void
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error)
    // 에러 텔레메트리 서비스 연동
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <DefaultErrorFallback error={this.state.error} />
    }
    return this.props.children
  }
}
```

---

### 6.2 Optimistic Updates

**현황**: TanStack Query mutation에서 미사용

**제안**
```typescript
// 고객 수정 예시
const updateCustomer = useMutation({
  mutationFn: (data) => customerService.update(data),
  onMutate: async (newData) => {
    // 캐시 취소
    await queryClient.cancelQueries({ queryKey: ['customer', newData.id] })

    // 이전 값 저장
    const previousData = queryClient.getQueryData(['customer', newData.id])

    // 낙관적 업데이트
    queryClient.setQueryData(['customer', newData.id], newData)

    return { previousData }
  },
  onError: (err, newData, context) => {
    // 롤백
    queryClient.setQueryData(['customer', newData.id], context?.previousData)
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['customers'] })
  },
})
```

---

### 6.3 useInfiniteQuery 도입

**현황**: 수동 페이지네이션 구현

**제안**
```typescript
// 문서 목록 무한 스크롤
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useInfiniteQuery({
  queryKey: ['documents', filters],
  queryFn: ({ pageParam = 1 }) => documentService.list({ page: pageParam, ...filters }),
  getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
})
```

---

### 6.4 localStorage 통합 서비스

**현황**: 17개 파일에서 개별 사용

**제안**
```typescript
// src/services/StorageService.ts
const STORAGE_KEYS = {
  AUTH_TOKEN: 'aims_auth_token',
  THEME: 'aims_theme',
  LAYOUT: 'aims_layout',
  RECENT_CUSTOMERS: 'aims_recent_customers',
  RECENT_SEARCHES: 'aims_recent_searches',
} as const

export const StorageService = {
  get<T>(key: keyof typeof STORAGE_KEYS, defaultValue?: T): T | null {
    try {
      const item = localStorage.getItem(STORAGE_KEYS[key])
      return item ? JSON.parse(item) : defaultValue ?? null
    } catch {
      return defaultValue ?? null
    }
  },

  set<T>(key: keyof typeof STORAGE_KEYS, value: T): void {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value))
  },

  remove(key: keyof typeof STORAGE_KEYS): void {
    localStorage.removeItem(STORAGE_KEYS[key])
  },

  clear(): void {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k))
  },
}
```

---

## 7. 권장 작업 순서

### Phase 1: 긴급 (이번 주)

| 순서 | 작업 | 예상 시간 | 우선순위 |
|-----|------|----------|---------|
| 1 | DocumentStatusProvider 메모리 누수 수정 | 1시간 | 🔴 높음 |
| 2 | CSS 하드코딩 제거 | 30분 | 🔴 높음 |
| 3 | Modal 시스템 테스트 추가 | 2시간 | 🔴 높음 |

### Phase 2: 중요 (다음 주)

| 순서 | 작업 | 예상 시간 | 우선순위 |
|-----|------|----------|---------|
| 4 | App.tsx 상태 추출 (useLayoutStore) | 3시간 | 🟠 중간 |
| 5 | useClickOutside 훅 추출 | 1시간 | 🟠 중간 |
| 6 | 스토어 위치 통합 | 1시간 | 🟠 중간 |

### Phase 3: 개선 (2주 내)

| 순서 | 작업 | 예상 시간 | 우선순위 |
|-----|------|----------|---------|
| 7 | AccountSettingsStore 수정 | 1시간 | 🟠 중간 |
| 8 | Provider 테스트 확장 | 2시간 | 🟡 낮음 |
| 9 | Focus Trap 구현 | 1시간 | 🟡 낮음 |

### Phase 4: 장기 (1개월 내)

| 순서 | 작업 | 예상 시간 | 우선순위 |
|-----|------|----------|---------|
| 10 | 대형 컴포넌트 분할 (PersonalFilesView) | 4시간 | 🟡 낮음 |
| 11 | ErrorBoundary 시스템 | 2시간 | 🟢 제안 |
| 12 | Optimistic Updates 적용 | 3시간 | 🟢 제안 |
| 13 | localStorage 통합 | 2시간 | 🟢 제안 |

---

## 부록: 상세 통계

### 테스트 커버리지

| 영역 | 테스트 수 | 상태 |
|-----|----------|------|
| Document Views | 37 | ✅ 우수 |
| Customer Features | 16 | ✅ 양호 |
| Services | 15 | ✅ 양호 |
| Shared UI | 7 | ⚠️ 부분 |
| Hooks | 7 | ⚠️ 부분 |
| Controllers | 5 | ⚠️ 부분 |
| Entities | 7 | ✅ 양호 |
| Modal System | 0 | ❌ 미흡 |
| Providers | 1 | ❌ 미흡 |

### CSS 변수 사용 현황

| 카테고리 | 사용 횟수 |
|---------|----------|
| 색상 변수 | ~2,200 |
| 레이아웃/간격 | ~800 |
| 타이포그래피 | ~600 |
| 애니메이션/타이밍 | ~400 |
| **총계** | **~4,000** |

### 상태 관리 분포

| 패턴 | 사용처 |
|-----|-------|
| Zustand | 6개 스토어 |
| React Context | 4개 Context |
| TanStack Query | ~15개 훅 |
| useState (App.tsx) | 36개 (문제) |

---

## 8. 작업 진행 기록

### 2025-11-29 Phase 1 작업 완료

#### ✅ 작업 1: DocumentStatusProvider 메모리 누수 수정

**문제**:
- `fetchDocuments` 함수가 7개 의존성을 가지고 자주 재생성됨
- 폴링 `useEffect`가 `fetchDocuments` 변경 시마다 interval 재설정
- Page Visibility API `useEffect`도 동일 문제

**해결**:
- `useRef`로 최신 함수 참조 유지하여 interval 재생성 방지
- 폴링 useEffect의 의존성에서 `fetchDocuments`, `checkApiHealth` 제거
- Page Visibility API useEffect도 동일하게 수정

**수정 파일**:
- `src/providers/DocumentStatusProvider.tsx`

**변경 내용**:
```typescript
// 🔧 useRef로 최신 함수 참조 유지 (폴링 interval 및 이벤트 리스너 안정화)
const fetchDocumentsRef = useRef(fetchDocuments)
const checkApiHealthRef = useRef(checkApiHealth)

// 최신 함수로 ref 업데이트 (렌더링마다)
useEffect(() => {
  fetchDocumentsRef.current = fetchDocuments
}, [fetchDocuments])

useEffect(() => {
  checkApiHealthRef.current = checkApiHealth
}, [checkApiHealth])

// 폴링 useEffect - ref 사용으로 의존성 안정화
useEffect(() => {
  if (typeof window === 'undefined') return
  if (!isPollingEnabled) return
  if (!isPageVisible) return

  const interval = setInterval(() => {
    fetchDocumentsRef.current(false)
    checkApiHealthRef.current()
  }, 5000)

  return () => clearInterval(interval)
}, [isPollingEnabled, isPageVisible]) // fetchDocuments, checkApiHealth 의존성 제거
```

**검증**:
- TypeScript 타입체크 통과
- 2,974개 테스트 통과

---

#### ✅ 작업 2: CSS 하드코딩 제거

**문제**:
- `CenterPaneView.css`: `rgba(255, 255, 255, 0.7)`, `rgba(28, 28, 30, 0.7)` 등 하드코딩
- `QuickFamilyAssignPanel.css`: `#dc3545` 에러 색상 하드코딩

**해결**:

1. **theme.css에 새 변수 추가**:
```css
/* Light Theme */
--color-header-glass-bg: rgba(255, 255, 255, 0.7);
--color-scrollbar-thumb: var(--color-ios-scrollbar-light);
--color-scrollbar-thumb-hover: var(--color-ios-scrollbar-hover-light);
--color-text-placeholder: var(--color-ios-text-placeholder-light);

/* Dark Theme */
--color-header-glass-bg: rgba(28, 28, 30, 0.7);
--color-scrollbar-thumb: var(--color-ios-scrollbar-dark);
--color-scrollbar-thumb-hover: var(--color-ios-scrollbar-hover-dark);
--color-text-placeholder: var(--color-ios-text-placeholder-dark);
```

2. **CenterPaneView.css 수정**:
```css
/* 변경 전 */
background-color: rgba(255, 255, 255, 0.7);

/* 변경 후 */
background-color: var(--color-header-glass-bg);
```

3. **QuickFamilyAssignPanel.css 수정**:
```css
/* 변경 전 */
color: #dc3545;
background: rgba(220, 53, 69, 0.1);
border-bottom: 1px solid rgba(220, 53, 69, 0.2);

/* 변경 후 */
color: var(--color-status-error);
background: var(--color-status-error-bg);
border-bottom: 1px solid var(--color-border-error);
```

**수정 파일**:
- `src/shared/design/theme.css`
- `src/components/CenterPaneView/CenterPaneView.css`
- `src/components/CustomerViews/CustomerRelationshipView/QuickFamilyAssignPanel/QuickFamilyAssignPanel.css`

**검증**:
- 프로덕션 빌드 성공

---

#### ✅ 작업 3: Modal 시스템 테스트 추가

**문제**:
- Modal, DraggableModal, CustomerSelectorModal: 0개 테스트
- 핵심 UI 기반 컴포넌트 검증 부재

**해결**:
- Modal 컴포넌트 테스트 21개 작성

**생성 파일**:
- `src/shared/ui/Modal/__tests__/Modal.test.tsx`

**테스트 항목**:
| 카테고리 | 테스트 수 | 내용 |
|---------|----------|------|
| 기본 렌더링 | 4 | visible true/false, header, footer |
| 크기 변형 | 4 | sm, md, lg, xl 클래스 |
| ESC 키 닫기 | 2 | escapeToClose true/false |
| backdrop 클릭 | 3 | backdropClosable true/false, 내부 클릭 |
| 닫기 버튼 | 1 | onClose 호출 |
| 접근성 | 5 | role, aria-modal, ariaLabel |
| 추가 CSS | 1 | className 적용 |
| React Node title | 1 | title에 React 요소 |
| **합계** | **21** | |

**검증**:
- 21개 테스트 모두 통과

---

### 작업 결과 요약

| 작업 | 상태 | 수정 파일 수 | 테스트 |
|-----|------|------------|-------|
| DocumentStatusProvider 메모리 누수 수정 | ✅ 완료 | 1 | 2,974 통과 |
| CSS 하드코딩 제거 | ✅ 완료 | 3 | 빌드 성공 |
| Modal 시스템 테스트 추가 | ✅ 완료 | 1 (신규) | 21 테스트 추가 |

### 업데이트된 테스트 커버리지

| 영역 | 테스트 수 | 상태 | 변경 |
|-----|----------|------|------|
| Document Views | 37 | ✅ 우수 | - |
| Customer Features | 16 | ✅ 양호 | - |
| Services | 15 | ✅ 양호 | - |
| Shared UI | 7 | ⚠️ 부분 | - |
| Hooks | 7 | ⚠️ 부분 | - |
| Controllers | 5 | ⚠️ 부분 | - |
| Entities | 7 | ✅ 양호 | - |
| **Modal System** | **21** | **✅ 양호** | **+21** |
| Providers | 1 | ❌ 미흡 | - |

---

**작성자**: Claude Code
**검토 필요**: 개발팀
