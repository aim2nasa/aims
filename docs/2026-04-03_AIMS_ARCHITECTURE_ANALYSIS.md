# AIMS 아키텍처 분석 보고서

> 작성일: 2026-04-03 (팩트체크 반영: 동일)
> 목적: 전체 서비스/모듈 목록, 의존성, 도메인 경계 위반, 결합도 핫스팟 식별
> 검증: 코드 기반 팩트체크 완료 — 25건 주장 중 20건 TRUE, 5건 수정 반영

---

## 1. 전체 서비스/모듈 목록

### 1.1 Backend (10개 서비스 + 배치 1개 + 인프라 4개)

#### API 서비스

| 서비스 | 스택 | 포트 | 역할 | 경로 |
|--------|------|:----:|------|------|
| **aims_api** | Express 5 (Node) | 3010 | 메인 API 허브: 인증, 고객, 문서, 계약, SSE, 시스템 로그 | `backend/api/aims_api/` |
| **aims_mcp** | TypeScript/MCP SDK | 3011 | AI 도구 호출용 MCP 서버 | `backend/api/aims_mcp/` |
| **aims_health_monitor** | TypeScript | 3012 | 전 서비스 헬스체크 (60초 폴링) | `backend/api/aims_health_monitor/` |
| **rustdesk-service** | Node.js | 3015 | UFW 방화벽 제어 (RustDesk 원격 지원용) | `backend/rustdesk-service/` |
| **aims_rag_api** | FastAPI (Python) | 8000 | RAG 하이브리드 검색 (Qdrant + MongoDB) | `backend/api/aims_rag_api/` |
| **pdf_proxy** | FastAPI (Python) | 8002 | PDF 서빙 + 메타 인코딩 + 썸네일 | `backend/api/pdf_proxy/` |
| **annual_report_api** | FastAPI (Python) | 8004 | AR/CRS PDF 파싱 + 고객 데이터 기록 | `backend/api/annual_report_api/` |
| **pdf_converter** | Node (Docker) | 8005 | Office→PDF 변환 (LibreOffice/pyhwp) | `tools/convert/` |
| **document_pipeline** | FastAPI (Python) | 8100 | 문서 처리 핵심: 업로드/OCR/분류/임베딩 | `backend/api/document_pipeline/` |
| **virus-scan-service** | FastAPI (Python) | 8100 (RPi5) | ClamAV 기반 바이러스 스캔 (별도 머신 yuri) | `backend/services/virus-scan-service/` |

#### 배치/파이프라인

| 모듈 | 역할 | 경로 |
|------|------|------|
| **embedding pipeline** | 텍스트 추출 → 청킹 → Qdrant 임베딩 (크론 실행) | `backend/embedding/` |

#### 인프라

| 인프라 | 포트 | 용도 |
|--------|:----:|------|
| MongoDB | 27017 | `docupload` DB (메인 데이터) |
| Redis | 6379 | OCR 스트림 (`ocr_stream`) |
| Qdrant | 6333 | 벡터 DB (`docembed` 컬렉션) |
| n8n | 5678 | 워크플로우 엔진 (레거시, docprep-main 웹훅 진입점) |

#### 백그라운드 프로세스

| 프로세스 | 유형 | 역할 |
|----------|------|------|
| `aims-backup-watcher` | systemd timer (5초 간격) | 백업 감시 |
| `backup_aims.sh` | cron (매일 03:00) | MongoDB + Qdrant + 파일 + n8n 백업 |
| `run_pipeline.sh` | cron | 임베딩 파이프라인 주기 실행 |

### 1.2 Frontend

**경로:** `frontend/aims-uix3/` — React 19 + TypeScript + Vite + TanStack Query + Zustand

#### Feature 모듈 (src/features/)

