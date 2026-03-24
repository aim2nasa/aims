# xPipe 모듈화 분석 보고서

**작성일**: 2026-03-24
**분석**: Alex (아키텍처) + Gini (순수성 검증)

---

## 1. 분석 목표

xPipe를 블랙박스 모듈로 외부에서 `pip install`해서 사용한다고 가정했을 때,
현재 코드의 재사용성 저해 요소를 식별하고 개선 방향을 제시한다.

현재 소비자: **AIMS** (InsuranceAdapter 사용), **xPipeWeb** (범용/어댑터 주입 가능)

---

## 2. 잘 된 부분 (Strong Points)

| # | 항목 | 설명 |
|---|------|------|
| 1 | 코어 인터페이스 독립 | `adapter.py`, `stage.py`, `store.py`, `queue.py`, `events.py`, `audit.py`, `pipeline.py` — 표준 라이브러리만 사용, 외부 의존 없음 |
| 2 | DomainAdapter 패턴 | 도메인 로직을 어댑터로 분리하는 설계가 깨끗함 |
| 3 | Pipeline 엔진 범용성 | JSON/YAML 정의, skip 조건, 이벤트 버스 연동이 도메인 무관 |
| 4 | DocumentStore/JobQueue ABC | 저장소/큐 교체 가능한 추상화 |
| 5 | ProviderRegistry 설계 | 다중 Provider fallback 지원 |
| 6 | Public API 28개 심볼 | `__init__.py`에서 핵심 타입 export |

---

## 3. 모듈 경계 위반 (역방향 의존성)

xPipe 패키지 내부에서 외부(AIMS) 도메인을 직접 참조하는 코드.

| # | 파일 | 위반 | 심각도 |
|---|------|------|--------|
| 1 | `console/web/server.py:243` | `from insurance.adapter import InsuranceDomainAdapter` | **CRITICAL** |
| 2 | `cli.py:98` | `importlib.import_module("insurance.adapter")` | **HIGH** |
| 3 | `tests/test_regression.py:48` | `from insurance.adapter import InsuranceDomainAdapter` | MEDIUM |
| 4 | `tests/test_testing.py:13` | `from insurance.adapter import InsuranceDomainAdapter` | MEDIUM |

**개선**: 어댑터 경로 하드코딩 제거 → 플러그인 레지스트리 또는 설정 주입 방식으로 전환

---

## 4. Provider 추상화 미사용

ABC가 정의되어 있지만, 내장 스테이지에서 직접 호출하고 있는 문제.

| 스테이지 | 외부 서비스 | Provider ABC | 실제 사용 |
|----------|-----------|-------------|----------|
| ClassifyStage | OpenAI Chat | `LLMProvider` 정의됨 | **미사용** — `AsyncOpenAI` 직접 호출 |
| EmbedStage | OpenAI Embedding | `EmbeddingProvider` 정의됨 | **미사용** — `AsyncOpenAI` 직접 호출 |
| ExtractStage | Upstage OCR | `OCRProvider` 정의됨 | **부분 사용** — ProviderRegistry 우선 + fallback 직접 생성 |
| ConvertStage | pdf_converter | 없음 | `localhost:8005` 하드코딩 |

**개선**: ClassifyStage/EmbedStage를 ProviderRegistry 경유로 전환. ConvertStage URL을 config 주입.

---

## 5. 환경변수 직접 참조

xPipe 코어가 특정 환경변수 이름을 직접 알고 있는 문제.

| 환경변수 | 파일 | 문제 |
|----------|------|------|
| `OPENAI_API_KEY` | `classify.py:111`, `embed.py:87`, `server.py:109` | OpenAI 전용 — Provider 내부에서만 참조해야 함 |
| `UPSTAGE_API_KEY` | `providers.py:155` | Provider 구현체가 코어에 위치 |
| `XPIPE_QUALITY_GATE` | `quality.py:121` | xPipe 자체 설정이나 런타임 중 동적 참조 |
| `XPIPE_DEMO_PORT` | `server.py:1430` | 허용 가능 |

**개선**:
- context 주입을 1순위로, `os.environ` fallback 제거
- Provider 구현체(`UpstageOCRProvider`)를 코어에서 사용자 영역으로 이동

---

## 6. 하드코딩된 경로/URL

| 위치 | 하드코딩 값 | 문제 |
|------|-----------|------|
| `server.py:59~65` | `~/aims/.env.shared` | AIMS 배포 환경 전용 경로 |
| `convert.py:148` | `http://localhost:8005/convert` | AIMS pdf_converter 주소 |
| `classify.py:61` | `gpt-4.1-mini` | 기본 모델명 |
| `classify.py:127` | 텍스트 3000자, temperature=0 | LLM 파라미터 |
| `providers.py:147` | `https://api.upstage.ai/...` | Upstage 엔드포인트 |

**개선**: 모두 config/context 주입으로 전환

---

## 7. 글로벌 상태

| 파일 | 글로벌 상태 | 문제 |
|------|-----------|------|
| `server.py:97~138` | 11개 모듈 레벨 변수 (`documents`, `sse_events`, `event_bus` 등) | 테스트 격리 불가, 병렬 실행 불가, 복수 인스턴스 불가 |
| `server.py:85` | `_load_env_files()` 즉시 실행 | import 시 side effect |
| `server.py` 내 `global` 키워드 | `_running_count` 등 직접 변경 | 상태 캡슐화 위반 |

