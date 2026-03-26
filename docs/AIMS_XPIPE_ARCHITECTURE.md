# AIMS × xPipe 아키텍처

**작성일**: 2026-03-27
**상태**: 현행 아키텍처 + 설계 원칙 + 진화 방향

> 이 문서는 AIMS와 xPipe의 관계, 각 레이어의 책임, 그리고 설계 결정의 근거를 기술한다.
> 코드를 수정하기 전에 이 문서를 읽고, 변경이 아키텍처 원칙에 부합하는지 확인할 것.

---

## 1. 핵심 개념

```
xPipe = 범용 문서 처리 파이프라인 엔진
AIMS = xPipe 위에 보험 도메인 어댑터를 얹은 하나의 사이트
```

**xPipe는 독립적이다.** AIMS가 없어도 xPipe는 동작한다. 다른 사이트(법률, 의료, 금융 등)에서도 도메인 어댑터만 교체하면 xPipe를 그대로 사용할 수 있어야 한다.

**AIMS는 소비자다.** xPipe의 기능을 사용하되, xPipe의 코어 로직에 의존하지 xPipe가 AIMS에 의존해서는 안 된다.

---

## 2. 레이어 구조

```
┌─────────────────────────────────────────────────┐
│  사이트 레이어 (소비자)                              │
│                                                 │
│  AIMS                    │  향후 다른 사이트        │
│  - document_pipeline     │  - LegalPipe 등        │
│  - InsuranceAdapter      │  - LegalAdapter 등     │
│  - 접착(파일저장, DB,     │                        │
│    SSE, 고객연결)         │                        │
├─────────────────────────────────────────────────┤
│  xPipe 코어 (엔진)                                │
│                                                 │
│  Pipeline, Stage, DomainAdapter ABC             │
│  EventBus, CostTracker, QualityGate, Scheduler  │
│  ProviderRegistry (LLM, OCR, Embedding)         │
│  MIME 판단, 변환, 텍스트 추출, 분류, 임베딩         │
└─────────────────────────────────────────────────┘
```

### 의존 방향

```
AIMS → xPipe 코어     (허용: AIMS가 xPipe를 사용)
xPipe 코어 → AIMS     (금지: xPipe가 AIMS에 의존)
xPipe 코어 → 외부 패키지 (최소화: 표준 라이브러리 우선)
```

---

## 3. 로직 소유 원칙

### xPipe가 소유하는 것 (파이프라인 코어)

어떤 사이트에서든 문서를 처리하려면 필요한 로직:

| 영역 | 예시 | 위치 |
|------|------|------|
| MIME 판단 | "이 파일을 PDF로 변환할 수 있는가?" | `xpipe/stages/convert.py` |
| 텍스트 추출 | pdfplumber, OCR, 직접 읽기 | `xpipe/stages/extract.py` |
| PDF 변환 | LibreOffice 경유 변환 | `xpipe/stages/convert.py` |
| AI 분류 | LLM 기반 문서 분류 | `xpipe/stages/classify.py` |
| 임베딩 | 벡터 변환 + 저장 | `xpipe/stages/embed.py` |
| 파이프라인 흐름 | 스테이지 실행, 이벤트, 비용 추적 | `xpipe/pipeline.py` 등 |
| Provider 추상화 | LLM, OCR, Embedding 교체 가능 | `xpipe/providers.py` |

### AIMS가 소유하는 것 (사이트/도메인)

보험 업계 특화 로직, AIMS 서비스 운영에 필요한 것:

| 영역 | 예시 | 위치 |
|------|------|------|
| 도메인 어댑터 | AR/CRS 감지, 보험 분류 체계 | `insurance/adapter.py` |
| 접착 계층 | 파일 저장, MongoDB 매핑, SSE 알림 | `document_pipeline/` |
| 후처리 | 고객 연결, displayName 생성 | `document_pipeline/` |
| 상태 관리 | overallStatus, credit_pending | `document_pipeline/` |
| 비즈니스 규칙 | 크레딧 체크, 쿼터 관리 | `document_pipeline/` |

### 판단 기준

> **"다른 사이트에서도 이 로직이 필요한가?"**
>
> - Yes → xPipe 코어에 있어야 한다
> - No → AIMS(사이트) 레이어에 있어야 한다

예시:
- "HWP를 PDF로 변환할 수 있는가?" → **Yes** → xPipe
- "이 문서가 MetLife Annual Report인가?" → **No** → AIMS (InsuranceAdapter)
- "변환 대상 파일의 overallStatus를 conversion_pending으로 설정" → 상태 전이 자체는 **접착 계층**, 변환 대상 판단은 **xPipe**

