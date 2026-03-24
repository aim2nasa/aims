# xPipe 리팩토링 계획

**작성일**: 2026-03-24
**상태**: Phase 3 완료 (실환경 검증 PASS)

---

## 1. 목표

> **xPipe를 `pip install xpipe`로 설치해서 어떤 프로젝트에서든 사용할 수 있는 독립 패키지로 만든다.**

### 완료 조건
- xPipe 패키지 내부에 AIMS/보험 도메인 참조 **0건**
- 자체 정의한 ABC를 내장 스테이지가 **실제로 사용** (Provider 직접 호출 0건)
- 환경변수 직접 참조 **0건** (모든 설정은 context/config 주입)
- 기존 AIMS + xPipeWeb의 동작 **100% 유지** (characterization 테스트 ALL PASS)

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

## 3. 개선 항목 (11건) — 전부 완료

| # | 항목 | 심각도 | 커밋 | 상태 |
|---|------|--------|------|------|
| 1 | server.py insurance import → 플러그인 (importlib 동적 로드) | CRITICAL | `17ccb8d3` | **DONE** |
| 2 | ClassifyStage/EmbedStage → ProviderRegistry 경유 | HIGH | `17ccb8d3` | **DONE** |
| 3 | ConvertStage URL → context['_converter_url'] 주입 | HIGH | `17ccb8d3` | **DONE** |
| 4 | cli.py insurance 하드코딩 → 환경변수 기반 어댑터 탐색 | HIGH | `17ccb8d3` | **DONE** |
| 5 | server.py 글로벌 상태 → ServerState 클래스 캡슐화 | HIGH | `17ccb8d3` | **DONE** |
| 6 | pyproject.toml optional-dependencies 선언 | MEDIUM | `17ccb8d3` | **DONE** |
| 7 | 환경변수 fallback 제거, context 주입 통일 | MEDIUM | `17ccb8d3` | **DONE** |
| 8 | UpstageOCRProvider os.environ fallback 제거 | MEDIUM | `17ccb8d3` | **DONE** |
| 9 | 내장 스테이지 7개 __init__.py export | MEDIUM | `17ccb8d3` | **DONE** |
| 10 | 프리셋 aims-insurance → standard 범용화 (alias 유지) | LOW | `17ccb8d3` | **DONE** |
| 11 | 테스트 insurance import → MockAdapter 교체 (conftest.py) | LOW | `17ccb8d3` | **DONE** |

---

## 4. 실행 결과

### Phase 1: Characterization 테스트 작성 — 완료 (`f4332734`)

7개 파일, 60개 테스트 작성. 기존 389 + 신규 60 = 449개 ALL PASS.

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

TDD 사이클 준수: 항목 수정 → 테스트 ALL PASS 확인 → 다음 항목.

변경 파일 22개, +775 / -292 라인. 453 테스트 ALL PASS.

주요 설계 결정:
- **#1**: `adapter_module`/`adapter_class` 설정 키 추가. 미설정 시 기존 동작 fallback (하위 호환)
- **#2**: ProviderRegistry 경유 추가. Registry 미등록 시 기존 OpenAI 직접 호출 fallback (하위 호환)
- **#5**: `ServerState` 클래스 도입 + 모듈 레벨 alias 유지 (최소 변경)
- **#7**: `os.environ` fallback 제거. API 키는 context에서만 읽음 (AIMS가 이미 주입하므로 동작 변경 없음)
- **#10**: `"standard"` 프리셋으로 이름 변경 + `"aims-insurance"` alias 유지 (하위 호환)
- **#11**: `conftest.py`에 MockInsuranceAdapter 정의. 실제 어댑터 동작 재현

### Phase 3: 실환경 검증 — 완료

프로덕션 배포 후 AR/CRS 문서 업로드 실테스트.

| 테스트 | document_type | overallStatus | 감지 | displayName | 고객연결 | 판정 |
|--------|-------------|---------------|------|-------------|---------|------|
| AR 문서 | `annual_report` | `embedding` | `is_annual_report: true` | 정상 | 정상 | **PASS** |
| CRS 문서 | `customer_review` | `completed` | `is_customer_review: true` | 정상 | 정상 | **PASS** |

