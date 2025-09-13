# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CRITICAL RULES - 반드시 준수해야 할 규칙 ⚠️

### Git Commit 규칙 - 절대 위반 금지!

**절대로 사용자의 명시적 허락 없이 커밋하지 마세요!**

1. **코드 구현 완료 후 반드시:**
   - 구현 내용을 먼저 설명
   - 다음과 같이 질문: "구현이 완료되었습니다. 확인해보시고 문제없으면 커밋해도 될까요?"
   - 사용자가 "커밋해" 또는 유사한 승인을 할 때까지 대기

2. **절대 금지사항:**
   - 구현 후 자동으로 커밋하기
   - 사용자 검토 없이 커밋하기
   - 커밋 준비 상태를 임의로 판단하기

3. **이것이 중요한 이유:**
   - 사용자가 구현이 올바르게 작동하는지 확인해야 함
   - 문제있는 코드가 커밋되는 것을 방지
   - 커밋 전 문제 수정 기회 제공

**기억하세요: 사용자가 반드시 검사하고 승인한 후에만 커밋!**

### 최소한 수정 원칙 - 철칙!

**부작용을 누적하지 말고 최소한의 수정만 해서 커밋하라!**

1. **하나의 기능, 최소한의 변경:**
   - 요청된 기능에 **직접적으로 필요한 부분만** 수정
   - 관련 없는 코드는 절대 건드리지 않기
   - "김치를 사러 갔다가 냉장고까지 사오지 말기"

2. **변경 범위 제한:**
   - 전체 파일을 리팩토링하지 말고 **해당 부분만** 수정
   - 하드코딩 → CSS 변수 등의 "개선"은 별도 작업으로 분리
   - 스타일 통일화는 요청받지 않았다면 하지 않기

3. **커밋 전 변경사항 검토:**
   - `git diff`로 변경사항이 **요청한 기능과 직접 관련된 것만** 있는지 확인
   - 불필요한 변경사항이 있다면 되돌리거나 별도 커밋으로 분리
   - 의도하지 않은 파일 변경이 있는지 점검

4. **부작용 방지가 최우선:**
   - 기존 동작하던 기능이 깨지는 것을 절대 방지
   - 작은 변경으로 큰 부작용을 만들지 않기
   - 확실하지 않으면 변경하지 않기

**원칙**: 작고 집중된 변경사항이 안전하고 유지보수하기 좋다!

### 하드코딩 금지 규칙 - 절대 준수! ⚠️

**테스트를 위한 임시코드를 제외하고는 하드코딩을 절대 금지한다!**

1. **스타일 하드코딩 금지:**
   - inline style에 색상값 직접 입력 금지 (`backgroundColor: '#ffffff'` ❌)
   - CSS 변수나 클래스 사용 필수 (`var(--color-bg-primary)` ✅)
   - 테마 시스템과 연동되지 않는 고정값 사용 금지

2. **동적 테마 반응 필수:**
   - 라이트/다크 모드 전환시 즉시 반영되어야 함
   - `html[data-theme="dark"]` CSS 규칙으로 테마별 스타일 정의
   - JS에서는 클래스명만 조건부로 적용

3. **허용되는 하드코딩:**
   - **테스트 목적**의 임시 코드만 허용
   - 개발 중 빠른 확인을 위한 디버깅 코드
   - **단, 커밋 전에 반드시 제거하거나 CSS로 리팩토링**

4. **위반시 조치:**
   - 하드코딩 발견시 즉시 CSS 변수/클래스로 리팩토링
   - 테마 시스템과 연동되도록 수정
   - 동적 반응 가능하도록 구조 개선

**기억하라**: 하드코딩은 유지보수성을 떨어뜨리고 테마 시스템을 파괴한다!

### React 개발 문제 해결 규칙 - 철칙! ⚠️

**React Real-time Refreshing 문제 시 절대 준수 사항**

