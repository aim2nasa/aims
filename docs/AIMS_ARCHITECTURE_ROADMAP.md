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

## 5. 다음 과제

### 크레딧 서비스 물리적 분리 (aims_credit)

creditService.js + credit-routes.js를 독립 마이크로서비스로 추출.
- 자체 DB 연결 (files, ai_token_usage, users)
- storageQuotaService 인라인화
- document_pipeline, aims_rag_api가 aims_credit에 직접 호출

### 모듈별 독립 빌드/테스트 파이프라인

각 서비스가 aims_api 없이 독립적으로 빌드/테스트 가능한 CI 구성.
- Internal API mock 서버 (테스트 시)
- 서비스별 Dockerfile 최적화
- 배포 순서 무관한 rolling update

---

## 참조

- [CLAUDE.md](../CLAUDE.md) — 프로젝트 규칙 + 변경 이력
- [NETWORK_SECURITY_ARCHITECTURE.md](NETWORK_SECURITY_ARCHITECTURE.md) — 네트워크 보안
- [2026-04-03_AIMS_ARCHITECTURE_ANALYSIS.md](2026-04-03_AIMS_ARCHITECTURE_ANALYSIS.md) — 아키텍처 분석 원본
