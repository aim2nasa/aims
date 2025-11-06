# AIMS-UIX3 모달 계층 구조 전체 분석

**날짜**: 2025-11-06
**분석 대상**: `d:/aims/frontend/aims-uix3/src`
**분석자**: Claude Code

---

## 📊 전체 현황 (18개) - 업데이트됨 ✅

```
공통 시스템 사용: 13개 (72.2%) ✅
자체 구현: 5개 (27.8%) ⚠️
```

> **업데이트 (2025-11-06)**: ConfirmationDialog 삭제 (Dead Code 제거, 커밋 610465f)
> 총 모달 수: 19개 → 18개

---

## 🏗️ 계층 구조 다이어그램

```
[Level 0: 기반 컴포넌트]
│
├─ Modal (@/shared/ui/Modal)
│  ├─ useEscapeKey (ESC 키 닫기)
│  ├─ useBodyOverflow (iOS 스크롤 방지)
│  ├─ useBackdropClick (배경 클릭 닫기)
│  └─ createPortal 자동 처리
│
└─ DraggableModal (@/shared/ui/DraggableModal)
   ├─ Modal의 모든 기능 상속 ⬆️
   ├─ useModalDragResize (드래그 & 리사이즈)
   ├─ 8방향 핸들
   └─ 크기 초기화 버튼

────────────────────────────────────────

[Level 1: 애플리케이션 모달]

📦 Modal 기반 (9개)
├─ DocumentDetailModal (문서 상세)
├─ DocumentSummaryModal (문서 요약)
├─ DocumentFullTextModal (전체 텍스트)
├─ DocumentNotesModal (메모 편집)
├─ DocumentLinkModal (고객 연결)
├─ FullTextModal (검색 전체 텍스트)
├─ CustomerEditModal (고객 수정 4탭 폼)
├─ AddressArchiveModal (주소 이력)
└─ RelationshipModal (관계 추가 공통)
   ├─ FamilyRelationshipModal (가족 관계 래퍼)
   └─ CorporateRelationshipModal (법인 관계 래퍼)

🔲 DraggableModal 기반 (4개)
├─ CustomerSelectorModal (고객 선택 트리)
├─ AnnualReportModal (Annual Report 보기)
├─ CustomerIdentificationModal (고객 식별)
└─ CustomerDocumentPreviewModal (문서 프리뷰, 훅 직접 사용*)

⚠️ 자체 구현 (5개) - ConfirmationDialog 삭제됨 ✅
├─ AddressSearchModal (Kakao 주소 검색, createPortal)
├─ LayoutControlModal (레이아웃 제어, createPortal + useDraggable)
├─ AppleConfirmModal (iOS 확인, createPortal + Controller)
├─ RelationshipModal (DOM 직접 렌더링, createPortal 미사용)
└─ CustomerDocumentPreviewModal (useModalDragResize 훅 직접 사용)
```

---

## 📋 상세 목록

### ✅ Modal 기반 (9개)

| # | 모달 | 경로 | 설명 |
|---|------|------|------|
| 1 | DocumentDetailModal | `components/DocumentViews/DocumentStatusView/components/` | 문서 상세 정보 (iOS Settings 스타일) |
| 2 | DocumentSummaryModal | `components/DocumentViews/DocumentStatusView/components/` | 문서 요약 표시 |
| 3 | DocumentFullTextModal | `components/DocumentViews/DocumentStatusView/components/` | 문서 전체 텍스트 |
| 4 | DocumentNotesModal | `components/DocumentViews/DocumentStatusView/components/` | 메모 편집/삭제 |
| 5 | DocumentLinkModal | `components/DocumentViews/DocumentStatusView/components/` | 문서-고객 연결 |
| 6 | FullTextModal | `components/DocumentViews/DocumentSearchView/` | 검색 결과 전체 텍스트 |
| 7 | CustomerEditModal | `features/customer/views/CustomerEditModal/` | 고객 수정 (4탭 폼) |
| 8 | AddressArchiveModal | `features/customer/components/AddressArchiveModal/` | 주소 이력 전체 표시 |
| 9 | RelationshipModal | `features/customer/components/RelationshipModal/` | 관계 추가 공통 모달 |