1. **문제 발생 징후:**
   - 코드 변경 후 브라우저에 반영되지 않음
   - Ctrl+Shift+R (하드 리프레시)해도 화면이 변하지 않음
   - 메뉴 구조나 컴포넌트 변경사항이 보이지 않음
   - Hot Module Replacement(HMR)가 작동하지 않음

2. **절대 금지사항:**
   - **코드를 먼저 건드리지 말 것!**
   - 문제 원인을 코드에서 찾으려 하지 말 것
   - 추가 수정을 통해 해결하려 하지 말 것

3. **반드시 따라야 할 해결 순서:**
   ```bash
   # 1단계: 모든 React 프로세스 종료
   pkill -f "react-scripts"
   
   # 2단계: React 캐시 완전 삭제
   rm -rf node_modules/.cache
   
   # 3단계: 새 서버 시작
   PORT=3005 npm start
   
   # 4단계: 컴파일 완료 대기
   # "Compiled successfully!" 메시지 확인
   
   # 5단계: 브라우저에서 하드 리프레시
   # Ctrl+Shift+R 또는 F5
   ```

4. **이 규칙이 중요한 이유:**
   - React 캐시 문제는 코드 변경과 무관하게 발생
   - 코드를 건드리면 문제가 더 복잡해짐
   - 캐시 삭제가 가장 빠르고 확실한 해결책
   - 불필요한 코드 변경으로 인한 부작용 방지

**기억하세요: React 화면 업데이트 문제 = 캐시 삭제 + 서버 재시작!**

---

## System Overview

AIMS (Agent Intelligent Management System) is an intelligent document management system for insurance salespeople. It automates repetitive tasks like document upload, classification, OCR, tagging, and case grouping to help salespeople better understand and respond to customers.

## Development Environment

- **Backend Server**: tars (Linux server) - accessible at `tars.giize.com`
- **Frontend Development**: WonderCastle (Windows 10 PC)
- **Database**: MongoDB on `tars:27017`

### ⚠️ 중요: 백엔드 수정 규칙
- **백엔드 API 서버는 tars Linux 서버에서 운영 중**
- **Claude는 백엔드 코드를 직접 수정할 수 없음**
- **백엔드 수정이 필요한 경우 반드시 사용자에게 수정 요청**
- **프론트엔드(WonderCastle)만 직접 수정 가능**

## Architecture

The system is organized into functional modules:

- **Frontend Applications**: Multiple React apps in `frontend/`
  - `aims-uix1`: Main UI application (React + Ant Design + Tailwind)
  - `doc-status-dashboard`: Document status monitoring (React + Tailwind)  
  - `aims-web`: Alternative web interface
  - `document-monitor`: Document tracking interface

- **Backend Services**:
  - Node.js API server in `api/` for document status monitoring
  - Python FastAPI service in `api/python/` for document status API
  - MongoDB database on `tars:27017`

- **Core Python Modules** in `src/`:
  - `docmeta`: Document metadata extraction
  - `dococr`: OCR text extraction from images/PDFs
  - `doctag`: AI-based document tagging and classification
  - `doccase`: Document clustering by case/incident

- **Automation**: n8n workflows in `n8n_flows/` for automated processing

## Common Development Commands

### Frontend Development
```bash
# Run main UI (port 3005)
cd frontend/aims-uix1 && PORT=3005 npm start

# Run document status dashboard  
cd frontend/doc-status-dashboard && npm start

# Build frontend
cd frontend/aims-uix1 && npm run build

# Test frontend
cd frontend/aims-uix1 && npm test
```

### Backend Services
```bash
# Start Node.js API server
cd api && npm start

# Start Python FastAPI service
cd api/python && uvicorn main:app --reload

# Start Python document status API
cd api/python && python main.py
```

### Python Development
```bash
# Run document metadata extraction
python scripts/run_docmeta.py --file ./samples/pdf/보험청구서.pdf

# Run full processing pipeline
python scripts/full_pipeline.py

# Run tests
make test
# or
PYTHONPATH=$(PWD) pytest -v
```