overallStatus 세분화도 정상 동작: AR 문서가 `embedding` 상태(크론 처리 중)로 정확히 표시됨.

### Phase 3.5: 모듈화 완성도 평가 (Alex + Gini + Claude)

**판정: FAIL — 완벽하지 않음 (약 80%)**

잔여 Major 이슈 4건:

| # | 이슈 | 파일 | 심각도 |
|---|------|------|--------|
| R1 | `adapter_name == "insurance"` 하드코딩 fallback 분기 | `server.py:278` | Major |
| R2 | 어댑터 유효값에 `"insurance"`, `"legal"` 하드코딩 | `server.py:1162` | Major |
| R3 | `OPENAI_API_KEY`, `UPSTAGE_API_KEY` 환경변수 직접 참조 5곳 | `server.py` | Major |
| R4 | ClassifyStage/EmbedStage의 OpenAI fallback 직접 호출 잔존 | `classify.py`, `embed.py` | Major |

→ Phase 2-B로 추가 리팩토링 진행 → **완료** (`09c207f6`)

### Phase 3.5-B: 최종 모듈화 평가 — **3자 ALL PASS**

| 평가자 | 판정 | 근거 |
|--------|------|------|
| **Alex** | **PASS** | 4개 기준 모두 충족. stages/에서 openai 직접 import 0건, 도메인 참조 0건 |
| **Gini** | **PASS** | 이전 지적 4건 모두 수정 확인. 환경변수 캡슐화, 어댑터 플러그인 구조 완성 |
| **Claude** | **PASS** | 453 테스트 ALL PASS, 프로덕션 실테스트 PASS |

→ 추가 엄격 재평가에서 잔여 이슈 발견 → Phase 2-C로 진행

### Phase 2-C: 보험 도메인 흔적 전면 제거 — 완료 (`a14b15d9`)

- adapter.py 주석 보험 예시 12건 → 범용 예시
- test_pipeline.py `test_aims_*` 11건 → `test_standard_*`
- test_regression.py `insurance` 변수명 → `adapter_a`
- providers.py → ABC만 유지, 구현체 `providers_builtin.py`로 분리
- conftest.py → MockDomainAdapter 완전 범용화
- server.py → `~/aims/` 하드코딩 제거, ENV_KEY_MAP 외부 주입
- **grep 결과: xpipe/ 전체에서 보험/insurance/AIMS 도메인 키워드 0건**

### Phase 3.5-C: 최종 모듈화 평가 — **3자 ALL PASS**

| 평가자 | 판정 | 근거 |
|--------|------|------|
| **Alex** | **PASS** | 8개 기준 모두 충족. 도메인 키워드 0건, providers.py ABC 순수 |
| **Gini** | **PASS** | 8개 검증 포인트 모두 통과. 코드 로직 도메인 오염 없음 |
| **Claude** | **PASS** | 453 테스트 ALL PASS, grep 0건 직접 확인 |

### Phase 4: 사용자 매뉴얼 — 진행 가능

**3자 ALL PASS 최종 달성. xPipe 모듈화 완료.**

---

## 5. 커밋 이력

| 커밋 | 내용 |
|------|------|
| `a14b15d9` | Phase 2-C: 보험 도메인 흔적 전면 제거 (3자 ALL PASS) |
| `57d38469` | 모듈화 분석 + 리팩토링 계획 문서 |
| `f4332734` | Phase 1: characterization 테스트 60개 |
| `17ccb8d3` | Phase 2: 리팩토링 11건 완료 (453 테스트 ALL PASS) |
| `0fce74be` | Phase 3 실환경 검증 결과 기록 |
| `09c207f6` | Phase 2-B: 잔여 Major 4건 완전 해소 (3자 ALL PASS) |

---

## 6. 참조

- [xPipe 모듈화 분석 보고서](XPIPE_MODULARIZATION_ANALYSIS.md)
- [xPipe 레이어 아키텍처](XPIPE_LAYER_ARCHITECTURE.md)
- [xPipe × AIMS 통합 보고서](2026-03-24_XPIPE_AIMS_INTEGRATION_REPORT.md)
