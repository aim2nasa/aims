# AIMS 하네스 엔지니어링 도입 현황 보고서

> 작성일: 2026-04-05
> 목적: 아키텍처 규칙 자동 강제 시스템(하네스)의 현재 도입 수준 점검 + 개선 권장

---

## 1. CLAUDE.md 현황

| 항목 | 현재 | 권장 |
|------|------|------|
| **줄 수** | 181줄 | 60줄 이하 |
| **카테고리** | 7개 (CRITICAL RULES, 코드 규칙, 배포, 에이전트/스킬, System Overview, 리팩토링, 참조) | - |
| **스킬 분리** | 6개 항목이 `.claude/skills/`로 참조 (CSS, UI, 백엔드, 고객, 파이프라인, AR/CRS) | 추가 분리 필요 |

### 줄 수 초과 원인

| 섹션 | 줄 수 | 분리 가능 여부 |
|------|------:|:-------------:|
| CRITICAL RULES (0~0-6) | ~40 | 핵심 — 유지 |
| 코드 규칙 (11개) | ~35 | 일부 분리 가능 |
| 에이전트/스킬 | ~30 | 분리 가능 |
| 변경 이력 테이블 (Phase 1~6) | ~20 | **즉시 분리 가능** |
| 배포 + System Overview | ~30 | 분리 가능 |
| 참조 문서 | ~10 | 유지 |

**변경 이력 테이블**은 ROADMAP.md에 이미 상세 내용이 있으므로 CLAUDE.md에서 제거하고 참조 링크만 남기면 ~20줄 절약 가능.

---

## 2. 자동 강제 시스템 현황

### 2-1. 현재 동작 중인 자동 강제

| 도구 | 위치 | 강제하는 규칙 |
|------|------|-------------|
| **ESLint** (`eslint.config.js`) | 로컬 IDE | `no-restricted-imports` — components/ → features/ 깊은 경로 차단 |
| **TypeScript strict** (`tsconfig.app.json`) | 로컬 + CI | `strict: true`, `noImplicitReturns: true` |
| **Pre-commit hook** (`.husky/pre-commit`) | 로컬 커밋 | 버전 자동 증가 + Python 구문 검사 + 서버 모듈별 테스트 |
| **Gini gate hook** (`.claude/hooks/`) | Claude Code 커밋 | `/gini-commit` 스킬 강제, 직접 git commit 차단 |
| **아키텍처 피트니스 테스트** (`tests/architecture/`) | CI + 로컬 | DB Gateway, 하드코딩 URL, 역방향 HTTP, 환경변수 표준 (5개) |
| **CI** (`.github/workflows/`) | GitHub push/PR | Frontend typecheck+test, Backend Jest, Python pytest, E2E, Architecture |

### 2-2. 미도입 (자동 강제 안 됨)

| 도구 | 상태 | 영향 |
|------|:----:|------|
| **ESLint CI 실행** | ❌ | `no-restricted-imports` 규칙이 IDE에서만 동작, CI에서 미검증 |
| **Python 린터 (ruff/flake8/pylint)** | ❌ | Python 코드 스타일/미사용 import/타입 오류 무검증 |
| **Python lint CI** | ❌ | Python 코드 품질이 CI에서 전혀 검증 안 됨 |
| **TypeScript `noUnusedLocals`** | `false` (TODO) | 미사용 변수가 방치됨 |
| **TypeScript `noUnusedParameters`** | `false` (TODO) | 미사용 파라미터가 방치됨 |
| **TypeScript `noUncheckedIndexedAccess`** | `false` (TODO) | 배열/객체 접근 시 undefined 가능성 미검증 |

### 2-3. TypeScript strict 설정 상세

```json
// tsconfig.app.json
{
  "strict": true,                      // ✅ 활성
  "noUnusedLocals": false,             // ⚠️ TODO: 정리 후 true로 복원
  "noUnusedParameters": false,         // ⚠️ TODO: 정리 후 true로 복원
  "noImplicitReturns": true,           // ✅ 활성
  "noUncheckedIndexedAccess": false,   // ⚠️ TODO: 정리 후 true로 복원
  "noUncheckedSideEffectImports": false
}
```

3개 항목이 TODO로 비활성 상태 — 기존 코드에 미사용 변수/파라미터가 다수 존재하여 즉시 활성화 시 빌드 실패.

---

## 3. 가비지 컬렉션 현황

### 3-1. Dead code 탐지 도구

| 도구 | 용도 | 도입 여부 |
|------|------|:---------:|
| **knip** | TS/JS 미사용 export, 파일, 의존성 탐지 | ❌ |
| **ts-prune** | TS 미사용 export 탐지 | ❌ |
| **vulture** | Python dead code 탐지 | ❌ |
| **depcheck** | 미사용 npm 의존성 탐지 | ❌ |

### 3-2. Dead code 추정 영역

| 영역 | 추정 근거 | 심각도 |
|------|----------|:------:|
| `noUnusedLocals: false` 허용 | TODO 주석으로 인정한 기술 부채 | 🟡 |
| `aims_mcp/dist/` 빌드 산출물 | 소스 전환 후 재빌드 안 됨 — 소스↔빌드 불일치 | 🟡 |
| `components/` 레거시 뷰 | `features/`로 마이그레이션 진행 중 — 일부 중복 가능 | ⚪ |
| Python `import` 미사용 | 린터 없이 감지 불가 | 🟡 |

