# xPipe 리팩토링 계획

**작성일**: 2026-03-24
**상태**: 계획 수립 완료, 테스트 작성 전

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

- 테스트가 PASS하는 한, 리팩토링은 안전하다
- 테스트가 FAIL하면, 리팩토링이 동작을 깨뜨린 것이다
- 한 번에 하나만 바꾼다

---

## 3. 개선 항목 (11건)

| # | 항목 | 심각도 | 작업량 |
|---|------|--------|--------|
| 1 | server.py의 insurance import → 플러그인 방식 | CRITICAL | 중 |
| 2 | ClassifyStage/EmbedStage → ProviderRegistry 경유 | HIGH | 중 |
| 3 | ConvertStage URL → config 주입 | HIGH | 소 |
| 4 | cli.py의 insurance 하드코딩 제거 | HIGH | 소 |
| 5 | server.py 글로벌 상태 → ServerState 캡슐화 | HIGH | 대 |
| 6 | pyproject.toml optional-dependencies 선언 | MEDIUM | 소 |
| 7 | 환경변수 fallback 제거, context 주입 통일 | MEDIUM | 중 |
| 8 | Provider 구현체(Upstage) 코어에서 분리 | MEDIUM | 소 |
| 9 | 내장 스테이지 `__init__.py` export | MEDIUM | 소 |
| 10 | 프리셋 이름 범용화 + AIMS 주석 제거 | LOW | 소 |
| 11 | 테스트의 insurance import → MockAdapter 교체 | LOW | 소 |

---

## 4. Characterization 테스트 계획

### 기존 커버리지 (약 289개 테스트)

| 테스트 파일 | 테스트 수 | 커버 대상 |
|---|---|---|
| `test_pipeline.py` | ~50 | Pipeline 엔진, 내장 스테이지 stub 모드 |
| `test_events.py` | ~20 | EventBus, 웹훅 |
| `test_providers.py` | ~35 | Provider ABC, Registry, UpstageOCR |
| `test_quality.py` | ~35 | QualityGate, GroundTruthRunner |
| `test_scheduler.py` | ~10 | Job, InMemoryQueue |
| `test_audit.py` | ~20 | AuditEntry, AuditLog |
| `test_cli.py` | ~5 | CLI 명령어 |
| `test_regression.py` | ~25 | E2E 파이프라인, 어댑터 교체 |
| `test_testing.py` | ~10 | TestRunner |
| `test_server_queue.py` | ~1 | xPipeWeb 큐잉 |
| `test_xpipe_independence.py` | ~8 | 패키지 독립성 |
| `test_insurance_adapter_hooks.py` | ~20 | InsuranceAdapter HookResult |
| `test_insurance_adapter_detect.py` | ~25 | AR/CRS 감지 |
| `test_adapter_contract.py` | ~25 | DomainAdapter ABC 계약 |

### 신규 작성 필요 (7개 파일, ~45개 테스트)

#### 파일 1: `test_char_classify_embed.py` (~13개)
> ClassifyStage/EmbedStage real 모드 동작 캡처 **(가장 큰 커버리지 갭)**

| 테스트 | 검증 | Mock |
|--------|------|------|
| `test_classify_stub_with_config` | config 있으면 classified=True | — |
| `test_classify_stub_without_config` | config 없으면 skipped | — |
| `test_classify_real_openai_call` | OpenAI API 호출 → 결과 파싱 | openai mock |
| `test_classify_real_no_api_key` | API 키 없으면 RuntimeError | environ mock |
| `test_classify_real_json_parse_error` | 비-JSON 응답 → doc_type=None | openai mock |
| `test_classify_real_token_usage` | usage가 context에 기록됨 | openai mock |
| `test_embed_stub_with_text` | 텍스트 있으면 embedded=True | — |
| `test_embed_stub_empty_text` | 빈 텍스트 → chunk_count=0 | — |
| `test_embed_real_openai_call` | Embedding API 호출 → dims 반환 | openai mock |
| `test_embed_real_no_api_key` | API 키 없으면 RuntimeError | environ mock |
| `test_embed_real_empty_skipped` | 빈 텍스트 → API 미호출 | openai mock |
| `test_embed_real_text_truncated` | 3000자 초과 → 잘려서 호출 | openai mock |
| `test_embed_real_token_usage` | usage가 context에 기록됨 | openai mock |

#### 파일 2: `test_char_convert_real.py` (~4개)
> ConvertStage real 모드 URL/fallback 캡처

| 테스트 | 검증 | Mock |
|--------|------|------|
| `test_convert_pdf_converter_success` | localhost:8005 성공 → method="pdf_converter" | httpx mock |
| `test_convert_pdf_converter_fail_soffice` | 8005 실패 → soffice fallback | httpx + subprocess mock |
| `test_convert_both_fail` | 둘 다 실패 → converted=False | 양쪽 mock |
| `test_convert_url_is_hardcoded` | URL이 `http://localhost:8005/convert`인지 캡처 | httpx mock |

