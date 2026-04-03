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

---

## 3. 로드맵

### R1 (단기): 결과 보고 이벤트화

**목표: 하위 서비스가 aims_api URL을 몰라도 결과를 보고할 수 있는 구조.**

현재 16건의 HTTP 콜백이 aims_api URL에 직접 의존:

| 서비스 | 콜백 유형 | 건수 |
|--------|-----------|:----:|
| document_pipeline | webhook/SSE 알림 (progress, complete, ar/cr-status, conversion) | 8 |
| document_pipeline | 로그/사용량 기록 (ocr-log, error-logs) | 2 |
| annual_report_api | webhook/SSE 알림 (ar/cr-status-change) | 2 |
| aims_rag_api | 로그/사용량 기록 (system-logs, ai-usage/log) | 4 |

**전환 방향:**
- SSE 알림 → Redis Pub/Sub 또는 MongoDB Change Stream
- 로그/사용량 → 각 서비스가 aims_analytics DB에 직접 기록 (aims_api 경유 불필요)

**효과:**
- document_pipeline, annual_report_api, aims_rag_api에서 `AIMS_API_URL` 환경변수 의존 감소
- aims_api 장애 시에도 알림/로그가 유실되지 않음 (현재는 HTTP 실패 시 유실)

### R2 (중기): 공유 서비스 분리

**목표: aims_api의 "만능" 책임을 분리하여 각 서비스가 필요한 것만 직접 접근.**

| 분리 대상 | 현재 | 전환 후 | 영향 범위 |
|-----------|------|---------|:---------:|
| 설정 조회 | aims_api `/api/settings/ai-models` | 공유 config (env/파일/etcd) | 4건 |
| 크레딧/쿼터 | aims_api `/api/internal/check-credit` | 독립 크레딧 서비스 또는 직접 DB | 4건 |
| 고객명 조회 | aims_api Internal API 경유 | Read replica 직접 접근 | 6건 |
| files 조회 | aims_api Internal API 경유 | Read replica 직접 접근 | 20+건 |

**효과:**
- 읽기 트래픽이 aims_api를 거치지 않아 부하 분산
- 각 서비스가 aims_api 없이도 조회 가능 (독립 테스트 가능)

### R3 (장기): aims_api 순수 오케스트레이터화

**목표: aims_api는 프론트엔드 API + 비즈니스 오케스트레이션만 담당. DB 쓰기도 각 서비스가 자신의 도메인에서 직접 수행.**

현재 전환 어려운 49+건의 쓰기 호출:
- files CRUD (document_pipeline → aims_api) — 8건
- customers 문서배열 조작 (document_pipeline → aims_api) — 3건
- AR/CR 결과 저장 (annual_report_api → aims_api) — 6건
- 파싱 상태 업데이트 (annual_report_api → aims_api) — 30+건

**전환 방향:**
- 각 서비스가 자기 도메인 DB를 직접 관리 (document_pipeline → files, annual_report_api → AR/CR 데이터)
- aims_api는 프론트엔드 API 제공 + 서비스 간 이벤트 조율만 담당
- 완전한 단방향 의존: `frontend → aims_api → {dp, ar, rag, mcp}` (역방향 콜백 0)

**효과:**
- 각 모듈 물리적 분리 가능 (별도 서버, 별도 배포)
- aims_api 단일 장애점 해소
- 서비스별 독립 스케일링

---

## 4. 현재 위치

```
[완료] DB Gateway Phase 1~6     ████████████████████ 100%
[완료] Backend 위반 B1~B7       ████████████████████ 100%
[완료] Frontend 위반 F1~F7      ████████████████████ 100%
─────────────────────────────────────────────────────────
[대기] R1: 이벤트화 (16건)       ░░░░░░░░░░░░░░░░░░░░   0%
[대기] R2: 공유 서비스 분리       ░░░░░░░░░░░░░░░░░░░░   0%
[대기] R3: 완전 단방향            ░░░░░░░░░░░░░░░░░░░░   0%
```

**토대 완료, R1 시작 전.**

DB Gateway로 "모든 DB 접근이 aims_api를 경유"하는 구조를 만들었고,
B1~B7/F1~F7로 코드 레벨의 위반을 정리했다.

다음 단계 R1은 이 토대 위에서 "aims_api를 몰라도 되는" 방향으로 역방향 콜백을 제거하는 작업이다.

---

## 5. 의존 구조 변화

### Before (DB Gateway 전)
```
aims_api ←──→ document_pipeline  (양방향 + DB 직접 접근)
    ↑↓              ↑↓
annual_report_api ←→ MongoDB     (각자 직접 접근)
    ↑↓
aims_rag_api ←────→ MongoDB      (직접 접근)
```

### Now (토대 완료 후)
```
aims_api (DB 단일 게이트웨이)
  ↑ document_pipeline  (Internal API 경유, webhook 콜백)
  ↑ annual_report_api  (Internal API 경유, webhook 콜백)
  ↑ aims_rag_api       (Internal API 경유, 로그 콜백)
  ↑ aims_mcp           (Internal API 경유, 단방향 ✓)
```

### Target (R3 완료 후)
```
aims_api (오케스트레이터)
  → document_pipeline  (이벤트 구독, 자체 DB)
  → annual_report_api  (이벤트 구독, 자체 DB)
  → aims_rag_api       (이벤트 구독, 자체 DB)
  → aims_mcp           (Internal API, 단방향)
```

---

## 참조

- [CLAUDE.md](../CLAUDE.md) — 프로젝트 규칙 + 변경 이력
- [NETWORK_SECURITY_ARCHITECTURE.md](NETWORK_SECURITY_ARCHITECTURE.md) — 네트워크 보안
- [2026-04-03_AIMS_ARCHITECTURE_ANALYSIS.md](2026-04-03_AIMS_ARCHITECTURE_ANALYSIS.md) — 아키텍처 분석 원본