**래퍼 컴포넌트 (2개)**:
- `FamilyRelationshipModal` → RelationshipModal 사용 (가족 관계 타입 전달)
- `CorporateRelationshipModal` → RelationshipModal 사용 (법인 관계 타입 전달)

**주요 기능**:
- ✅ ESC 키로 닫기 자동 지원
- ✅ iOS 스크롤 방지 (body position: fixed)
- ✅ 배경 클릭으로 닫기 옵션
- ✅ createPortal 자동 처리
- ✅ 다크모드 자동 지원

---

### ✅ DraggableModal 기반 (4개)

| # | 모달 | 경로 | 설명 |
|---|------|------|------|
| 1 | CustomerSelectorModal | `shared/ui/CustomerSelectorModal/` | 고객 선택 (트리 구조 + 실시간 검색) |
| 2 | AnnualReportModal | `features/customer/components/AnnualReportModal/` | Annual Review Report 표시 |
| 3 | CustomerIdentificationModal | `features/customer/components/CustomerIdentificationModal/` | 동명이인 고객 식별 (1명/다수/없음) |
| 4 | CustomerDocumentPreviewModal* | `features/customer/views/CustomerDetailView/tabs/` | 문서 프리뷰 (PDF/이미지, react-pdf) |

> *`CustomerDocumentPreviewModal`은 DraggableModal 컴포넌트 대신 `useModalDragResize` 훅을 직접 사용 + createPortal

**주요 기능** (Modal의 모든 기능 + 추가):
- ✅ 드래그로 이동
- ✅ 8방향 리사이즈 핸들 (상하좌우 + 4개 코너)
- ✅ 화면 경계 제약 (모달이 화면 밖으로 나가지 않음)
- ✅ 크기 초기화 버튼
- ✅ Min/Max 크기 제한
- ✅ 자동 위치 초기화 (닫을 때)

---

### ⚠️ 자체 구현 (4개) - ConfirmationDialog 삭제됨 ✅

| # | 모달 | 경로 | 구현 방식 | 특수성 |
|---|------|------|----------|--------|
| 1 | AddressSearchModal | `features/customer/components/AddressSearchModal/` | createPortal 직접 사용 | Kakao Maps API 연동 |
| 2 | LayoutControlModal | `components/LayoutControlModal.tsx` | createPortal + useDraggable | 레이아웃 제어 패널 |
| 3 | AppleConfirmModal | `components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/` | createPortal + Controller | Controller-View 패턴 |
| 4 | RelationshipModal | `features/customer/components/RelationshipModal/` | DOM 직접 렌더링 | createPortal 미사용 |
| 5 | CustomerDocumentPreviewModal | `features/customer/views/CustomerDetailView/tabs/` | useModalDragResize 훅 직접 | react-pdf 통합 |

**특징**:
- ⚠️ ESC 키, body overflow 등을 자체 구현
- ⚠️ 코드 중복 가능성
- ⚠️ 유지보수 비용 증가
- ✅ 특수 기능 구현 가능 (Kakao API, 햅틱 등)

---

## 🎯 마이그레이션 우선순위

### 🟢 High Priority (3개) - 즉시 전환 권장

1. **AddressSearchModal** → `Modal`
   - **이유**: Kakao API는 모달 내부 콘텐츠일 뿐, Modal 컴포넌트와 무관
   - **예상 효과**: ESC 키, body overflow 자동 처리
   - **난이도**: 낮음

2. **CustomerDocumentPreviewModal** → `DraggableModal`
   - **이유**: 이미 `useModalDragResize` 훅 사용 중, 컴포넌트로 전환만 필요
   - **예상 효과**: 리사이즈 핸들, 초기화 버튼 자동 획득
   - **난이도**: 낮음