#### 파일 3: `test_char_cli_adapter.py` (~3개)
> CLI 어댑터 탐색 동작 캡처

| 테스트 | 검증 | Mock |
|--------|------|------|
| `test_status_insurance_found` | insurance 있으면 이름 출력 | — |
| `test_status_insurance_not_found` | insurance 없으면 에러 없이 동작 | importlib mock |
| `test_test_includes_contract` | _cmd_test가 contract 테스트 포함 | — |

#### 파일 4: `test_char_server_state.py` (~6개)
> server.py 글로벌 상태 구조 캡처

| 테스트 | 검증 | Mock |
|--------|------|------|
| `test_initial_documents_empty` | documents가 빈 dict | — |
| `test_initial_config_shape` | current_config 키 목록 + 기본값 | — |
| `test_event_bus_type` | EventBus 인스턴스 | — |
| `test_audit_log_type` | AuditLog 인스턴스 | — |
| `test_queue_maxsize` | maxsize=100 | — |
| `test_default_mode` | OPENAI_API_KEY에 따라 real/stub | environ mock |

#### 파일 5: `test_char_env_fallback.py` (~4개)
> 환경변수 fallback 우선순위 캡처

| 테스트 | 검증 | Mock |
|--------|------|------|
| `test_classify_context_key_priority` | context 키가 environ보다 우선 | openai + environ mock |
| `test_classify_env_fallback` | context 없으면 environ 사용 | openai + environ mock |
| `test_embed_context_key_priority` | 동일 (EmbedStage) | openai + environ mock |
| `test_embed_env_fallback` | 동일 | openai + environ mock |

#### 파일 6: `test_char_imports.py` (~4개)
> Import 경로 동작 캡처

| 테스트 | 검증 | Mock |
|--------|------|------|
| `test_upstage_from_providers` | `from xpipe.providers import UpstageOCRProvider` | — |
| `test_stages_exports_seven` | `xpipe.stages.__all__` == 7개 | — |
| `test_xpipe_init_all_importable` | `__all__` 28개 심볼 모두 import 가능 | — |
| `test_stages_individual_import` | 각 스테이지 개별 import 동작 | — |

#### 파일 7: `test_char_adapter_snapshot.py` (~6개)
> InsuranceAdapter 동작 스냅샷 (MockAdapter 교체 기준)

| 테스트 | 검증 | Mock |
|--------|------|------|
| `test_classification_config_snapshot` | categories 수, valid_types, prompt 존재 | — |
| `test_detect_ar_snapshot` | AR 텍스트 → Detection 구조 | — |
| `test_detect_crs_snapshot` | CRS 텍스트 → Detection 구조 | — |
| `test_detect_normal_snapshot` | 일반 텍스트 → 빈 리스트 | — |
| `test_on_stage_complete_unknown` | 알 수 없는 stage → 빈 리스트 | — |
| `test_extract_domain_metadata` | 반환 구조 캡처 | — |

---

## 5. 실행 순서

```
Phase 1: Characterization 테스트 작성
  ├→ 7개 파일, ~45개 테스트 작성
  ├→ 기존 289 + 신규 45 = 약 334개 ALL PASS 확인
  └→ 이 시점에서 "현재 동작의 안전망" 완성

Phase 2: 리팩토링 (한 항목씩, 테스트 ALL PASS 유지)
  ├→ #1  server.py insurance import → 플러그인
  ├→ #2  ClassifyStage/EmbedStage → ProviderRegistry
  ├→ #3  ConvertStage URL → config 주입
  ├→ #4  cli.py insurance 하드코딩 제거
  ├→ #5  server.py 글로벌 상태 → ServerState
  ├→ #6  pyproject.toml optional-dependencies
  ├→ #7  환경변수 fallback 제거
  ├→ #8  Upstage Provider 코어에서 분리
  ├→ #9  내장 스테이지 export
  ├→ #10 프리셋 이름 범용화
  └→ #11 테스트 insurance → MockAdapter

Phase 3: 검증
  ├→ 전체 테스트 ALL PASS (334+)
  ├→ test_xpipe_independence.py 강화 (역방향 의존성 0건 확인)
  ├→ AIMS 실환경 배포 + 문서 업로드 실테스트
  └→ xPipeWeb 정상 동작 확인

Phase 4: 사용자 매뉴얼 작성
  └→ xPipe가 완벽하게 모듈화된 후 작성
```

---

## 6. 참조

- [xPipe 모듈화 분석 보고서](XPIPE_MODULARIZATION_ANALYSIS.md)
- [xPipe 레이어 아키텍처](XPIPE_LAYER_ARCHITECTURE.md)
- [xPipe × AIMS 통합 보고서](2026-03-24_XPIPE_AIMS_INTEGRATION_REPORT.md)