### Database & Search
```bash
# Check Qdrant vector database
python scripts/check_qdrant.py

# Create embeddings for search
python scripts/create_embeddings.py

# Perform RAG search
python scripts/rag_search.py
```

## Key Integration Points

- **WebSocket**: Real-time document status updates via `websocketService.js`
- **MongoDB**: Document storage and metadata in `docupload.files` collection
- **Vector Search**: Qdrant vector database for semantic document search
- **OCR Processing**: Integrated text extraction from images and PDFs
- **n8n Workflows**: Automated document processing pipelines

## File Structure Notes

- Frontend apps share similar structure but serve different purposes
- Python modules follow a shared pattern with `__init__.py` and core functionality
- Sample documents in `samples/` organized by MIME type for testing
- Tools in `tools/` provide utilities for file analysis and smart search
- Scripts in `scripts/` handle various processing and API tasks

## Testing

- Frontend: Jest and React Testing Library (`npm test`)
- Python: pytest with `make test` or manual pytest commands
- Sample files available in `samples/` for testing different document types

## Code Quality and Cleanup Guidelines

### 정리 요청 시 필수 검사 항목

사용자가 "정리" 또는 "코드 정리"를 요청할 때는 다음 모든 항목을 철저히 검사하고 개선해야 합니다:

1. **중복 코드 제거 (Duplicate Code Removal)**
   - 동일하거나 유사한 기능을 수행하는 코드 찾기
   - 공통 함수나 컴포넌트로 추출하여 재사용성 향상
   - 중복된 import문과 종속성 정리

2. **사용하지 않는 코드 제거 (Dead Code Elimination)**
   - 참조되지 않는 함수, 변수, 컴포넌트 찾기
   - 사용하지 않는 import문 제거
   - 도달할 수 없는 코드 블록 제거
   - 주석 처리된 오래된 코드 제거

3. **컴파일 오류 수정 (Compilation Error Fix)**
   - TypeScript/JavaScript 타입 오류 수정
   - 문법 오류와 런타임 오류 해결
   - 빌드 프로세스에서 발생하는 모든 경고 해결

4. **코드 품질 향상 (Code Quality Improvement)**
   - 일관된 코딩 스타일 적용
   - 변수명과 함수명 개선
   - 복잡한 함수를 작은 단위로 분리
   - 적절한 에러 처리 추가

5. **성능 최적화 (Performance Optimization)**
   - 불필요한 리렌더링 방지
   - 메모리 누수 방지
   - 비효율적인 알고리즘 개선

### 정리 작업 순서

1. **전체 코드베이스 스캔**: 모든 파일을 검토하여 문제점 파악
2. **우선순위 설정**: 컴파일 오류 → 중복 코드 → 미사용 코드 → 품질 개선 순서
3. **단계별 수정**: 한 번에 하나씩 문제를 해결하여 안정성 확보
4. **테스트 검증**: 각 수정 후 관련 기능이 정상 작동하는지 확인
5. **최종 빌드 테스트**: 전체 시스템이 오류 없이 빌드되는지 확인

**중요**: 정리 요청은 단순한 포맷팅이 아닌, 코드 품질과 유지보수성을 근본적으로 개선하는 작업입니다.

---

## 현재 프로젝트 진행상황 (2025-09-01)

### 최근 완료된 작업

#### Phase 3 완료: AIMS 디자인 시스템 Button 컴포넌트 전환 ✅
- **목표**: 모든 Ant Design Button → AIMS 커스텀 Button 컴포넌트로 전환
- **완료 파일들**:
  - `src/components/common/Button.js` - link, dashed variant 추가
  - `AddressSearchModal.js` - 모든 버튼 컴포넌트 전환
  - `DocumentLinkModal.js` - 버튼 API 변경 (type → variant)
  - `CustomerEditForm.js` - 폼 버튼들 전환
  - `DocumentManagementPanel.js` - 패널 액션 버튼들 전환
  - `ConsultationManagementPanel.js` - 상담 관련 버튼들 전환
  - `ContractManagementPanel.js` - 계약 관련 버튼들 전환
  - `CustomerManagement.js` - 메인 관리 페이지 버튼들 전환
  - `ImageViewer.js`, `PDFViewer.js` - 뷰어 컨트롤 버튼들 전환
  - `RightPane.js` - 우측 패널 버튼들 전환
  - `CustomerRelationshipTreeView.js` - 관계도 뷰 버튼들 전환

