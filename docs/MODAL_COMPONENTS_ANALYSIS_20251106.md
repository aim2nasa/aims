# AIMS-UIX3 모달 컴포넌트 분석 보고서

**작성일**: 2025년 11월 6일
**분석 대상**: frontend/aims-uix3
**목적**: 공통 모달 시스템 채택 현황 파악 및 개선 방안 도출

---

## 📊 전체 현황

**총 19개 모달** (테스트 파일 제외)

| 구분 | 개수 | 비율 |
|------|------|------|
| ✅ 공통 Modal 직접 사용 | 7개 | 36.8% |
| ✅ 공통 Modal 간접 사용 (래퍼) | 2개 | 10.5% |
| ❌ 자체 구현 | 10개 | 52.6% |
| **공통 시스템 채택률** | **9개** | **47.4%** |

---

## 🎯 공통 모달 시스템

### 1. Modal (기본 모달)
**경로**: `src/shared/ui/Modal/Modal.tsx`

**주요 기능**:
- React Portal 자동 처리
- ESC 키로 닫기
- body overflow 제어
- backdrop 클릭으로 닫기
- ARIA 접근성 지원
- Light/Dark 테마 자동 대응

**Props**:
- `visible`, `onClose`, `title`, `size`, `backdropClosable`
- `escapeToClose`, `showHeader`, `footer`, `children`

### 2. DraggableModal (드래그 가능 모달)
**경로**: `src/shared/ui/DraggableModal/DraggableModal.tsx`

**주요 기능**:
- Modal 기반 확장
- 헤더 드래그로 이동
- 8개 핸들로 크기 조절
- 크기 초기화 버튼
- Portal, ESC, body overflow 자동 처리

**추가 Props**:
- `initialWidth`, `initialHeight`, `minWidth`, `minHeight`
- `showResetButton`, `onReset`

---

## ✅ 공통 모달을 사용하는 모달 (9개)

### Modal 직접 사용 (7개)

| 번호 | 파일명 | 용도 |
|------|--------|------|
| 1 | `DocumentDetailModal.tsx` | 문서 상세 정보 표시 |
| 2 | `DocumentFullTextModal.tsx` | 문서 전체 텍스트 표시 |
| 3 | `DocumentSummaryModal.tsx` | 문서 요약 정보 표시 |
| 4 | `DocumentNotesModal.tsx` | 문서 연결 시 메모 표시/편집 |
| 5 | `DocumentLinkModal.tsx` | 문서를 고객에게 연결 |
| 6 | `FullTextModal.tsx` | 검색 결과 전체 텍스트 표시 |

**파일 경로**:
- `src/components/DocumentViews/DocumentStatusView/components/`
  - DocumentDetailModal.tsx
  - DocumentFullTextModal.tsx
  - DocumentSummaryModal.tsx
  - DocumentNotesModal.tsx
  - DocumentLinkModal.tsx
- `src/components/DocumentViews/DocumentSearchView/`
  - FullTextModal.tsx

### DraggableModal 사용 (1개)

| 번호 | 파일명 | 용도 |
|------|--------|------|
| 7 | `CustomerSelectorModal.tsx` | 고객 선택 모달 (드래그 가능) |

**파일 경로**:
- `src/shared/ui/CustomerSelectorModal/CustomerSelectorModal.tsx`

### RelationshipModal 래퍼 (2개)

| 번호 | 파일명 | 용도 |
|------|--------|------|
| 8 | `FamilyRelationshipModal.tsx` | 가족 관계 추가 (RelationshipModal 래퍼) |
| 9 | `CorporateRelationshipModal.tsx` | 법인 관계 추가 (RelationshipModal 래퍼) |

**파일 경로**:
- `src/features/customer/components/FamilyRelationshipModal/FamilyRelationshipModal.tsx`
- `src/features/customer/components/CorporateRelationshipModal/CorporateRelationshipModal.tsx`

---

## ❌ 자체 구현 모달 (10개)

### A. 드래그/리사이즈 기능 필요 (4개)

| 번호 | 파일명 | 현재 구현 | 특징 |
|------|--------|----------|------|
| 1 | `AnnualReportModal.tsx` | createPortal + 자체 드래그 | 드래그 + 테이블 정렬 |
| 2 | `CustomerIdentificationModal.tsx` | div.overlay + 드래그 | 드래그 가능 |
| 3 | `CustomerDocumentPreviewModal.tsx` | createPortal + useModalDragResize | 드래그 + 리사이즈 |
| 4 | `LayoutControlModal.tsx` | createPortal + 드래그 | 부동 드래그 모달 |

