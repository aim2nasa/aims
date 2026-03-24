# xPipe 리팩토링 계획

**작성일**: 2026-03-24
**상태**: 모듈화 완료, 5인 리뷰 9라운드 통과, 실환경 검증 PASS

---

## 1. 목표

> **xPipe를 `pip install xpipe`로 설치해서 어떤 프로젝트에서든 사용할 수 있는 독립 패키지로 만든다.**

### 완료 조건 — 전부 달성
- [x] xPipe 패키지 내부에 AIMS/보험 도메인 참조 **0건** (grep 확인)
- [x] 자체 정의한 ABC를 내장 스테이지가 **실제로 사용** (stages/에서 openai 직접 import 0건)
- [x] 환경변수 직접 참조 **0건** (XPIPE_* 제외, 코어에서 os.environ 0건)
- [x] 기존 AIMS + xPipeWeb의 동작 **100% 유지** (451 테스트 ALL PASS + 프로덕션 실테스트)

---

## 2. 원칙

**TDD 리팩토링 사이클**:
```
① 현재 동작을 캡처하는 테스트 작성 (characterization tests)
② 테스트 ALL PASS 확인
③ 리팩토링 (한 항목씩)
④ 테스트 ALL PASS 재확인
⑤ 다음 항목으로
```

---

## 3. 실행 결과

### Phase 1: Characterization 테스트 작성 — 완료 (`f4332734`)

7개 파일, 60개 테스트 작성.

| 테스트 파일 | 테스트 수 | 커버 대상 |
|---|---|---|
| `test_char_classify_embed.py` | 17 | ClassifyStage/EmbedStage real/stub 모드 |
| `test_char_convert_real.py` | 13 | ConvertStage URL/fallback |
| `test_char_cli_adapter.py` | 3 | CLI 어댑터 탐색 |
| `test_char_server_state.py` | 6 | server.py 글로벌 상태 구조 |
| `test_char_env_fallback.py` | 4 | API 키 우선순위 |
| `test_char_imports.py` | 5 | import 경로 보존 |
| `test_char_adapter_snapshot.py` | 12 | InsuranceAdapter 동작 스냅샷 |

### Phase 2: 리팩토링 11건 — 완료 (`17ccb8d3`)

| # | 항목 | 심각도 |
|---|------|--------|
| 1 | server.py insurance import → 플러그인 (importlib 동적 로드) | CRITICAL |
| 2 | ClassifyStage/EmbedStage → ProviderRegistry 경유 | HIGH |
| 3 | ConvertStage URL → context['_converter_url'] 주입 | HIGH |
| 4 | cli.py insurance 하드코딩 → 환경변수 기반 어댑터 탐색 | HIGH |
| 5 | server.py 글로벌 상태 → ServerState 클래스 캡슐화 | HIGH |
| 6 | pyproject.toml optional-dependencies 선언 | MEDIUM |
| 7 | 환경변수 fallback 제거, context 주입 통일 | MEDIUM |
| 8 | UpstageOCRProvider os.environ fallback 제거 | MEDIUM |
| 9 | 내장 스테이지 7개 __init__.py export | MEDIUM |
| 10 | 프리셋 aims-insurance → standard 범용화 | LOW |
| 11 | 테스트 insurance import → MockAdapter 교체 | LOW |

### Phase 2-B: 잔여 Major 4건 해소 — 완료 (`09c207f6`)

| # | 이슈 |
|---|------|
| R1 | server.py insurance 하드코딩 fallback 분기 완전 제거 |
| R2 | 어댑터 유효값 하드코딩 제거 → adapter_module/adapter_class 구조적 검증 |
| R3 | OPENAI/UPSTAGE API 키 환경변수 직접 참조 제거 → ENV_KEY_MAP + ServerState 캡슐화 |
| R4 | stages/ 코어에서 from openai 완전 제거 → OpenAILLMProvider/EmbeddingProvider 경유 |

### Phase 2-C: 보험 도메인 흔적 전면 제거 — 완료 (`a14b15d9`)

- adapter.py 주석 보험 예시 12건 → 범용 예시
- test_pipeline.py `test_aims_*` 11건 → `test_standard_*`
- test_regression.py `insurance` 변수명 → `adapter_a`
- providers.py → ABC만 유지, 구현체 `providers_builtin.py`로 분리
- conftest.py → MockDomainAdapter 완전 범용화
- server.py → `~/aims/` 하드코딩 제거, ENV_KEY_MAP 외부 주입

### Phase 2-D: 비Python 파일 정제 + providers 역의존 제거 — 완료 (`4c517fe5`)

- index.html "Insurance / aims-insurance" placeholder → "— / — / —"
- XPIPEWEB.md 보험 도메인 용어 전면 범용화
- server.py parents[5] off-by-one → _find_env_file() 탐색 함수
- providers.py 구현체 re-export 제거 (코어 ABC가 구현체에 의존 금지)