#### "1번 정리 및 최적화" 완료 ✅
- **1차 정리** (커밋: 944f697):
  - 미사용 import 제거 (IdcardOutlined, CloseOutlined, Table 등)
  - 미사용 변수/함수 제거 (loading, setLoading, handleKeyPress 등)
  - Unicode BOM 제거 (apiService.js)

- **2차 Hook 종속성 최적화** (커밋: 47f4c55):
  - `CustomerDetailPanel.js`: fetchCustomerDetail, fetchCustomerDocuments useCallback 최적화
  - `CustomerManagement.js`: pagination Hook 종속성 경고 해결
  - `ImageViewer.js`: 미사용 변수 제거 (maxImageHeight, containerHeight, paneHeight)
  - `CustomerRelationshipTreeView.js`: selectFamilyRepresentative useCallback 최적화

- **결과**: 모든 ESLint 경고 해결, 성공적인 빌드 완료

### 다음 단계 옵션들

#### Option 1: Phase 4 - 테마 시스템 통합
- CSS Variables를 활용한 다크모드 지원
- `src/styles/themes.css` 파일 생성
- 색상, 폰트, 간격 등의 디자인 토큰 정의
- 컴포넌트별 테마 적용

#### Option 2: 성능 최적화 단계
- React.memo, useMemo, useCallback 추가 최적화
- 번들 크기 분석 및 코드 스플리팅
- 이미지 lazy loading 구현
- API 호출 최적화 (중복 요청 방지, 캐싱)

#### Option 3: 테스트 커버리지 향상
- Jest 단위 테스트 추가
- React Testing Library 통합 테스트 구현
- E2E 테스트 시나리오 작성
- 테스트 자동화 설정

#### Option 4: 접근성(A11y) 개선
- ARIA 속성 추가
- 키보드 네비게이션 개선
- 스크린 리더 지원 강화
- 색상 대비 및 포커스 관리

### 재개 시 실행할 명령어
```bash
# 개발 서버 시작
cd frontend/aims-uix1 && PORT=3005 npm start

# 현재 상태 확인
git status
git log --oneline -10

# 최근 커밋 확인
git show --name-only
```

### 중요한 컨텍스트
- **현재 브랜치**: main
- **마지막 커밋**: 47f4c55 (Hook 종속성 최적화)
- **빌드 상태**: 성공 (ESLint 경고 0개)
- **개발 서버**: PORT=3005에서 실행 중
- **주요 작업 완료**: Phase 3 + 코드 정리 및 최적화

### 프로젝트 철학
- **점진적 개선**: 한 번에 하나씩 체계적으로 개선
- **품질 우선**: 모든 경고와 오류를 해결한 후 다음 단계 진행  
- **사용자 승인**: 모든 커밋 전 사용자 확인 필수
- **문서화**: 모든 변경사항을 상세히 기록

---

## AIMS 디자인 시스템 - 공식 색상 가이드 🎨

### 테마 색상 시스템 (color.png 기준)

이 섹션은 `/mnt/d/Users/rossi/Desktop/color.png`에서 정의된 Light/Dark 테마를 기반으로 합니다.

#### Light Theme 색상
```css
/* 배경 색상 */
--color-bg-primary: #f5f6f7;        /* 메인 배경 */
--color-bg-secondary: #ffffff;      /* 카드/패널 배경 */

/* 텍스트 색상 */
--color-text-primary: #1a1a1a;      /* 메인 텍스트 */
--color-text-secondary: #6b7280;    /* 보조 텍스트 */

/* 버튼 색상 */
--color-primary: #3b82f6;           /* 주요 버튼 (파란색) */
--color-primary-hover: #2563eb;     /* 주요 버튼 호버 */

/* 아이콘 색상 */
--color-icon-orange: #f97316;       /* 주황색 아이콘 */
--color-icon-pink: #ec4899;         /* 분홍색 아이콘 */
--color-icon-cyan: #06b6d4;         /* 청록색 아이콘 */
--color-icon-red: #ef4444;          /* 빨간색 아이콘 */
```