**파일 경로**:
- `src/features/customer/components/AnnualReportModal/AnnualReportModal.tsx`
- `src/features/customer/components/CustomerIdentificationModal/CustomerIdentificationModal.tsx`
- `src/features/customer/views/CustomerDetailView/tabs/CustomerDocumentPreviewModal.tsx`
- `src/components/LayoutControlModal.tsx`

**개선 가능**: DraggableModal 기반으로 통합 가능

### B. 전문화된 검색/입력 UI (3개)

| 번호 | 파일명 | 현재 구현 | 특징 |
|------|--------|----------|------|
| 5 | `AddressSearchModal.tsx` | createPortal | 실시간 검색 + 페이지네이션 |
| 6 | `AddressArchiveModal.tsx` | div.overlay | 주소 이력 전문 표시 |
| 7 | `RelationshipModal.tsx` | div.overlay | 관계 추가 전문 UI |

**파일 경로**:
- `src/features/customer/components/AddressSearchModal/AddressSearchModal.tsx`
- `src/features/customer/components/AddressArchiveModal/AddressArchiveModal.tsx`
- `src/features/customer/components/RelationshipModal/RelationshipModal.tsx`

**개선 가능**: AddressArchiveModal은 Modal 기반 변경 가능
**유지 필요**: AddressSearchModal, RelationshipModal은 전문화된 UI

### C. 특수 목적 (2개)

| 번호 | 파일명 | 현재 구현 | 특징 |
|------|--------|----------|------|
| 8 | `AppleConfirmModal.tsx` | createPortal | iOS 네이티브 alert 완벽 재현 |
| 9 | `CustomerEditModal.tsx` | createPortal | 다중 탭 폼 |

**파일 경로**:
- `src/components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal.tsx`
- `src/features/customer/views/CustomerEditModal/CustomerEditModal.tsx`

**개선 가능**: CustomerEditModal은 Modal 기반 변경 가능
**유지 필요**: AppleConfirmModal은 iOS 디자인 철학 준수 필요

---

## 💡 개선 권장사항

### 우선순위: 높음 (즉시 개선 가능)

#### 1. CustomerEditModal → Modal 기반 변경
**현재**:
```tsx
// createPortal + 자체 ESC 처리
const modalContent = (
  <div className="modal-overlay" onClick={handleBackdropClick}>
    <div className="customer-edit-modal">
      {/* 다중 탭 폼 */}
    </div>
  </div>
)
return createPortal(modalContent, document.body)
```

**개선안**:
```tsx
import Modal from '@/shared/ui/Modal'

<Modal
  visible={isOpen}
  onClose={onClose}
  title="고객 정보 수정"
  size="lg"
>
  {/* 다중 탭 폼 로직 유지 */}
</Modal>
```

**효과**:
- ESC 키 처리 자동화
- body overflow 자동 제어
- 코드 간결화
- 테마 자동 대응

---

#### 2. AddressArchiveModal → Modal 기반 변경
**현재**:
```tsx
// div.overlay + 자체 구현
<div className="overlay">
  <div className="address-archive-modal">
    {/* 주소 이력 표시 */}
  </div>
</div>
```

**개선안**:
```tsx
import Modal from '@/shared/ui/Modal'

<Modal
  visible={isOpen}
  onClose={onClose}
  title="주소 이력"
  size="md"
>
  {/* 주소 이력 표시 로직 유지 */}
</Modal>
```

**효과**:
- 접근성 개선 (ARIA 지원)
- 표준화된 모달 동작
- 코드 일관성 향상

---

### 우선순위: 중간 (DraggableModal 기반 통합)

#### 3. AnnualReportModal → DraggableModal 기반 리팩토링
**현재**:
- 자체 드래그 로직 구현
- createPortal 직접 사용

**개선안**:
```tsx
import DraggableModal from '@/shared/ui/DraggableModal'

<DraggableModal
  visible={isOpen}
  onClose={onClose}
  title="연차보고서"
  initialWidth={1200}
  initialHeight={800}
  minWidth={800}
  minHeight={600}
>
  {/* 테이블 정렬 로직 유지 */}
</DraggableModal>
```

