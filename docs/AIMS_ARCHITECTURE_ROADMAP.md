# AIMS Architecture Roadmap

> 최종 갱신: 2026-04-05

---

## 1. 핵심 목적

**각 모듈이 독립적으로 빌드/테스트/배포/진화 가능한 구조.**

현재 AIMS는 aims_api를 중심으로 모든 서비스가 양방향 HTTP 호출로 결합되어 있다.
어디 하나 바꾸면 전체 빌드 + 전체 테스트가 강제되고, 배포 순서에 의존성이 생긴다.

목표 구조:
- 모듈 간 소통은 **정의된 인터페이스(API 계약, 이벤트 스키마)**로만
- 의존 방향은 **단방향** (하위 → 상위 호출 금지, 이벤트로 대체)
- AIMS는 모듈들의 유기체 — 각 장기가 독립적으로 기능하되 전체가 하나로 동작

---

## 2. 완료된 작업

### Phase 0: DB Gateway 전환 (2026-04-03)

Python 서비스들의 MongoDB 직접 접근을 aims_api Internal API 경유로 전환.
aims_api가 DB 스키마의 단일 게이트웨이가 되었다.

| Phase | 내용 | 규모 | 커밋 |
|:-----:|------|------|------|
| 1 | aims_rag_api read-only 전환 | 33건, API 9개, 테스트 42건 | `bf6de606` |
| 2 | aims_mcp DB write 전환 | 11건, Write API 8개, 테스트 56건 | `7a4b3473` |
| 3 | annual_report_api DB write 전환 | 44건, API 9개, 테스트 38건 | `72d4fdcf` |
| 4 | document_pipeline DB write 전환 | 52건, API 5개, 테스트 25건 | `be22cde0` |
| 5 | Dead code 제거 + CI 아키텍처 테스트 | 739 PASS | `6269c362` |
| 6 | files/customers read 전환 | 97건, API 9개, 테스트 36건 | `14844b9a` |

**합계: 248건 전환, Internal API 48개, regression 테스트 197건**

### Phase 1: Backend 위반 수정 (2026-04-03~04)

| 항목 | 내용 | 커밋 |
|:----:|------|------|
| B4 | personal-files-routes 루프백 제거 | `22169882` |
| B7 | PYTHON_API_URL 미정의 수정 | `22169882` |
| B5 | Python 서비스 컬렉션명 하드코딩 상수화 (16곳) | `245daaaa` |
| B6 | ar_parse_queue 스키마 계약 추가 (@aims/shared-schema) | `245daaaa` |

### Phase 2: Frontend 위반 수정 (2026-04-04)

| 항목 | 내용 | 커밋 |
|:----:|------|------|
| F1 | DocumentRegistrationView 3개 feature 내부 직접 import → barrel export | `96499f38` |
| F2 | shared/ → features/ 역방향 의존 제거 (fileHash, formatFileSize) | `96499f38` |
| F3 | ChatPanel → customer feature 내부 직접 import 제거 | `96499f38` |
| F4 | features/ ↔ components/ 양방향 의존 32건 해소 (SFSymbol, AppleConfirmModal 등 shared/ui 이전) | `96499f38` |
| F5 | services/ → Zustand 스토어 직접 접근 제거 (콜백 패턴 전환) | `96499f38` |
| F6 | entities/ api.ts 빈 껍데기 4개 삭제 | `96499f38` |
| F7 | controller 위치 규칙 명문화 (CLAUDE.md) | `96499f38` |

### R1: 결과 보고 이벤트화 (2026-04-04)

**목표 달성: 하위 서비스가 aims_api URL을 몰라도 결과를 보고할 수 있는 구조.**

16건의 HTTP 콜백을 Redis Pub/Sub + aims_analytics 직접 기록으로 전환.

| 서비스 | 전환 내용 | 건수 |
|--------|-----------|:----:|
| document_pipeline | webhook/SSE → Redis Pub/Sub (progress, complete, ar/cr-status, conversion) | 8 |
| document_pipeline | 로그/사용량 → aims_analytics 직접 기록 | 2 |
| annual_report_api | webhook/SSE → Redis Pub/Sub (ar/cr-status-change) | 2 |
| aims_rag_api | 로그/사용량 → aims_analytics 직접 기록 | 4 |

**합계: 11건 역방향 의존 제거** | 머지 `9a8a97f8`

### R2: 공유 서비스 분리 (2026-04-04)

**목표 달성: aims_api의 공개 API 의존을 Internal API/크레딧 서비스로 정리.**

