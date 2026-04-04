# AIMS 서비스 모듈 독립성 평가 보고서

> 최종 갱신: 2026-04-05
> 평가 기준: 빌드 / 테스트 / 배포 / 진화 4축 독립성
> 대상: 백엔드 7개 서비스 + 프론트엔드 1개

---

## 1. 종합 평가

### 4축 독립성 매트릭스

| 서비스 | 빌드 | 테스트 | 배포 | 진화 | 종합 |
|--------|:----:|:-----:|:----:|:----:|:----:|
| **pdf_proxy** | ✅ | ✅ | ✅ | ✅ | 완전 독립 |
| **document_pipeline** | ✅ | ✅ | ✅ | ✅ | 완전 독립 |
| **annual_report_api** | ✅ | ✅ | ✅ | ✅ | 완전 독립 |
| **aims_rag_api** | ✅ | ✅ | ✅ | ✅ | 완전 독립 |
| **aims_api** | ⚠️ | ⚠️ | ✅ | ✅ | 거의 독립 |
| **frontend** | ✅ | ✅ | ✅ | ⚠️ | 거의 독립 |
| **aims_mcp** | ⚠️ | ⚠️ | ✅ | ⚠️ | 부분 결합 |

### 축별 요약

| 축 | 독립 서비스 수 | 현재 수준 | 평가 |
|-----|:-----------:|----------|------|
| **배포** | 7/7 | 개별 deploy 스크립트 + 병렬 배포 | 잘 설계됨 |
| **테스트** | 5/7 | 단위 테스트 mock 격리, E2E만 결합 | 양호 |
| **빌드** | 5/7 | shared-schema `file:` 의존 2건 | 양호 |
| **진화** | 6/7 | 하드코딩 URL 0건, 환경변수 통일 완료 | 잘 설계됨 |

---

## 2. 서비스 프로파일

### 코드 규모

| 서비스 | 언어 | 소스 라인 | 테스트 파일 | 테스트 수 | Dockerfile |
|--------|------|--------:|----------:|--------:|:----------:|
| aims_api | JavaScript | 49,631 | 76 | 1,411 | ✅ Docker |
| annual_report_api | Python | 51,906 | 13 | 154 | ❌ PM2 |
| frontend | TS/TSX | 39,831 | 248 | 4,840 | ❌ nginx |
| document_pipeline | Python | 21,641 | 47 | 758 | ❌ PM2 |
| aims_mcp | TypeScript | 15,954 | 36 | 818 | ❌ PM2 |
| aims_rag_api | Python | 4,322 | 4 | 32 | ✅ Docker |
| pdf_proxy | Python | 504 | 1 | - | ❌ PM2 |
| **합계** | | **183,789** | **425** | **8,013+** | |

### Internal API (aims_api 제공)

- 엔드포인트: **41개** (`/api/internal/*`)
- 인증: `x-api-key` 헤더 (`.env.shared`의 `INTERNAL_API_KEY`)
- 소비자: document_pipeline, annual_report_api, aims_rag_api, aims_mcp (4개 서비스)

---

## 3. 축별 상세 분석

### 3-1. 빌드 독립성

**독립 (5개):** document_pipeline, annual_report_api, aims_rag_api, pdf_proxy, frontend
- 자체 `requirements.txt` 또는 `package.json`
- 다른 서비스 소스를 직접 import하지 않음

**부분 결합 (2개):** aims_api, aims_mcp
- `@aims/shared-schema` 의존: `"file:../../shared/schema"` (로컬 경로 참조)
- 모노레포 밖에서는 빌드 불가
- aims_api의 Dockerfile에서 shared-schema를 먼저 빌드하는 단계 필요

```
# 결합 구조
aims_api ──file:──→ @aims/shared-schema (backend/shared/schema/)
aims_mcp ──file:──→ @aims/shared-schema
```

**shared-schema 사용 범위:**
- `COLLECTIONS` 상수 (컬렉션명 하드코딩 방지)
- `CUSTOMER_FIELDS`, `CUSTOMER_TYPES`, `CUSTOMER_STATUS` 타입 정의
- Internal API 응답 타입, Redis 이벤트 스키마

### 3-2. 테스트 독립성

**독립 (5개):** document_pipeline, annual_report_api, aims_rag_api, pdf_proxy, frontend
- 외부 서비스 실행 없이 단독 테스트 가능
- AsyncMock, MagicMock, vi.mock 등으로 외부 의존성 격리