| 모듈 | 역할 |
|------|------|
| `customer/` | **지배적 모듈** — 고객 전체 라이프사이클, AR/CRS API, PDF 파싱, 파일 해시, 관계/주소/메모 |
| `batch-upload/` | 폴더 일괄 업로드, 중복 검출, 스토리지 가드 |
| `annual-report/` | AR 워크플로우 (고객 선택/등록 모달) |
| `AccountSettings/` | 계정 관리, 스토리지/AI 사용량 |
| `help/` | FAQ/공지/사용가이드 API |

#### 레거시 컴포넌트 (src/components/) — features/로 마이그레이션 중

| 디렉토리 | 역할 |
|----------|------|
| `DocumentViews/` | 문서 등록, 탐색, 검색, 상태, 개인파일 — **가장 큰 크로스 커플링 지점** |
| `ChatPanel/` | AI 채팅 어시스턴트 |
| `ContractViews/` | 계약 관리, 엑셀 임포트 |
| `CustomerViews/` | 레거시 래퍼 (features/customer로 위임) |
| `CenterPaneView/` | 메인 콘텐츠 패인 오케스트레이터 |
| `Header/` | 앱 헤더, 유저 프로필 |
| `PDFViewer/`, `ImageViewer/` | 뷰어 구현체 |
| `NaverMap/` | 지역별 고객 지도 |
| `QuickSearch/`, `QuickActionsViews/` | 글로벌 유틸리티 패널 |
| `HelpViews/` | FAQ, 공지, 사용가이드 뷰 |
| `InquiryView/` | 문의/지원 티켓 |

#### 서비스 레이어 (src/services/) — 19개

| 서비스 | 외부 사용 수 | 비고 |
|--------|:-----------:|------|
| **DocumentStatusService** | **45곳** | 가장 널리 사용되는 서비스 |
| **customerService** | 24곳 | Zustand 스토어 직접 접근 (결합 이슈) |
| **DocumentService** | 23곳 | |
| **relationshipService** | 20곳 | |
| **userService** | 14곳 | |
| **searchService** | 12곳 | |
| **contractService** | 9곳 | |
| **documentTypesService** | 7곳 | |
| **aiUsageService** | 5곳 | |
| **personalFilesService** | 5곳 | |
| 기타 9개 | 1~4곳 | addressService, modalService 등 |

#### 상태 관리

| 영역 | 도구 | 위치 | 주요 스토어 |
|------|------|------|-------------|
| 서버 상태 | TanStack Query | `src/app/queryClient.ts` | `queryKeys.customers()`, `queryKeys.documentsByCustomer()` 등 |
| UI 상태 (공용) | Zustand | `src/shared/store/` (6개) | `useDevModeStore`, `useLayoutStore`, `useNavigationStore`, `useRecentCustomersStore`, `useCustomerStatusFilterStore`, `useAccountSettingsStore` |
| 엔티티 상태 | Zustand | `src/stores/` (2개) | `CustomerDocument`, `user` |
| 인증 상태 | Zustand | `src/shared/stores/` | `authStore` |
| 트리 스코프 | React Context | 컴포넌트 내 | `useAppleConfirm`, `useDocumentSearch`, `CustomerContext` |

> **구조 이슈:** Zustand 스토어가 `src/stores/`, `src/shared/store/`, `src/shared/stores/` 3곳에 분산

---

## 2. 모듈 간 의존성

### 2.1 Backend 호출 관계

```
                         ┌──────────────────┐
                         │    aims_api      │ ← 모든 서비스의 중심
                         │     :3010        │
                         └─┬──┬──┬──┬──┬──┬─┘
              ┌────────────┘  │  │  │  │  └────────────┐
              ▼               │  ▼  │  ▼               ▼
       aims_mcp:3011          │ doc_pipeline  annual_report  aims_rag_api
                              │   :8100         :8004          :8000
                              ▼     │             │              │
                        pdf_proxy   ▼             │              │
                          :8002  pdf_converter    │              │
                                  :8005           │              │
                              ┌───┘               │              │
                              ▼                   ▼              ▼
                         aims_api:3010 ←──── 콜백/웹훅 ────────┘
```

#### 서비스별 외부 호출 상세