3. **LayoutControlModal** → `DraggableModal`
   - **이유**: useDraggable 사용 중, DraggableModal이 더 강력
   - **예상 효과**: 8방향 리사이즈, 화면 경계 제약 자동 획득
   - **난이도**: 중간

---

### 🟡 Medium Priority (1개) - 선택적 전환

4. **RelationshipModal** → `Modal`
   - **이유**: createPortal도 사용하지 않는 단순 구조
   - **예상 효과**: ESC 키, backdrop 클릭 자동 처리
   - **난이도**: 낮음
   - **주의**: FamilyRelationshipModal, CorporateRelationshipModal이 래퍼로 사용 중

---

### 🔴 Low Priority (1개) - 유지 권장

5. **AppleConfirmModal**
   - **유지 이유**: Controller-View 패턴 특수성 (`useAppleConfirmController` 훅 연동)
   - **마이그레이션 비용**: 높음
   - **효과**: 낮음

### ✅ 삭제 완료 (1개) - Dead Code 제거

6. **~~ConfirmationDialog~~** ✅ 삭제됨 (커밋 610465f)
   - **삭제 이유**: Dead Code (실제 사용되지 않음)
   - **대체**: AppleConfirmModal이 실제 확인 다이얼로그로 사용 중
   - **영향**: 없음

---

## 📈 통계 및 전망

### 현재 상태

| 카테고리 | 개수 | 비율 |
|---------|------|------|
| **Modal 기반** | 9 | 50.0% |
| **DraggableModal 기반** | 4 | 22.2% |
| **공통 시스템 합계** | **13** | **72.2%** ✅ |
| **자체 구현** | 5 | 27.8% |
| **전체** | **18** | **100%** |

> **변경사항**: ConfirmationDialog 삭제 (Dead Code 제거, 커밋 610465f)

### 마이그레이션 완료 시 예상

**High + Medium Priority 4개 전환 시**:

| 카테고리 | 개수 | 비율 |
|---------|------|------|
| **Modal 기반** | 11 (+2) | 61.1% |
| **DraggableModal 기반** | 6 (+2) | 33.3% |
| **공통 시스템 합계** | **17** | **94.4%** 🎯 |
| **자체 구현 (특수 목적)** | 1 | 5.6% |
| **전체** | **18** | **100%** |

**예상 코드 감소량**: 약 150~200줄 (ESC, body overflow, drag 로직 제거)

> **업데이트**: 총 모달 수 19개 → 18개 (ConfirmationDialog 삭제)

---

## 🔍 상세 분석: 자체 구현 모달

### 1. AddressSearchModal
**파일**: `features/customer/components/AddressSearchModal/AddressSearchModal.tsx`

**현재 구현**:
```typescript
import { createPortal } from 'react-dom'

// ESC 키 처리 (자체 구현)
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  window.addEventListener('keydown', handleEscape)
  return () => window.removeEventListener('keydown', handleEscape)
}, [onClose])

return createPortal(
  <div className="address-search-modal-overlay" onClick={handleBackdropClick}>
    <div className="address-search-modal-content">
      {/* Kakao API 컴포넌트 */}
    </div>
  </div>,
  document.body
)
```

**권장 변경**:
```typescript
import Modal from '@/shared/ui/Modal'

return (
  <Modal
    visible={isOpen}
    onClose={onClose}
    showHeader={false}
    backdropClosable={true}
  >
    {/* Kakao API 컴포넌트 */}
  </Modal>
)
```

**효과**: 약 40줄 감소, ESC/body overflow 자동 처리

---

### 2. CustomerDocumentPreviewModal
**파일**: `features/customer/views/CustomerDetailView/tabs/CustomerDocumentPreviewModal.tsx`

**현재 구현**:
```typescript
import { createPortal } from 'react-dom'
import { useModalDragResize } from '@/shared/ui/DraggableModal/hooks/useModalDragResize'

const {
  position,
  size,
  isDragging,
  isResizing,
  handleMouseDown,
  resetPosition
} = useModalDragResize({ initialWidth: 1200, initialHeight: 800 })

return createPortal(
  <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
    {/* 수동 리사이즈 핸들 구현 */}
  </div>,
  document.body
)
```