**개선**: 전역 변수 → `ServerState` 클래스로 캡슐화, side effect import 제거

---

## 8. AIMS 특화 코드가 코어에 잔존

| 위치 | 내용 |
|------|------|
| `pipeline_presets.py:24` | `AIMS_INSURANCE_PRESET`, `"aims-insurance"` 프리셋 이름 |
| `store.py:26~27` | docstring에 MongoDB 컬렉션명(`files`, `errors`) |
| `queue.py:11~13` | docstring에 Redis Stream 매핑 (`ocr_stream`) |
| `stages/extract.py` | AIMS 호환 필드명 (`meta_status`, `has_text`) |
| `stages/ingest.py` | AIMS 호환 필드명 (`originalName`) |

**개선**: 프리셋 이름 범용화, AIMS 상세 주석 제거, 필드명을 범용으로 변경하고 매핑은 어댑터에서 처리

---

## 9. 패키지 의존성 선언 누락

`pyproject.toml`에 `dependencies = []`로 선언되어 있으나, 내장 스테이지가 런타임에 필요로 하는 패키지:

| 패키지 | 사용 위치 | 필요 조건 |
|--------|----------|----------|
| `openai` | classify, embed, server | LLM/Embedding 스테이지 사용 시 |
| `httpx` | providers, convert, server | OCR/변환 스테이지 사용 시 |
| `pdfplumber` | extract | PDF 텍스트 추출 시 |
| `fastapi` + `uvicorn` | server | xPipeWeb 사용 시 |
| `pydantic` | server | xPipeWeb 사용 시 |

**개선**: `[project.optional-dependencies]` 섹션에 extras로 분리 선언
```toml
[project.optional-dependencies]
stages = ["openai", "httpx", "pdfplumber"]
web = ["fastapi", "uvicorn", "pydantic"]
all = ["openai", "httpx", "pdfplumber", "fastapi", "uvicorn", "pydantic"]
```

---

## 10. 내장 스테이지 미export

`__init__.py`에서 내장 스테이지(`IngestStage`, `ExtractStage`, `ClassifyStage` 등 7개)를 export하지 않아, 외부 소비자가 서브모듈을 직접 import해야 함.

```python
# 현재: 서브모듈 직접 import 필요
from xpipe.stages.extract import ExtractStage

# 개선안: __init__.py에서 export
from xpipe import ExtractStage
```

---

## 11. 개선 우선순위

| 순위 | 항목 | 심각도 | 작업량 |
|------|------|--------|--------|
| **1** | server.py의 insurance import → 플러그인 방식 | CRITICAL | 중 |
| **2** | ClassifyStage/EmbedStage → ProviderRegistry 경유 | HIGH | 중 |
| **3** | ConvertStage URL → config 주입 | HIGH | 소 |
| **4** | cli.py의 insurance 하드코딩 제거 | HIGH | 소 |
| **5** | server.py 글로벌 상태 → ServerState 캡슐화 | HIGH | 대 |
| **6** | pyproject.toml optional-dependencies 선언 | MEDIUM | 소 |
| **7** | 환경변수 fallback 제거, context 주입 통일 | MEDIUM | 중 |
| **8** | Provider 구현체(Upstage) 코어에서 분리 | MEDIUM | 소 |
| **9** | 내장 스테이지 `__init__.py` export | MEDIUM | 소 |
| **10** | 프리셋 이름 범용화 + AIMS 주석 제거 | LOW | 소 |
| **11** | 테스트의 insurance import → MockAdapter 교체 | LOW | 소 |

---

## 12. 목표 구조 (개선 후)

```
xpipe/                          ← pip install xpipe
  __init__.py                   ← 모든 Public API export
  adapter.py                    ← DomainAdapter ABC
  pipeline.py                   ← Pipeline 엔진
  stage.py                      ← Stage ABC
  store.py                      ← DocumentStore ABC
  queue.py                      ← JobQueue ABC
  events.py                     ← EventBus
  audit.py                      ← AuditLog
  cost_tracker.py               ← CostTracker
  quality.py                    ← QualityGate
  scheduler.py                  ← Scheduler
  providers.py                  ← LLMProvider/OCRProvider/EmbeddingProvider ABC만
  stages/                       ← 내장 스테이지 (ProviderRegistry 경유)
    ingest.py, extract.py, classify.py, embed.py, ...
  console/web/                  ← xPipeWeb (ServerState 캡슐화, 어댑터 플러그인)
  tests/                        ← MockAdapter 사용

사용자 영역 (xPipe 외부):
  insurance/adapter.py          ← InsuranceDomainAdapter (AIMS 전용)
  providers/openai.py           ← OpenAI LLM/Embedding Provider
  providers/upstage.py          ← Upstage OCR Provider
```

---

## 13. 참조

- [xPipe 레이어 아키텍처](XPIPE_LAYER_ARCHITECTURE.md)
- [xPipe × AIMS 통합 보고서](2026-03-24_XPIPE_AIMS_INTEGRATION_REPORT.md)
- [xPipe 모듈화 전략](XPIPE_MODULARIZATION_STRATEGY.md)