**부분 결합 (2개):** aims_api, aims_mcp
- **aims_api**: 단위 테스트(Jest)는 독립 실행 가능하나, contract 테스트는 실행 중인 서버 필요
- **aims_mcp**: 단위 테스트(vitest)는 독립이나, cross-system E2E는 aims_api + aims_rag_api 필요

```
# 테스트 의존 관계 (E2E만)
aims_api contract tests ──→ aims_api 서버 (localhost:3010)
aims_mcp E2E tests ──→ aims_api + aims_rag_api
```

단위 테스트와 E2E 테스트가 명확히 분리되어 있어, 일상적인 개발에서는 독립 테스트가 가능함.

### 3-3. 배포 독립성

**전 서비스 독립 (7/7)**

각 서비스에 개별 배포 스크립트가 존재:

| 서비스 | 배포 스크립트 | 실행 방식 |
|--------|-------------|----------|
| aims_api | `deploy_aims_api.sh` | Docker rebuild + restart |
| document_pipeline | `deploy_document_pipeline.sh` | PM2 restart |
| annual_report_api | `deploy_annual_report_api.sh` | PM2 restart |
| aims_rag_api | `deploy_aims_rag_api.sh` | Docker rebuild + restart |
| aims_mcp | `deploy_aims_mcp.sh` | PM2 restart |
| pdf_proxy | `deploy_pdf_proxy.sh` | PM2 restart |
| frontend | `deploy_all.sh` 내 병렬 단계 | nginx static 교체 |

`deploy_all.sh`는 이들을 오케스트레이션:
- Step 2: aims_api (단독, 선행 배포 — 다른 서비스의 Internal API 제공자)
- Step 3~8: 백엔드 6개 서비스 **병렬 배포**
- Step 9: document_pipeline (단독, Docker 빌드 시간 확보)
- Step 10~11: Frontend + Admin **병렬 배포**
- Step 12~13: 헬스체크 + Docker 정리

**스마트 빌드**: 소스 변경 없는 서비스는 QUICK RESTART (빌드 생략).

### 3-4. 진화 독립성

#### 하드코딩 URL 현황: 0건 (✅ 해결 완료 — `612378a5`)

모든 서비스 간 URL이 환경변수 + fallback 패턴으로 전환됨:

| 환경변수 | 기본값 | 사용 파일 |
|---------|--------|----------|
| `ANNUAL_REPORT_API_URL` | `http://localhost:8004` | admin-routes, annual-report-routes, webhooks-routes |
| `DOCUMENT_PIPELINE_URL` | `http://localhost:8100` | health-routes, webhooks-routes |
| `AIMS_RAG_API_URL` | `http://localhost:8000` | admin-routes |
| `PDF_PROXY_URL` | `http://localhost:8002` | admin-routes |
| `PDF_CONVERTER_URL` | `http://localhost:8005` | admin-routes |
| `N8N_URL` | `http://localhost:5678` | admin-routes, webhooks-routes |
| `AIMS_MCP_URL` | `http://localhost:3011` | admin-routes |

#### 환경변수 네이밍 표준: `{SERVICE_NAME}_URL`

```
AIMS_API_URL             (aims_api — 하위 서비스에서 사용)
ANNUAL_REPORT_API_URL    (annual_report_api)
DOCUMENT_PIPELINE_URL    (document_pipeline)
AIMS_RAG_API_URL         (aims_rag_api)
PDF_PROXY_URL            (pdf_proxy)
PDF_CONVERTER_URL        (pdf_converter)
N8N_URL                  (n8n)
AIMS_MCP_URL             (aims_mcp)
```

#### 자기 호출 제거 완료

```javascript
// Before: HTTP 자기 호출 (안티패턴)
await axios.delete(`http://localhost:3010/api/documents/${docId}`);

