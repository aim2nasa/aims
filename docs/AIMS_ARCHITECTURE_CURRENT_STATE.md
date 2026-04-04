# AIMS Architecture — Current State

> 최종 갱신: 2026-04-05
> 아키텍처 개선 R1~R6 완료 후 현재 운영 구조

---

## 1. 서비스 목록

| 서비스 | 포트 | 스택 | 실행 | 역할 |
|--------|:----:|------|:----:|------|
| **aims_api** | 3010 | Express 5 (Node) | Docker | DB 게이트웨이 + 오케스트레이터. 인증, 라우팅, Internal API, eventBus |
| **document_pipeline** | 8100 | FastAPI (Python) | PM2 | 문서 업로드/전처리/분류/OCR 큐잉. Redis 이벤트 발행 |
| **annual_report_api** | 8004 | FastAPI (Python) | PM2 | AR/CRS PDF 파싱 (pdfplumber). Internal API 경유 DB 접근 |
| **aims_rag_api** | 8000 | FastAPI (Python) | Docker | RAG 검색 (Qdrant + OpenAI). Internal API 경유 DB 접근 |
| **aims_mcp** | — | TypeScript (Node) | PM2 | AI 채팅 MCP 서버 (도구 15개). Internal API 경유 DB 접근 |
| **aims_health_monitor** | 3012 | TypeScript (Node) | PM2 | 서비스 헬스체크 (60초 간격), Slack 알림 |
| **pdf_proxy** | 8002 | FastAPI (Python) | PM2 | S3/로컬 파일 → PDF 변환/다운로드 프록시 |
| **pdf_converter** | 8005 | Node (LibreOffice) | Docker | DOCX/XLSX/HWP → PDF 변환 |

### 공유 패키지

| 패키지 | 경로 | 역할 |
|--------|------|------|
| `@aims/shared-schema` | `backend/shared/schema/` | 컬렉션명 상수, Internal API 타입, Redis 이벤트 스키마 |

### 크론/배치

| 스크립트 | 주기 | 역할 |
|---------|------|------|
| `embedding/full_pipeline.py` | 매 1분 | embed_pending 문서 → OpenAI 임베딩 → Qdrant 저장 |
| `annual_report_api` 자가 복구 | 30초 | ar_parsing_status=pending 문서 자동 파싱 |

---

## 2. 서비스 간 의존성

### 의존 방향도

```
프론트엔드 (React)
    ↓ HTTP (JWT 인증)
aims_api (오케스트레이터 + DB 게이트웨이)
    ↓ Internal API (x-api-key)          ↓ Redis Pub/Sub (구독)
    ├── document_pipeline ──────────────→ Redis (이벤트 발행)
    ├── annual_report_api ──────────────→ Redis (이벤트 발행)
    ├── aims_rag_api
    ├── aims_mcp
    └── pdf_proxy / pdf_converter
```

### 호출 방식 매트릭스

| 호출자 → 대상 | 방식 | 용도 |
|:-------------|:----:|------|
| 프론트엔드 → aims_api | HTTP (JWT) | 모든 사용자 요청 |
| document_pipeline → aims_api | Internal API (x-api-key) | 파일/고객 DB 읽기·쓰기 |
| annual_report_api → aims_api | Internal API (x-api-key) | 고객/파일 DB 읽기·쓰기, AI 설정 조회 |
| aims_rag_api → aims_api | Internal API (x-api-key) | 크레딧 체크, AI 설정 조회 |
| aims_mcp → aims_api | Internal API (x-api-key) | 고객/문서/계약 조회 |
| document_pipeline → Redis | PUBLISH | 진행률, 완료, AR/CR 상태 이벤트 |
| annual_report_api → Redis | PUBLISH | AR/CR 파싱 상태 변경 이벤트 |
| aims_api → Redis | SUBSCRIBE | 이벤트 수신 → SSE 브로드캐스트, DB 업데이트 |
| document_pipeline → aims_analytics | 직접 DB 기록 | 로그, 사용량 기록 |
| annual_report_api → aims_analytics | 직접 DB 기록 | 에러 로그 기록 |
| aims_rag_api → aims_analytics | 직접 DB 기록 | 검색 로그, 토큰 사용량 |
| aims_api → MongoDB (docupload) | 직접 DB 접근 | **유일한 DB 게이트웨이** |

### 역방향 의존: 0건

aims_api가 하위 서비스를 직접 호출하는 경로는 **없음**.
하위 서비스의 결과 보고는 모두 Redis Pub/Sub 이벤트로 처리.

---

## 3. 데이터 흐름

### 3-1. 문서 업로드 흐름

