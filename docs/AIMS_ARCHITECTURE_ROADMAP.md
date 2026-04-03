# AIMS Architecture Roadmap

> 최종 갱신: 2026-04-04

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
| 3 | annual_report_api DB write 전환 | 44건, API 9개, 테스트 38건 | `72d4fdcf` |
| 4 | document_pipeline DB write 전환 | 52건, API 5개, 테스트 25건 | `be22cde0` |
| 5 | Dead code 제거 + CI 아키텍처 테스트 | 739 PASS | `6269c362` |
| 6 | files/customers read 전환 | 97건, API 9개, 테스트 36건 | `14844b9a` |

**합계: 237건 전환, Internal API 40개, regression 테스트 141건**

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

---

## 3. 현재 위치

```
[완료] DB Gateway Phase 1~6     ████████████████████ 100%
[완료] Backend 위반 B1~B7       ████████████████████ 100%
[완료] Frontend 위반 F1~F7      ████████████████████ 100%
[완료] R1: 이벤트화 (16건)       ████████████████████ 100%
[완료] R2: 공유 서비스 분리       ████████████████████ 100%
[완료] R3: 문서연결 이벤트화      ████████████████████ 100%
```

**R1~R3 완료. 역방향 HTTP 의존 0건 달성.**

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

### After (R3 완료)
```
aims_api (오케스트레이터 + DB 게이트웨이)
  ↓ document_pipeline  (Internal API 경유, Redis 이벤트 발행)
  ↓ annual_report_api  (Internal API 경유, Redis 이벤트 발행)
  ↓ aims_rag_api       (Internal API 경유, aims_analytics 직접 기록)
  ↓ aims_mcp           (Internal API 경유, 단방향)
```

**단방향 의존 달성:**
- 하위 서비스 → aims_api: Internal API (읽기/쓰기)
- 하위 서비스 → Redis: 이벤트 발행 (aims_api가 구독)
- 하위 서비스 → aims_analytics: 로그/사용량 직접 기록
- aims_api → 하위 서비스: **역방향 호출 0건**

---

## 5. 완료된 인프라 개선

### 모듈별 독립 빌드/테스트 파이프라인 (2026-04-04)

`.husky/pre-commit`을 모듈별 선택 실행 방식으로 전환. | 머지 `02541f61`
- 변경된 모듈만 테스트 (git diff --cached 기반)
- 단일 모듈 변경 시 최대 91% 시간 단축 (45초 → 4~22초)
- shared-schema 변경 시 전체 실행 (의존 모듈 전체 영향)

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

---

## 참조

- [CLAUDE.md](../CLAUDE.md) — 프로젝트 규칙 + 변경 이력
- [NETWORK_SECURITY_ARCHITECTURE.md](NETWORK_SECURITY_ARCHITECTURE.md) — 네트워크 보안
- [2026-04-03_AIMS_ARCHITECTURE_ANALYSIS.md](2026-04-03_AIMS_ARCHITECTURE_ANALYSIS.md) — 아키텍처 분석 원본