| 호출자 | 호출 대상 | 용도 |
|--------|-----------|------|
| **aims_api** → aims_mcp | 채팅 도구 디스패치 |
| **aims_api** → annual_report_api | AR/CRS 체크 및 파싱 프록시 |
| **aims_api** → document_pipeline | 스마트 서치, 배치 displayName, 헬스 |
| **aims_api** → n8n | docprep-main 웹훅 (레거시) |
| **aims_api** → pdf_converter | Office→PDF 변환 |
| **aims_api** → virus-scan-service | 파일 스캔 |
| **aims_api** → **자기 자신** | personal-files-routes 루프백 (안티패턴) |
| **document_pipeline** → aims_api | 크레딧 체크, 고객 조회, webhook 알림 |
| **document_pipeline** → pdf_converter | 변환 요청 |
| **annual_report_api** → aims_api | 모델 설정, SSE 트리거, 시스템 로그 |
| **aims_rag_api** → aims_api | 크레딧, 모델 설정, 토큰 로깅 |
| **aims_rag_api** → document_pipeline | 스마트 서치 위임 |
| **aims_mcp** → aims_api | 주소 검색, 시스템 로그 |
| **aims_mcp** → aims_rag_api | RAG 검색 |

**핵심 문제: 양방향 의존성** — aims_api가 document_pipeline/annual_report_api를 호출하고, 이들이 다시 aims_api를 콜백. 순환 의존.

### 2.2 공유 MongoDB 직접 접근

| 컬렉션 | aims_api | doc_pipeline | annual_report | aims_rag | aims_mcp |
|--------|:--------:|:------------:|:------------:|:--------:|:--------:|
| **files** | R/W (owner) | R/W | R/W | **R only** | — |
| **customers** | R/W (owner) | R/W | R/W | **R only** | R/W |
| **customer_relationships** | R/W | — | — | R | R/W |
| **customer_memos** | R/W | — | — | — | R/W |
| **ar_parse_queue** | W (enqueue) | — | R/W (consume) | — | — |
| **pdf_conversion_queue** | W (enqueue) | R/W (worker) | — | — | — |
| **upload_queue** | — | R/W (worker) | — | — | — |
| **chat_sessions/messages** | R/W | — | — | — | R |

**`files`를 4개 서비스가 (3 R/W + 1 R), `customers`를 5개 서비스가 (4 R/W + 1 R) 스키마 계약 없이 직접 접근.**

### 2.3 공유 모듈

- **`@aims/shared-schema`** (`backend/shared/schema/`): `COLLECTIONS`, `CUSTOMER_FIELDS` 등 상수 — Node.js 서비스 11곳에서 사용
- **Python 서비스는 미사용** — 컬렉션명을 `"files"`, `"customers"` 문자열로 하드코딩

### 2.4 Redis 공유

- `document_pipeline` → `ocr_stream` XADD (OCR 요청 발행)
- `document_pipeline/ocr_worker` → `ocr_stream` XREADGROUP (소비)
- `aims_api/ocr-usage-routes` → `ocr_stream` XADD (수동 재큐잉)

### 2.5 Frontend 크로스 의존

```
components/DocumentRegistrationView (최악의 커플링)
    ├── @/features/customer/utils/pdfParser
    ├── @/features/customer/utils/fileHash
    ├── @/features/customer/api/annualReportApi
    ├── @/features/customer/api/customerReviewApi
    ├── @/features/annual-report/components/CustomerSelectionModal
    ├── @/features/annual-report/components/NewCustomerInputModal
    ├── @/features/batch-upload/components/StorageExceededDialog
    ├── @/features/batch-upload/components/DuplicateDialog
    └── @/features/batch-upload/api/batchUploadApi

components/ChatPanel
    ├── @/features/customer/utils/pdfParser
    └── @/features/customer/views/.../tabs/CustomerDocumentPreviewModal (3단계 깊이)

shared/ui/UsageQuotaWidget
    └── @/features/batch-upload/utils/fileValidation (역방향 의존!)
```