```
프론트엔드 (파일 선택)
    ↓ POST /api/documents/upload (JWT)
aims_api
    ↓ 파일 저장 + DB 레코드 생성
    ↓ POST /webhook/docprep-main (Internal)
document_pipeline
    ├─ 시스템 파일 차단
    ├─ pdfplumber 텍스트 추출 (무료)
    ├─ AR/CRS 감지 (키워드 매칭, 파일명 사용 금지)
    ├─ 텍스트 있음 → 요약/분류 (gpt-4o-mini) → embed_pending
    ├─ 텍스트 없음 → 크레딧 체크 → Redis Stream OCR큐
    │       ↓
    │   OCR Worker (Upstage API) → 요약/분류 → embed_pending
    └─ Redis PUBLISH aims:doc:progress / aims:doc:complete
            ↓
    aims_api eventBus (구독) → SSE 브로드캐스트 → 프론트엔드 실시간 갱신
            ↓
    임베딩 크론 (매 1분) → OpenAI text-embedding-3-small → Qdrant 저장 → completed
```

### 3-2. AR/CRS 파싱 흐름

```
document_pipeline (문서 전처리 중)
    ├─ PDF 텍스트에서 "Annual Review Report" 등 키워드 감지
    ├─ is_annual_report=true, ar_parsing_status=pending 설정
    └─ Internal API로 DB 업데이트

annual_report_api (30초 자가 복구)
    ├─ Internal API로 pending 문서 조회
    ├─ pdfplumber 테이블 추출 (AI 불필요)
    ├─ 계약 데이터 파싱 → Internal API로 고객에 저장
    ├─ ar_parsing_status=completed
    └─ Redis PUBLISH aims:ar:status
            ↓
    aims_api eventBus → SSE → 프론트엔드 AR 탭 갱신
```

### 3-3. RAG 검색 흐름

```
프론트엔드 (AI 채팅 질문)
    ↓ POST /api/chat (JWT)
aims_api
    ↓ aims_rag_api 호출 (HTTP)
aims_rag_api
    ├─ 크레딧 체크 (Internal API /internal/check-credit)
    ├─ AI 모델 설정 조회 (Internal API /internal/settings/ai-models)
    ├─ 쿼리 분석 (QueryAnalyzer)
    ├─ Qdrant 시맨틱 검색 (text-embedding-3-small)
    ├─ 하이브리드 검색 (시맨틱 + 키워드)
    ├─ Cross-Encoder 재순위화
    ├─ OpenAI GPT 답변 생성
    └─ aims_analytics에 검색 로그 기록
```

---

## 4. 인프라

### 데이터 저장소

| 시스템 | 역할 | 접근 방식 |
|--------|------|----------|
| **MongoDB (docupload)** | 핵심 데이터 — 사용자, 고객, 계약, 파일, 메모, 관계, 설정 | aims_api만 직접 접근 (DB 게이트웨이) |
| **MongoDB (aims_analytics)** | 분석 데이터 — API 로그, 에러, 토큰 사용량, 검색 로그, OCR 사용량 | aims_api + 하위 서비스 직접 기록 (30일 TTL) |
| **Redis** | 이벤트 버스 (Pub/Sub 6채널) + OCR 스트림 큐 | 모든 서비스 접근 |
| **Qdrant** | 벡터 DB — 문서 청크 임베딩 (컬렉션: `docembed`, 1536차원) | aims_rag_api (검색) + 임베딩 크론 (저장) + aims_api (customer_id 동기화) |

### Redis 이벤트 채널 (6개)

| 채널 | 발행자 | 구독자 | 페이로드 |
|------|--------|--------|---------|
| `aims:doc:progress` | document_pipeline | aims_api | document_id, progress, stage, owner_id |
| `aims:doc:complete` | document_pipeline | aims_api | document_id, status, owner_id |
| `aims:ar:status` | annual_report_api, document_pipeline | aims_api | customer_id, file_id, status |
| `aims:cr:status` | annual_report_api, document_pipeline | aims_api | customer_id, file_id, status |
| `aims:doc:list` | document_pipeline | aims_api | user_id, change_type, document_id |
| `aims:doc:link` | document_pipeline | aims_api | document_id, customer_id, user_id |

### MongoDB 컬렉션 (docupload, 13개)

| 컬렉션 | 용도 |
|--------|------|
| `users` | 사용자 (OAuth, 역할, 스토리지 티어) |
| `customers` | 고객 (개인정보, 보험정보, 문서 연결) |
| `contracts` | 보험 계약 |
| `files` | 문서 (업로드, 메타, OCR, 임베딩 상태) |
| `customer_relationships` | 고객 간 관계 (가족, 법인 등) |
| `customer_memos` | 고객별 메모 |
| `insurance_products` | 보험 상품 참조 데이터 |
| `insurers` | 보험사 참조 데이터 |
| `ar_parse_queue` | AR 파싱 큐 |
| `system_settings` | AI 모델/파일검증 설정 |
| `config` | AutoClicker 버전 등 시스템 설정 |
| `upload_queue` | 문서 업로드 큐 |
| `personal_files` | 개인 파일 저장소 |

