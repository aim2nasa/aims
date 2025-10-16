# Annual Report 기능 구현 계획 (안전한 단계별 진행)

**작성일**: 2025-10-16
**목적**: Annual Report 파싱 기능의 안전하고 확실한 단계별 구현 계획

---

## 🎯 구현 목표

보험설계사의 고객 Annual Report (보유계약 현황) PDF를 자동 파싱하여 DB에 저장하고 프론트엔드에서 조회/표시

---

## 📋 구현 방식

- **백엔드**: Python FastAPI (독립 서비스)
- **이유**: 25초 평균 처리 시간 → 비동기 필수, 기존 Python 코드 재사용
- **특징**: 각 단계마다 커밋 전 사용자 승인 필수

---

## 🔥 Phase 1: Python FastAPI 기본 구조 (백엔드)

### Step 1-1: 디렉토리 구조 생성

```
backend/api/annual_report_api/
├── main.py
├── config.py
├── requirements.txt
├── README.md
├── routes/
│   ├── __init__.py
│   ├── parse.py
│   └── query.py
├── services/
│   ├── __init__.py
│   ├── detector.py
│   ├── parser.py
│   └── db_writer.py
└── utils/
    ├── __init__.py
    └── pdf_utils.py
```

- **작업**: 디렉토리 및 빈 `__init__.py` 파일 생성
- **커밋 전 확인 필요**: 디렉토리 구조 검토
- **상태**: ✅ 완료

### Step 1-2: FastAPI 기본 설정

- **파일**: `main.py`, `config.py`, `requirements.txt`, `README.md`
- **내용**:
  - FastAPI 앱 초기화
  - CORS 설정
  - MongoDB 연결 설정 (환경 변수)
  - 헬스체크 엔드포인트
- **커밋 전 확인 필요**: 기본 설정 동작 확인
- **상태**: 🔄 진행 중

---

## 🔥 Phase 2: 핵심 파싱 로직 구현 (백엔드)

### Step 2-1: PDF 유틸리티 함수

- **파일**: `utils/pdf_utils.py`
- **기능**:
  - PDF 페이지 수 가져오기
  - PDF 특정 페이지 텍스트 추출
  - N페이지 동적 탐지 ("주요 보장내용 현황" 찾기)
- **커밋 전 확인 필요**: 샘플 PDF로 테스트
- **상태**: ⏳ 대기

### Step 2-2: Annual Report 판단 로직

- **파일**: `services/detector.py`
- **기능**:
  - PDF 1페이지 읽기
  - 키워드 체크 ("Annual Review Report", "보유계약 현황")
  - confidence 점수 계산
- **커밋 전 확인 필요**: 4개 샘플 PDF로 검증
- **상태**: ⏳ 대기

### Step 2-3: OpenAI API 파싱 로직

- **파일**: `services/parser.py`
- **기능**:
  - `tools/annual_report/parse_pdf_with_ai.py` 코드 이동
  - 프롬프트 확장 (고객명, 발행기준일 추출)
  - JSON 파싱 및 에러 핸들링
- **커밋 전 확인 필요**: 실제 파싱 테스트 (25초 소요)
- **상태**: ⏳ 대기

### Step 2-4: MongoDB 저장 로직

- **파일**: `services/db_writer.py`
- **기능**:
  - `customers.annual_reports` 배열에 추가
  - 요약 정보 계산 (total_monthly_premium, total_contracts)
  - 에러 핸들링
- **커밋 전 확인 필요**: DB 저장 확인
- **상태**: ⏳ 대기

---

## 🔥 Phase 3: API 엔드포인트 구현 (백엔드)

### Step 3-1: 파싱 엔드포인트

- **파일**: `routes/parse.py`
- **엔드포인트**: `POST /annual-report/parse`
- **기능**:
  - FastAPI BackgroundTasks 사용
  - 즉시 응답 (< 1초)
  - 백그라운드에서 파싱 (25초)
- **커밋 전 확인 필요**: API 테스트
- **상태**: ⏳ 대기

### Step 3-2: 조회 엔드포인트

- **파일**: `routes/query.py`
- **엔드포인트**: `GET /customers/:id/annual-reports`
- **기능**:
  - 고객의 모든 Annual Reports 조회
  - 최신순 정렬
- **커밋 전 확인 필요**: 조회 테스트
- **상태**: ⏳ 대기

### Step 3-3: main.py 라우터 등록

- **파일**: `main.py`
- **내용**: 라우터 등록 및 서버 실행 테스트
- **커밋 전 확인 필요**: 전체 API 동작 확인
- **상태**: ⏳ 대기

---

## 🔥 Phase 4: Node.js 연동 (백엔드)

### Step 4-1: Python API 호출 함수 추가

- **파일**: `backend/api/aims_api/server.js`
- **위치**: 고객 문서 업로드 API 근처
- **기능**:
  - Python FastAPI 호출 (axios)
  - 에러 핸들링