// After: 내부 함수 직접 호출 (612378a5)
const { deleteDocument } = require('../lib/documentDeleteService');
await deleteDocument(docId.toString());
```

`documentDeleteService.js`로 문서 삭제 공통 로직을 추출하여 `documents-routes.js`와 `personal-files-routes.js` 양쪽에서 호출. 의존성 주입(`init`) 패턴 적용.

#### deploy_aims_api.sh 환경변수 전달

Docker `-e` 옵션으로 7개 환경변수가 모두 전달됨:
```bash
-e ANNUAL_REPORT_API_URL="${ANNUAL_REPORT_API_URL:-http://localhost:8004}"
-e DOCUMENT_PIPELINE_URL="${DOCUMENT_PIPELINE_URL:-http://localhost:8100}"
-e AIMS_RAG_API_URL="${AIMS_RAG_API_URL:-http://localhost:8000}"
-e PDF_PROXY_URL="${PDF_PROXY_URL:-http://localhost:8002}"
-e PDF_CONVERTER_URL="${PDF_CONVERTER_URL:-http://localhost:8005}"
-e N8N_URL="${N8N_URL:-http://localhost:5678}"
-e AIMS_MCP_URL="${AIMS_MCP_URL:-http://localhost:3011}"
```

#### 역방향 의존 (하위 → aims_api): 깨끗함

- document_pipeline: `AIMS_API_URL` 환경변수 사용 ✅
- aims_rag_api: `AIMS_API_URL` 환경변수 사용 ✅
- aims_mcp: `AIMS_API_URL` 환경변수 사용 ✅

---

## 4. DB 게이트웨이 전환 성과

DB 게이트웨이 리팩토링(R1~R6, 2026-04)의 독립성 개선 효과:

| 항목 | 전환 전 | 전환 후 |
|------|--------|--------|
| MongoDB 직접 접근 서비스 | 5개 | **1개** (aims_api만) |
| Internal API 엔드포인트 | 0개 | **41개** |
| 하위 서비스 DB 의존성 | 강한 결합 | **완전 격리** |
| 하위 서비스 독립 테스트 | 불가능 | **가능** |
| 공유 스키마 범위 | 없음 (각자 하드코딩) | **중앙 관리** (@aims/shared-schema) |

---

## 5. 개선 이력 및 잔여 권장사항

### 완료된 개선 (2026-04-05)

| 항목 | 커밋 | 내용 |
|------|------|------|
| ~~P1: 하드코딩 URL 환경변수화~~ | `612378a5` | 21건 → 7개 환경변수 + fallback 패턴 |
| ~~P2: 자기 호출 제거~~ | `612378a5` | HTTP 자기 호출 → documentDeleteService 직접 호출 |
| ~~P3: 환경변수 네이밍 표준화~~ | `612378a5` | `{SERVICE_NAME}_URL` 패턴 통일 |

### 잔여 개선 권장사항 (선택)

#### P4: shared-schema를 npm 레지스트리 패키지로 전환

현재 `file:../../shared/schema` 로컬 경로 의존을 npm 패키지로 전환하면 모노레포 밖에서도 빌드 가능. 단, 현재 모노레포 구조에서는 `file:` 참조가 실용적이므로 **필요 시에만** 수행.

#### P5: 나머지 서비스 컨테이너화

현재 Docker: 2/7 (aims_api, aims_rag_api). PM2 실행 서비스를 Docker로 전환하면 환경 일관성 향상. 단, PM2가 현 운영에서 안정적이므로 **K8s 전환 시에만** 수행.

---

## 6. 결론

| 영역 | 상태 | 한 줄 요약 |
|------|:----:|----------|
| DB 게이트웨이 | ✅ 완료 | 하위 서비스 DB 독립성 확보 (41개 Internal API) |
| 배포 자동화 | ✅ 완료 | 7개 서비스 개별 배포 + 병렬 배포 |
| 테스트 격리 | ✅ 양호 | 단위 테스트 독립, E2E만 부분 결합 |
| 빌드 독립성 | ⚠️ 양호 | shared-schema file: 의존 2건 (실용적 수준) |
| 진화 독립성 | ✅ 완료 | 하드코딩 URL 0건, 환경변수 통일, 자기 호출 제거 |

**핵심 메시지:** DB 게이트웨이 전환(R1~R6)으로 **하위 → 상위** 독립성을 확보하고, URL 환경변수화(`612378a5`)로 **상위 → 하위** 독립성도 확보하여 양방향 진화 독립성이 달성됨. 잔여 결합은 shared-schema `file:` 참조 2건(실용적 수준)과 E2E 테스트의 서비스 간 결합(설계상 불가피)뿐임.

---

## 참조

- [AIMS_ARCHITECTURE_CURRENT_STATE.md](AIMS_ARCHITECTURE_CURRENT_STATE.md) — 현재 아키텍처 구조
- [AIMS_ARCHITECTURE_ROADMAP.md](AIMS_ARCHITECTURE_ROADMAP.md) — DB 게이트웨이 전환 이력
- [CLAUDE.md](../CLAUDE.md) — 프로젝트 규칙
