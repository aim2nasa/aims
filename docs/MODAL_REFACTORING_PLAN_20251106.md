# AIMS-UIX3 모달 구조 개선 리팩토링 계획서

**작성일**: 2025년 11월 6일
**작성자**: Claude Code
**버전**: 1.0.0
**프로젝트**: AIMS-UIX3

---

## 📋 목차

1. [개요](#1-개요)
2. [현황 분석](#2-현황-분석)
3. [목표 및 원칙](#3-목표-및-원칙)
4. [계층 구조 설계](#4-계층-구조-설계)
5. [실행 계획](#5-실행-계획)
6. [위험 관리](#6-위험-관리)
7. [기대 효과](#7-기대-효과)
8. [구현 세부사항](#8-구현-세부사항)
9. [점진적 마이그레이션](#9-점진적-마이그레이션)
10. [타임라인](#10-타임라인)

---

## 1. 개요

### 1.1 배경
AIMS-UIX3 프로젝트의 모달 시스템이 분산되어 있어 코드 중복과 유지보수 어려움이 발생하고 있습니다. 현재 19개 모달 중 10개(52.6%)가 자체 구현으로 되어 있어, 통합된 모달 시스템으로의 리팩토링이 필요합니다.

### 1.2 목적
- 개별적으로 존재하는 "자체 구현 모달"을 공용화
- Microsoft MFC 라이브러리처럼 상속 구조를 활용한 재사용 가능한 모달 시스템 구축
- 중복 코드 제거 및 유지보수성 향상
- Risk-free한 안전한 리팩토링 수행

---

## 2. 현황 분석

### 2.1 현재 통계
| 구분 | 개수 | 비율 |
|------|------|------|
| **총 모달 수** | 19개 | 100% |
| **공통 Modal 사용** | 7개 | 36.8% |
| **DraggableModal 사용** | 1개 | 5.3% |
| **래퍼 모달** | 2개 | 10.5% |
| **자체 구현** | 10개 | 52.6% |
| **공통 시스템 채택률** | 9개 | 47.4% |

### 2.2 중복 코드 분석
| 기능 | 중복 횟수 | 총 라인 수 |
|------|----------|-----------|
| createPortal + backdrop | 10개 | ~150줄 |
| ESC 키 처리 | 10개 | ~140줄 |
| body overflow 제어 | 10개 | ~100줄 |
| 드래그 로직 | 4개 | ~400줄 |
| **총 중복 코드** | - | **~790줄** |

### 2.3 자체 구현 모달 분류

#### A. 드래그/리사이즈 필요 (4개)
1. `AnnualReportModal` - 드래그 + 테이블 정렬
2. `CustomerIdentificationModal` - 드래그 가능
3. `CustomerDocumentPreviewModal` - 드래그 + 리사이즈
4. `LayoutControlModal` - 부동 드래그 모달

#### B. 전문화된 UI (3개)
5. `AddressSearchModal` - 실시간 검색 + 페이지네이션
6. `AddressArchiveModal` - 주소 이력 전문 표시
7. `RelationshipModal` - 관계 추가 전문 UI

#### C. 특수 목적 (3개)
8. `AppleConfirmModal` - iOS 네이티브 alert 재현
9. `CustomerEditModal` - 다중 탭 폼
10. `FamilyRelationshipModal` / `CorporateRelationshipModal` - RelationshipModal 래퍼

---

## 3. 목표 및 원칙

### 3.1 핵심 목표
1. **코드 재사용성 극대화**: 중복 코드 94% 제거 (740줄 → 50줄)
2. **공통 시스템 채택률 향상**: 47.4% → 68.4% (+21%)
3. **유지보수성 개선**: 단일 소스로 모달 동작 관리
4. **접근성 강화**: ARIA 지원 자동화
5. **성능 최적화**: 불필요한 리렌더링 방지

### 3.2 설계 원칙
1. **상속 구조 활용**: MFC 라이브러리 모델 참고
2. **점진적 마이그레이션**: 한 번에 하나씩 안전하게
3. **기능 동일성 보장**: 100% 기존 기능 유지
4. **테스트 우선**: 각 단계별 철저한 검증
5. **롤백 가능성**: 언제든 이전 상태로 복귀 가능

---

## 4. 계층 구조 설계

### 4.1 상속 구조도

```
BaseModalCore (추상 레이어)
    ├── BaseModal (구현 레이어)
    │   ├── Modal (정적 모달)
    │   │   ├── CustomerEditModal (마이그레이션)
    │   │   ├── AddressArchiveModal (마이그레이션)
    │   │   └── 기존 7개 모달
    │   │
    │   └── DraggableModal (드래그 가능)
    │       ├── AnnualReportModal (마이그레이션)
    │       ├── CustomerIdentificationModal (마이그레이션)
    │       └── CustomerSelectorModal (기존)
    │
    └── SpecializedModals (특수 목적 - 유지)
        ├── AppleConfirmModal (iOS 스타일)
        ├── SearchModal (실시간 검색)
        └── RelationshipModal (관계 입력)
```

### 4.2 계층별 역할

#### 4.2.1 BaseModalCore (최상위 추상 레이어)
```typescript
// 공통 인터페이스 정의
export interface BaseModalCoreProps {
  visible: boolean
  onClose: () => void
  escapeToClose?: boolean
  backdropClosable?: boolean
  className?: string
  ariaLabel?: string
}

// 공통 훅 제공
export interface BaseModalCoreHooks {
  useEscapeKey: Hook
  useBodyOverflow: Hook
  useBackdropClick: Hook
  usePortalContainer: Hook
}
```

#### 4.2.2 BaseModal (구현 레이어)
- BaseModalCore의 모든 훅 사용
- 공통 로직 구현
- 하위 모달들에게 기능 제공

#### 4.2.3 Modal / DraggableModal (구체 구현)
- BaseModal 기능 상속
- 각자의 특화 기능 추가
- 실제 사용되는 컴포넌트

---

## 5. 실행 계획

### Phase 1: BaseModalCore 훅 생성 (Risk: 낮음)

#### 목표
공통 로직을 훅으로 추출하여 코드 재사용성 확보

#### 작업 내용
1. **신규 파일 생성**
   ```
   src/shared/ui/Modal/hooks/useModalCore.ts
   - useEscapeKey: ESC 키 처리
   - useBodyOverflow: body 스크롤 제어
   - useBackdropClick: 배경 클릭 처리
   - usePortalContainer: Portal 관리
   ```

2. **기존 모달 리팩토링**
   - `Modal.tsx`: 중복 코드 제거, 훅 사용
   - `DraggableModal.tsx`: 중복 코드 제거, 훅 사용

#### 예상 결과
- **코드 감소**: ~140줄
- **소요 시간**: 2-3시간
- **영향 범위**: Modal 7개, DraggableModal 1개

#### 테스트 체크리스트
- [ ] ESC 키로 모달 닫기
- [ ] backdrop 클릭으로 닫기
- [ ] body 스크롤 방지
- [ ] 모달 닫힌 후 스크롤 복원

---

### Phase 2: 간단한 모달 마이그레이션 (Risk: 낮음)

#### 목표
드래그 기능이 없는 자체 구현 모달을 공통 Modal로 전환

#### 2.1 CustomerEditModal 마이그레이션

**현재 (자체 구현)**:
```typescript
// 50줄의 중복 코드
const modalContent = (
  <div className="modal-overlay" onClick={handleBackdropClick}>
    <div className="customer-edit-modal">
      {/* 다중 탭 폼 */}
    </div>
  </div>
)
return createPortal(modalContent, document.body)
```

**개선 후**:
```typescript
import Modal from '@/shared/ui/Modal'

<Modal
  visible={visible}
  onClose={onClose}
  title="고객 정보 수정"
  size="lg"
  backdropClosable={false}
>
  {/* 다중 탭 폼 로직 유지 */}
</Modal>
```

- **제거 코드**: ~50줄
- **추가 코드**: ~10줄
- **순 감소**: ~40줄

#### 2.2 AddressArchiveModal 마이그레이션

**현재 (자체 구현)**:
```typescript
// 30줄의 중복 코드
<div className="address-archive-modal-overlay">
  <div className="address-archive-modal">
    {/* 주소 이력 */}
  </div>
</div>
```

**개선 후**:
```typescript
import Modal from '@/shared/ui/Modal'

<Modal
  visible={isOpen}
  onClose={onClose}
  title={`🏠 ${customerName}님의 주소 보관소`}
  size="md"
>
  {/* 주소 이력 로직 유지 */}
</Modal>
```

- **제거 코드**: ~30줄
- **추가 코드**: ~8줄
- **순 감소**: ~22줄

#### Phase 2 총 효과
- **코드 감소**: ~62줄
- **소요 시간**: 3-4시간
- **채택률 향상**: 47.4% → 57.9%

---

### Phase 3: 드래그 모달 마이그레이션 (Risk: 중간)

#### 목표
자체 드래그 로직을 DraggableModal로 통합

#### 3.1 AnnualReportModal 마이그레이션

**현재 (자체 드래그 구현)**:
```typescript
// 120줄의 드래그 로직
const [isDragging, setIsDragging] = useState(false)
const [position, setPosition] = useState({ x: 0, y: 0 })
// ... 복잡한 드래그 이벤트 처리
```

**개선 후**:
```typescript
import DraggableModal from '@/shared/ui/DraggableModal'

<DraggableModal
  visible={isOpen}
  onClose={onClose}
  title={`${customerName}님의 Annual Report`}
  initialWidth={1200}
  initialHeight={800}
  showResetButton={true}
>
  {/* 테이블 정렬 로직 유지 */}
</DraggableModal>
```

- **제거 코드**: ~120줄
- **추가 코드**: ~15줄
- **순 감소**: ~105줄

**보너스 기능 (자동 제공)**:
- ✅ 8개 핸들로 리사이즈
- ✅ 크기 초기화 버튼
- ✅ 화면 경계 제약

#### 3.2 CustomerIdentificationModal 마이그레이션

**현재 (자체 드래그 구현)**:
```typescript
// 100줄의 드래그 로직
const [isDragging, setIsDragging] = useState(false)
const [position, setPosition] = useState({ x: 0, y: 0 })
// ... 드래그 이벤트 처리
```

**개선 후**:
```typescript
import DraggableModal from '@/shared/ui/DraggableModal'

<DraggableModal
  visible={isOpen}
  onClose={onClose}
  title="📊 Annual Report 감지"
  initialWidth={600}
  initialHeight={500}
>
  {/* Annual Report 감지 로직 유지 */}
</DraggableModal>
```

- **제거 코드**: ~100줄
- **추가 코드**: ~12줄
- **순 감소**: ~88줄

#### Phase 3 총 효과
- **코드 감소**: ~193줄
- **소요 시간**: 5-6시간
- **채택률 향상**: 57.9% → 68.4%

---

### Phase 4: 검증 및 문서화 (Risk: 낮음)

#### 목표
전체 시스템 안정성 검증 및 가이드 작성

#### 작업 내용
1. **통합 테스트**
   - 19개 모달 전체 수동 테스트
   - 크로스 브라우저 테스트
   - 접근성 검증

2. **성능 측정**
   - 렌더링 시간 측정
   - 메모리 사용량 확인
   - 애니메이션 프레임레이트

3. **문서 작성**
   - MODAL_REFACTORING_GUIDE.md
   - CLAUDE.md 업데이트
   - 마이그레이션 체크리스트

#### 소요 시간
4-5시간

---

## 6. 위험 관리

### 6.1 위험 요소 및 완화 전략

| 위험 | 확률 | 영향 | 완화 전략 |
|------|------|------|----------|
| 기존 기능 깨짐 | 중간 | 높음 | 단계별 테스트, 백업 코드 유지 |
| 스타일 불일치 | 높음 | 중간 | CSS 변수 활용, 세밀한 조정 |
| 성능 저하 | 낮음 | 중간 | 성능 측정, React.memo 활용 |
| 접근성 저하 | 중간 | 높음 | ARIA 검증, 키보드 테스트 |

### 6.2 롤백 계획

#### Git 브랜치 전략
```bash
# Phase별 브랜치 생성
git checkout -b refactor/modal-phase1-hooks
git checkout -b refactor/modal-phase2-simple
git checkout -b refactor/modal-phase3-draggable

# 문제 발생 시 롤백
git checkout main
git branch -D refactor/modal-phaseN
```

#### 코드 백업 전략
```typescript
// 마이그레이션 시 기존 코드 주석 보관
/* BACKUP: 원본 구현
const OldImplementation = () => {
  // ... 기존 코드
}
*/
```

---

## 7. 기대 효과

### 7.1 정량적 효과

| 항목 | 현재 | 목표 | 개선 |
|------|------|------|------|
| **총 코드 라인** | ~2,500줄 | ~2,050줄 | **-450줄 (18%)** |
| **중복 코드** | ~790줄 | ~50줄 | **-740줄 (94%)** |
| **공통 시스템 채택률** | 47.4% | 68.4% | **+21%** |
| **유지보수 파일 수** | 19개 | 15개 | **-4개 (21%)** |

### 7.2 정성적 효과

1. **유지보수성 향상**
   - 버그 수정 시 한 곳만 수정
   - 새 기능 추가 시 모든 모달에 자동 반영

2. **개발 효율성**
   - 새 모달 개발 시간 50% 단축
   - 코드 리뷰 시간 감소

3. **사용자 경험**
   - 일관된 모달 동작
   - 향상된 접근성
   - 부드러운 애니메이션

4. **팀 협업**
   - 명확한 모달 사용 가이드
   - 표준화된 코드 패턴
   - 온보딩 시간 단축

---

## 8. 구현 세부사항

### 8.1 BaseModalCore 훅 구현

```typescript
// src/shared/ui/Modal/hooks/useModalCore.ts

import { useEffect, useCallback } from 'react'

/**
 * ESC 키로 모달 닫기
 */
export const useEscapeKey = (
  enabled: boolean,
  onClose: () => void
) => {
  useEffect(() => {
    if (!enabled) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [enabled, onClose])
}

/**
 * body overflow 제어 (iOS 대응)
 */
export const useBodyOverflow = (visible: boolean) => {
  useEffect(() => {
    if (visible) {
      const scrollY = window.scrollY
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
    }

    return () => {
      const scrollY = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0', 10) * -1)
      }
    }
  }, [visible])
}

/**
 * backdrop 클릭 핸들러
 */
export const useBackdropClick = (
  backdropClosable: boolean,
  onClose: () => void
) => {
  return useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (backdropClosable && e.target === e.currentTarget) {
      onClose()
    }
  }, [backdropClosable, onClose])
}
```

### 8.2 공통 CSS 변수 시스템

```css
/* src/shared/ui/Modal/modal-variables.css */

:root {
  /* Z-Index 계층 */
  --z-index-modal-backdrop: 1000;
  --z-index-modal: 1001;
  --z-index-modal-header: 1002;

  /* 색상 */
  --color-modal-backdrop: rgba(0, 0, 0, 0.5);
  --color-modal-bg: var(--color-bg-primary);
  --color-modal-border: var(--color-border);

  /* 크기 */
  --radius-modal: 12px;
  --shadow-modal: 0 20px 60px rgba(0, 0, 0, 0.3);

  /* 애니메이션 */
  --duration-modal-appear: 0.3s;
  --easing-modal-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}

html[data-theme="dark"] {
  --color-modal-backdrop: rgba(0, 0, 0, 0.7);
  --shadow-modal: 0 20px 60px rgba(0, 0, 0, 0.5);
}
```

### 8.3 타입 정의 통합

```typescript
// src/shared/ui/Modal/types.ts

/**
 * 모든 모달의 기본 Props
 */
export interface BaseModalProps {
  visible: boolean
  onClose: () => void
  escapeToClose?: boolean
  backdropClosable?: boolean
  className?: string
  ariaLabel?: string
  children: React.ReactNode
}

/**
 * 정적 모달 Props
 */
export interface ModalProps extends BaseModalProps {
  title?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showHeader?: boolean
  footer?: React.ReactNode
}

/**
 * 드래그 가능 모달 Props
 */
export interface DraggableModalProps extends BaseModalProps {
  title?: React.ReactNode
  showHeader?: boolean
  showResetButton?: boolean
  onReset?: () => void
  footer?: React.ReactNode
  initialWidth?: number
  initialHeight?: number
  minWidth?: number
  minHeight?: number
}
```

---

## 9. 점진적 마이그레이션

### 9.1 안전한 전환 절차

```markdown
1. **새 브랜치 생성**
   git checkout -b refactor/modal-{모달명}

2. **기존 코드 백업 (주석)**
   // BACKUP: 원본 코드 보관

3. **새 코드 구현**
   import Modal from '@/shared/ui/Modal'

4. **기능 테스트**
   - 모든 인터랙션 확인
   - 스타일 비교
   - 접근성 검증

5. **문제 없으면 백업 제거 + 커밋**
   git add . && git commit

6. **PR 생성 및 리뷰**
   gh pr create

7. **승인 후 병합**
   git merge
```

### 9.2 테스트 체크리스트

```markdown
## {모달명} 마이그레이션 테스트

### 기능 테스트
- [ ] 모달 열기/닫기
- [ ] ESC 키로 닫기
- [ ] backdrop 클릭으로 닫기
- [ ] 드래그 (해당 시)
- [ ] 리사이즈 (해당 시)
- [ ] 데이터 로딩/에러 상태

### 스타일 테스트
- [ ] Light/Dark 테마
- [ ] 반응형 레이아웃
- [ ] 애니메이션
- [ ] z-index 충돌

### 접근성 테스트
- [ ] Tab 키 네비게이션
- [ ] ARIA 속성
- [ ] 포커스 트랩
- [ ] 스크린 리더

### 성능 테스트
- [ ] 렌더링 시간 < 100ms
- [ ] 60fps 애니메이션
- [ ] 메모리 누수 없음
```

---

## 10. 타임라인

### 10.1 단계별 일정

```
Week 1: Phase 1 - BaseModalCore 훅 생성
  Day 1: 훅 구현
  Day 2: Modal/DraggableModal 리팩토링
  Day 3: 테스트 및 검증

Week 2: Phase 2 - 간단한 모달 마이그레이션
  Day 1: CustomerEditModal
  Day 2: AddressArchiveModal
  Day 3: 통합 테스트

Week 3: Phase 3 - 드래그 모달 마이그레이션
  Day 1-2: AnnualReportModal
  Day 3-4: CustomerIdentificationModal
  Day 5: 통합 테스트

Week 4: Phase 4 - 검증 및 문서화
  Day 1-2: 전체 테스트
  Day 3: 문서 작성
  Day 4-5: 최종 검토
```

### 10.2 예상 소요 시간

| Phase | 작업 내용 | 예상 시간 |
|-------|----------|-----------|
| Phase 1 | BaseModalCore 훅 생성 | 2-3시간 |
| Phase 2 | 간단한 모달 2개 | 3-4시간 |
| Phase 3 | 드래그 모달 2개 | 5-6시간 |
| Phase 4 | 검증 및 문서화 | 4-5시간 |
| **총계** | **전체 리팩토링** | **14-18시간** |

**풀타임 기준**: 2-3일
**파트타임 기준**: 1-2주

---

## 부록

### A. 특수 모달 유지 목록

다음 6개 모달은 자체 구현 유지:

1. **AppleConfirmModal** - iOS 네이티브 alert 정확도
2. **AddressSearchModal** - 실시간 검색 전문화
3. **RelationshipModal** - 복잡한 관계 입력
4. **LayoutControlModal** - 부동 모달 특수 위치
5. **FamilyRelationshipModal** - RelationshipModal 래퍼
6. **CorporateRelationshipModal** - RelationshipModal 래퍼

### B. 파일 구조

```
src/shared/ui/Modal/
├── Modal.tsx (기존, 개선)
├── Modal.css (기존)
├── DraggableModal/
│   ├── DraggableModal.tsx (기존, 개선)
│   └── DraggableModal.css (기존)
├── hooks/ (신규)
│   └── useModalCore.ts
├── types.ts (신규)
└── modal-variables.css (신규)
```

### C. 참고 문서

- `docs/MODAL_COMPONENTS_ANALYSIS_20251106.md` - 현황 분석
- `frontend/aims-uix3/CLAUDE.md` - 프로젝트 가이드
- `frontend/aims-uix3/CSS_SYSTEM.md` - CSS 시스템

### D. 성공 기준

- [ ] 기존 기능 100% 동일하게 작동
- [ ] 코드 18% 이상 감소
- [ ] 중복 코드 90% 이상 제거
- [ ] 모든 테스트 통과
- [ ] 성능 저하 없음
- [ ] 접근성 향상

---

## 결론

이 리팩토링을 통해 AIMS-UIX3 프로젝트의 모달 시스템이 Microsoft MFC 라이브러리처럼 강력한 상속 구조를 갖춘 재사용 가능한 시스템으로 진화할 것입니다.

Risk-free한 점진적 접근 방식을 통해 안전하게 진행하면서도 코드 품질과 유지보수성을 크게 향상시킬 수 있습니다.

---

**문서 끝**

*최종 수정일: 2025년 11월 6일*
*다음 검토일: 리팩토링 완료 후*
---

## 부록 A: 전체 모달 계층 구조 완전 분석 (19개)

### 개요
실제 코드 분석을 통해 파악한 **모든 19개 모달의 완전한 계층 구조**입니다.

---

### 최종 계층 구조 트리

```
BaseModalCore (추상 기반: ESC, backdrop, overflow, Portal)
│
├─ [기반 1] Modal (정적 모달)
│   │
│   ├─ [문서 상태 모달 - 5개]
│   │   ├─ DocumentDetailModal (lg) - 문서 상세 정보 + 복사 기능
│   │   ├─ DocumentFullTextModal (lg) - 전체 텍스트 API 로드
│   │   ├─ DocumentSummaryModal (md) - 요약 정보 API 로드
│   │   ├─ DocumentNotesModal (md) - 메모 편집/삭제 (내부: AppleConfirmModal 사용)
│   │   └─ DocumentLinkModal (sm) - 고객 연결 (내부: CustomerSelectorModal 호출)
│   │
│   ├─ [문서 검색 모달 - 1개]
│   │   └─ FullTextModal (lg) - 검색 결과 전체 텍스트
│   │
│   ├─ [고객 관계 모달 - 3개]
│   │   ├─ RelationshipModal (고정) - 공통 관계 추가 (검색 + 선택)
│   │   ├─ FamilyRelationshipModal (고정) - 가족관계 래퍼 (배우자/부모/자녀)
│   │   └─ CorporateRelationshipModal (고정) - 법인관계 래퍼 (대표/임원/직원)
│   │
│   └─ [마이그레이션 대상 - 3개]
│       ├─ AddressArchiveModal (lg) - 주소 이력 표시 ⚠️
│       ├─ AddressSearchModal (고정) - 주소 검색 + 페이지네이션 ⚠️
│       └─ CustomerEditModal (lg) - 4개 탭 폼 (기본/연락처/주소/보험) ⚠️
│
├─ [기반 2] DraggableModal (드래그 + 리사이즈)
│   │
│   ├─ [운영 중 - 2개]
│   │   ├─ CustomerSelectorModal (1100x700)
│   │   │   ├─ 고객 트리 테이블
│   │   │   ├─ 초성 필터 (한글/영문/숫자)
│   │   │   ├─ 칼럼 리사이즈
│   │   │   ├─ 정렬 기능
│   │   │   └─ 검색 (이름/전화)
│   │   │
│   │   └─ CustomerDocumentPreviewModal (900x가변)
│   │       ├─ PDF 뷰어 (react-pdf)
│   │       ├─ 이미지 뷰어
│   │       ├─ Fit to page
│   │       └─ (useModalDragResize 직접 사용)
│   │
│   └─ [마이그레이션 대상 - 2개]
│       ├─ AnnualReportModal (가변) ⚠️
│       │   ├─ 보험 계약 테이블
│       │   ├─ 정렬 기능
│       │   └─ (현재 자체 드래그 구현)
│       │
│       └─ CustomerIdentificationModal (가변) ⚠️
│           ├─ 고객 1명: 자동 선택
│           ├─ 고객 2명+: 라디오 선택
│           ├─ 고객 없음: 신규 생성
│           └─ (현재 자체 드래그 구현)
│
└─ [특수 구현] createPortal 직접 사용 (2개)
    │
    ├─ AppleConfirmModal (iOS 스타일)
    │   ├─ 아이콘 4가지 (success/error/info/warning)
    │   ├─ 제목 + 메시지
    │   ├─ 취소/확인 버튼
    │   ├─ destructive 스타일
    │   └─ Controller 패턴 (useAppleConfirmController)
    │
    └─ LayoutControlModal (부동 모달)
        ├─ 자유 이동 (viewport 제약 없음)
        ├─ 레이아웃 컴포넌트 표시/숨김 (7개)
        ├─ Gap 설정 슬라이더
        └─ 햅틱 피드백 (useDraggable)
```

---

### 19개 모달 완전 분류표

| # | 모달명 | 계층 | 구현 상태 | 마이그레이션 | 크기 | 주요 기능 |
|---|--------|------|----------|------------|------|----------|
| **문서 상태 모달** | | | | | | |
| 1 | DocumentDetailModal | Modal | ✅ | - | lg | 문서 상세 + 복사 |
| 2 | DocumentFullTextModal | Modal | ✅ | - | lg | 전체 텍스트 API |
| 3 | DocumentSummaryModal | Modal | ✅ | - | md | 요약 정보 API |
| 4 | DocumentNotesModal | Modal | ✅ | - | md | 메모 편집 + AppleConfirmModal |
| 5 | DocumentLinkModal | Modal | ✅ | - | sm | 고객 연결 + CustomerSelectorModal |
| **문서 검색 모달** | | | | | | |
| 6 | FullTextModal | Modal | ✅ | - | lg | 검색 텍스트 표시 |
| **고객 관계 모달** | | | | | | |
| 7 | RelationshipModal | Modal | ✅ | - | 고정 | 관계 추가 (검색+선택) |
| 8 | FamilyRelationshipModal | RelationshipModal | ✅ | - | 고정 | 가족관계 래퍼 |
| 9 | CorporateRelationshipModal | RelationshipModal | ✅ | - | 고정 | 법인관계 래퍼 |
| **드래그 모달** | | | | | | |
| 10 | CustomerSelectorModal | DraggableModal | ✅ | - | 1100x700 | 테이블+초성+리사이즈 |
| 11 | CustomerDocumentPreviewModal | useModalDragResize | ✅ | - | 900x가변 | PDF+이미지 뷰어 |
| **마이그레이션 대상 - 정적** | | | | | | |
| 12 | AddressArchiveModal | 자체 overlay | 🔄 | **필요** | lg | 주소 이력 |
| 13 | AddressSearchModal | 자체 Portal | 🔄 | **필요** | 고정 | 주소 검색+페이지네이션 |
| 14 | CustomerEditModal | 자체 Portal | 🔄 | **필요** | lg | 4개 탭 폼 |
| **마이그레이션 대상 - 드래그** | | | | | | |
| 15 | AnnualReportModal | 자체 드래그 | 🔄 | **필요** | 가변 | 보험 계약 테이블 |
| 16 | CustomerIdentificationModal | 자체 드래그 | 🔄 | **필요** | 가변 | 고객 식별 (1명/다중/신규) |
| **특수 구현** | | | | | | |
| 17 | AppleConfirmModal | createPortal | ✅ | - | 고정 | iOS alert 재현 |
| 18 | LayoutControlModal | createPortal | ✅ | - | 부동 | 자유이동 모달 |

**통계**:
- ✅ 이미 표준화: 13개 (68.4%)
- 🔄 마이그레이션 대기: 5개 (26.3%)
- 특수 유지: 2개 (10.5%)

---

### 마이그레이션 우선순위 및 난이도

#### 🟢 Phase 1: 쉬움 (1-2시간/개)
1. **AddressArchiveModal** → Modal
   - 현재: 자체 `<div className="overlay">` 구조
   - 변경: Modal 컴포넌트로 래핑
   - 파일: `src/features/customer/components/AddressArchiveModal/AddressArchiveModal.tsx`
   - 예상 코드 감소: ~30줄

2. **AddressSearchModal** → Modal
   - 현재: createPortal + ESC 직접 구현
   - 변경: Modal 컴포넌트로 래핑
   - 파일: `src/features/customer/components/AddressSearchModal/AddressSearchModal.tsx`
   - 예상 코드 감소: ~35줄

#### 🟡 Phase 2: 중간 (2-3시간/개)
3. **AnnualReportModal** → DraggableModal
   - 현재: 120줄 자체 드래그 로직
   - 변경: DraggableModal + 테이블 로직 유지
   - 파일: `src/features/customer/components/AnnualReportModal/AnnualReportModal.tsx`
   - 예상 코드 감소: ~105줄

4. **CustomerIdentificationModal** → DraggableModal
   - 현재: 100줄 자체 드래그 로직
   - 변경: DraggableModal + 식별 로직 유지
   - 파일: `src/features/customer/components/CustomerIdentificationModal/CustomerIdentificationModal.tsx`
   - 예상 코드 감소: ~88줄

#### 🟢 Phase 3: 쉬움 (1시간)
5. **CustomerEditModal** → Modal
   - 현재: createPortal + ESC + backdrop 직접 구현
   - 변경: Modal + 4개 탭 로직 유지
   - 파일: `src/features/customer/views/CustomerEditModal/CustomerEditModal.tsx`
   - 예상 코드 감소: ~40줄

**총 예상 코드 감소**: ~298줄

---

### 모달 간 관계도

```
DocumentNotesModal
    └─ 내부 사용 → AppleConfirmModal (삭제 확인)

DocumentLinkModal
    └─ 내부 호출 → CustomerSelectorModal (고객 선택)

RelationshipModal (기본)
    ├─ 래퍼 → FamilyRelationshipModal (props: type='family')
    └─ 래퍼 → CorporateRelationshipModal (props: type='corporate')
```

---

### 파일 경로 전체 목록

#### 기반 컴포넌트
```
src/shared/ui/Modal/Modal.tsx
src/shared/ui/DraggableModal/DraggableModal.tsx
```

#### 문서 상태 모달 (6개)
```
src/components/DocumentViews/DocumentStatusView/components/
├── DocumentDetailModal.tsx
├── DocumentFullTextModal.tsx
├── DocumentSummaryModal.tsx
├── DocumentNotesModal.tsx
└── DocumentLinkModal.tsx

src/components/DocumentViews/DocumentSearchView/
└── FullTextModal.tsx
```

#### 고객 관계 모달 (3개)
```
src/features/customer/components/
├── RelationshipModal/RelationshipModal.tsx
├── FamilyRelationshipModal/FamilyRelationshipModal.tsx
└── CorporateRelationshipModal/CorporateRelationshipModal.tsx
```

#### 드래그 모달 (2개 + 마이그레이션 2개)
```
src/shared/ui/CustomerSelectorModal/CustomerSelectorModal.tsx
src/features/customer/views/CustomerDetailView/tabs/CustomerDocumentPreviewModal.tsx

[마이그레이션 대상]
src/features/customer/components/AnnualReportModal/AnnualReportModal.tsx
src/features/customer/components/CustomerIdentificationModal/CustomerIdentificationModal.tsx
```

#### 마이그레이션 대상 - 정적 (3개)
```
src/features/customer/components/AddressArchiveModal/AddressArchiveModal.tsx
src/features/customer/components/AddressSearchModal/AddressSearchModal.tsx
src/features/customer/views/CustomerEditModal/CustomerEditModal.tsx
```

#### 특수 구현 (2개)
```
src/components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal.tsx
src/components/LayoutControlModal.tsx
```

---

*부록 A 끝*