#### Dark Theme 색상
```css
/* 배경 색상 */
--color-bg-primary: #374151;        /* 메인 배경 */
--color-bg-secondary: #4b5563;      /* 카드/패널 배경 */

/* 텍스트 색상 */
--color-text-primary: #f9fafb;      /* 메인 텍스트 */
--color-text-secondary: #d1d5db;    /* 보조 텍스트 */

/* 버튼 색상 */
--color-primary: #2563eb;           /* 주요 버튼 (어두운 파란색) */
--color-primary-hover: #1d4ed8;     /* 주요 버튼 호버 */

/* 아이콘 색상 - 다크모드에서 약간 더 밝게 */
--color-icon-orange: #fb923c;       /* 주황색 아이콘 */
--color-icon-pink: #f472b6;         /* 분홍색 아이콘 */
--color-icon-cyan: #22d3ee;         /* 청록색 아이콘 */
--color-icon-red: #f87171;          /* 빨간색 아이콘 */
```

### 디자인 원칙

1. **방향성 중심**: color.png는 디자인 방향을 제시하는 레퍼런스
2. **유연한 적용**: 정확한 색상코드보다는 **톤과 분위기** 유지가 중요
3. **통일성**: 전체적인 색조와 시각적 조화 확보
4. **접근성**: 충분한 색상 대비 유지 (WCAG 2.1 AA 기준)
5. **반응성**: 테마 전환 시 모든 요소가 즉시 반영되어야 함
6. **확장성**: 새로운 색상 추가 시 시스템적 접근

### 색상 적용 철학

#### ✅ 올바른 접근
- color.png와 **조화로운 색상** 선택
- 상황에 맞는 **적절한 명도/채도** 조정
- 전체적인 **일관된 분위기** 유지
- Light/Dark 테마 간 **자연스러운 전환**

#### ❌ 피해야 할 접근
- 색상코드에 **경직되게** 얽매이기
- 레퍼런스 **무시하고** 임의 색상 사용
- 테마별 **불일치**하는 색조 적용
- **하드코딩**된 고정 색상 사용

#### 예시: 파란색 버튼 적용
```css
/* 상황별 유연한 적용 ✅ */
--color-primary: #3b82f6;        /* 기본 */
--color-primary: #2563eb;        /* 좀 더 진한 톤 */
--color-primary: #1d4ed8;        /* 강조가 필요한 경우 */

/* 경직된 적용 ❌ */
--color-primary: #3b82f6;        /* 오직 이것만 */
```

### 구현 방법

#### CSS Variables 사용
```css
/* 올바른 방법 ✅ */
.button-primary {
  background-color: var(--color-primary);
  color: var(--color-text-primary);
}

/* 잘못된 방법 ❌ */
.button-primary {
  background-color: #3b82f6;
  color: #1a1a1a;
}
```

#### 테마 전환 구조
```css
/* 기본 (Light Theme) */
:root {
  --color-bg-primary: #f5f6f7;
  --color-text-primary: #1a1a1a;
}

/* Dark Theme */
html[data-theme="dark"] {
  --color-bg-primary: #374151;
  --color-text-primary: #f9fafb;
}
```

### 색상 적용 우선순위

1. **필수 적용**: 배경, 텍스트, 주요 버튼
2. **중요 적용**: 테두리, 그림자, 호버 상태
3. **보조 적용**: 아이콘, 인디케이터, 상태 표시

**중요**: 이 가이드는 color.png의 디자인을 모든 AIMS 컴포넌트에 일관되게 적용하기 위한 표준입니다.