---

## 5. 프론트엔드 모듈 구조

### 스택

React 19 + TypeScript + Vite + TanStack Query + Zustand

### 디렉토리 경계

```
src/
├── app/            — queryClient, router (진입점)
├── pages/          — 라우트 페이지 (thin wrapper, lazy loading)
├── features/       — 기능 모듈 (도메인별 캡슐화)
│   ├── customer/       — 고객 CRUD, AR/CRS, 주소, 문서 다운로드
│   ├── annual-report/  — AR 관련 모달
│   ├── batch-upload/   — 일괄 업로드 (중복/용량 검증)
│   ├── help/           — 공지, 가이드, FAQ
│   └── AccountSettings/ — 계정 설정
├── shared/         — 공유 모듈 (모든 계층에서 접근 가능)
│   ├── ui/             — Button, Modal, Tooltip, Toast, SFSymbol 등
│   ├── lib/            — api.ts, timeUtils.ts, errorReporter
│   ├── store/          — Zustand 스토어 (layout, devMode 등)
│   ├── hooks/          — 공용 훅 (useCustomerSSE, useModal 등)
│   └── design/         — CSS 변수, 토큰, 테마
├── entities/       — 도메인 엔티티 + Zod 스키마
├── services/       — 비즈니스 로직 + API 호출
├── components/     — 레거시 뷰 (features/로 마이그레이션 중)
└── contexts/       — React Context (AppleConfirm, DocumentSearch)
```

### 경계 규칙

| 규칙 | 강제 방식 |
|------|----------|
| `components/` → `features/` 내부 경로 import 금지 | ESLint `no-restricted-imports` 자동 차단 |
| `features/` 외부 접근은 barrel export만 | 각 feature의 `index.ts`가 Public API 정의 |
| `shared/` → `features/` 의존 금지 | 코드 리뷰 (lint 미적용) |
| CSS 색상: hex 금지 → `var(--color-*)` 전용 | 코드 리뷰 |
| 데이터 변경 후 `window.location.reload()` | Optimistic Update 금지 규칙 |

---

## 6. 아키텍처 원칙

### 단방향 의존

```
프론트엔드 → aims_api → 하위 서비스
                ↑ Redis 이벤트 (하위 → aims_api)
```

- 하위 서비스는 aims_api URL만 알면 됨 (Internal API)
- aims_api는 하위 서비스 URL을 **모름** (역방향 호출 0건)
- 하위 서비스의 결과 보고는 Redis Pub/Sub으로 비동기 처리

### DB 게이트웨이

- MongoDB(docupload) 직접 접근은 **aims_api만** 허용
- 하위 서비스는 41개 Internal API 엔드포인트를 통해 DB 조회·수정
- 예외: `document_pipeline/main.py` health check (READ-ONLY, 1건, 허용)
- aims_analytics DB는 하위 서비스에서 직접 기록 허용 (로그/사용량)

### 이벤트 기반 통신

- 문서 처리 진행률, 완료, AR/CR 상태 변경 → Redis Pub/Sub
- aims_api의 eventBus가 구독 → SSE 브로드캐스트 → 프론트엔드 실시간 갱신
- 문서-고객 연결도 Redis 이벤트 (`aims:doc:link`)로 처리

### ICreditPolicy (정책 패턴)

- 과금 로직을 인터페이스로 격리 (15개 메서드)
- `DefaultCreditPolicy`: 유료 모델 (크레딧 체크·소비·보너스)
- `NoCreditPolicy`: 무료 모델 (모든 체크 허용)
- 환경변수 `CREDIT_POLICY=default|free`로 전환

### Internal API 인증

- 모든 Internal API: `x-api-key` 헤더 검증
- 키: `.env.shared`의 `INTERNAL_API_KEY` (SSoT)
- 공개 API와 완전 분리된 `/api/internal/*` 경로

### 공유 스키마 (@aims/shared-schema)

- 컬렉션명 상수 (하드코딩 금지)
- Internal API 응답 타입 + 필수 필드 정의
- Redis 이벤트 채널명 + 페이로드 타입
- 계약 테스트 32건으로 정합성 자동 검증

---

## 참조

- [AIMS_ARCHITECTURE_ROADMAP.md](AIMS_ARCHITECTURE_ROADMAP.md) — 개선 이력 (Phase 0 ~ R6)
- [NETWORK_SECURITY_ARCHITECTURE.md](NETWORK_SECURITY_ARCHITECTURE.md) — 네트워크 보안
- [CLAUDE.md](../CLAUDE.md) — 프로젝트 규칙