| 항목 | 전환 내용 | 건수 |
|------|-----------|:----:|
| 고객검색 | 공개 API `GET /api/customers` → Internal API `POST /internal/customers/resolve-by-name` | 3건 |
| 크레딧 라우트 | chat-routes.js → credit-routes.js 분리 (물리적 서비스 분리 대비) | 2 엔드포인트 |
| 환경변수 | INTERNAL_API_KEY 누락 수정 (document_pipeline, aims_mcp) | 2건 |

**regression 테스트: mock 15곳 전환 + 단위 테스트 4건 추가** | 머지 `e751d71e`

### R3: 문서연결 이벤트화 (2026-04-04)

**목표 달성: 역방향 HTTP 의존 0건. 완전 단방향 의존.**

| 항목 | 전환 내용 |
|------|-----------|
| 문서연결 | `POST /api/customers/{id}/documents` HTTP → Redis PUBLISH `aims:doc:link` |
| eventBus | DOC_LINK 채널 구독 + handleDocumentLink 10단계 오케스트레이션 |
| Qdrant | eventBus.initialize에 qdrantClient 주입, 청크 customer_id 동기화 |
| PDF 변환 | triggerPdfConversionIfNeeded 트리거 포함 |

**regression 테스트: 8건 추가 (소유권, 중복, AR큐, PDF, SSE)** | 머지 `d04c44e7`

### R4: aims_api 라우트 모듈 정리 (2026-04-04)

**목표 달성: customers-routes.js 4,842행을 도메인별 6개 파일로 분리.**

| 분리 파일 | 도메인 | 라우트 | 행 수 |
|-----------|--------|:------:|:-----:|
| customers-routes.js | Customer CRUD & 통계 | 12 | 1,710 |
| annual-report-routes.js | AR/CRS 프록시 & SSE | 16 | 1,116 |
| customer-documents-routes.js | 문서 연결/관리 | 8 | 872 |
| notification-routes.js | Webhook/SSE 알림 | 9 | 606 |
| customer-memos-routes.js | 메모 CRUD | 4 | 309 |
| address-history-routes.js | 주소 이력 | 3 | 222 |

공유 모듈 추출:
- `services/qdrant-sync.js` — Qdrant 청크 customer_id 동기화
- `utils/address-helper.js` — 카카오 주소 검증 + 정규화
- `config/sse-channels.js` — SSE 채널 별칭 싱글턴

**실동작 테스트 18/18 PASS** | 커밋 `8c63d221`

### R5: 아키텍처 재검증 잔존 이슈 수정 (2026-04-04)

R1~R4 완료 후 전체 코드 재검증에서 발견된 잔존 역방향 의존 + DB 직접 접근 수정.

| 서비스 | 이전 (위반) | 이후 (전환) |
|--------|-------------|-------------|
| annual_report_api | `system_logger.py` → POST `/api/system-logs` | aims_analytics DB 직접 기록 (errorLogger.js 스키마 통일) |
| document_pipeline | `doc_prep_main.py` → POST `/api/webhooks/ar-status-change`, `cr-status-change` | Redis Pub/Sub (`aims:ar:status`, `aims:cr:status`) |
| document_pipeline | `ocr_worker.py` → POST `/api/webhooks/document-processing-complete` | Redis Pub/Sub (`aims:doc:complete`) |
| annual_report_api | `auto_parse_annual_reports.py` → `db["files"]` 직접 접근 | `internal_api.query_files()` 전환 |

**regression 테스트 13건 추가** (스키마 검증 6 + Redis 채널 4 + Internal API 전환 3) | 커밋 `3d8ac41a`

### R6: Settings API 전환 + Frontend 경계 강화 (2026-04-04~05)

**목표 달성: settings 공개 API 의존 0건 + Frontend 아키텍처 경계 자동 강제.**

| 항목 | 내용 | 커밋 |
|:----:|------|------|
| Settings Internal API | `GET /api/settings/ai-models` 공개 API → `GET /api/internal/settings/ai-models` (x-api-key 인증) 전환. 5곳 전환, regression 테스트 6건, 실동작 7/7 PASS | `a07f2266` |
| Frontend 역방향 의존 해소 | `components/` → `features/` 깊은 경로 직접 import 9건 → barrel export 경유 전환. `features/help/index.ts` 신규. Playwright E2E 7/7 PASS | `b437abe2` |
| Gini Minor 수정 | barrel alias 2단계→1단계 단순화. ESLint `no-restricted-imports` 규칙 추가 — `components/`에서 `features/` 내부 경로 import 자동 차단 | `2c6009ab` |

