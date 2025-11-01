# 유닛테스트 필요 항목 목록

**분석 기간**: 2025년 10월 25일 ~ 2025년 11월 1일 (최근 1주일)
**분석 시점**: 2025년 11월 1일 21:30
**총 커밋 수**: 약 150개

---

## 🔴 높은 우선순위 (핵심 비즈니스 로직)

### 1. 법인 고객 관계자 관리 기능 (커밋: 7d4802b ~ 183e453)

#### 테스트 필요 파일:
- **`CorporateRelationshipModal.tsx`** (신규 컴포넌트)
  - ❌ 테스트 없음
  - 필요한 테스트:
    - [ ] 모달 열기/닫기 동작
    - [ ] 관계자 선택 및 관계 유형 선택 (대표/임원/직원)
    - [ ] 사용자 정의 관계 입력 기능
    - [ ] 개인 고객만 검색되는지 확인
    - [ ] 관계 저장 성공/실패 처리

- **`RelationshipModal.tsx`** (공통 컴포넌트)
  - ❌ 테스트 없음
  - 필요한 테스트:
    - [ ] 가족관계/법인관계 모두 지원 확인
    - [ ] Props에 따른 동적 UI 변경 (title, memberLabel 등)
    - [ ] 중복 선택 방지 로직 (커밋: 3343914)
    - [ ] allowCustomRelation 기능
    - [ ] filterCustomerType에 따른 고객 필터링

- **`RelationshipsTab.tsx`** (RightPane 관계 탭)
  - ⚠️ 부분적 테스트만 존재 (`useCustomerRelationshipsController.test.tsx`)
  - 추가 필요한 테스트:
    - [ ] 법인 고객일 때 "관계자 추가" 버튼 표시
    - [ ] 개인 고객일 때 "가족 추가" 버튼 표시
    - [ ] 테이블 헤더: 법인 = "관계 삭제", 개인 = "가족 삭제"
    - [ ] 관계 삭제 후 목록 갱신

- **`CustomerRelationshipView.tsx`** (관계별 보기 - 트리 뷰)
  - ✅ 기본 테스트 있음 (`CustomerRelationshipView.test.tsx`)
  - 추가 필요한 테스트:
    - [ ] **getRelationshipLabel 헬퍼 함수** (커밋: 183e453)
      - [ ] 가족 구성원 이름 옆 관계 표시 ("정부균 (배우자)")
      - [ ] 법인 직원 이름 옆 직책 표시 ("신상철 (대표)")
      - [ ] display_relationship_label 우선 사용 확인
      - [ ] relationship_type → 한글 레이블 변환
      - [ ] 관계 정보 없을 때 빈 문자열 반환

### 2. 사용자별 문서 격리 기능 (커밋: ffcafd6 ~ 41db3a9)

#### 테스트 필요 파일:
- **`api.ts`** (userId 헤더 자동 추가)
  - ✅ 기본 테스트 있음 (`api.test.ts`)
  - 추가 필요한 테스트:
    - [ ] x-user-id 헤더 자동 추가 확인
    - [ ] userId가 없을 때 헤더 추가 안함
    - [ ] 모든 API 요청에 일관되게 적용

- **`user.ts`** (사용자 전환 시 데이터 정리)
  - ❌ 테스트 없음
  - 필요한 테스트:
    - [ ] 사용자 전환 시 CustomerDocument 초기화
    - [ ] 사용자 전환 시 DocumentStatusDocument 초기화
    - [ ] 개발자 모드 토글 기능
    - [ ] 사용자 목록 로드

- **`searchService.ts`** (검색 결과 사용자별 격리)
  - ✅ 테스트 있음 (`searchService.test.ts`)
  - 확인 필요:
    - [ ] 키워드 검색에 userId 필터 적용
    - [ ] 시맨틱 검색에 userId 필터 적용
    - [ ] SmartSearch에 userId 필터 적용

### 3. 문서 처리 타임아웃 상태 표시 (커밋: 2c259d8)

#### 테스트 필요 파일:
- **`DocumentProcessingModule.ts`**
  - ✅ 기본 테스트 있음 (`DocumentProcessingModule.test.ts`)
  - 추가 필요한 테스트:
    - [ ] 5분 경과 시 timeout 상태 표시
    - [ ] 타임아웃 전에는 processing 상태 유지
    - [ ] 타임아웃 후에도 백그라운드 처리 계속 진행