---

## 4. 어댑터 패턴

xPipe는 도메인 로직을 모른다. 어댑터를 통해 주입받는다.

```python
# xPipe 코어 — 어댑터 인터페이스만 정의
class DomainAdapter(ABC):
    def get_classification_config(self) -> dict: ...
    def detect_special_documents(self, text, metadata) -> dict: ...
    def resolve_entity(self, text, metadata) -> dict: ...
    def generate_display_name(self, metadata) -> str: ...
    def on_stage_complete(self, stage_name, result) -> HookResult: ...

# AIMS — 보험 도메인 구현
class InsuranceDomainAdapter(DomainAdapter):
    # AR/CRS 감지, 보험 문서 22개 유형 분류, 고객 연결 등

# 향후 — 법률 도메인 구현
class LegalDomainAdapter(DomainAdapter):
    # 계약서 감지, 법률 문서 분류, 당사자 연결 등
```

---

## 5. 엔진 전환

`PIPELINE_ENGINE` 환경변수로 xPipe / legacy 즉시 전환.

```
process_document_pipeline()
  ├─ PIPELINE_ENGINE=xpipe   → _process_via_xpipe()   (현재 기본)
  └─ PIPELINE_ENGINE=legacy  → _process_via_legacy()   (삭제 예정)
```

레거시 코드는 xPipe 안정 운영 확인 후 **전면 삭제** 예정. 레거시에만 있는 로직은 xPipe로 이관하고, 레거시에 의존하는 코드는 xPipe 코어로 전환해야 한다.

---

## 6. 현재 아키텍처 이슈

### 해결됨

| # | 이슈 | 해결 |
|---|------|------|
| 1 | server.py insurance 직접 import | 플러그인 동적 로드로 전환 (`17ccb8d3`) |
| 2 | ClassifyStage/EmbedStage OpenAI 직접 호출 | ProviderRegistry 경유 (`17ccb8d3`) |
| 3 | 환경변수 직접 참조 | context 주입 통일 (`09c207f6`) |
| 4 | 보험 도메인 흔적 | 전면 제거 (`a14b15d9`) |

### 진행 중

| # | 이슈 | 상태 | 설계 방향 |
|---|------|------|----------|
| 5 | `doc_prep_main.py`의 `_is_convertible_mime` 로컬 함수 | **이번 작업** | xPipe 코어(`xpipe/stages/convert.py`)에 이미 정의됨 → import로 교체 |
| 6 | 레거시 `pdf_conversion_text_service.py`의 `CONVERTIBLE_MIMES` | **이번 작업** | xPipe 코어에서 import로 교체 (레거시 삭제 전까지 하위 호환) |
| 7 | 후처리 오케스트레이션이 document_pipeline에 잔존 | 보류 | xPipe 코어 내부로 이동하여 document_pipeline을 순수 접착 계층으로 |
| 8 | `import shutil` 함수 내 중복 | **이번 작업** | 파일 상단으로 이동 |
| 9 | 일반/xPipe 경로 필드 불일치 | **이번 작업** | 일관성 확보 |

---

## 7. 진화 방향

### 단기 (현재)
- xPipe 코어에 이미 정의된 `CONVERTIBLE_MIMES`를 AIMS 레이어에서 import하여 사용
- 레거시 경로의 중복 정의 제거
- document_pipeline은 접착+오케스트레이션, xPipe는 코어 판단

### 중기
- 후처리 오케스트레이션을 xPipe 코어 내부로 이동
- document_pipeline → 순수 접착 계층 (파일 저장, DB, SSE)
- 레거시 경로(`_process_via_legacy`) 삭제

### 장기
- xPipe를 `pip install xpipe`로 설치 가능한 독립 패키지로 배포
- 다른 도메인(법률, 의료 등) 어댑터 PoC
- 멀티테넌시 지원

---

## 8. 참조

| 문서 | 내용 |
|------|------|
| [XPIPE_LAYER_ARCHITECTURE.md](XPIPE_LAYER_ARCHITECTURE.md) | 레이어 상세 구조 + 어댑터 인터페이스 |
| [XPIPE_MODULARIZATION_ANALYSIS.md](XPIPE_MODULARIZATION_ANALYSIS.md) | 모듈 경계 위반 분석 |
| [XPIPE_REFACTORING_PLAN.md](XPIPE_REFACTORING_PLAN.md) | 리팩토링 실행 이력 |
| [XPIPE_DISCUSSION_LOG.md](XPIPE_DISCUSSION_LOG.md) | 의사결정 토의 기록 |
