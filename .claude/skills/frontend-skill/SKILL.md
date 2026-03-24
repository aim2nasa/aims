---
name: frontend-skill
description: AIMS 프론트엔드 개발 가이드. React, 컴포넌트, 뷰, 화면, 프론트엔드 작업 시 자동 사용
---

# AIMS 프론트엔드 개발 가이드

> 프론트엔드 코드 수정, 컴포넌트 작성, 화면 개발 시 참조

## 프로젝트 기본

- 경로: `frontend/aims-uix3/`
- 스택: React 19 + TypeScript + Vite + TanStack Query + Zustand
- 명령어: `npm run dev` (5177), `npm run build`, `npm run test`, `npm run typecheck`
- 별칭: `@/shared/*`, `@/features/*`, `@/entities/*`, `@/services/*`, `@/components/*` 등

## 디렉토리 구조

| 디렉토리 | 용도 |
|----------|------|
| `src/features/` | 기능 모듈 (api/, components/, controllers/, hooks/, views/) |
| `src/shared/ui/` | 공용 UI 컴포넌트 (Button, Modal, Tooltip, Toast 등) |
| `src/shared/store/` | Zustand 스토어 (useLayoutStore, useDevModeStore 등) |
| `src/shared/lib/` | 유틸 (api.ts, timeUtils.ts, logger.ts) |
| `src/shared/design/` | 디자인 토큰 (tokens.css, theme.css) |
| `src/entities/` | 도메인 엔티티 + Zod 스키마 |
| `src/services/` | 비즈니스 로직 + API 호출 |
| `src/components/` | 레거시 뷰 컴포넌트 (features/로 마이그레이션 중) |
| `src/pages/` | 라우트 페이지 (thin wrapper, lazy loading) |
| `src/app/` | queryClient.ts, router.tsx |

## 상태 관리 패턴

### Zustand (클라이언트/UI 상태)
```tsx
// 스토어 정의: src/shared/store/useXxxStore.ts
const useXxxStore = create<XxxState>((set) => ({
  value: false,
  setValue: (v) => set({ value: v }),
}))

// persist 필요 시: zustand/middleware의 persist 사용
// 사용자 격리 키: `aims-xxx_${userId}`
```

### TanStack Query (서버 상태)
```tsx
// 쿼리 키 팩토리: src/app/queryClient.ts
queryKeys.customers()                    // ['aims', 'customers']
queryKeys.customer(id)                   // ['aims', 'customers', id]
queryKeys.documentsByCustomer(customerId)

// 캐시 무효화
invalidateQueries.customers()
invalidateQueries.customerChanged(id)
```

- staleTime: 5분, gcTime: 10분
- refetchOnWindowFocus: false
- **데이터 변경 후: 반드시 `window.location.reload()`** (Optimistic Update 금지)

### React Context (트리 스코프)
- `useAppleConfirm()` — alert/confirm 모달
- `useDocumentSearch()` — 문서 검색 상태
- `CustomerContext` — 고객 목록/선택

## API 호출 패턴

```tsx
import { api } from '@/shared/lib/api'

// GET
const data = await api.get<ResponseType>('/api/customers')

// POST
await api.post('/api/customers', { name: '...' })

// 에러 타입: ApiError, NetworkError, TimeoutError, RequestCancelledError
```

- 프록시: `/api` → `100.110.215.65:3010`, `/shadow` → `:8100`, `/pdf-proxy` → `:8002`

## 컴포넌트 패턴

### 뷰 컴포넌트
```tsx
// props 패턴
interface Props {
  visible: boolean
  onClose: () => void
  onNavigate?: (view: string) => void
  onCustomerClick?: (customer: Customer) => void
}

// forwardRef로 refresh() 노출
const MyView = forwardRef<{ refresh: () => void }, Props>((props, ref) => { ... })
```

### 기능 모듈 구조 (features/)
```
features/customer/
  api/           — API 함수
  components/    — 내부 컴포넌트
  controllers/   — 비즈니스 로직 훅
  hooks/         — 기능별 훅
  views/         — 뷰 컴포넌트
```

### CSS는 뷰별 co-located
```
ViewName.tsx
ViewName.css
ViewName.mobile.css
```

## 필수 UI 규칙

- **Tooltip**: 반드시 `<Tooltip>` from `@/shared/ui/Tooltip` (native title 금지)
- **Modal**: `useModal()` + `<Modal>` — ESC, backdrop click, body overflow 처리
- **Toast**: `useToastContext()` — `toast.success()`, `toast.error()`
- **Alert/Confirm**: `useAppleConfirm()` — `showAlert()`, `showConfirm()`
- **아이콘**: `<SFSymbol>` — max 17px(BODY), 배경 투명, 호버는 opacity+scale
- **날짜**: `formatDate()`, `formatDateTime()` from `@/shared/lib/timeUtils`

## CSS 규칙 (css-rules 스킬 참조)

- 색상: `var(--color-*)` CSS 변수만 (hex 금지, !important 금지)
- 레이어 순서: `reset → tokens → theme → base → utilities → components → views → responsive`
- 다크모드: `[data-theme="dark"]` 속성
- font-weight 500 금지
- CSS 수정 시 `grep "클래스명" **/*.css`로 부모 오버라이드 확인 필수

## SSE 실시간 구독

```tsx
import { useCustomerSSE } from '@/shared/hooks/useCustomerSSE'
// SharedWorker 기반, 채널: customerDoc, ar, cr, documentStatus 등
```

## 테스트

- 프레임워크: Vitest + jsdom
- 커버리지: 50% stmt/fn/lines, 40% branches
- 실행: `npm run test`, `npm run test:coverage`

## UI 변경 시 Playwright 검증 (필수)

UI를 수정/구현한 경우 반드시 Playwright E2E로 검증한다. DOM 존재 여부만 확인하는 것은 검증이 아니다.

### 검증 기준
- **값 검증**: 각 요소의 실제 텍스트, class, attribute 값을 개별 확인
- **인터랙션 검증**: 클릭/입력/선택 후 상태 변화가 기대값과 일치하는지 확인
- **시각 검증**: headful 모드로 실행하여 색상/레이아웃을 육안 확인 가능한 스크린샷 캡처
- **에러 경로 검증**: 실패 응답, 빈 데이터, 네트워크 오류 시 UI가 올바르게 반응하는지 확인

### 금지 사항
- DOM 요소 존재(`isVisible`, `count > 0`)만 확인하고 PASS 처리 금지
- headless 모드에서 저해상도 스크린샷만 찍고 검증 완료 처리 금지
- 상태(색상, class)를 확인하지 않고 "스크린샷 확인" 처리 금지

### xPipeWeb (순수 HTML+JS)
xPipeWeb은 React가 아닌 순수 HTML+JS 구성이지만 동일한 Playwright 검증 기준을 적용한다.