- **`documentStatus.ts`** (타입 정의)
  - ❌ 테스트 없음 (타입 파일이라 필요 없을 수도)

---

## 🟡 중간 우선순위 (UI/UX 개선)

### 4. User Profile Menu (커밋: dde2c7c ~ bef8fcc)

#### 테스트 필요 파일:
- **`UserProfileMenu.tsx`**
  - ❌ 테스트 없음
  - 필요한 테스트:
    - [ ] 메뉴 열기/닫기 동작
    - [ ] 유튜브 스타일 UI 렌더링
    - [ ] 메뉴 항목 클릭 이벤트

- **`UserProfileMenuItem.tsx`**
  - ❌ 테스트 없음
  - 필요한 테스트:
    - [ ] 아이콘 시스템 (SFSymbol vs SVG)
    - [ ] 호버 효과
    - [ ] 클릭 핸들러

- **`UserProfileHeader.tsx`**
  - ❌ 테스트 없음
  - 필요한 테스트:
    - [ ] 사용자 아바타 표시
    - [ ] 사용자 이름 표시 (제거됨)

### 5. RightPane 미닫이문 슬라이드 애니메이션 (커밋: 363acb8)

#### 테스트 필요 파일:
- **`App.tsx`** (RightPane 애니메이션 로직)
  - ✅ 기본 테스트 있음 (`App.brb-drag.test.tsx`, `App.leftpane-sync.test.tsx`)
  - 추가 필요한 테스트:
    - [ ] RightPane 슬라이드 애니메이션 동작
    - [ ] 애니메이션 완료 후 콜백 실행
    - [ ] CSS transition과 동기화

### 6. 문서 요약 및 전체 텍스트 보기 기능 개선 (커밋: 41fd8fc, 874fa88)

#### 테스트 필요 파일:
- **`DocumentSummaryModal.tsx`**
  - ❌ 테스트 없음
  - 필요한 테스트:
    - [ ] 모달 열기/닫기
    - [ ] API 엔드포인트 수정 반영 확인
    - [ ] 요약 데이터 표시

- **`DocumentFullTextModal.tsx`**
  - ❌ 테스트 없음
  - 필요한 테스트:
    - [ ] 모달 열기/닫기
    - [ ] API 엔드포인트 수정 반영 확인
    - [ ] 전체 텍스트 표시

### 7. Annual Report 모달 개선 (커밋: a2dcf47, 62226cb)

#### 테스트 필요 파일:
- **`AnnualReportModal.tsx`**
  - ❌ 테스트 없음
  - 필요한 테스트:
    - [ ] AIMS 표준 디자인 적용 확인
    - [ ] 정렬 아이콘 시스템
    - [ ] 정렬 기능 동작 (오름차순/내림차순)

---

## 🟢 낮은 우선순위 (스타일/리팩토링)

### 8. Form Select 드롭다운 높이 통일 (커밋: 2cbd7b3)

#### 테스트 필요 파일:
- **`components.css`**
  - ❌ CSS 파일이라 유닛테스트 대상 아님
  - 대신 비주얼 리그레션 테스트 또는 스토리북 필요

### 9. Timestamp 표준화 (커밋: 3636ae1 ~ a588319)

#### 테스트 필요 파일:
- **`timeUtils.ts`**
  - ❌ 테스트 없음
  - 필요한 테스트:
    - [ ] formatDateTime 함수
    - [ ] formatDate 함수
    - [ ] formatTime 함수
    - [ ] 타임존 처리 (UTC, KST)
    - [ ] ISO 8601 포맷 변환

### 10. 문서 검색 결과 요약 표시 개선 (커밋: e4869f8)

#### 테스트 필요 파일:
- **`searchService.ts`**
  - ✅ 테스트 있음 (`searchService.test.ts`)
  - 확인 필요:
    - [ ] 요약 표시 로직 테스트 추가 여부

---

## 📊 통계 요약