### Phase 2-E: 5인 리뷰 회의 (9라운드) — 완료

**참가자**: code-reviewer, security-auditor, Alex, Gini, Claude

리뷰 중 추가 수정 사항:

| 라운드 | 수정 내용 | 커밋 |
|--------|----------|------|
| Round 1 | AIMS 주석 8건 정제 (adapter.py Phase 1 TODO, store.py customerId 등) | `d8abb2d9` |
| Round 2 | .env.shared 에러 메시지 3곳 범용화, OCR 기본 모델명, adapter.py MongoDB 주석 | `a329b02d` |
| Round 3 | server.py _find_env_file 범용화, TEXT_EXTENSIONS 상수화, virus_scan 제거, claim_stale no-op | `9ddff5c3` |
| Round 5 | asyncio.get_event_loop() → get_running_loop() (Python 3.12+ 호환) | `59e51d0e` |
| Round 6 | quality.py os.environ 제거 → QualityGate(enabled=) 생성자 주입, InMemoryQueue 문서화 | `50782774` |
| Round 7~9 | **연속 3라운드 × 5인 전원 수정사항 없음 → 종료** | — |

### Phase 3: 실환경 검증 — 완료

#### 검증 1: AIMS × xPipe — PASS

| 테스트 | document_type | overallStatus | 감지 | displayName | 고객연결 |
|--------|-------------|---------------|------|-------------|---------|
| AR 문서 | `annual_report` | `embedding` | `is_annual_report: true`, `tags: ["AR"]` | 정상 | 정상 |
| CRS 문서 | `customer_review` | `completed` | `is_customer_review: true`, `tags: ["CRS"]` | 정상 | 정상 |

overallStatus 세분화 정상 동작 확인.

#### 검증 2: xPipeWeb — PASS

| 항목 | 결과 |
|------|------|
| 서버 실행 | online (PM2, 포트 8200) |
| `GET /api/config` | 정상 — 설정 반환 |
| `GET /api/documents` | 정상 — 문서 목록 반환 |
| `GET /` (UI) | 정상 — HTML 반환 |
| `POST /api/upload` | 정상 — 업로드 → 큐잉 → 처리 완료 |
| `GET /api/results/{id}` | 정상 — AR 감지 성공 (confidence 1.0) |

### Phase 4: 사용자 매뉴얼 — 진행 가능

**모듈화 완료. 5인 리뷰 9라운드 통과. 실환경 검증 PASS.**

---

## 4. 커밋 이력

| 커밋 | 내용 |
|------|------|
| `57d38469` | 모듈화 분석 + 리팩토링 계획 문서 |
| `f4332734` | Phase 1: characterization 테스트 60개 |
| `17ccb8d3` | Phase 2: 리팩토링 11건 |
| `09c207f6` | Phase 2-B: 잔여 Major 4건 해소 |
| `a14b15d9` | Phase 2-C: 보험 도메인 흔적 전면 제거 |
| `4c517fe5` | Phase 2-D: 비Python 파일 정제 + providers 역의존 제거 |
| `86aad5e8` | Phase 2-D+: adapter.py 마지막 도메인 예시 범용화 |
| `d8abb2d9` | Round 1: AIMS 주석 8건 정제 |
| `a329b02d` | Round 2: 에러 메시지/docstring 범용화 5건 |
| `9ddff5c3` | Round 3: env 탐색 범용화, 상수화, virus_scan 제거, claim_stale no-op |
| `59e51d0e` | Round 5: asyncio.get_running_loop() Python 3.12+ 호환 |
| `50782774` | Round 6: quality.py os.environ 제거 + InMemoryQueue 문서화 |

---

## 5. 최종 모듈화 상태

### grep 검증 결과 (xpipe/ 전체, 모든 파일 형식)

```
insurance, 보험, aims-insurance, InsuranceAdapter,
annual_report, customer_review, MetLife, 메트라이프, 설계사
→ 0건
```

### 코어 os.environ 참조 (XPIPE_* 제외)

```
→ 0건 (cli.py의 XPIPE_ADAPTER_MODULE/CLASS만 존재)
```

### stages/ 코어에서 from openai 직접 import

```
→ 0건 (providers_builtin.py 경유로 완전 이동)
```

### providers.py (ABC 모듈)에 구현체 코드

```
→ 0건 (ABC 3개만 존재, 구현체는 providers_builtin.py)
```

---

## 6. 참조

- [xPipe 모듈화 분석 보고서](XPIPE_MODULARIZATION_ANALYSIS.md)
- [xPipe 레이어 아키텍처](XPIPE_LAYER_ARCHITECTURE.md)
- [xPipe × AIMS 통합 보고서](2026-03-24_XPIPE_AIMS_INTEGRATION_REPORT.md)