### R7: 서비스 URL 환경변수화 + 자기 호출 제거 (2026-04-05)

**목표 달성: aims_api → 하위 서비스 하드코딩 URL 0건. 진화 독립성 4/7 → 6/7 개선.**

| 항목 | 내용 | 건수 |
|------|------|:----:|
| URL 환경변수화 | 하드코딩 `localhost:PORT` 21건 → `process.env.XXX \|\| fallback` 패턴 전환 | 21건 |
| 자기 호출 제거 | `personal-files-routes.js`의 HTTP 자기 호출 → `documentDeleteService` 내부 함수 직접 호출 | 1건 |
| documentDeleteService 추출 | `documents-routes.js`에서 문서 삭제 공통 로직(DB+파일+고객참조+AR큐+Qdrant) 70행 분리 | 신규 |
| deploy 환경변수 전달 | `deploy_aims_api.sh`에 Docker `-e` 옵션으로 7개 환경변수 전달 추가 | 7개 |
| 환경변수 네이밍 표준 | `{SERVICE_NAME}_URL` 패턴 통일 — 8개 서비스 URL 표준화 | 8개 |

**환경변수 표준:**

| 환경변수 | 기본값 | 대상 서비스 |
|---------|--------|-----------|
| `ANNUAL_REPORT_API_URL` | `http://localhost:8004` | annual_report_api |
| `DOCUMENT_PIPELINE_URL` | `http://localhost:8100` | document_pipeline |
| `AIMS_RAG_API_URL` | `http://localhost:8000` | aims_rag_api |
| `PDF_PROXY_URL` | `http://localhost:8002` | pdf_proxy |
| `PDF_CONVERTER_URL` | `http://localhost:8005` | pdf_converter |
| `N8N_URL` | `http://localhost:5678` | n8n |
| `AIMS_MCP_URL` | `http://localhost:3011` | aims_mcp |

**regression 테스트: 기존 12건 갱신 + 신규 30건 (실동작 MongoDB 검증 포함)** | 커밋 `612378a5`

### R8: aims_mcp 아키텍처 위반 수정 (2026-04-05)

**목표 달성: aims_mcp 잔존 위반 4건 해소. 전 서비스 아키텍처 위반 0건.**

| # | 위반 | 수정 |
|:-:|------|------|
| 1 | `systemLogger.ts` — 공개 API 하드코딩 호출 (`/api/system-logs`) | aims_analytics DB 직접 기록 (30일 TTL, R1 패턴 동일) |
| 2 | `documents.ts` — `http://localhost:8000` 하드코딩 | `AIMS_RAG_API_URL` 환경변수 전환 |
| 3 | `products.ts` — `db.collection()` DB 직접 접근 2건 | `GET /internal/products/search` Internal API 신규 (insurers JOIN 포함) |
| 4 | `address.ts` — 공개 API 호출 (인증 없음) | `x-api-key` 헤더 추가 (Internal API 인증 패턴 일관성) |

**regression 테스트: aims_mcp vitest 818 PASS + aims_api Jest 1,441 PASS + 실동작 17건** | 커밋 `5a929198`

---

## 3. 현재 위치

```
[완료] DB Gateway Phase 1~6     ████████████████████ 100%
[완료] Backend 위반 B1~B7       ████████████████████ 100%
[완료] Frontend 위반 F1~F7      ████████████████████ 100%
[완료] R1: 이벤트화 (16건)       ████████████████████ 100%
[완료] R2: 공유 서비스 분리       ████████████████████ 100%
[완료] R3: 문서연결 이벤트화      ████████████████████ 100%
[완료] R4: 라우트 모듈 정리       ████████████████████ 100%
[완료] R5: 재검증 잔존 수정       ████████████████████ 100%
[완료] R6: Settings + Frontend   ████████████████████ 100%
[완료] R7: URL 환경변수화         ████████████████████ 100%
[완료] R8: aims_mcp 위반 수정     ████████████████████ 100%
```

**R1~R8 완료. 전 서비스 아키텍처 위반 0건 달성.**

### 재검증 현황 (R8 이후, 2026-04-05)