- **커밋 전 확인 필요**: 연동 테스트
- **상태**: ⏳ 대기

---

## 🔥 Phase 5: 프론트엔드 UI (고객 상세 페이지)

### Step 5-1: Annual Reports 조회 서비스

- **파일**: `frontend/aims-uix3/src/services/annualReportService.ts`
- **기능**:
  - API 호출 함수들
  - `getAnnualReports(customerId)`
- **커밋 전 확인 필요**: 서비스 동작 확인
- **상태**: ⏳ 대기

### Step 5-2: Annual Report 컨트롤러

- **파일**: `frontend/aims-uix3/src/controllers/useAnnualReportsController.tsx`
- **기능**:
  - 상태 관리 (로딩, 에러, 데이터)
  - 조회 함수
- **커밋 전 확인 필요**: 컨트롤러 테스트
- **상태**: ⏳ 대기

### Step 5-3: 계약 탭 내 Annual Report 섹션

- **파일**: `frontend/aims-uix3/src/features/customer/views/CustomerDetailView/tabs/ContractsTab.tsx` (신규)
- **내용**:
  - Annual Report 섹션 UI
  - 계약 테이블 표시
  - 요약 정보 (총 계약 건수, 월 보험료 합계)
- **커밋 전 확인 필요**: UI 동작 확인
- **상태**: ⏳ 대기

### Step 5-4: CustomerDetailView 연동

- **파일**: `frontend/aims-uix3/src/features/customer/views/CustomerDetailView/CustomerDetailView.tsx`
- **내용**: 계약 탭 추가
- **커밋 전 확인 필요**: 전체 흐름 테스트
- **상태**: ⏳ 대기

---

## 🔥 Phase 6: 통합 테스트 및 문서화

### Step 6-1: 엔드투엔드 테스트

- **테스트 시나리오**:
  1. 샘플 PDF 업로드
  2. 백그라운드 파싱 대기 (25초)
  3. DB 저장 확인
  4. 프론트엔드에서 조회 확인
- **커밋 전 확인 필요**: 전체 플로우 검증
- **상태**: ⏳ 대기

### Step 6-2: README 및 API 문서 작성

- **파일**: `backend/api/annual_report_api/README.md`
- **내용**:
  - API 엔드포인트 목록
  - 사용 방법
  - 환경 변수 설정
- **커밋 전 확인 필요**: 문서 검토
- **상태**: ⏳ 대기

---

## ⚠️ 중요 원칙

### 1. 커밋 규칙 (절대 준수!)

- ❌ **Claude가 임의로 커밋 금지**
- ✅ **각 단계 완료 후 사용자에게 커밋 요청**
- ✅ **사용자 승인 후에만 커밋 실행**
- ✅ **커밋 후 다음 단계 명령 대기**

### 2. 안전성 우선

- 백엔드 코드는 tars 서버에 배포 필요 (Claude는 수정만)
- 프론트엔드는 로컬에서 테스트 가능
- 각 단계마다 동작 검증 필수

### 3. 최소 수정 원칙

- 기존 코드 최대한 보존
- 새로운 기능만 추가
- 부작용 방지

---

## 📊 예상 소요 시간

- Phase 1-2: 백엔드 파싱 로직 (1일)
- Phase 3: API 엔드포인트 (0.5일)
- Phase 4: Node.js 연동 (0.5일)
- Phase 5: 프론트엔드 UI (1일)
- Phase 6: 통합 테스트 (0.5일)
- **총 예상**: 3.5일

---

## 🚀 시작 방법

1. 사용자가 계획 승인 ✅
2. Phase 1-1부터 순차적으로 진행
3. 각 Step 완료 시 커밋 요청
4. 사용자 승인 후 다음 Step 진행

---

## 📚 참고 문서

- [ANNUAL_REPORT_FEATURE_SPEC.md](ANNUAL_REPORT_FEATURE_SPEC.md) - 기능 명세서
- [ANNUAL_REPORT_IMPLEMENTATION_ANALYSIS.md](ANNUAL_REPORT_IMPLEMENTATION_ANALYSIS.md) - 구현 분석 및 벤치마크
- `tools/annual_report/parse_pdf_with_ai.py` - 기존 파싱 코드
- `tools/annual_report/benchmark_parser.py` - 벤치마크 스크립트

---

## 📝 진행 상황 (업데이트)

### 완료된 단계
- [x] Phase 1-1: 디렉토리 구조 생성 (2025-10-16)

### 진행 중
- [ ] Phase 1-2: FastAPI 기본 설정

### 대기 중
- [ ] Phase 2: 핵심 파싱 로직
- [ ] Phase 3: API 엔드포인트
- [ ] Phase 4: Node.js 연동
- [ ] Phase 5: 프론트엔드 UI
- [ ] Phase 6: 통합 테스트

---

**최종 수정**: 2025-10-16
**작성자**: Claude
**승인**: 사용자