---

## 3. 도메인 경계 위반

### 3.1 Backend 위반

| # | 위반 | 심각도 | 위치 | 설명 |
|:-:|------|:------:|------|------|
| B1 | **annual_report_api가 `files`/`customers` 직접 쓰기** | **HIGH** | `main.py`, `routes/background.py`, `services/db_writer.py` | aims_api의 검증/로깅/SSE 완전 우회. `db["files"].update_one()` 다수 |
| B2 | **aims_mcp가 `customers`/`memos`/`relationships` 직접 쓰기** | **HIGH** | `tools/customers.ts`, `tools/memos.ts`, `tools/relationships.ts` | aims_api의 비즈니스 로직(활동 로그, SSE 알림) 우회 |
| B3 | **aims_rag_api가 `customers`/`relationships` 직접 읽기** | MED | `hybrid_search.py` | 스키마 변경 시 동시 수정 필요 |
| B4 | **personal-files-routes 자기 자신 HTTP 호출** | LOW | `personal-files-routes.js:223,312,429,505,524,719,924,1000` | `localhost:3010/api/webhooks/*` 루프백 안티패턴 |
| B5 | **Python 서비스 컬렉션명 하드코딩** | MED | 전 Python 서비스 | `@aims/shared-schema` 미사용, 문자열 직접 사용 |
| B6 | **ar_parse_queue 스키마 계약 부재** | MED | aims_api ↔ annual_report_api | 양쪽이 같은 큐를 사용하나 스키마 정의 없음 |
| B7 | **PYTHON_API_URL 미정의** | LOW | `admin-routes.js:564` | 변수 선언 없이 사용 — RAG 버전 체크 항상 실패 |

### 3.2 Frontend 위반

| # | 위반 | 심각도 | 위치 | 설명 |
|:-:|------|:------:|------|------|
| F1 | **DocumentRegistrationView가 3개 feature 내부 직접 import** | **HIGH** | `components/DocumentViews/DocumentRegistrationView/` | customer, annual-report, batch-upload 내부 7개 모듈 침투 (하위 hooks/utils 포함 시 더 많음) |
| F2 | **shared/ → features/ 역방향 의존** | **HIGH** | `shared/ui/UsageQuotaWidget` → `features/batch-upload/utils` | 계층 역전 — shared가 feature에 의존 |
| F3 | **ChatPanel이 customer 탭 내부 컴포넌트 직접 import** | MED | `ChatPanel.tsx:26` → `views/.../tabs/CustomerDocumentPreviewModal` | 3단계 깊이 침투 (views→CustomerDetailView→tabs) |
| F4 | **features/ ↔ components/ 양방향 의존** | MED | `MemosTab` → `AppleConfirmModal` (components/) | feature가 레거시 내부에 의존 |
| F5 | **services/ 레이어가 Zustand 스토어 직접 접근** | MED | `customerService.ts` → `useRecentCustomersStore` | 서비스가 React 상태에 결합, React 외부 사용 불가 |
| F6 | **entities/가 services/ 재export만 하는 빈 껍데기** | LOW | `entities/customer/api.ts`, `entities/document/api.ts` | 레이어 존재 이유 불분명 |
| F7 | **controller 위치 불일치** | LOW | `src/controllers/` vs `features/customer/controllers/` | 어디에 두는지 규칙 없음 |

---

## 4. 결합도 Top 5

| 순위 | 지점 | 결합 지표 | 영향 |
|:----:|------|-----------|------|
| **1** | **aims_api (백엔드 허브)** | 7개 서비스 양방향 의존. SSE/인증/크레딧/로그/모델설정 모두 집중 | aims_api 장애 = 전체 시스템 다운. 어떤 서비스도 독립 테스트 불가 |
| **2** | **`files` 컬렉션** | 4개 서비스 접근 (3 R/W + 1 R), 스키마 계약 없음 | 스키마 변경 시 4곳 동시 수정 필요. 데이터 정합성 위험 |
| **3** | **`customers` 컬렉션** | 5개 서비스 접근 (4 R/W + 1 R), 검증/SSE 우회 경로 존재 | 고객 데이터 불일치, 활동 로그 누락, SSE 미발송 |
| **4** | **DocumentRegistrationView (프론트)** | 3개 feature 내부 7+ 모듈 직접 import | 어떤 feature 리팩터링이든 이 파일 동시 수정 필수 |
| **5** | **features/customer (프론트)** | pdfParser, fileHash, annualReportApi 등이 외부 8곳에서 import | customer 모듈이 "문서 처리" 도메인까지 흡수, 분리 불가 |