| 영역 | 상태 | 잔존 | 비고 |
|------|:----:|:----:|------|
| 역방향 HTTP (webhook/로그) | **0건** | — | R5에서 완전 제거 |
| 역방향 HTTP (settings API) | **0건** | — | R6에서 Internal API 전환 완료 |
| 역방향 HTTP (aims_mcp 공개 API) | **0건** | — | R8에서 aims_analytics 직접 기록 + x-api-key 추가 |
| 하드코딩 URL (aims_api) | **0건** | — | R7에서 환경변수 전환 완료 |
| 하드코딩 URL (aims_mcp) | **0건** | — | R8에서 환경변수 전환 완료 |
| DB 직접 접근 (aims_mcp) | **0건** | — | R8에서 products Internal API 전환 |
| DB 직접 접근 (운영, 허용) | 1건 | `document_pipeline/main.py` health check | READ-ONLY, 허용 |
| Frontend shared/ 격리 | **0건** | — | 완전 해소 |
| Frontend components/ → features/ | **0건** | — | R6에서 barrel export 전환 + ESLint 자동 강제 |

---

## 4. 의존 구조 변화

### Before (DB Gateway 전)
```
aims_api ←──→ document_pipeline  (양방향 + DB 직접 접근)
    ↑↓              ↑↓
annual_report_api ←→ MongoDB     (각자 직접 접근)
    ↑↓
aims_rag_api ←────→ MongoDB      (직접 접근)
```

### After (R7 완료)
```
aims_api (오케스트레이터 + DB 게이트웨이)
  ↓ document_pipeline  (Internal API 경유, Redis 이벤트 발행)
  ↓ annual_report_api  (Internal API 경유, aims_analytics 직접 기록)
  ↓ aims_rag_api       (Internal API 경유, aims_analytics 직접 기록)
  ↓ aims_mcp           (Internal API 경유, 단방향)
  → 하위 서비스 URL: 환경변수({SERVICE_NAME}_URL)로 주입
```

**단방향 의존 + 환경변수 주입 달성:**
- 하위 서비스 → aims_api: Internal API (읽기/쓰기)
- 하위 서비스 → Redis: 이벤트 발행 (aims_api가 구독)
- 하위 서비스 → aims_analytics: 로그/사용량 직접 기록
- aims_api → 하위 서비스: 환경변수 URL로 호출 (하드코딩 0건)
- 자기 호출: **0건** (documentDeleteService로 내부 함수화)

---

## 5. 완료된 인프라 개선

### 모듈별 독립 빌드/테스트 파이프라인 (2026-04-04)

`.husky/pre-commit`을 모듈별 선택 실행 방식으로 전환. | 머지 `02541f61`
- 변경된 모듈만 테스트 (git diff --cached 기반)
- 단일 모듈 변경 시 최대 91% 시간 단축 (45초 → 4~22초)
- shared-schema 변경 시 전체 실행 (의존 모듈 전체 영향)
- aims_rag_api Docker 기반 테스트 파이프라인 추가 (모듈별 6/6 완성) | 커밋 `c4165171`

### ICreditPolicy 인터페이스 기반 설계 (2026-04-04)

크레딧 정책을 인터페이스로 격리하여 구현체를 교체 가능한 플러그인 구조로 전환. | 머지 `954b347a`

| 구현체 | 환경변수 | 동작 |
|--------|---------|------|
| DefaultCreditPolicy | `CREDIT_POLICY=default` (기본) | 기존 creditService.js 로직 (유료 모델) |
| NoCreditPolicy | `CREDIT_POLICY=free` | 모든 체크 허용, 관리 no-op (무료 모델) |

- ICreditPolicy 인터페이스: Core(체크 3) / Query(조회 8) / Admin(관리 4) = 15개 메서드
- 5개 라우트에서 creditService 직접 참조 완전 제거 → creditPolicy 인터페이스 경유
- db/analyticsDb를 생성자 주입으로 전환 (호출부에서 매번 전달하지 않음)
- regression 테스트 22건 (팩토리 분기, NoCreditPolicy 전 메서드, DefaultCreditPolicy 위임)

### Internal API 계약 테스트 + Redis 이벤트 스키마 (2026-04-04)

`@aims/shared-schema`를 확장하여 서비스 간 API/이벤트 계약을 공식화. | 머지 `f3c050dd`
- Internal API 응답 타입 11개 + `INTERNAL_API_REQUIRED_FIELDS` (엔드포인트별 필수 필드)
- Redis 이벤트 채널 6개 + 페이로드 타입 6개 + `EVENT_REQUIRED_FIELDS`
- 계약 테스트 32건 (스키마 정의 검증 + eventBus CHANNELS 일치 검증)
- Python 서비스 응답 검증: `_validate_response` 헬퍼 (fail-open, 경고만)