### 3-3. 문서↔코드 불일치 검사

**도구 없음.** 현재 수동 검증에 의존.

- CLAUDE.md의 변경 이력 테이블 ↔ ROADMAP.md 중복 관리
- Internal API 엔드포인트 수 (문서: 42개) ↔ 실제 코드 불일치 가능성
- 스킬 파일 21개의 내용이 코드 변경에 따라 최신 상태인지 미검증

---

## 4. CI 검사 커버리지

### 4-1. 현재 CI에서 검사하는 것

| CI Job | 검사 내용 | 테스트 수 |
|--------|----------|--------:|
| Frontend | TypeScript typecheck + vitest | ~4,840 |
| Backend | aims_api Jest (MongoDB) | ~1,411 |
| Python | annual_report_api + aims_rag_api pytest | ~186 |
| E2E | Playwright smoke (chromium) | 가변 |
| Architecture | 피트니스 테스트 5개 | 5 |

### 4-2. CI에서 검사하지 않는 것

| 항목 | 로컬 테스트 수 | CI 미포함 이유 |
|------|-------------:|---------------|
| document_pipeline pytest | 758 | CI에 미추가 |
| aims_mcp vitest | 818 | CI에 미추가 |
| xPipe pytest | 377 | CI에 미추가 |
| embedding pytest | 43 | 서버 의존 |
| AutoClicker pytest | 95 | Windows 전용 |
| aims_api migration | 6 | CI에 미추가 |
| shared/schema import | 2 | CI에 미추가 |
| poc_legal pytest | 31 | CI에 미추가 |
| **ESLint** | - | CI에서 미실행 |
| **Python 린터** | - | 도구 미도입 |

**CI 커버리지: ~6,442 / 8,566 (75%)** — document_pipeline, aims_mcp, xPipe 추가 시 ~98%

---

## 5. 개선 권장사항

### P1: 즉시 도입 (공수 소, 효과 대)

| 항목 | 내용 | 효과 |
|------|------|------|
| **ESLint CI 실행** | ci-frontend.yml에 `npx eslint .` step 추가 | 경계 규칙이 CI에서도 강제됨 |
| **Python ruff 도입** | `pip install ruff` + `ruff check` CI step | 미사용 import, 포맷, 타입 오류 자동 검출 (flake8 대비 100배 빠름) |
| **CLAUDE.md 변경 이력 분리** | 변경 이력 테이블을 ROADMAP.md 참조 링크로 대체 | ~20줄 절약, 181줄 → ~160줄 |

### P2: 단기 도입 (공수 중, 효과 중)

| 항목 | 내용 | 효과 |
|------|------|------|
| **document_pipeline CI 추가** | ci-python.yml에 pytest step 추가 | 758건 테스트 CI 커버리지 확보 |
| **aims_mcp CI 추가** | ci-backend.yml 또는 별도 워크플로우 | 818건 테스트 CI 커버리지 확보 |
| **`noUnusedLocals: true` 복원** | 기존 미사용 변수 정리 후 활성화 | dead code 자동 감지 |
| **knip 도입** | 미사용 export/파일/의존성 1회 스캔 | 가비지 코드 일괄 식별 |

### P3: 장기 도입 (공수 대, 효과 장기)

| 항목 | 내용 | 효과 |
|------|------|------|
| **aims_mcp `dist/` .gitignore** | 빌드 산출물을 git에서 제거 | 소스↔빌드 불일치 원천 차단 |
| **CLAUDE.md 60줄 목표** | 에이전트/스킬, 코드 규칙을 별도 파일로 분리 | 컨텍스트 최적화 |
| **문서↔코드 동기화 검사** | Internal API 수, 컬렉션 수 등을 코드에서 추출 → 문서와 비교 | 문서 정합성 자동 보장 |

---

## 6. 결론

### 현재 하네스 성숙도

| 영역 | 수준 | 상태 |
|------|:----:|------|
| **아키텍처 규칙 자동 강제** | ✅ 양호 | 피트니스 테스트 5개 + CI 통합 완료 |
| **코드 품질 자동 강제** | ⚠️ 부분 | ESLint 있으나 CI 미실행, Python 린터 없음 |
| **Dead code 탐지** | ❌ 미도입 | knip/vulture/ts-prune 모두 없음 |
| **문서 정합성 검사** | ❌ 미도입 | 수동 검증 의존 |
| **CI 테스트 커버리지** | ⚠️ 75% | document_pipeline, aims_mcp 미포함 |

**핵심 메시지:** 아키텍처 규칙 자동 강제(피트니스 테스트)는 오늘 완성되었으나, **코드 품질 자동 강제(린터)와 가비지 컬렉션(dead code 탐지)**은 미도입 상태. P1(ESLint CI + ruff)만 추가해도 하네스 성숙도가 한 단계 올라감.

---

## 참조

- [AIMS_ARCHITECTURE_ROADMAP.md](AIMS_ARCHITECTURE_ROADMAP.md) — R8까지 완료된 아키텍처 개선 이력
- [AIMS_MODULE_INDEPENDENCE_REPORT.md](AIMS_MODULE_INDEPENDENCE_REPORT.md) — 서비스 독립성 평가
- [AIMS_ARCHITECTURE_CURRENT_STATE.md](AIMS_ARCHITECTURE_CURRENT_STATE.md) — 현재 아키텍처 구조