**권장 변경**:
```typescript
import DraggableModal from '@/shared/ui/DraggableModal'

return (
  <DraggableModal
    visible={isOpen}
    onClose={onClose}
    title="문서 프리뷰"
    initialWidth={1200}
    initialHeight={800}
    minWidth={800}
    minHeight={600}
  >
    {/* react-pdf 컴포넌트 */}
  </DraggableModal>
)
```

**효과**: 약 60줄 감소, 8방향 핸들 + 초기화 버튼 자동 획득

---

### 3. LayoutControlModal
**파일**: `components/LayoutControlModal.tsx`

**현재 구현**:
```typescript
import { createPortal } from 'react-dom'
import { useDraggable } from '@/shared/hooks/useDraggable'

const { position, handleMouseDown } = useDraggable()

return createPortal(
  <div style={{ left: position.x, top: position.y }}>
    {/* 레이아웃 제어 UI */}
  </div>,
  document.body
)
```

**권장 변경**:
```typescript
import DraggableModal from '@/shared/ui/DraggableModal'

return (
  <DraggableModal
    visible={isOpen}
    onClose={onClose}
    title="레이아웃 제어"
    initialWidth={400}
    initialHeight={500}
    showHeader={true}
  >
    {/* 레이아웃 제어 UI */}
  </DraggableModal>
)
```

**효과**: 약 50줄 감소, 리사이즈 + 화면 경계 제약 자동 획득

---

### 4. RelationshipModal
**파일**: `features/customer/components/RelationshipModal/RelationshipModal.tsx`

**현재 구현**:
```typescript
// createPortal 미사용, DOM에 직접 렌더링
return (
  <div className="relationship-modal-overlay">
    <div className="relationship-modal-content">
      {/* 관계 추가 폼 */}
    </div>
  </div>
)
```

**권장 변경**:
```typescript
import Modal from '@/shared/ui/Modal'

return (
  <Modal
    visible={visible}
    onClose={onClose}
    showHeader={false}
    backdropClosable={true}
  >
    {/* 관계 추가 폼 */}
  </Modal>
)
```

**효과**: ESC 키, backdrop 클릭 자동 처리, z-index 관리 자동화

---

## 🎓 리팩토링 Best Practices

### 1. 마이그레이션 체크리스트

**Modal로 전환 시**:
- [ ] `import Modal from '@/shared/ui/Modal'` 추가
- [ ] `createPortal` 제거
- [ ] ESC 키 핸들러 제거 (자동 처리됨)
- [ ] body overflow 로직 제거 (자동 처리됨)
- [ ] backdrop 클릭 핸들러 제거 (자동 처리됨)
- [ ] CSS에서 `.overlay` 스타일 정리
- [ ] 테스트 업데이트 (Portal 구조 변경)

**DraggableModal로 전환 시**:
- [ ] `import DraggableModal from '@/shared/ui/DraggableModal'` 추가
- [ ] Modal 체크리스트 전부 + 아래 추가
- [ ] 드래그 state 제거 (`isDragging`, `position` 등)
- [ ] 드래그 핸들러 제거 (`handleMouseDown`, `handleMouseMove` 등)
- [ ] `useModalDragResize` 훅 호출 제거
- [ ] 수동 리사이즈 핸들 제거 (8방향 자동 생성됨)
- [ ] 드래그 관련 테스트 스킵 또는 제거

---

### 2. 점진적 리팩토링 원칙

```
Phase 1: 가장 단순한 것부터 (AddressSearchModal)
  ↓
Phase 2: 중간 복잡도 (RelationshipModal)
  ↓
Phase 3: 복잡한 것 (CustomerDocumentPreviewModal, LayoutControlModal)
  ↓
각 Phase마다 테스트 통과 확인 → 다음 단계 진행
```

---

### 3. 비즈니스 로직 보존 원칙