---

## 6. 보류 과제

### 크레딧 서비스 물리적 분리 (aims_credit) — 보류

**보류 결정 (2026-04-04):**

R2에서 credit-routes.js로 논리적 분리를 완료했으나, 물리적 분리(독립 마이크로서비스)는 보류한다.

**보류 이유:**
- `storageQuotaService` 의존 해소 비용이 높음 — creditService가 `getUserStorageInfo`, `getTierDefinitions`에 4곳에서 의존하며, storageQuotaService는 aims_api 전반 15곳에서 사용 중. 크레딧 전용 부분만 추출하려면 storageQuotaService 자체를 공유 라이브러리로 리팩토링해야 함
- 논리적 분리(credit-routes.js)로 현재 충분히 관리 가능 — 코드 경계가 명확하고, 독립 배포 시 그대로 추출 가능한 구조
- aims_api 부하가 분리를 요구하는 수준이 아님 — 현재 사용자 규모에서 크레딧 체크는 부하의 극히 일부

**물리적 분리 조건 (재검토 트리거):**
- aims_api 응답 시간이 P95 > 500ms로 악화될 때
- 사용자 수가 100명 이상으로 증가하여 크레딧 체크 트래픽이 유의미해질 때
- 크레딧 로직의 독립 배포 주기가 aims_api와 크게 달라질 때

### Observability 강화 (Redis 이벤트 흐름 모니터링) — 보류

R1/R3에서 webhook → Redis Pub/Sub 전환 완료. 현재 이벤트 발행/구독은 console.log 수준 로깅만 존재.

**현재 상태:**
- Redis 이벤트 채널 6개 (`aims:doc:*`, `aims:ar:*` 등) 운영 중
- 이벤트 유실, 처리 지연, 구독자 장애 시 감지 수단 없음
- eventBus 에러는 catch 후 console.error만 출력

**필요 시점 (재검토 트리거):**
- Redis 이벤트 기반 처리에서 원인 불명의 장애 발생 시
- 문서 처리 파이프라인에서 "걸린" 상태가 반복될 때
- 사용자 수 증가로 이벤트 볼륨이 모니터링 없이 관리 불가해질 때

### aims_api 순수 오케스트레이터화 — 장기 과제

현재 aims_api는 DB 게이트웨이 + 오케스트레이터 + 비즈니스 로직을 모두 담당. 장기적으로 비즈니스 로직을 도메인 서비스로 분리하여 aims_api를 라우팅/인증/오케스트레이션 전용으로 경량화.

**현재 상태:**
- R4 라우트 모듈 정리로 도메인별 파일 분리 완료 (논리적 경계 확보)
- 각 라우트 파일이 DB 직접 접근 + 비즈니스 로직을 포함하는 구조
- 물리적 서비스 분리 전 단계로, 현재 구조에서 충분히 관리 가능

**필요 시점 (재검토 트리거):**
- aims_api 단일 프로세스의 메모리/CPU가 한계에 도달할 때
- 특정 도메인(AR/CRS, 문서 관리 등)의 배포 주기가 독립적으로 필요해질 때
- 팀 규모 확대로 도메인별 독립 개발/배포가 필수가 될 때

---

## 7. 코드 품질 개선 항목

R4 라우트 모듈 정리(2026-04-04) Gini 검수에서 발견된 Minor 이슈 4건 → **전부 해결 완료** (커밋 `3bb88428`).

| # | 이슈 | 수정 내용 |
|:-:|------|-----------|
| 1 | `address-history-routes.js` 인증 누락 | `authenticateJWT` 미들웨어 추가 |
| 2 | `address-helper.js` API Key 하드코딩 | 폴백 제거, 환경변수 전용 + `.env.shared`에 키 추가 |
| 3 | `annual-report-routes.js` FormData import 누락 | `require('form-data')` 명시적 추가 |
| 4 | `notification-routes.js` webhook 인증 없음 | `authenticateJWT` + 프론트엔드 `getAuthToken()` 토큰 전달 |

---

## 참조

- [CLAUDE.md](../CLAUDE.md) — 프로젝트 규칙 + 변경 이력
- [NETWORK_SECURITY_ARCHITECTURE.md](NETWORK_SECURITY_ARCHITECTURE.md) — 네트워크 보안
- [2026-04-03_AIMS_ARCHITECTURE_ANALYSIS.md](2026-04-03_AIMS_ARCHITECTURE_ANALYSIS.md) — 아키텍처 분석 원본
