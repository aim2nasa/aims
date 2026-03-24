# xPipe 사용자 매뉴얼

> **xPipe v0.1.0** -- 도메인 무관 문서 처리 파이프라인 엔진

---

## 목차

1. [개요](#1-개요)
2. [설치](#2-설치)
3. [Quick Start](#3-quick-start)
4. [핵심 개념](#4-핵심-개념)
5. [DomainAdapter 구현 가이드](#5-domainadapter-구현-가이드)
6. [Provider 등록 가이드](#6-provider-등록-가이드)
7. [커스텀 스테이지 작성](#7-커스텀-스테이지-작성)
8. [설정 주입](#8-설정-주입)
9. [부가 시스템](#9-부가-시스템)
10. [xPipeWeb (데모 서버)](#10-xpipeweb-데모-서버)
11. [동작 확인 방법](#11-동작-확인-방법)
12. [API Reference](#12-api-reference)
13. [버전 정책](#13-버전-정책)

---

## 1. 개요

### xPipe란?

xPipe는 **도메인 무관(domain-agnostic) 문서 처리 파이프라인 엔진**입니다. 문서의 수신, 텍스트 추출, AI 분류, 특수 문서 감지, 벡터 임베딩까지의 전체 처리 흐름을 선언적으로 정의하고 실행합니다.

xPipe 코어는 어떤 도메인(보험, 법률, 의료 등)도 알지 못합니다. 도메인별 로직은 `DomainAdapter`를 구현하여 외부에서 주입합니다.

### 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **코어는 도메인을 모른다** | 분류 체계, 특수 문서 규칙 등 도메인 로직은 어댑터가 제공 |
| **표준 라이브러리만 사용** | 코어 패키지는 외부 의존성 0개. AI/OCR Provider는 optional |
| **선언적 파이프라인** | JSON/YAML로 스테이지 순서, 조건, 파라미터를 정의 |
| **어댑터 패턴** | DomainAdapter, DocumentStore, JobQueue, Provider ABC로 확장 |
| **stub/real 모드** | 외부 서비스 없이 stub 모드로 테스트 가능 |

### 아키텍처 다이어그램

```
                    +---------------------+
                    |   호스트 애플리케이션  |
                    | (도메인별 어댑터 구현) |
                    +----------+----------+
                               |
                    DomainAdapter 주입
                               |
              +----------------v-----------------+
              |          xPipe 코어 엔진          |
              |                                   |
              |  Pipeline                         |
              |    |-- IngestStage    (파일 수신)  |
              |    |-- ConvertStage   (PDF 변환)   |
              |    |-- ExtractStage   (텍스트 추출)|
              |    |-- ClassifyStage  (AI 분류)    |
              |    |-- DetectSpecialStage (특수감지)|
              |    |-- EmbedStage     (벡터 임베딩)|
              |    +-- CompleteStage  (완료 처리)  |
              |                                   |
              |  ProviderRegistry                 |
              |    |-- LLMProvider                 |
              |    |-- OCRProvider                 |
              |    +-- EmbeddingProvider           |
              |                                   |
              |  EventBus | AuditLog | CostTracker|
              +-----------------------------------+
                               |
              +----------------v-----------------+
              |        인프라 ABC (교체 가능)      |
              |  DocumentStore | JobQueue         |
              +-----------------------------------+
```

---

## 2. 설치

### 요구사항

- **Python 3.10** 이상

### pip install

```bash
# 코어만 설치 (외부 의존성 없음)
pip install -e backend/api/document_pipeline/xpipe/

# AI/OCR 스테이지 포함 (openai, httpx, pdfplumber)
pip install -e "backend/api/document_pipeline/xpipe/[stages]"

# 웹 데모 서버 포함 (fastapi, uvicorn, pydantic)
pip install -e "backend/api/document_pipeline/xpipe/[web]"

# 전체 설치
pip install -e "backend/api/document_pipeline/xpipe/[all]"
```

### Optional Dependencies

| 그룹 | 패키지 | 용도 |
|------|--------|------|
| `stages` | `openai`, `httpx`, `pdfplumber` | AI 분류, OCR, PDF 텍스트 추출 |
| `web` | `fastapi`, `uvicorn`, `pydantic` | xPipeWeb 데모 서버 |
| `all` | 위 전체 | 모든 기능 |

---

## 3. Quick Start

### 3.1 stub 모드 -- 외부 서비스 없이 5분 안에 첫 파이프라인 실행

```python
import asyncio
from xpipe import (
    Pipeline, PipelineDefinition, StageConfig,
    IngestStage, ExtractStage, ClassifyStage,
    DetectSpecialStage, EmbedStage, CompleteStage,
    get_preset,
)


async def main():
    # 1. 프리셋으로 파이프라인 정의 로드
    definition_dict = get_preset("minimal")  # ingest → extract → complete
    pipeline = Pipeline.from_dict(definition_dict)

    # 2. 스테이지 등록
    pipeline.register_stage("ingest", IngestStage)
    pipeline.register_stage("extract", ExtractStage)
    pipeline.register_stage("complete", CompleteStage)

    # 3. 실행 (stub 모드)
    context = {
        "file_path": "/tmp/sample.txt",
        "filename": "sample.txt",
        "mode": "stub",
    }
    result = await pipeline.run(context)

    # 4. 결과 확인
    print(f"상태: {result['status']}")
    print(f"표시명: {result['display_name']}")
    print(f"실행된 스테이지: {result['_pipeline']['stages_executed']}")


asyncio.run(main())
```

### 3.2 standard 프리셋 -- 7단계 전체 파이프라인

```python
import asyncio
from xpipe import (
    Pipeline, get_preset,
    IngestStage, ConvertStage, ExtractStage, ClassifyStage,
    DetectSpecialStage, EmbedStage, CompleteStage,
)


async def main():
    # standard 프리셋: ingest → convert → extract → classify →
    #                   detect_special → embed → complete
    pipeline = Pipeline.from_dict(get_preset("standard"))

    # 모든 내장 스테이지 등록
    for name, cls in [
        ("ingest", IngestStage),
        ("convert", ConvertStage),
        ("extract", ExtractStage),
        ("classify", ClassifyStage),
        ("detect_special", DetectSpecialStage),
        ("embed", EmbedStage),
        ("complete", CompleteStage),
    ]:
        pipeline.register_stage(name, cls)

    result = await pipeline.run({
        "file_path": "/tmp/document.pdf",
        "filename": "document.pdf",
        "mode": "stub",
    })

    # stage_data에 각 스테이지의 입출력이 기록됨
    for stage_name, data in result.get("stage_data", {}).items():
        print(f"[{stage_name}] {data.get('status')} ({data.get('duration_ms')}ms)")


asyncio.run(main())
```

### 3.3 real 모드 -- 실제 AI/OCR 서비스 연동

```python
import asyncio
from xpipe import (
    Pipeline, get_preset, ProviderRegistry,
    IngestStage, ExtractStage, ClassifyStage,
    DetectSpecialStage, EmbedStage, CompleteStage,
)
from xpipe.providers_builtin import (
    OpenAILLMProvider,
    OpenAIEmbeddingProvider,
    UpstageOCRProvider,
)


async def main():
    # Provider 등록
    registry = ProviderRegistry()
    registry.register("llm", OpenAILLMProvider(api_key="sk-..."), priority=10)
    registry.register("ocr", UpstageOCRProvider(api_key="up-..."), priority=10)
    registry.register("embedding", OpenAIEmbeddingProvider(api_key="sk-..."), priority=10)

    # 파이프라인 구성
    pipeline = Pipeline.from_dict(get_preset("standard"))
    for name, cls in [
        ("ingest", IngestStage),
        ("extract", ExtractStage),
        ("classify", ClassifyStage),
        ("detect_special", DetectSpecialStage),
        ("embed", EmbedStage),
        ("complete", CompleteStage),
    ]:
        pipeline.register_stage(name, cls)

    # real 모드 실행 (분류 설정 포함)
    result = await pipeline.run({
        "file_path": "/tmp/document.pdf",
        "filename": "document.pdf",
        "mode": "real",
        "_provider_registry": registry,
        "_classify_config": {
            "system_prompt": "다음 문서를 분류하세요.",
            "categories": ["계약서", "보고서", "영수증", "일반문서"],
        },
    })

    print(f"분류 결과: {result.get('document_type')}")
    print(f"신뢰도: {result.get('classification_confidence')}")


asyncio.run(main())
```

---

## 4. 핵심 개념

### 4.1 Pipeline

`Pipeline`은 `PipelineDefinition`에 따라 스테이지를 순서대로 실행하는 엔진입니다.

```python
definition = PipelineDefinition(
    name="my-pipeline",
    stages=[
        StageConfig(name="ingest"),
        StageConfig(name="extract"),
        StageConfig(name="classify", skip_if="!has_text"),  # 텍스트 없으면 스킵
        StageConfig(name="complete"),
    ],
)
pipeline = Pipeline(definition)
```

**주요 특성:**
- 스테이지는 `register_stage()`로 사전 등록해야 합니다.
- `run(context)`로 실행하면 모든 스테이지를 순서대로 처리합니다.
- `validate()`로 정의의 유효성만 사전 검증할 수 있습니다 (dry-run).
- `from_dict()`, `from_json()`, `from_yaml()` 팩토리 메서드를 제공합니다.

### 4.2 Stage

모든 스테이지는 `Stage` ABC를 구현합니다.

```python
class Stage(ABC):
    @abstractmethod
    def get_name(self) -> str: ...

    @abstractmethod
    async def execute(self, context: dict[str, Any]) -> dict[str, Any]: ...

    def should_skip(self, context: dict[str, Any]) -> bool:
        return False  # 기본: 스킵하지 않음
```

**스킵 메커니즘 (2단계):**
1. `StageConfig.skip_if` -- 파이프라인 정의 수준. context 키의 truthy/falsy 체크.
   - `"has_text"`: context["has_text"]가 truthy면 스킵
   - `"!has_text"`: context["has_text"]가 falsy면 스킵
2. `Stage.should_skip()` -- 스테이지 코드 수준. 복잡한 조건 가능.

### 4.3 DomainAdapter

도메인별 로직을 xPipe 코어에 주입하는 플러그인 인터페이스입니다.

```
xPipe 코어 ──(호출)──> DomainAdapter ──(반환)──> config/결과
```

코어는 어댑터에게 "분류 설정을 주세요", "특수 문서인지 확인해주세요" 등을 요청하고, 어댑터가 도메인 지식을 기반으로 응답합니다. AI 호출 자체는 코어가 관리합니다.

### 4.4 Provider

AI/OCR 서비스를 래핑하는 인터페이스입니다.

| ABC | 역할 | 메서드 |
|-----|------|--------|
| `LLMProvider` | LLM 완성 (분류/요약) | `complete(system_prompt, user_prompt, **kwargs)` |
| `OCRProvider` | OCR 텍스트 인식 | `process(file_path, **kwargs)` |
| `EmbeddingProvider` | 벡터 임베딩 생성 | `embed(texts, **kwargs)` |

`ProviderRegistry`를 통해 역할(role)별로 여러 Provider를 priority 기반으로 등록하고, 자동 폴백을 지원합니다.

### 4.5 context dict

파이프라인의 모든 스테이지가 공유하는 상태 dict입니다. 각 스테이지는 context를 받아 처리 결과를 추가하고 반환합니다.

**주요 키:**

| 키 | 설정 주체 | 설명 |
|----|-----------|------|
| `file_path` | 호출자 | 처리할 파일 경로 |
| `filename` | 호출자 | 원본 파일명 |
| `mode` | 호출자 | `"stub"` 또는 `"real"` |
| `_api_keys` | 호출자 | Provider API 키 dict (`{"openai": "sk-...", "upstage": "up-..."}`) |
| `_provider_registry` | 호출자 | `ProviderRegistry` 인스턴스 |
| `_domain_adapter` | 호출자 | `DomainAdapter` 인스턴스 |
| `_classify_config` | 호출자/어댑터 | 분류 프롬프트, 카테고리 등 |
| `_converter_url` | 호출자 | PDF 변환 서비스 URL |
| `models` | 호출자 | 모델명 dict (`{"llm": "gpt-4.1-mini", "ocr": "upstage", "embedding": "text-embedding-3-small"}`) |
| `mime_type` | IngestStage | 감지된 MIME 타입 |
| `file_size` | IngestStage | 파일 크기 (bytes) |
| `extracted_text` | ExtractStage | 추출된 텍스트 |
| `has_text` | ExtractStage | 텍스트 존재 여부 |
| `document_type` | ClassifyStage | 분류 결과 |
| `classification_confidence` | ClassifyStage | 분류 신뢰도 (0~1) |
| `special_detected` | DetectSpecialStage | 특수 문서 감지 여부 (bool) |
| `detections` | DetectSpecialStage | 특수 문서 감지 결과 리스트 |
| `embedded` | EmbedStage | 임베딩 완료 여부 |
| `status` | CompleteStage | 최종 상태 (`"completed"`) |
| `display_name` | CompleteStage | 생성된 표시명 |
| `stage_data` | 각 스테이지 | 스테이지별 입출력 상세 기록 |
| `_pipeline` | Pipeline | 파이프라인 메타데이터 (실행/스킵된 스테이지 목록, 에러) |

### 4.6 실행 흐름

```
ingest → convert → extract → classify → detect_special → embed → complete
  |         |         |          |             |            |        |
  |    (skip_if:     (skip_if:   |      (adapter 또는   (skip_if:  |
  |  !needs_         has_text)   |       rules로 감지) credit_    |
  |  conversion)                 |                     pending)   |
  v         v         v          v             v            v        v
파일수신  PDF변환   텍스트추출  AI분류    특수문서감지   벡터임베딩  완료처리
```

---

## 5. DomainAdapter 구현 가이드

### 5.1 ABC 인터페이스 전체 메서드

| 메서드 | 종류 | 설명 |
|--------|------|------|
| `get_classification_config()` | **abstract** | 분류 체계 + 프롬프트 반환 |
| `detect_special_documents(text, mime_type, filename)` | **abstract** | 특수 문서 감지 |
| `resolve_entity(detection, owner_id)` | **abstract** | 감지된 엔티티 연결 |
| `extract_domain_metadata(text, filename)` | **abstract** | 도메인 특화 메타데이터 추출 |
| `generate_display_name(doc, detection)` | **abstract** | 문서 표시명 생성 |
| `on_stage_complete(stage, doc, context)` | **abstract** | 단계 완료 후 후속 액션 |
| `validate_document(filename, mime_type, file_size)` | 선택적 | 업로드 전 유효성 검증 (기본: 항상 유효) |
| `on_before_ai_call(call_type, params)` | 선택적 | AI 호출 직전 후크 (기본: params 그대로 반환) |

### 5.2 최소 구현 예제

분류와 특수 문서 감지만 필요한 경우:

```python
from xpipe import (
    DomainAdapter, ClassificationConfig, Category,
    Detection, HookResult,
)
from typing import Any, Optional


class MinimalAdapter(DomainAdapter):
    """최소한의 어댑터 구현 예제"""

    async def get_classification_config(self) -> ClassificationConfig:
        return ClassificationConfig(
            categories=[
                Category(code="contract", name="계약서"),
                Category(code="report", name="보고서"),
                Category(code="receipt", name="영수증"),
                Category(code="general", name="일반문서"),
            ],
            prompt_template=(
                "다음 문서를 분류하세요.\n"
                "카테고리: 계약서, 보고서, 영수증, 일반문서\n\n"
                "문서 텍스트:\n{text}\n\n"
                'JSON 형식으로 응답: {{"type": "분류결과", "confidence": 0.0~1.0}}'
            ),
            valid_types=["contract", "report", "receipt", "general"],
        )

    async def detect_special_documents(
        self, text: str, mime_type: str, filename: str = "",
    ) -> list[Detection]:
        # 특수 문서 감지가 필요 없으면 빈 리스트 반환
        return []

    async def resolve_entity(
        self, detection: Detection, owner_id: str,
    ) -> dict[str, Any]:
        return {"matched": False, "reason": "not_implemented"}

    async def extract_domain_metadata(
        self, text: str, filename: str,
    ) -> dict[str, Any]:
        return {}

    async def generate_display_name(
        self, doc: dict[str, Any], detection: Optional[Detection] = None,
    ) -> str:
        return ""  # 빈 문자열 → 코어가 기본 규칙 적용

    async def on_stage_complete(
        self, stage: str, doc: dict[str, Any], context: dict[str, Any],
    ) -> list[HookResult]:
        return []
```

### 5.3 전체 구현 예제

```python
from xpipe import (
    DomainAdapter, ClassificationConfig, Category,
    Detection, HookResult, StageHookAction,
)
from typing import Any, Optional


class LegalDocAdapter(DomainAdapter):
    """법률 도메인 어댑터 예제"""

    async def get_classification_config(self) -> ClassificationConfig:
        return ClassificationConfig(
            categories=[
                Category(code="contract", name="계약서", parent="legal"),
                Category(code="lawsuit", name="소장", parent="legal"),
                Category(code="ruling", name="판결문", parent="legal"),
                Category(code="opinion", name="법률의견서", parent="legal"),
                Category(code="general", name="일반문서"),
            ],
            prompt_template=(
                "법률 문서 분류 전문가로서 다음 문서를 분류하세요.\n\n"
                "카테고리:\n"
                "- contract: 계약서 (임대차, 매매, 용역 등)\n"
                "- lawsuit: 소장\n"
                "- ruling: 판결문\n"
                "- opinion: 법률의견서\n"
                "- general: 위에 해당하지 않는 일반 문서\n\n"
                "문서 텍스트:\n{text}\n\n"
                'JSON 형식: {{"type": "코드", "confidence": 0.0~1.0}}'
            ),
            valid_types=["contract", "lawsuit", "ruling", "opinion", "general"],
            extra={
                "require_text_for_classification": True,
            },
        )

    async def detect_special_documents(
        self, text: str, mime_type: str, filename: str = "",
    ) -> list[Detection]:
        detections = []
        text_lower = text.lower()

        # 판결문 패턴 감지
        if "판결" in text and "선고" in text and "사건" in text:
            detections.append(Detection(
                doc_type="ruling",
                confidence=0.9,
                metadata={"pattern": "ruling_keywords"},
            ))

        # 계약서 패턴 감지
        if "계약" in text_lower and ("갑" in text and "을" in text):
            detections.append(Detection(
                doc_type="contract",
                confidence=0.85,
                metadata={"pattern": "contract_parties"},
            ))

        return detections

    async def resolve_entity(
        self, detection: Detection, owner_id: str,
    ) -> dict[str, Any]:
        # 판결문에서 사건 번호 추출 등
        if detection.doc_type == "ruling":
            case_number = detection.metadata.get("case_number", "")
            if case_number:
                return {
                    "entity_id": case_number,
                    "entity_name": f"사건 {case_number}",
                    "matched": True,
                }
        return {"matched": False, "reason": "entity_not_found"}

    async def extract_domain_metadata(
        self, text: str, filename: str,
    ) -> dict[str, Any]:
        # 법률 문서에서 날짜, 당사자 등 추출
        metadata = {}
        if "원고" in text:
            metadata["has_plaintiff"] = True
        if "피고" in text:
            metadata["has_defendant"] = True
        return metadata

    async def generate_display_name(
        self, doc: dict[str, Any], detection: Optional[Detection] = None,
    ) -> str:
        doc_type = doc.get("document_type", "")
        filename = doc.get("filename", "")
        if detection and detection.doc_type == "ruling":
            case_num = detection.metadata.get("case_number", "")
            if case_num:
                return f"[판결문] {case_num}"
        if doc_type:
            type_names = {
                "contract": "계약서",
                "lawsuit": "소장",
                "ruling": "판결문",
                "opinion": "법률의견서",
            }
            name = type_names.get(doc_type, doc_type)
            return f"[{name}] {filename}"
        return ""

    async def on_stage_complete(
        self, stage: str, doc: dict[str, Any], context: dict[str, Any],
    ) -> list[HookResult]:
        results = []
        if stage == "classify" and doc.get("document_type") == "ruling":
            # 판결문 감지 시 전용 처리 트리거
            results.append(HookResult(
                action=StageHookAction.TRIGGER_PROCESS,
                payload={"process": "ruling_parser", "doc_id": doc.get("_id")},
            ))
        if stage == "complete":
            # 처리 완료 시 알림
            results.append(HookResult(
                action=StageHookAction.NOTIFY,
                payload={"channel": "websocket", "message": "문서 처리 완료"},
            ))
        return results
```

### 5.4 HookResult 사용법

`on_stage_complete()`에서 반환하는 `HookResult`의 액션 유형:

| StageHookAction | 설명 | payload 예시 |
|-----------------|------|-------------|
| `NOTIFY` | 알림 전송 (SSE, 웹훅 등) | `{"channel": "websocket", "message": "..."}` |
| `UPDATE_STATUS` | 문서 상태 변경 | `{"status": "review_required"}` |
| `TRIGGER_PROCESS` | 추가 처리 트리거 | `{"process": "special_parser"}` |
| `SKIP_REMAINING` | 이후 단계 스킵 | `{"reason": "no_further_processing"}` |
| `NOOP` | 아무것도 하지 않음 | `{}` |

### 5.5 하위 호환성 원칙

- 신규 메서드 추가 시 반드시 기본 구현(no-op)이 함께 제공됩니다.
- 기존 abstract 메서드 시그니처는 변경되지 않습니다.
- 기존 어댑터 구현체는 새 버전에서도 수정 없이 동작합니다.

---

## 6. Provider 등록 가이드

### 6.1 Provider ABC

#### LLMProvider

```python
class LLMProvider(ABC):
    @abstractmethod
    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """반환: {"content": str, "usage": {"input_tokens": int, "output_tokens": int}, "model": str}"""
        ...

    @abstractmethod
    def get_name(self) -> str: ...

    @abstractmethod
    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float: ...
```

#### OCRProvider

```python
class OCRProvider(ABC):
    @abstractmethod
    async def process(
        self,
        file_path: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """반환: {"text": str, "pages": int, "confidence": float}"""
        ...

    @abstractmethod
    def get_name(self) -> str: ...
```

#### EmbeddingProvider

```python
class EmbeddingProvider(ABC):
    @abstractmethod
    async def embed(
        self,
        texts: list[str],
        **kwargs: Any,
    ) -> list[list[float]]: ...

    @abstractmethod
    def get_name(self) -> str: ...

    @abstractmethod
    def get_dimensions(self) -> int: ...
```

### 6.2 ProviderRegistry 사용법

```python
from xpipe import ProviderRegistry

registry = ProviderRegistry()

# 역할별 등록 (priority가 높을수록 우선 사용)
registry.register("llm", openai_provider, priority=10)
registry.register("llm", anthropic_provider, priority=5)  # 폴백

# 최우선 Provider 조회
provider = registry.get("llm")  # → openai_provider

# 폴백 체인 조회
chain = registry.get_fallback("llm")  # → [openai_provider, anthropic_provider]

# 자동 폴백 호출 (1순위 실패 시 2순위로 자동 전환)
result = await registry.call_with_fallback(
    "llm", "complete",
    system_prompt="분류하세요",
    user_prompt="문서 텍스트...",
)

# 등록된 Provider 정보 조회
roles = registry.list_roles()            # ["llm", "ocr", "embedding"]
providers = registry.list_providers("llm")  # [{"name": "openai", "priority": 10, ...}]
```

### 6.3 내장 Provider

xPipe는 3개의 참조 구현(built-in Provider)을 제공합니다. `xpipe.providers_builtin`에서 import합니다.

#### OpenAILLMProvider

```python
from xpipe.providers_builtin import OpenAILLMProvider

provider = OpenAILLMProvider(api_key="sk-...")

result = await provider.complete(
    system_prompt="문서를 분류하세요.",
    user_prompt="문서 텍스트...",
    model="gpt-4.1-mini",     # 기본값: gpt-4.1-mini
    temperature=0,             # 기본값: 0
    max_tokens=100,            # 기본값: 100
)
# result = {"content": "...", "usage": {...}, "model": "gpt-4.1-mini", "_raw_usage": ...}
```

#### UpstageOCRProvider

```python
from xpipe.providers_builtin import UpstageOCRProvider

provider = UpstageOCRProvider(api_key="up-...")

result = await provider.process("/tmp/document.pdf")
# result = {"text": "추출된 텍스트...", "pages": 3, "confidence": 0.95}
```

- Rate limit (429) 자동 재시도 (최대 5회, Retry-After 헤더 우선)
- 타임아웃: 120초

#### OpenAIEmbeddingProvider

```python
from xpipe.providers_builtin import OpenAIEmbeddingProvider

provider = OpenAIEmbeddingProvider(
    api_key="sk-...",
    model="text-embedding-3-small",  # 기본값
)

vectors = await provider.embed(["텍스트1", "텍스트2"])
dims = provider.get_dimensions()  # 1536
```

지원 모델별 차원:
| 모델 | 차원 |
|------|------|
| `text-embedding-3-small` | 1536 |
| `text-embedding-3-large` | 3072 |
| `text-embedding-ada-002` | 1536 |

### 6.4 커스텀 Provider 작성 + 등록

```python
from xpipe import LLMProvider, ProviderRegistry
from typing import Any


class AnthropicLLMProvider(LLMProvider):
    """Anthropic Claude API를 사용하는 커스텀 LLM Provider"""

    def __init__(self, api_key: str):
        self._api_key = api_key

    def get_name(self) -> str:
        return "anthropic"

    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        # Claude Sonnet 기준 추정
        return (input_tokens * 3.0 + output_tokens * 15.0) / 1_000_000

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        model = kwargs.get("model", "claude-sonnet-4-20250514")

        response = await client.messages.create(
            model=model,
            max_tokens=kwargs.get("max_tokens", 100),
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )

        return {
            "content": response.content[0].text,
            "usage": {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            },
            "model": model,
        }


# 등록
registry = ProviderRegistry()
registry.register("llm", AnthropicLLMProvider(api_key="sk-ant-..."), priority=10)
registry.register("llm", OpenAILLMProvider(api_key="sk-..."), priority=5)  # 폴백
```

---

## 7. 커스텀 스테이지 작성

### 7.1 Stage ABC 구현

```python
from xpipe import Stage
from typing import Any
import time


class WatermarkStage(Stage):
    """워터마크 추가 스테이지 (커스텀)"""

    def get_name(self) -> str:
        return "watermark"

    def should_skip(self, context: dict[str, Any]) -> bool:
        # 이미지가 아니면 스킵
        mime = context.get("mime_type", "")
        return not mime.startswith("image/")

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        start = time.time()

        file_path = context.get("file_path", "")
        # 실제 워터마크 로직...

        # stage_data 기록 (xPipeWeb에서 시각화됨)
        duration_ms = int((time.time() - start) * 1000)
        context.setdefault("stage_data", {})
        context["stage_data"]["watermark"] = {
            "status": "completed",
            "duration_ms": duration_ms,
            "input": {"file_path": file_path},
            "output": {"watermarked": True},
        }

        return context
```

### 7.2 Pipeline에 등록

```python
from xpipe import Pipeline, PipelineDefinition, StageConfig, IngestStage, CompleteStage

definition = PipelineDefinition(
    name="watermark-pipeline",
    stages=[
        StageConfig(name="ingest"),
        StageConfig(name="watermark"),
        StageConfig(name="complete"),
    ],
)

pipeline = Pipeline(definition)
pipeline.register_stage("ingest", IngestStage)
pipeline.register_stage("watermark", WatermarkStage)
pipeline.register_stage("complete", CompleteStage)
```

### 7.3 skip 조건 설정

**방법 1: StageConfig.skip_if (선언적)**

```python
StageConfig(name="watermark", skip_if="skip_watermark")
# context["skip_watermark"]가 truthy면 스킵

StageConfig(name="embed", skip_if="credit_pending")
# context["credit_pending"]가 truthy면 스킵

StageConfig(name="extract", skip_if="has_text")
# context["has_text"]가 truthy면 스킵 (이미 텍스트 있으면 추출 불필요)
```

**방법 2: should_skip() (프로그래밍적)**

```python
class MyStage(Stage):
    def should_skip(self, context: dict[str, Any]) -> bool:
        # 복잡한 조건 가능
        return (
            context.get("file_size", 0) > 100_000_000  # 100MB 초과
            or context.get("mime_type", "").startswith("video/")
        )
```

> **이중 스킵 방어**: `ConvertStage`는 프리셋의 `skip_if: "!needs_conversion"` 선언과 스테이지 내부 `should_skip()` 메서드가 동시에 작동합니다. 어느 한 쪽만 있어도 스킵되며, 이는 의도된 이중 방어 설계입니다.

### 7.4 stage_data 기록 패턴

각 스테이지는 `context["stage_data"][스테이지명]`에 입출력을 기록하는 것을 권장합니다. xPipeWeb에서 각 스테이지의 데이터를 시각화할 때 이 구조를 참조합니다.

```python
context.setdefault("stage_data", {})
context["stage_data"]["my_stage"] = {
    "status": "completed",       # "completed", "skipped", "error"
    "duration_ms": 42,           # 처리 소요 시간
    "input": { ... },            # 스테이지에 입력된 데이터
    "output": { ... },           # 스테이지가 생성한 데이터
}
```

---

## 8. 설정 주입

### 8.1 context 키 계약

파이프라인 실행 시 context dict에 설정을 주입합니다. `_` 접두사가 붙은 키는 xPipe 내부용입니다.

| 키 | 타입 | 필수 | 설명 |
|----|------|------|------|
| `file_path` | `str` | O | 처리할 파일의 절대 경로 |
| `filename` | `str` | O | 원본 파일명 |
| `mode` | `str` | O | `"stub"` (시뮬레이션) 또는 `"real"` (실제 처리) |
| `_api_keys` | `dict` | real 모드 시 | `{"openai": "sk-...", "upstage": "up-..."}` |
| `_provider_registry` | `ProviderRegistry` | - | Provider 레지스트리 (설정 시 `_api_keys`보다 우선) |
| `_domain_adapter` | `DomainAdapter` | - | 도메인 어댑터 (DetectSpecialStage에서 사용) |
| `_classify_config` | `dict` | 분류 시 | `{"system_prompt": "...", "categories": [...]}` |
| `_converter_url` | `str` | - | PDF 변환 서비스 URL (기본: `http://localhost:8005/convert`) |
| `models` | `dict` | - | 모델명 지정. `{"llm": "gpt-4.1-mini", "ocr": "upstage", "embedding": "text-embedding-3-small"}` |
| `document_id` | `str` | - | 문서 식별자 (이벤트 발행에 사용) |

### 8.2 프리셋 사용법

```python
from xpipe import get_preset, list_presets, PRESETS

# 사용 가능한 프리셋 목록
for p in list_presets():
    print(f"{p['name']}: {p['stages']}")
# standard: ['ingest', 'convert', 'extract', 'classify', 'detect_special', 'embed', 'complete']
# minimal: ['ingest', 'extract', 'complete']

# 프리셋 조회
standard = get_preset("standard")
minimal = get_preset("minimal")

# 프리셋으로 파이프라인 생성
pipeline = Pipeline.from_dict(get_preset("standard"))
```

**standard 프리셋 (7단계):**

| 스테이지 | skip_if 조건 |
|----------|-------------|
| ingest | (없음) |
| convert | `!needs_conversion` (변환 불필요 시 스킵) |
| extract | `has_text` (텍스트 이미 있으면 스킵) |
| classify | (없음) |
| detect_special | (없음) |
| embed | `credit_pending` (크레딧 부족 시 스킵) |
| complete | (없음) |

**minimal 프리셋 (3단계):**

| 스테이지 | skip_if 조건 |
|----------|-------------|
| ingest | (없음) |
| extract | (없음) |
| complete | (없음) |

### 8.3 JSON 파이프라인 정의

```json
{
  "name": "custom-pipeline",
  "stages": [
    {"name": "ingest", "config": {}},
    {"name": "extract", "config": {}, "skip_if": "has_text"},
    {"name": "classify", "config": {}, "skip_on_error": true},
    {"name": "complete", "config": {}}
  ],
  "webhooks": {
    "stage_complete": "https://example.com/webhook"
  }
}
```

```python
pipeline = Pipeline.from_json("pipeline.json")
```

### 8.4 YAML 파이프라인 정의

xPipe는 내장 YAML 파서를 포함합니다 (PyYAML 의존 없음). 기본 키-값, 리스트, 중첩 dict를 지원합니다.

```yaml
name: custom-pipeline
stages:
  - name: ingest
    config: {}
  - name: extract
    skip_if: has_text
  - name: classify
    skip_on_error: true
  - name: complete
```

```python
pipeline = Pipeline.from_yaml("pipeline.yaml")
```

---

## 9. 부가 시스템

### 9.1 EventBus (이벤트 구독, 웹훅)

이벤트를 발행하면 등록된 웹훅으로 HTTP POST 요청을 자동 전송합니다.

```python
from xpipe import EventBus, PipelineEvent, WebhookConfig

# 설정 커스터마이징
config = WebhookConfig(
    max_retries=3,              # 최대 재시도 횟수
    retry_delay_seconds=1.0,    # 재시도 간 대기 시간
    timeout_seconds=5.0,        # HTTP 요청 타임아웃
)
bus = EventBus(config=config)

# 웹훅 등록
bus.register_webhook(
    "stage_complete",
    "https://example.com/webhook",
    headers={"Authorization": "Bearer token123"},
)

# 동기 리스너 등록 (테스트/내부 연동)
def on_complete(event: PipelineEvent):
    print(f"단계 완료: {event.stage}")

bus.on("stage_complete", on_complete)
bus.on("*", lambda e: print(f"이벤트: {e.event_type}"))  # 와일드카드

# 이벤트 발행
event = PipelineEvent(
    event_type="stage_complete",
    document_id="abc123",
    stage="classify",
    payload={"document_type": "contract", "confidence": 0.95},
)
await bus.emit(event)

# Dead Letter Queue (전송 실패 이벤트)
failed = bus.get_dead_letter_queue()
bus.clear_dead_letter_queue()

# 통계
stats = bus.get_stats()
# {"event_types": 1, "total_webhooks": 1, "dead_letter_queue_size": 0, "listener_count": 2}
```

**Pipeline과 EventBus 연동:**

```python
bus = EventBus()
pipeline = Pipeline(definition, event_bus=bus)
# Pipeline이 각 스테이지 시작/완료 시 자동으로 이벤트를 발행합니다
```

### 9.2 AuditLog (감사 로그)

SHA-256 체크섬으로 무결성을 보장하는 append-only 감사 로그입니다.

```python
from xpipe import AuditLog, AuditEntry

audit = AuditLog()

# 기록
entry = audit.record(AuditEntry(
    document_id="abc123",
    stage="classification",
    action="classified",
    actor="openai/gpt-4.1-mini",
    details={"category": "contract", "confidence": 0.95},
))

# 무결성 검증 (단건)
assert audit.verify_integrity(entry)  # True

# 전체 무결성 검증
report = audit.verify_all()
# {"total": 1, "valid": 1, "invalid": 0, "invalid_entries": []}

# 조회
by_doc = audit.get_by_document("abc123")
by_stage = audit.get_by_stage("classification")
by_actor = audit.get_by_actor("openai/gpt-4.1-mini")
by_period = audit.get_by_period("2026-01-01T00:00:00", "2026-12-31T23:59:59")

# 통계
stats = audit.get_stats()
# {"total_entries": 1, "unique_documents": 1, "by_stage": {...}, ...}
```

### 9.3 CostTracker (비용 추적)

Provider별 사용량과 비용을 인메모리로 추적합니다.

```python
from xpipe import CostTracker, UsageRecord

tracker = CostTracker()

# 사용량 기록
tracker.record(UsageRecord(
    provider="openai",
    operation="classify",
    input_tokens=500,
    output_tokens=100,
    estimated_cost=0.0012,
    timestamp="2026-03-19T12:00:00",
))

# 기간별 요약
summary = tracker.get_summary("all")    # 전체 기간
summary = tracker.get_summary("day")    # 오늘 (UTC 기준)
summary = tracker.get_summary("hour")   # 최근 1시간

# 요약 구조
# {
#     "total_records": 1,
#     "total_cost": 0.0012,
#     "total_input_tokens": 500,
#     "total_output_tokens": 100,
#     "by_provider": {"openai": {"cost": 0.0012, "count": 1, ...}},
#     "by_operation": {"classify": {"cost": 0.0012, "count": 1, ...}},
#     "period": "all",
# }

# Provider별/작업별 조회
openai_records = tracker.get_by_provider("openai")
classify_records = tracker.get_by_operation("classify")
```

### 9.4 QualityGate (품질 게이트)

문서 처리 결과의 품질을 자동 측정하고, 기준 미달 문서를 플래그합니다.

```python
from xpipe import QualityGate, QualityConfig

# 임계치 커스터마이징
config = QualityConfig(
    min_confidence=0.5,          # 분류 최소 confidence
    min_text_length=10,          # 최소 텍스트 길이
    max_broken_char_ratio=0.3,   # 최대 깨진 문자 비율
    overall_threshold=0.4,       # 종합 점수 통과 임계치
)
gate = QualityGate(config, enabled=True)

# 단건 평가
score = gate.evaluate({
    "classification_confidence": 0.85,
    "full_text": "계약서 본문 텍스트...",
    "document_type": "contract",
})
print(f"통과: {score.passed}")          # True
print(f"종합: {score.overall}")          # 0.71
print(f"플래그: {score.flags}")          # []

# 배치 평가
report = gate.evaluate_batch([doc1, doc2, doc3])
print(f"통과: {report.passed}/{report.total}")
print(f"플래그 요약: {report.flags_summary}")
# {"LOW_CONFIDENCE": 1, "SHORT_TEXT": 2}
```

**플래그 종류:**

| 플래그 | 조건 |
|--------|------|
| `LOW_CONFIDENCE` | 분류 신뢰도 < min_confidence |
| `SHORT_TEXT` | 텍스트 길이 < min_text_length |
| `BROKEN_TEXT` | 깨진 문자 비율 > max_broken_char_ratio |
| `UNCLASSIFIED` | document_type이 general/unknown/빈값 |

### 9.5 TestRunner (어댑터 테스트)

외부 JSON 파일로 정의된 테스트 케이스로 DomainAdapter 구현체를 검증합니다.

```python
from xpipe.testing import TestRunner, TestCase

runner = TestRunner(adapter=my_adapter)

# JSON에서 테스트 셋 로드
test_cases = TestRunner.load_test_set("tests/sample_documents.json")

# 감지 테스트
detection_results = await runner.run_detection_tests(test_cases)
print(f"감지 테스트: {detection_results['passed']}/{detection_results['total']}")

# 분류 설정 테스트
classify_results = await runner.run_classification_tests(test_cases)
print(f"분류 테스트: {classify_results['passed']}/{classify_results['total']}")
print(f"설정 유효: {classify_results['config_valid']}")
```

**테스트 셋 JSON 형식:**

```json
[
    {
        "input_text": "이 계약은 갑과 을 사이에 체결된...",
        "input_mime": "application/pdf",
        "expected_detections": [
            {"doc_type": "contract"}
        ],
        "expected_classification": "contract",
        "description": "계약서 감지 테스트",
        "filename": "contract_sample.pdf"
    }
]
```

### 9.6 GroundTruthRunner (분류 정확도 측정)

Ground Truth 파일을 기반으로 분류 정확도를 자동 측정합니다.

```python
from xpipe import GroundTruthRunner

runner = GroundTruthRunner()

# GT 파일로 정확도 측정
report = runner.measure_accuracy("tests/ground_truth.json")
print(f"정확도: {report.accuracy:.1%}")  # 91.8%
print(f"정확: {report.correct}/{report.total}")
print(f"불일치: {report.mismatches}")

# 기준선 대비 비교
baseline = {"accuracy": 0.90}
passed = runner.compare_with_baseline(report, baseline)
print(f"기준선 통과: {passed}")  # True (91.8% >= 90%)
```

**GT JSON 형식:**

```json
[
    {"file_id": "abc123", "expected_type": "contract", "actual_type": "contract"},
    {"file_id": "def456", "expected_type": "report"}
]
```

`actual_type`이 없으면 `docs` 인자나 `doc_provider` 콜백으로 문서를 조회하여 `document_type` 필드를 사용합니다.

---

## 10. xPipeWeb (데모 서버)

xPipeWeb은 xPipe 엔진을 시각적으로 체험할 수 있는 개발자 전용 웹 데모 서버입니다.

### 10.1 실행 방법

```bash
# 방법 1: CLI
python -m xpipe demo

# 방법 2: 직접 실행
python -m xpipe.console.web.server
```

- 기본 포트: **8200** (환경변수 `XPIPE_DEMO_PORT`로 변경 가능)
- 외부 DB 의존 없이 인메모리로 동작
- API 키는 `.env.shared` 또는 `.env` 파일에서 자동 로드 (`XPIPE_ENV_FILE` 환경변수로 지정 가능)

### 10.2 UI 사용법

브라우저에서 `http://localhost:8200`에 접속하면:

1. 파일을 업로드합니다.
2. 모드(stub/real)와 활성화할 스테이지를 선택합니다.
3. 파이프라인이 실행되면 각 스테이지의 입출력 데이터를 실시간으로 확인할 수 있습니다.
4. stage_data를 통해 각 단계에서 어떤 데이터가 들어가고 나오는지 직접 확인합니다.

### 10.3 필수 패키지

```bash
pip install fastapi uvicorn python-multipart pydantic
# 또는
pip install -e "backend/api/document_pipeline/xpipe/[web]"
```

---

## 11. 동작 확인 방법

### 11.1 단위 테스트 실행

```bash
# xpipe 내장 테스트
python -m xpipe test

# 또는 pytest 직접 실행 (xpipe 소스 디렉토리에서 실행)
pytest xpipe/tests/ -v
```

### 11.2 어댑터 계약 테스트

어댑터가 DomainAdapter ABC를 올바르게 구현했는지 검증합니다.

```bash
pytest tests/test_adapter_contract.py -v
```

### 11.3 stub 모드 파이프라인 검증

외부 서비스 없이 파이프라인 동작을 확인합니다.

```python
import asyncio
from xpipe import Pipeline, get_preset, IngestStage, ExtractStage, CompleteStage

async def verify():
    pipeline = Pipeline.from_dict(get_preset("minimal"))
    pipeline.register_stage("ingest", IngestStage)
    pipeline.register_stage("extract", ExtractStage)
    pipeline.register_stage("complete", CompleteStage)

    result = await pipeline.run({
        "file_path": "/tmp/test.txt",
        "filename": "test.txt",
        "mode": "stub",
    })

    assert result["status"] == "completed"
    assert "ingest" in result["_pipeline"]["stages_executed"]
    print("stub 모드 검증 통과")

asyncio.run(verify())
```

### 11.4 real 모드 파이프라인 검증

실제 AI/OCR 서비스를 사용하여 문서를 처리합니다. API 키가 필요합니다.

```python
pipeline = Pipeline.from_dict(get_preset("full"))
pipeline.register_stage("ingest", IngestStage)
pipeline.register_stage("convert", ConvertStage)
pipeline.register_stage("extract", ExtractStage)
pipeline.register_stage("classify", ClassifyStage)
pipeline.register_stage("detect_special", DetectSpecialStage)
pipeline.register_stage("embed", EmbedStage)
pipeline.register_stage("complete", CompleteStage)

result = await pipeline.run({
    "file_path": "/tmp/document.pdf",
    "filename": "document.pdf",
    "mode": "real",
    "_api_keys": {
        "openai": "sk-...",
        "upstage": "up-...",
    },
    "_classify_config": {
        "system_prompt": "문서를 분류하세요.",
        "categories": ["계약서", "보고서", "일반문서"],
    },
})
assert result["status"] == "completed"
assert result.get("document_type") is not None
```

### 11.5 xPipeWeb으로 시각적 확인

```bash
python -m xpipe demo
# 브라우저에서 http://localhost:8200 접속
```

### 11.6 Golden File 테스트

`GroundTruthRunner`를 사용하여 분류 정확도가 기준선 이상인지 확인합니다.

```python
from xpipe import GroundTruthRunner

runner = GroundTruthRunner()
report = runner.measure_accuracy("tests/ground_truth.json")

baseline = {"accuracy": 0.90}
assert runner.compare_with_baseline(report, baseline), (
    f"정확도 저하: {report.accuracy:.1%} < 90%"
)
```

### 11.7 QualityGate 평가

```python
from xpipe import QualityGate

gate = QualityGate()
score = gate.evaluate({
    "classification_confidence": 0.85,
    "full_text": "충분한 텍스트가 포함된 문서...",
    "document_type": "contract",
})
assert score.passed, f"품질 미달: flags={score.flags}"
```

### 11.8 파이프라인 정의 검증 (CLI)

```bash
# JSON 정의 파일 검증
python -m xpipe pipeline validate pipeline.json

# YAML 정의 파일 검증
python -m xpipe pipeline validate pipeline.yaml

# 프리셋 목록 확인
python -m xpipe pipeline presets
```

### 11.9 배포 전 체크리스트

- [ ] `python -m xpipe test` 전체 PASS
- [ ] stub 모드 파이프라인 정상 동작
- [ ] real 모드 파이프라인 정상 동작 (API 키 설정 확인)
- [ ] DomainAdapter 계약 테스트 PASS (`test_adapter_contract.py`)
- [ ] Ground Truth 정확도 기준선 이상
- [ ] QualityGate 통과율 확인
- [ ] `python -m xpipe pipeline validate` 정의 파일 검증 통과

---

## 12. API Reference

### Public API 전체 목록 (`__all__` 기준)

#### Adapter

| 클래스 | 설명 |
|--------|------|
| `DomainAdapter` | 도메인별 로직 주입 ABC. abstract 메서드: `get_classification_config()`, `detect_special_documents()`, `resolve_entity()`, `extract_domain_metadata()`, `generate_display_name()`, `on_stage_complete()`. 선택적 메서드: `validate_document()`, `on_before_ai_call()` |
| `Category` | 분류 체계의 단일 카테고리. `code: str`, `name: str`, `parent: Optional[str]` |
| `Detection` | 특수 문서 감지 결과. `doc_type: str`, `confidence: float`, `metadata: dict` |
| `ClassificationConfig` | AI 분류 설정. `categories: list[Category]`, `prompt_template: str`, `valid_types: list[str]`, `extra: dict` |
| `HookResult` | 단계 완료 후 액션. `action: StageHookAction`, `payload: dict` |
| `StageHookAction` | 액션 유형 Enum: `NOTIFY`, `UPDATE_STATUS`, `TRIGGER_PROCESS`, `SKIP_REMAINING`, `NOOP` |

#### Storage

| 클래스 | 설명 |
|--------|------|
| `DocumentStore` | 문서 CRUD + 상태 관리 ABC. abstract 메서드: `get_document()`, `create_document()`, `update_document()`, `update_document_status()`, `delete_document()`, `find_pending_documents()`, `find_embedding_targets()`. 선택적: `insert_error()` |
| `JobQueue` | 비동기 작업 큐 ABC. abstract 메서드: `enqueue()`, `dequeue()`, `ack()`. 선택적: `claim_stale()` |

#### Queue (인메모리)

| 클래스 | 설명 |
|--------|------|
| `InMemoryQueue` | asyncio.Queue 래핑 데모 서버 전용 큐. 메서드: `put(job)`, `get(timeout)`, `remove(job_id)`, `qsize()` |
| `Job` | 작업 단위 데이터클래스. `job_id`, `file_path`, `filename`, `status`, `config_snapshot`, `result`, `error`, `error_stage`, `created_at`, `started_at`, `completed_at` |
| `JobStatus` | Enum: `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED` |

#### Quality

| 클래스 | 설명 |
|--------|------|
| `QualityGate` | 품질 평가 엔진. `evaluate(doc) -> QualityScore`, `evaluate_batch(docs) -> QualityReport` |
| `QualityConfig` | 임계치 설정. `min_confidence`, `min_text_length`, `max_broken_char_ratio`, `overall_threshold` |
| `QualityScore` | 평가 결과. `classification_confidence`, `text_quality`, `overall`, `passed`, `flags` |
| `QualityReport` | 배치 보고서. `total`, `passed`, `failed`, `flags_summary`, `avg_confidence`, `avg_text_quality`, `scores` |
| `GroundTruthRunner` | GT 대비 정확도 측정. `measure_accuracy(gt_path, docs)`, `compare_with_baseline(current, baseline)` |
| `AccuracyReport` | 정확도 보고서. `total`, `correct`, `incorrect`, `skipped`, `accuracy`, `mismatches` |

#### Providers

| 클래스 | 설명 |
|--------|------|
| `LLMProvider` | LLM ABC. `complete(system_prompt, user_prompt, **kwargs)`, `get_name()`, `estimate_cost()` |
| `OCRProvider` | OCR ABC. `process(file_path, **kwargs)`, `get_name()` |
| `EmbeddingProvider` | 임베딩 ABC. `embed(texts, **kwargs)`, `get_name()`, `get_dimensions()` |
| `ProviderRegistry` | 역할별 Provider 관리. `register(role, provider, priority)`, `get(role)`, `get_fallback(role)`, `call_with_fallback(role, method, ...)`, `list_roles()`, `list_providers(role)` |
| `CostTracker` | 사용량/비용 추적. `record(usage)`, `get_summary(period)`, `get_by_provider(name)`, `get_by_operation(op)` |
| `UsageRecord` | 사용량 기록. `provider`, `operation`, `input_tokens`, `output_tokens`, `estimated_cost`, `timestamp` |

#### Events

| 클래스 | 설명 |
|--------|------|
| `EventBus` | 이벤트 발행 + 웹훅 디스패치. `emit(event)`, `register_webhook(event_type, url, headers)`, `unregister_webhook()`, `on(event_type, listener)`, `off()`, `get_dead_letter_queue()`, `clear_dead_letter_queue()`, `get_stats()` |
| `PipelineEvent` | 이벤트 데이터. `event_type`, `document_id`, `stage`, `payload`, `timestamp` |
| `WebhookConfig` | 웹훅 설정. `max_retries=3`, `retry_delay_seconds=1.0`, `timeout_seconds=5.0` |

#### Audit

| 클래스 | 설명 |
|--------|------|
| `AuditLog` | 감사 로그 관리. `record(entry)`, `get_all()`, `get_by_document(id)`, `get_by_stage(stage)`, `get_by_actor(actor)`, `get_by_period(start, end)`, `verify_integrity(entry)`, `verify_all()`, `get_stats()` |
| `AuditEntry` | 감사 엔트리. `document_id`, `stage`, `action`, `actor`, `details`, `timestamp`, `checksum` |

#### Pipeline

| 클래스 | 설명 |
|--------|------|
| `Stage` | 스테이지 ABC. `get_name()`, `execute(context)`, `should_skip(context)` |
| `Pipeline` | 파이프라인 엔진. `register_stage(name, cls)`, `run(context)`, `validate()`, `from_dict(data)`, `from_json(path)`, `from_yaml(path)` |
| `PipelineDefinition` | 파이프라인 정의. `name`, `stages: list[StageConfig]`, `webhooks: dict` |
| `StageConfig` | 스테이지 설정. `name`, `config`, `skip_if`, `skip_on_error`, `module` |
| `PRESETS` | 내장 프리셋 dict (`"standard"`, `"minimal"`) |
| `get_preset(name)` | 프리셋 조회 함수 |
| `list_presets()` | 프리셋 목록 함수 |

#### Built-in Stages

| 클래스 | 스테이지명 | 설명 |
|--------|-----------|------|
| `IngestStage` | `ingest` | 파일 수신, 메타데이터 수집 (크기, MIME, 저장 경로) |
| `ConvertStage` | `convert` | 비-PDF 문서를 PDF로 변환 (pdf_converter 서비스 또는 LibreOffice) |
| `ExtractStage` | `extract` | 텍스트 추출 (직접 읽기, pdfplumber, OCR) |
| `ClassifyStage` | `classify` | AI 분류 (LLMProvider 경유, `_classify_config` 필요) |
| `DetectSpecialStage` | `detect_special` | 특수 문서 감지 (DomainAdapter 또는 키워드 규칙) |
| `EmbedStage` | `embed` | 벡터 임베딩 (EmbeddingProvider 경유) |
| `CompleteStage` | `complete` | 완료 처리, 표시명 생성, 소요 시간/비용 집계 |

---

## 13. 버전 정책

### Semantic Versioning

xPipe는 [SemVer](https://semver.org)를 따릅니다: `MAJOR.MINOR.PATCH`

| 변경 유형 | 버전 | 예시 |
|-----------|------|------|
| 하위 호환 깨지는 변경 | MAJOR | DomainAdapter 메서드 시그니처 변경 |
| 호환 유지 기능 추가 | MINOR | DomainAdapter에 기본 구현 메서드 추가 |
| 버그 수정 | PATCH | 파이프라인 처리 버그 수정 |

### DomainAdapter 하위 호환 규칙

1. **기존 abstract 메서드 시그니처 변경 금지** -- MAJOR 변경에 해당
2. **새 메서드 추가 시 반드시 기본 구현(no-op) 제공** -- MINOR 변경. 기존 어댑터가 수정 없이 동작해야 합니다.
3. **메서드 제거 시**: deprecation 경고 1 MINOR 버전 유지 후 다음 MAJOR에서 제거

### DocumentStore / JobQueue 하위 호환 규칙

1. **기존 abstract 메서드 시그니처 변경 금지** -- MAJOR 변경
2. **새 메서드 추가 시 기본 구현 제공** -- MINOR 변경
3. **반환 타입 변경 금지** -- MAJOR 변경

### Deprecation 정책

- deprecated 표시 후 **최소 1 MINOR 버전** 유지
- 다음 MAJOR에서 제거
- deprecated 메서드는 `warnings.warn()` + docstring에 표기

### Pre-release (현재: 0.x.x)

- 0.x.x 동안은 MINOR 변경에서도 breaking change가 허용됩니다.
- **1.0.0 이후** 위 정책이 엄격하게 적용됩니다.

### 현재 버전 기록

| 버전 | 단계 | 내용 |
|------|------|------|
| 0.1.0 | Phase 1 | DomainAdapter ABC + DocumentStore/JobQueue ABC 정의, 7단계 내장 스테이지, ProviderRegistry, EventBus, AuditLog, CostTracker, QualityGate, TestRunner, xPipeWeb 데모 서버 |

---

## CLI 명령어 요약

```bash
python -m xpipe version             # 버전 출력
python -m xpipe status              # 패키지 상태 + ABC 정의 출력
python -m xpipe demo                # xPipeWeb 데모 서버 시작
python -m xpipe test                # 내장 테스트 실행
python -m xpipe providers           # Provider ABC 정보
python -m xpipe events              # 이벤트/웹훅 시스템 정보
python -m xpipe audit               # 감사 로그 시스템 정보
python -m xpipe pipeline validate <파일>  # 파이프라인 정의 검증
python -m xpipe pipeline presets    # 내장 프리셋 목록
python -m xpipe quality             # 품질 게이트 설정 표시
python -m xpipe quality check <GT>  # Ground Truth 측정
```