---

## 5. 의존성 요약 다이어그램

### Backend 순환 의존

```
aims_api ──────→ document_pipeline ──────→ aims_api (콜백)
aims_api ──────→ annual_report_api ──────→ aims_api (콜백)
aims_api ──────→ aims_rag_api ───────────→ aims_api (콜백)
aims_api ──────→ aims_mcp ───────────────→ aims_api (로그)
```

### DB 커플링

```
files ←──── aims_api (owner, R/W)
      ←──── document_pipeline (R/W — owner 우회)
      ←──── annual_report_api (R/W — owner 우회)
      ←──── aims_rag_api (R only — 스키마 직접 참조)

customers ←── aims_api (owner, R/W)
          ←── document_pipeline (R/W — owner 우회)
          ←── annual_report_api (R/W — owner 우회)
          ←── aims_rag_api (R only — 스키마 직접 참조)
          ←── aims_mcp (R/W — owner 우회)
```

---

## 한 줄 요약

> **가장 먼저 분리해야 할 곳은 `files`/`customers` 컬렉션의 직접 접근이다** — 4~5개 서비스가 스키마 계약 없이 동일 컬렉션을 직접 R/W하는 것이 모든 결합의 근본 원인이며, aims_api를 유일한 데이터 게이트웨이로 만들지 않는 한 어떤 서비스도 독립 배포/리팩터링이 불가능하다.

---

## 부록: 팩트체크 수행 결과

> 보고서 v1 대비 코드 기반 검증을 수행하여 수정한 내역

### 검증 범위

| 카테고리 | 검증 건수 | TRUE | PARTIALLY TRUE | 수정 반영 |
|----------|:---------:|:----:|:--------------:|:---------:|
| Backend HTTP 호출 | 11 | 11 | 0 | — |
| DB 직접 접근 | 6 | 4 | 2 | R/W → R only 수정 |
| Frontend 크로스 의존 | 8 | 5 | 3 | 수치/깊이 수정 |
| 누락 항목 조사 | 1 | — | — | 서비스/인프라/서비스레이어 추가 |

### 수정 사항

1. **aims_rag_api DB 접근 표기**: `files`/`customers` 모두 R/W → **R only**로 수정. 실제 코드에 write 연산 없음 (`hybrid_search.py`에서 `find`/`find_one`만 사용)
2. **DocumentRegistrationView import 수**: "5+ 모듈" → **7개 모듈** (루트 파일 기준, 하위 hooks/utils 포함 시 더 많음)
3. **ChatPanel import 깊이**: "2단계" → **3단계** (`views/` → `CustomerDetailView/` → `tabs/`)
4. **annualReportApi 외부 참조 수**: "9곳" → **8곳** (1곳은 다른 경로 `shared/api/annualReportApi` mock)
5. **누락 서비스 추가**: `virus-scan-service` (ClamAV, RPi5), `rustdesk-service` (:3015), `embedding pipeline`
6. **누락 인프라 추가**: n8n (:5678), `aims-backup-watcher` systemd timer, 야간 백업 크론
7. **Frontend 서비스 레이어 추가**: 19개 서비스 파일 목록 (특히 `DocumentStatusService` 45곳 사용 — 가장 널리 쓰이는 서비스)
8. **Zustand 스토어 분산 구조 문서화**: `src/stores/`, `src/shared/store/`, `src/shared/stores/` 3곳 분산