**절대 변경하지 않을 것**:
- API 호출 로직
- 상태 관리 로직
- 폼 검증 로직
- 데이터 변환 로직
- 이벤트 핸들러 로직

**변경할 것**:
- Portal 구조
- ESC 키 핸들링
- body overflow 제어
- 드래그/리사이즈 구현
- CSS 클래스명 (필요시)

---

## 📊 예상 효과

### 코드 품질

| 항목 | Before | After | 개선 |
|------|--------|-------|------|
| 총 코드 줄 수 | ~1,500줄 | ~1,300줄 | -200줄 (-13%) |
| 중복 코드 | ESC/body overflow 6곳 | 0곳 | -100% |
| 테스트 커버리지 | 개별 구현 테스트 | 공통 시스템 테스트 | 일관성 ↑ |
| 유지보수성 | 6개 개별 관리 | 2개 공통 관리 | 비용 -67% |

---

### 사용자 경험

| 기능 | Before | After |
|------|--------|-------|
| ESC 키 닫기 | 일부 모달만 | 모든 모달 ✅ |
| iOS 스크롤 방지 | 일부 모달만 | 모든 모달 ✅ |
| 드래그 경계 제약 | 없음 | 자동 적용 ✅ |
| 리사이즈 핸들 | 수동 구현 | 8방향 자동 ✅ |
| 크기 초기화 | 없음 | 버튼 자동 생성 ✅ |

---

## 🚀 다음 단계 제안

### Immediate Actions (1주 이내)

1. **AddressSearchModal → Modal** (2시간)
   - 가장 단순, 즉시 효과 가시화
   - Kakao API 영향 없음

2. **CustomerDocumentPreviewModal → DraggableModal** (3시간)
   - 이미 훅 사용 중, 전환 용이
   - react-pdf 영향 없음

---

### Short-term Goals (2주 이내)

3. **LayoutControlModal → DraggableModal** (4시간)
   - 레이아웃 제어 로직 복잡, 테스트 필요

4. **RelationshipModal → Modal** (2시간)
   - 래퍼 컴포넌트 2개 동시 테스트 필요

---

### Long-term Considerations

5. **AppleConfirmModal, ConfirmationDialog 평가**
   - Controller-View 패턴 재평가
   - 햅틱 피드백을 Modal에 통합 가능한지 검토
   - 6개월 후 재검토

---

## 📚 참고 문서

- **리팩토링 이력**: [`MODAL_REFACTORING_SUMMARY_20251106.md`](./MODAL_REFACTORING_SUMMARY_20251106.md)
- **공통 Modal 문서**: `frontend/aims-uix3/src/shared/ui/Modal/README.md`
- **DraggableModal 문서**: `frontend/aims-uix3/src/shared/ui/DraggableModal/README.md`
- **useModalCore 훅 문서**: `frontend/aims-uix3/src/shared/ui/Modal/hooks/useModalCore.ts`

---

## ✅ 결론

**AIMS-UIX3 모달 시스템은 현재 72.2%의 공통화율을 달성했으며, 4개 모달을 추가 마이그레이션하면 94.4%까지 향상 가능합니다.**

**핵심 전략**:
1. ✅ 단순한 것부터 점진적 마이그레이션
2. ✅ 비즈니스 로직 100% 보존
3. ✅ 각 단계마다 테스트 통과 확인
4. ✅ 특수 목적 모달은 유지 (AppleConfirmModal)
5. ✅ Dead Code 제거 (ConfirmationDialog 삭제 완료)

**예상 ROI**:
- 코드 13% 감소
- 유지보수 비용 67% 감소
- 사용자 경험 일관성 향상
- 버그 수정 용이성 향상

**현재까지 달성**:
- ✅ ConfirmationDialog 삭제 (Dead Code 제거, 3,371줄 감소)
- ✅ 공통화율 68.4% → 72.2% 향상

---

**문서 작성일**: 2025-11-06
**다음 리뷰 예정일**: 2025-11-13 (마이그레이션 Phase 4 완료 후)