**효과**:
- 드래그 로직 제거 (100+ 줄 감소)
- 리사이즈 기능 자동 제공
- 크기 초기화 버튼 자동 제공

---

#### 4. CustomerIdentificationModal → DraggableModal 기반 리팩토링
**현재**:
- 자체 드래그 로직
- div.overlay 구현

**개선안**:
```tsx
import DraggableModal from '@/shared/ui/DraggableModal'

<DraggableModal
  visible={isOpen}
  onClose={onClose}
  title="고객 식별"
  initialWidth={900}
  initialHeight={700}
>
  {/* 기존 로직 유지 */}
</DraggableModal>
```

**효과**:
- 드래그 로직 간소화
- 표준화된 드래그 UX

---

#### 5. CustomerDocumentPreviewModal (이미 준수 ✅)
**현재 상태**:
- `useModalDragResize` 훅 사용 중
- DraggableModal의 핵심 로직 재사용

**평가**: 이미 공통 시스템과 동일한 패턴 사용 중

---

### 우선순위: 낮음 (유지 필요)

#### 특수 목적 모달 (변경 불필요)

| 모달 | 유지 이유 |
|------|----------|
| **AppleConfirmModal** | iOS 네이티브 alert 정확도 유지 필요 |
| **AddressSearchModal** | 실시간 검색 + 페이지네이션 전문화 |
| **RelationshipModal** | 관계 추가 전문 UI, 복잡한 상태 관리 |
| **LayoutControlModal** | 부동 모달로 특수한 위치 제어 필요 |

---

## 📈 개선 효과 예측

### 현재 상태
```
공통 시스템 채택률: 47.4% (9/19)
자체 구현: 52.6% (10/19)
```

### 개선 후 예측
```
개선 가능 모달: 4개
- CustomerEditModal
- AddressArchiveModal
- AnnualReportModal
- CustomerIdentificationModal

공통 시스템 채택률: 68.4% (13/19)
자체 구현: 31.6% (6/19)

향상률: +21%
```

### 코드 품질 개선
- **코드 라인 감소**: 약 300~400줄 (드래그 로직 제거)
- **유지보수성 향상**: 공통 컴포넌트로 버그 수정 일괄 반영
- **일관성 향상**: 모든 모달이 동일한 UX 제공
- **접근성 개선**: ARIA 지원 자동 제공

---

## 🔍 상세 파일 목록

### 공통 모달 시스템
```
src/shared/ui/Modal/Modal.tsx
src/shared/ui/DraggableModal/DraggableModal.tsx
```

### 공통 모달 사용 (9개)
```
src/components/DocumentViews/DocumentStatusView/components/
├── DocumentDetailModal.tsx
├── DocumentFullTextModal.tsx
├── DocumentSummaryModal.tsx
├── DocumentNotesModal.tsx
└── DocumentLinkModal.tsx

src/components/DocumentViews/DocumentSearchView/
└── FullTextModal.tsx

src/shared/ui/CustomerSelectorModal/
└── CustomerSelectorModal.tsx

src/features/customer/components/
├── FamilyRelationshipModal/FamilyRelationshipModal.tsx
└── CorporateRelationshipModal/CorporateRelationshipModal.tsx
```

### 자체 구현 (10개)
```
src/features/customer/components/
├── AnnualReportModal/AnnualReportModal.tsx
├── CustomerIdentificationModal/CustomerIdentificationModal.tsx
├── AddressSearchModal/AddressSearchModal.tsx
├── AddressArchiveModal/AddressArchiveModal.tsx
└── RelationshipModal/RelationshipModal.tsx

src/features/customer/views/
├── CustomerEditModal/CustomerEditModal.tsx
└── CustomerDetailView/tabs/CustomerDocumentPreviewModal.tsx

src/components/
├── LayoutControlModal.tsx
└── DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal.tsx
```

---

## 📝 결론

1. **현재 채택률 47.4%**는 양호한 수준이나, 개선 여지가 있음
2. **4개 모달**을 공통 시스템으로 전환하여 **68.4%**까지 향상 가능
3. **특수 목적 모달 6개**는 현 상태 유지가 적절
4. 개선 시 **코드 일관성**, **유지보수성**, **접근성** 대폭 향상 예상

---

**작성자**: Claude Code
**검토 필요**: 개선 작업 착수 전 팀 리뷰 권장
**다음 단계**: 우선순위별 리팩토링 계획 수립
