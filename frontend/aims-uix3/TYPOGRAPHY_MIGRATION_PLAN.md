# 타이포그래피 시스템 마이그레이션 계획

## 🎯 목표
모든 UI 컴포넌트를 공용 타이포그래피 클래스로 전환하여 프로젝트 전역의 폰트 일관성 확보

---

## 📋 마이그레이션 우선순위

### Phase 1: 핵심 페이지 (High Priority)
**목표**: 사용자가 가장 많이 보는 페이지
**예상 소요**: 1-2시간

- [ ] AllCustomersView (전체보기)
- [ ] CustomerDetailView (고객 상세)
  - [ ] RelationshipsTab
  - [ ] DocumentsTab
  - [ ] AnnualReportTab
  - [ ] ConsultationsTab
- [ ] DocumentLibraryView (문서 라이브러리)
- [ ] DocumentStatusView (문서 상태)
- [ ] DocumentRegistrationView (문서 등록)

### Phase 2: 공용 컴포넌트 (High Priority)
**목표**: 여러 곳에서 재사용되는 컴포넌트
**예상 소요**: 30분-1시간

- [ ] Header
- [ ] LeftPane / CustomMenu
- [ ] CenterPaneView
- [ ] BaseViewer
- [ ] 모달 컴포넌트들

### Phase 3: 나머지 페이지 (Medium Priority)
**목표**: 덜 자주 사용되는 페이지
**예상 소요**: 1-2시간

- [ ] 기타 Customer Views
- [ ] 기타 Document Views
- [ ] 설정 페이지

### Phase 4: 정리 및 검증 (Low Priority)
**목표**: CSS 파일 정리 및 품질 확인
**예상 소요**: 30분

- [ ] 사용하지 않는 CSS 클래스 제거
- [ ] 중복 폰트 정의 제거
- [ ] 전체 페이지 육안 검증

---

## 🔄 자동 변환 패턴

### 패턴 1: 페이지 제목
```bash
# 찾기 패턴
<h1 className="page-title">
<h2 className=".*-title">  # 페이지 레벨 제목

# 변환 후
<h1 className="typography-page-title">
<h2 className="typography-page-title">
```

### 패턴 2: 탭 제목
```bash
# 찾기 패턴
.*Tab.*\.tsx 파일 내의
<h2 className=".*-title">
<h3 className=".*-title">

# 변환 후
<h2 className="typography-tab-title">
<h3 className="typography-tab-title">
```

### 패턴 3: 빈 상태 메시지
```bash
# 찾기 패턴
<p className=".*empty.*message">
<div className=".*empty.*text">

# 변환 후
<p className="typography-empty-message">
```

---

## 🛠️ 자동 변환 스크립트

### 1. 페이지 제목 통일
```bash
# CenterPaneView title 클래스 찾기
grep -r "className.*title" --include="*View.tsx" src/

# 자동 변환 (dry-run 먼저)
find src/ -name "*View.tsx" -type f -exec sed -n 's/className="[^"]*title[^"]*"/className="typography-page-title"/gp' {} +
```

### 2. CSS에서 폰트 크기 정의 제거
```bash
# font-size 정의 찾기
grep -r "font-size: var(--font-size" --include="*.css" src/

# 해당 줄 주석 처리 (수동 검증 후 삭제)
```

---

## ✅ 각 파일 마이그레이션 체크리스트

파일을 변환할 때 다음을 확인:

### TSX/JSX 파일
- [ ] 제목 요소에 `typography-*-title` 클래스 추가
- [ ] 본문 요소에 `typography-body` 클래스 추가
- [ ] 테이블 헤더에 `typography-table-header` 추가
- [ ] 테이블 셀에 `typography-table-cell` 추가
- [ ] 버튼 텍스트에 `typography-button` 추가
- [ ] 빈 상태에 `typography-empty-*` 추가

### CSS 파일
- [ ] `font-size: *` 정의 제거
- [ ] `font-weight: *` 제거 (색상 관련만 유지)
- [ ] 폰트 크기만 정의하던 클래스 삭제
- [ ] 레이아웃/색상 관련 스타일만 유지

---

## 🎯 목표 메트릭

### Before (현재)
- 총 CSS 파일: 72개
- font-size 정의: 527개
- 일관성: 페이지마다 제각각

### After (목표)
- font-size 정의: 0개 (typography.css만)
- 일관성: 100% (모든 페이지 동일 규칙)
- 유지보수: CSS 한 곳만 수정

---

## 🚀 실행 방법

### 즉시 시작 (수동 방식)
```bash
# 1. 첫 번째 파일 선택
cd frontend/aims-uix3/src
code features/customer/views/AllCustomersView/AllCustomersView.tsx

# 2. 제목 찾기
# <h1>, <h2> 태그 찾아서 typography-page-title 추가

# 3. CSS 파일 열기
code features/customer/views/AllCustomersView/AllCustomersView.css

# 4. font-size, font-weight 정의 삭제

# 5. 브라우저 확인

# 6. 다음 파일로 이동
```

### 반자동 방식 (추천)
```bash
# 1. 패턴 찾기
npm run find-typography-patterns

# 2. 변환 스크립트 실행
npm run migrate-typography

# 3. 수동 검증
npm run dev
```

---

## 📊 진행 상황 추적

### Phase 1 Progress: 0/9
- [ ] AllCustomersView
- [ ] CustomerDetailView
  - [ ] RelationshipsTab
  - [ ] DocumentsTab
  - [ ] AnnualReportTab
  - [ ] ConsultationsTab
- [ ] DocumentLibraryView
- [ ] DocumentStatusView
- [ ] DocumentRegistrationView

### Phase 2 Progress: 0/5
- [ ] Header
- [ ] LeftPane
- [ ] CenterPaneView
- [ ] BaseViewer
- [ ] Modals

### Overall: 0% Complete

---

## 🎉 완료 기준

마이그레이션이 완료되면:
1. `grep -r "font-size:" --include="*.css" src/` → 0 results (typography.css 제외)
2. 모든 페이지의 제목 크기 통일
3. 모든 탭의 제목 크기 통일
4. 브라우저에서 모든 주요 페이지 육안 확인 완료

---

**시작일**: 2025-10-26
**예상 완료일**: TBD
**담당**: Claude + User Review