| 우선순위 | 파일 수 | 테스트 있음 | 테스트 없음 | 테스트 추가 필요 |
|---------|---------|------------|------------|-----------------|
| 높음 | 8개 | 3개 | 5개 | **20개 테스트 케이스** |
| 중간 | 9개 | 2개 | 7개 | **15개 테스트 케이스** |
| 낮음 | 4개 | 1개 | 3개 | **5개 테스트 케이스** |
| **합계** | **21개** | **6개** | **15개** | **40개 테스트 케이스** |

---

## 🎯 권장 테스트 작성 순서

### Phase 1: 핵심 비즈니스 로직 (1-2일)
1. **법인 고객 관계자 관리**
   - `CorporateRelationshipModal.test.tsx`
   - `RelationshipModal.test.tsx`
   - `RelationshipsTab` 추가 테스트

2. **CustomerRelationshipView 관계 레이블 표시**
   - `CustomerRelationshipView.relationship-label.test.tsx`

### Phase 2: 사용자 격리 및 보안 (1일)
3. **사용자별 문서 격리**
   - `user.test.ts`
   - `api.test.ts` 확장

### Phase 3: UI/UX 개선 (1-2일)
4. **User Profile Menu**
   - `UserProfileMenu.test.tsx`
   - `UserProfileMenuItem.test.tsx`

5. **문서 모달들**
   - `DocumentSummaryModal.test.tsx`
   - `DocumentFullTextModal.test.tsx`
   - `AnnualReportModal.test.tsx`

### Phase 4: 유틸리티 및 기타 (0.5일)
6. **Timestamp 표준화**
   - `timeUtils.test.ts`

---

## 📝 테스트 작성 시 주의사항

### 1. 법인 관계자 관리 테스트
- **Mock 데이터**: 법인 고객, 개인 고객, 관계 데이터 필요
- **API Mocking**: `RelationshipService.createRelationship` 모킹
- **중복 선택 방지**: `identifyRelatedCustomers` 함수 테스트 중요

### 2. 사용자 격리 테스트
- **LocalStorage Mocking**: `userId` 저장/불러오기
- **API 헤더 검증**: 모든 요청에 `x-user-id` 포함 확인
- **Zustand Store**: `user` 스토어 상태 변경 테스트

### 3. UI 컴포넌트 테스트
- **React Testing Library** 사용
- **User Interaction**: `userEvent.click`, `userEvent.type` 활용
- **Accessibility**: ARIA 속성 확인

### 4. Timestamp 테스트
- **타임존 독립성**: 테스트 실행 환경과 무관하게 동작
- **Edge Cases**: null, undefined, 잘못된 형식 처리

---

## 🔍 기존 테스트 파일 확인 필요

다음 테스트 파일들이 최근 변경사항을 반영하는지 검토 필요:

1. **`CustomerRelationshipView.test.tsx`**
   - 관계 레이블 표시 기능 추가됨 (커밋: 183e453)

2. **`searchService.test.ts`**
   - 사용자별 격리 필터 추가됨 (커밋: 41db3a9, 9b772bc, e324756)

3. **`api.test.ts`**
   - userId 헤더 자동 추가 기능 추가됨 (커밋: faffd76)

4. **`DocumentProcessingModule.test.ts`**
   - 타임아웃 상태 표시 기능 추가됨 (커밋: 2c259d8)

---

## 🚀 빠른 시작 가이드

### 테스트 템플릿 예시

```typescript
// CorporateRelationshipModal.test.tsx
import { render, screen, userEvent } from '@testing-library/react';
import { CorporateRelationshipModal } from './CorporateRelationshipModal';

describe('CorporateRelationshipModal', () => {
  it('should render modal when visible is true', () => {
    render(
      <CorporateRelationshipModal
        visible={true}
        onCancel={() => {}}
        customerId="company-123"
      />
    );

    expect(screen.getByText('법인 관계자 추가')).toBeInTheDocument();
  });

  it('should display relationship type options', () => {
    // 대표, 임원, 직원 옵션 표시 확인
  });

  it('should prevent duplicate selection', async () => {
    // 이미 관계 맺은 고객은 검색 결과에서 제외
  });
});
```

---

**마지막 업데이트**: 2025년 11월 1일 21:30
**작성자**: Claude Code
**다음 검토 일정**: 2025년 11월 8일
