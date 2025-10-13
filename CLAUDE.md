# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🎯 핵심 개발 철학 - 최우선 원칙 🎯

### UX 최우선주의 - 모든 것의 중심

**"최고의 UX를 위해서는 모든 것을 다 뜯어 고칠 용의가 있다."**

이것이 AIMS 프로젝트의 근본 철학입니다.

#### 핵심 가치

1. **사용자가 중심이다**
   - 모든 결정의 기준은 "사용자에게 더 나은가?"
   - 기술적 완성도보다 사용자 경험이 우선
   - 사용자가 느끼는 불편함은 즉시 해결해야 할 최우선 과제

2. **UX 개선을 위해서라면 모든 것을 뜯어고칠 용의가 있다**
   - 기존 코드가 아무리 잘 작성되어 있어도
   - 아키텍처가 아무리 훌륭해도
   - 이미 많은 시간을 투자했어도
   - **UX가 더 나아진다면 주저 없이 전면 개편한다**

3. **이것이 진정한 개발자의 자세다**
   - 코드에 대한 애착보다 사용자에 대한 책임감
   - 기술 자랑보다 실용성
   - 완벽한 설계보다 완벽한 경험

#### 실천 원칙

```
UX 문제 발견 시:
1. "이게 정말 사용자에게 불편한가?" 확인
2. "어떻게 하면 더 나아질까?" 고민
3. "기존 코드를 뜯어고쳐야 한다면?" → 주저 없이 실행
4. "전체를 다시 설계해야 한다면?" → 과감하게 결단
```

**기억하라**: 코드는 다시 짜면 되지만, 사용자의 시간은 돌아오지 않는다.

---

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

5. **⚠️ 진단과 구현의 일치성 검증 - 신규 추가!**
   - **문제 진단이 "색상 문제"라면 오직 CSS만 수정**
   - **문제 진단이 "로직 문제"라면 오직 해당 로직만 수정**
   - 진단 결과와 다른 영역을 수정하는 것은 **최소 수정 원칙 위반**
   - 예시:
     ```
     ❌ 잘못된 예: "색상 대비 문제" 진단 → CSS + JavaScript 둘 다 수정
     ✅ 올바른 예: "색상 대비 문제" 진단 → CSS만 수정
     ❌ 잘못된 예: "상태 관리 문제" 진단 → 상태 로직 + 스타일 둘 다 수정
     ✅ 올바른 예: "상태 관리 문제" 진단 → 상태 로직만 수정
     ```

**원칙**: 작고 집중된 변경사항이 안전하고 유지보수하기 좋다!

**새로운 철칙**: 진단한 문제 영역 외의 코드를 건드리는 것은 금지!

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

### 인라인 스타일 가이드라인 ⚖️

**허용**: 동적 계산값 (`width: ${dynamicValue}px`), 런타임 위치 (`transform: translate()`)
**금지**: 정적 색상, 하드코딩된 값, 대량 중복 패턴

**판단 기준**: "3개월 후에도 유지보수하기 쉬운가?"

### 공용 CSS 시스템 ⚡

- 5회 이상 반복 패턴 → 공용 클래스 추출
- 공용 클래스 카테고리: Layout, Interactive, Accent, Spacing
- CSS 변수 사용 필수

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
  - Node.js API server in `backend/api/aims_api/` for document status monitoring
  - Python FastAPI service in `backend/api/doc_status_api/` for document status API
  - MongoDB database on `tars:27017`

- **Core Python Modules** in `src/`:
  - `docmeta`: Document metadata extraction
  - `dococr`: OCR text extraction from images/PDFs
  - `doctag`: AI-based document tagging and classification
  - `doccase`: Document clustering by case/incident

- **Automation**: n8n workflows in `backend/n8n_flows/` for automated processing

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
cd backend/api/aims_api && npm start

# Start Python FastAPI service
cd backend/api/doc_status_api && uvicorn main:app --reload

# Start Python document status API
cd backend/api/doc_status_api && python main.py
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

## 프로젝트 철학

- **점진적 개선**: 한 번에 하나씩 체계적으로
- **품질 우선**: 모든 경고 해결 후 진행
- **사용자 승인**: 커밋 전 확인 필수
- **문서화**: 변경사항 상세 기록

---

## AIMS 디자인 시스템 🎨

### 색상 시스템

| 요소 | Light | Dark |
|------|-------|------|
| 배경 | #f5f6f7, #ffffff | #374151, #4b5563 |
| 텍스트 | #1a1a1a, #6b7280 | #f9fafb, #d1d5db |
| 액션 | #3b82f6 | #2563eb |

### 핵심 원칙

- **톤과 분위기** 유지 (경직된 색상코드 금지)
- CSS 변수 사용 (`var(--color-primary)`)
- Light/Dark 테마 자연스러운 전환
- WCAG 2.1 AA 색상 대비 기준

**자세한 내용**: `frontend/aims-uix3/CSS_SYSTEM.md` 참조

---

## 🍎 애플 디자인 철학 (UIX3 표준)

### 3대 핵심 원칙

1. **Clarity (명확성)**: 정보 계층 구조 명확
2. **Deference (겸손함)**: UI가 콘텐츠 방해 금지
3. **Depth (깊이감)**: 자연스러운 시각적 계층

### Progressive Disclosure

- **기본**: 거의 보이지 않는 서브틀한 표현
- **상호작용**: 필요한 정보만 단계적 표시
- **철학**: "Invisible until you need it"

### 금지사항

- 화려한 그라데이션
- 강한 색상 강조
- 과도한 시각적 효과
- 항상 보이는 인디케이터

### 체크리스트

- [ ] iOS 공식 팔레트
- [ ] 서브틀한 기본 상태
- [ ] Progressive Disclosure 구현
- [ ] Light/Dark 테마 지원
- [ ] ARIA 접근성