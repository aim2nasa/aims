# xPipe — AIMS 문서 처리 엔진 모듈화 전략 토의

**작성일**: 2026-03-13
**참여**: Alex (개발/아키텍트), Gini (품질 엔지니어), Architect (설계 전문가), PM (제품 매니저), Moderator (Claude)
**상태**: 진행 중

---

## 1. 배경 및 목표

### 1.1 현재 상황
AIMS는 메트라이프 보험설계사를 타겟으로 하는 SaaS 플랫폼이다. 그 근간에는 다음과 같은 도메인 무관한 핵심 기능이 있다:

- **텍스트 추출**: PDF/HWP/이미지 등에서 파서를 통해 텍스트 추출
- **OCR**: PaddleOCR/Upstage 등을 통한 이미지 문서 텍스트 인식
- **문서 분류**: full_text 기반 AI 자동 분류 (현재 M6 프롬프트, 91.8% 정확도)
- **키워드 검색 / RAG 검색**: 벡터 임베딩 + 메타데이터 하이브리드 검색
- **문서 요약 / 메타데이터 추출**: AI 기반 자동 요약 및 구조화

### 1.2 목표
이 핵심 기능들을 **독립적인 모듈/레이어로 분리**하여, 향후 보험 외 다른 솔루션(법률, 의료, 금융 등)에서도 재활용할 수 있는 **범용 문서 처리 플랫폼**으로 발전시킨다.

**AIMS First 원칙**: xPipe는 AIMS 지원을 **최우선**으로 한다. AIMS에서 xPipe를 효율적으로 사용할 수 있는 구조가 기본 설계 방향이며, 범용성은 AIMS 최적화를 해치지 않는 범위에서 추구한다. 최고의 아키텍트(Alex)가 AIMS-xPipe 간 구조를 설계·개선한다.

### 1.2.1 xPipe 핵심 철학 — "자동차의 엔진"

xPipe는 AIMS라는 자동차의 **엔진**이다. 엔진은 차체(AIMS)에 장착되어 동작하지만, 엔진 단독으로도 시동을 걸고, 성능을 측정하고, 이상을 진단할 수 있어야 한다. 그리고 이 엔진은 **AIMS뿐 아니라 어떤 자동차(솔루션)에든 탑재**될 수 있어야 한다.

```
┌─ AIMS (보험 솔루션) ──┐  ┌─ 솔루션 B ──────────┐  ┌─ 솔루션 C ──────────┐
│  Insurance Adapter     │  │  LegalAdapter        │  │  MedicalAdapter      │
│         │              │  │         │            │  │         │            │
│         ▼              │  │         ▼            │  │         ▼            │
│  ┌─ xPipe (엔진) ─┐   │  │  ┌─ xPipe (엔진) ┐  │  │  ┌─ xPipe (엔진) ┐  │
│  │  동일한 코어     │   │  │  │  동일한 코어   │  │  │  │  동일한 코어   │  │
│  └─────────────────┘   │  │  └────────────────┘  │  │  └────────────────┘  │
└────────────────────────┘  └──────────────────────┘  └──────────────────────┘

xPipe 엔진 내부:
┌─ xPipe ──────────────────────────────────────────────────┐
│                                                            │
│  ┌─────────────┐  자동화 테스트 + Regression 테스트        │
│  │ 코어 기능    │  ← 외부 테스트 셋 주입 가능               │
│  │ (파이프라인)  │                                          │
│  └─────────────┘                                          │
│                                                            │
│  ┌─────────────┐  독립 관리 인터페이스 (웹 / GUI / CUI)    │
│  │ 모니터링     │  ← 동작·상태·장애 실시간 확인              │
│  │ 상태 제어    │  ← 엔진만으로도 조작 가능                  │
│  └─────────────┘                                          │
│                                                            │
│  ┌─────────────┐  외부 자원 관리                           │
│  │ 비용 모니터링 │  ← AI API, OCR, 스토리지 등 유료 서비스    │
│  │ 사용량 제어  │  ← 실시간 비용 추적 + 제어/변경 가능       │
│  └─────────────┘                                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

이 철학에서 도출되는 **6가지 독립성 원칙**:

1. **독립 실행**: xPipe는 AIMS 없이 단독으로 기동·실행 가능해야 한다
2. **독립 검증**: 자동화 테스트와 regression 테스트가 xPipe 자체에 내장되며, 외부에서 샘플 테스트 셋을 주입하여 전체 파이프라인의 정확성을 검증할 수 있다
3. **독립 제어**: xPipe 전용 관리 인터페이스(웹/GUI/CUI)를 통해 동작·상태·장애를 모니터링하고, 세부 기능을 제어할 수 있다
4. **이식성**: xPipe는 AIMS 전용이 아니다. 제3의 솔루션에서도 어댑터만 구현하면 손쉽게 탑재·사용할 수 있어야 한다. 설치·설정·연동이 간편해야 한다
5. **외부 자원 투명성**: xPipe가 사용하는 유료 외부 서비스(AI API, OCR, 스토리지 등)의 사용량·비용이 실시간으로 모니터링되며, 관리 인터페이스를 통해 제어·변경할 수 있다
6. **하위 호환성 (Backward Compatibility)**: xPipe가 기능 개선·진화하더라도, 이미 xPipe를 사용 중인 레거시 시스템은 **수정 없이(backward compatible) 또는 최소한의 수정만으로** 새 버전을 수용할 수 있어야 한다. 엔진을 업그레이드해도 차체를 뜯어고칠 필요가 없어야 한다

### 1.3 WHY NOW — 왜 지금 해야 하는가

1. **기술 부채 임계점**: document_pipeline에 보험 도메인 로직이 깊이 결합되어, 새 기능 추가 시마다 코어 코드를 건드려야 하는 상황. 결합이 깊어질수록 나중에 분리 비용이 기하급수적으로 증가
2. **코드 분해의 자연스러운 시점**: `doc_prep_main.py` God Function(600줄+), `openai_service.py` 프롬프트 하드코딩 등 기술 부채 해소가 필요한 시점과 겹침. 리팩토링의 방향을 "모듈화"로 잡으면 부채 해소와 구조 개선을 동시에 달성
3. **목적 정의**: 이 작업은 **"리팩토링으로서의 모듈화"**. 새 제품/SaaS를 만드는 것이 아니라, 기존 코드의 구조를 개선하면서 미래 확장 옵션을 확보하는 것

**기회 비용**: Phase 0~3 기간(약 14-18주) 동안 AIMS 신규 기능 개발이 제한됨. 단, 리팩토링 과정에서 기술 부채(God Function, 보안 이슈 등)가 함께 해소되므로 순수 손실은 아님.

### 1.4 마일스톤 및 완료 기준 (Definition of Done)

**마일스톤**: 현재 혼재된 구조에서 레이어를 완전히 독립시키고, 분리된 구조 위에서 AIMS가 안정적으로 동작하는 것을 검증

**측정 가능한 완료 기준:**

```
기능 보존
- [ ] 파이프라인 E2E 테스트 전/후 결과 동일
- [ ] M6 분류 정확도 91.8% 유지 또는 향상
- [ ] 처리 시간 기존 대비 10% 이내 오차

코드 구조
- [ ] document_pipeline 코드에서 보험 도메인 키워드
      (AR, CRS, 25소분류, annual_report 등)가
      어댑터(Layer 3) 외에 존재하지 않음 (grep 검증)
- [ ] xPipe 코어가 insurance 모듈을 직접 import하는 코드 없음

독립성
- [ ] xpipe 패키지가 AIMS 없이 단독 설치·실행 가능
- [ ] Phase 4 PoC에서 다른 도메인 어댑터가 xPipe 인터페이스만으로 동작

이식성 (제3 솔루션 탑재)
- [ ] pip install + 어댑터 구현 + 설정 파일만으로 신규 솔루션에 xPipe 연동 가능
- [ ] Quick Start 가이드 제공: 최소 코드로 xPipe 기동 → 문서 처리 → 결과 수신
- [ ] 솔루션별 설정 격리: 각 솔루션이 독립된 설정·인프라·어댑터로 운영 가능

하위 호환성 (Backward Compatibility)
- [ ] Semantic Versioning 적용 (MAJOR.MINOR.PATCH)
      MAJOR = 하위 호환 깨지는 변경, MINOR = 호환 유지 기능 추가, PATCH = 버그 수정
- [ ] DomainAdapter 인터페이스 변경 시 기존 어댑터가 수정 없이 동작
      (신규 메서드는 default 구현 제공, 기존 메서드 시그니처 변경 금지)
- [ ] 버전 업그레이드 시 마이그레이션 가이드 제공
      (breaking change 발생 시 자동 마이그레이션 스크립트 또는 명확한 변경 목록)
- [ ] 최소 직전 1개 MAJOR 버전과의 호환 기간 보장 (deprecation 경고 → 다음 MAJOR에서 제거)

독립 검증 (테스트)
- [ ] xPipe 자체 자동화 테스트 스위트 내장 (unit + integration + E2E)
- [ ] regression 테스트가 xPipe 단독으로 실행·판정 가능
- [ ] 외부 샘플 테스트 셋 주입 인터페이스 제공
      (테스트 문서 + 기대 결과를 외부에서 추가하여 파이프라인 정확성 검증)
- [ ] 테스트 셋 추가만으로 새로운 도메인/문서 유형의 검증이 가능

독립 제어 (관리 인터페이스)
- [ ] xPipe 전용 관리 인터페이스 제공 (웹 / GUI / CUI 중 택일 또는 복수)
- [ ] 파이프라인 실시간 모니터링: 처리 상태, 큐 적재량, 처리 속도, 오류율
- [ ] 세부 기능 제어: 개별 스테이지 on/off, 재처리, 설정 변경
- [ ] 장애 감지 및 알림: 스테이지별 오류, 처리 지연, 인프라 이상

외부 자원 모니터링 (비용·사용량)
- [ ] 유료 서비스별 실시간 사용량·비용 추적
      (OpenAI API, Upstage OCR, 벡터 DB, 스토리지 등)
- [ ] 관리 인터페이스에서 비용 대시보드 제공 (일별/월별/서비스별)
- [ ] 외부 서비스 제어: 제공자 변경, 모델 전환, 사용량 한도 설정,
      비용 임계치 알림, 서비스 on/off

보안
- [ ] Phase 0의 Critical/Major 보안 이슈 전원 해결
```

---

## 2. 현재 아키텍처 분석 (4개 관점 교차 검증)

### 2.1 전체 시스템 구조

```
[Frontend]                     [Backend - TARS 서버]
React+TS+Vite (D:\aims)       ┌─ aims_api (Node.js, :3010) ─── MongoDB (:27017)
  ├─ TanStack Query            ├─ document_pipeline (FastAPI, :8100) ─── Redis
  ├─ Zustand                   ├─ aims_rag_api (Python, :8000) ─── Qdrant
  └─ SSE (실시간)               ├─ annual_report_api (Python)
                                ├─ aims_mcp (MCP 서버, :3011)
                                ├─ aims_health_monitor (:3012)
                                ├─ paddle_ocr_api (PaddleOCR)
                                ├─ pdf_proxy / pdf_converter (:8005)
                                └─ embedding (cron, full_pipeline.py)
```

### 2.2 document_pipeline 내부 구조 (모듈화 대상)

```
document_pipeline (FastAPI :8100)
├── 라우터 (8개)
│   ├─ doc_upload.py          # 문서 업로드
│   ├─ doc_prep_main.py       # 전처리 + 분류 + AR/CRS 감지
│   ├─ doc_ocr.py             # OCR 처리
│   ├─ doc_meta.py            # 메타데이터 추출
│   ├─ doc_summary.py         # 문서 요약
│   ├─ doc_display_name.py    # 표시명 생성
│   ├─ smart_search.py        # 스마트 검색
│   └─ shadow_router.py       # 섀도 라우팅
├── 서비스 (11개)
│   ├─ AI: anthropic_service, openai_service, upstage_service
│   ├─ 인프라: mongo_service, redis_service, file_service
│   ├─ 큐: upload_queue_service, pdf_conversion_queue_service
│   └─ 기타: meta_service, temp_file_service, pdf_conversion_text_service
└── 워커 (3개 비동기)
    ├─ upload_worker        (MongoDB 큐)
    ├─ pdf_conversion_worker
    └─ ocr_worker           (Redis Stream)
```

### 2.3 현재 문제점 (도메인 결합)

```
┌─ document_pipeline ──────────────────────────────────────┐
│                                                          │
│  [도메인 무관 코어]              [보험 도메인 하드코딩]    │
│  ├─ upload_worker               ├─ AR/CRS 감지           │
│  ├─ pdf_conversion_worker       ├─ 7대분류/25소분류       │
│  ├─ ocr_worker (Redis)          ├─ 보험 메타데이터 추출   │
│  ├─ anthropic/openai/upstage    ├─ 보험 문서 표시명 규칙  │
│  ├─ mongo_service               └─ annual_report_api 연동│
│  └─ file_service                                         │
└──────────────────────────────────────────────────────────┘

문제: 코어 기능과 보험 도메인 로직이 같은 레이어에 혼재
→ 다른 도메인에서 재사용 불가능
```

### 2.4 각 에이전트 분석 요약

| 에이전트 | 핵심 진단 |
|---------|----------|
| **Alex** | 11개 서비스가 분리되어 있으나, 분류+요약 통합 AI 호출 등 결합이 과소평가됨 |
| **Architect** | 현재 "분산된 모놀리스" 상태. 보험 로직 하드코딩이 재사용 장벽 |
| **Gini** | 서비스-UI 결합, 인증 우회 등 기술 부채 선해결 필요. 통합 테스트 부재 |
| **PM** | 수직 통합 파이프라인이 최대 차별화 포인트. PG 연동은 스코프 밖으로 합의 |

---

## 3. 아키텍처 비교 (AS-IS → TO-BE)

### 3.0 AS-IS: 현재 구조

```
┌─ AIMS ──────────────────────────────────────────────────────┐
│                                                              │
│  Frontend (React)                                            │
│  └─ API 호출 ──────────────────────────┐                     │
│                                        ▼                     │
│  aims_api (Node.js :3010) ◄────► MongoDB                     │
│       │                                                      │
│       ▼                                                      │
│  document_pipeline (FastAPI :8100)                            │
│  ┌───────────────────────────────────────────────────┐       │
│  │  업로드 → PDF변환 → OCR → ★분류 → ★메타추출 → 임베딩  │       │
│  │                           ★AR/CRS감지              │       │
│  │                           ★보험표시명               │       │
│  │                           ★보험25소분류             │       │
│  │  ─────────────────────────────────────────────    │       │
│  │  ★ = 보험 도메인 로직이 코어에 하드코딩            │       │
│  └───────────────────────────────────────────────────┘       │
│                                                              │
│  aims_rag_api ◄────► Qdrant                                  │
│  annual_report_api                                           │
│  paddle_ocr_api                                              │
│  pdf_proxy / pdf_converter                                   │
│                                                              │
│  ※ 모든 것이 AIMS라는 하나의 덩어리                           │
│  ※ 범용 기능과 보험 로직의 경계가 없음                         │
└──────────────────────────────────────────────────────────────┘
```

### 3.0.1 TO-BE: 목표 구조

```
┌─ AIMS (보험 솔루션) ─────────────────────────────────────────┐
│                                                              │
│  Frontend (React)                                            │
│  └─ API 호출 ──────────────────────────┐                     │
│                                        ▼                     │
│  aims_api (Node.js :3010) ◄────► MongoDB                     │
│       │                                                      │
│       │  ┌─ InsuranceDomainAdapter ─────────────┐              │
│       │  │  분류: M6 프롬프트 + 7대/25소분류     │              │
│       │  │  감지: AR/CRS 특수문서 감지           │              │
│       │  │  연결: 고객명 → 고객ID               │              │
│       │  │  메타: 보험 메타데이터 추출           │              │
│       │  │  표시명: 보험 문서 표시명 규칙        │              │
│       │  │  후크: AR 감지 시 SSE 알림 등         │              │
│       │  └──────────────┬─────────────────────┘              │
│       │                 │ implements                          │
│       ▼                 ▼                                    │
│  ┌─ xPipe ──────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │   │
│  │  │ 파일수신 │→│텍스트   │→│ AI분류  │→│  검색   │        │   │
│  │  │ 큐관리  │ │추출    │ │ 메타추출│ │  RAG   │        │   │
│  │  │ PDF변환 │ │ OCR    │ │ 임베딩  │ │        │        │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘        │   │
│  │                                                       │   │
│  │  DomainAdapter Interface (ABC)                         │   │
│  │  ├─ get_classification_config() → 프롬프트+분류체계   │   │
│  │  ├─ detect_special_documents() → 특수문서 감지        │   │
│  │  ├─ resolve_entity() → 엔티티 연결                    │   │
│  │  ├─ extract_metadata() → 메타데이터                   │   │
│  │  ├─ generate_display_name() → 표시명                  │   │
│  │  └─ on_stage_complete() → 단계별 후크                 │   │
│  │                                                       │   │
│  │  ※ 도메인 로직 zero. 순수 파이프라인.                    │   │
│  │  ※ 어댑터를 꽂으면 어떤 도메인이든 동작                  │   │
│  │                                                       │   │
│  │  ┌────────────────────────────────────────────┐       │   │
│  │  │ 독립 검증: 자동화 테스트 + Regression       │       │   │
│  │  │           외부 테스트 셋 주입 가능           │       │   │
│  │  ├────────────────────────────────────────────┤       │   │
│  │  │ 독립 제어: 관리 인터페이스 (웹/GUI/CUI)     │       │   │
│  │  │           모니터링 · 상태 · 장애 · 제어      │       │   │
│  │  └────────────────────────────────────────────┘       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘

미래: 다른 솔루션도 xPipe 위에 구축 가능

┌─ 법률 솔루션 ────┐  ┌─ 의료 솔루션 ────┐
│ 법률 어댑터       │  │ 의료 어댑터       │
│ └─ 판례분류       │  │ └─ 진단서분류     │
│ └─ 계약서메타     │  │ └─ 처방전메타     │
└──────┬───────────┘  └──────┬───────────┘
       │                     │
       ▼                     ▼
┌─ xPipe ──────────────────────────────┐
│  (동일한 코어 엔진 재사용)             │
└──────────────────────────────────────┘
```

### 3.0.2 핵심 차이

| | AS-IS | TO-BE |
|---|---|---|
| **보험 로직 위치** | 파이프라인 내부에 하드코딩 | 어댑터로 외부 분리 |
| **xPipe** | 존재하지 않음 (= document_pipeline) | 독립된 범용 엔진 |
| **재사용성** | 불가능 | 어댑터만 바꾸면 다른 도메인 |
| **경계** | 없음 | Adapter Interface로 명확 |

---

## 4. 제안: 3-Layer 아키텍처

### 3.1 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Application (도메인별 솔루션)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ AIMS 보험     │  │ 법률 문서     │  │ 의료 기록     │  ... │
│  │ - AR/CRS 파싱 │  │ - 판례 분류   │  │ - 진단서 분류 │       │
│  │ - 25소분류    │  │ - 계약서 추출 │  │ - 처방전 추출 │       │
│  │ - 보험 메타   │  │ - 법률 메타   │  │ - 의료 메타   │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │               │
├─────────▼─────────────────▼─────────────────▼───────────────┤
│  Layer 2: DomainAdapter (통합 플러그인 인터페이스)             │
│  ┌────────────────────────────────────────────────────┐     │
│  │ get_classification_config() — 분류 프롬프트+체계    │     │
│  │ detect_special_documents()  — 특수문서 감지+분기    │     │
│  │ resolve_entity()            — 엔티티 연결           │     │
│  │ extract_metadata()          — 메타데이터 추출       │     │
│  │ generate_display_name()     — 표시명 생성           │     │
│  │ on_stage_complete()         — 단계별 후크           │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Layer 1: xPipe (도메인 무관, 재사용 가능)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Ingest   │ │ Extract  │ │ Enrich   │ │ Search   │       │
│  │ 파일수신  │ │ 텍스트추출│ │ 임베딩   │ │ 벡터검색  │       │
│  │ 큐관리   │ │ OCR      │ │ 분류(AI) │ │ 키워드   │       │
│  │ PDF변환  │ │ 파서     │ │ 메타추출 │ │ RAG      │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────────────────────────────────────────────┐       │
│  │ Infrastructure: Redis Stream, MongoDB, Qdrant    │       │
│  └──────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Layer 1: xPipe (도메인 무관)

재사용 가능한 순수 문서 처리 기능:

| 모듈 | 기능 | 현재 코드 위치 |
|------|------|---------------|
| **Ingest** | 파일 수신, 큐 관리, PDF 변환 | upload_worker, pdf_conversion_worker |
| **Extract** | 텍스트 추출, OCR | ocr_worker, doc_ocr.py |
| **Enrich** | 임베딩 생성, AI 분류 (범용), 메타 추출 (범용) | full_pipeline.py, doc_prep_main.py |
| **Search** | 벡터 검색, 키워드 검색, RAG | aims_rag_api, smart_search.py |

### 3.3 Layer 2: Domain Adapter (플러그인 인터페이스)

> **설계 주의사항** (Alex 리뷰 반영):
> - 현재 `openai_service.py`에서 분류+요약+제목을 **한 번의 AI 호출**로 처리 중
> - 어댑터를 개별 함수로 분리하면 AI 호출 횟수 증가 → 비용 증가
> - AR/CRS 감지는 파이프라인 **중간 단계**에서 발생하므로 `PostProcess`로는 커버 불가
> - → 인터페이스는 Phase 1에서 실제 코드 분석 후 확정. 아래는 **초안**

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class Category:
    code: str
    name: str
    parent: str | None = None

@dataclass
class Detection:
    doc_type: str           # "annual_report", "customer_review" 등
    confidence: float
    metadata: dict          # 감지 시 추출된 정보

class DomainAdapter(ABC):
    """도메인별 통합 어댑터 — AI 호출 최적화를 위해 단일 인터페이스로 통합"""

    # --- 분류 ---
    @abstractmethod
    def get_classification_config(self) -> dict:
        """분류 체계 + 프롬프트 + 유효 타입 반환
        xPipe 코어가 이 config로 AI 호출 (분류+요약 통합 유지)"""
        ...

    # --- 특수 문서 감지 (파이프라인 중간 분기) ---
    @abstractmethod
    def detect_special_documents(self, text: str, mime: str) -> list[Detection]:
        """도메인 특화 문서 감지 (보험: AR/CRS, 법률: 판례 등)
        파이프라인 중간에서 호출, 감지 결과에 따라 후속 처리 분기"""
        ...

    # --- 엔티티 연결 ---
    @abstractmethod
    def resolve_entity(self, detection: Detection, owner_id: str) -> dict:
        """감지된 문서에서 엔티티 연결 (보험: 고객명→고객ID)"""
        ...

    # --- 메타데이터 추출 ---
    @abstractmethod
    def extract_metadata(self, text: str, filename: str) -> dict:
        """도메인 특화 메타데이터 추출"""
        ...

    # --- 표시명 ---
    @abstractmethod
    def generate_display_name(self, doc: dict, detection: Detection | None) -> str:
        """표시명 생성 규칙"""
        ...

    # --- 단계별 후크 ---
    @abstractmethod
    def on_stage_complete(self, stage: str, doc: dict) -> list[dict]:
        """각 처리 단계 완료 후 후속 액션 (알림, 상태 변경 등)"""
        ...
```

> **초안 vs 이전 설계 차이점**:
> - 4개 개별 어댑터 → **1개 통합 `DomainAdapter`** (AI 호출 최적화 보존)
> - `DetectionAdapter` 추가 (AR/CRS 등 파이프라인 중간 감지)
> - `EntityResolutionAdapter` 추가 (고객명→고객ID 연결)
> - `classify()` 대신 `get_classification_config()` → xPipe 코어가 분류+요약 통합 AI 호출 관리

### 3.4 Layer 3: Application (AIMS 보험 구현 예시)

```python
class InsuranceClassificationAdapter(ClassificationAdapter):
    """AIMS 보험 도메인 분류 어댑터"""

    INSURANCE_CATEGORIES = [
        Category("health", "건강보험", "insurance"),
        Category("life", "생명보험", "insurance"),
        Category("annuity", "연금보험", "insurance"),
        # ... 7대분류/25소분류
    ]

    def get_categories(self):
        return self.INSURANCE_CATEGORIES

    def get_prompt_template(self):
        return M6_PROMPT  # 91.8% 정확도 프롬프트

    def classify(self, text: str, filename: str) -> ClassificationResult:
        # 현재 doc_prep_main.py의 분류 로직 이동
        ...

class InsuranceMetadataAdapter(MetadataAdapter):
    """보험 문서 메타데이터 추출"""

    def get_schema(self):
        return {
            "policyholder": str,      # 계약자
            "insured": str,           # 피보험자
            "policy_number": str,     # 증권번호
            "insurance_company": str, # 보험사
            "effective_date": str,    # 보험 시작일
        }

    def extract(self, text: str, filename: str) -> dict:
        # 현재 doc_meta.py의 보험 메타 추출 로직 이동
        ...
```

---

## 4. 제공 형태: SDK + API 하이브리드 전략

### 4.1 단계별 전략

| 단계 | 형태 | 설명 |
|------|------|------|
| **1단계 (현재)** | Python 패키지 (내부용) | xPipe을 `xpipe` 패키지로 분리. AIMS가 소비자 |
| **2단계 (수익화 후)** | + REST API | xPipe을 호스팅 API로도 제공. 외부 고객 대상 |
| **3단계 (확장)** | + SDK (npm/pip) | 외부 개발자가 자체 인프라에 설치 가능한 SDK 배포 |

### 4.2 분리 전략: Strangler Fig 패턴 (Alex 제안)

별도 패키지를 한 번에 만드는 것이 아니라, **기존 코드 내에서 디렉토리 경계를 먼저 나눈다**:

```
Phase 2: 기존 코드 내 디렉토리 분리

document_pipeline/
├── xpipe/               # 도메인 무관 코어 (점진적 이동)
│   ├── ingest/
│   ├── extract/
│   ├── enrich/
│   └── adapter.py       # DomainAdapter ABC 인터페이스
├── insurance/            # 보험 어댑터 (점진적 추출)
│   ├── classification.py
│   ├── ar_crs_detection.py
│   ├── metadata.py
│   └── display_name.py
├── routers/              # HTTP 진입점 (기존 유지)
└── workers/              # 기존 유지
```

```
Phase 3: xpipe/ 를 독립 패키지로 추출

xpipe/                    # 독립 Python 패키지
├── core/
│   ├── ingest/
│   ├── extract/
│   └── enrich/
├── adapter.py            # DomainAdapter ABC
├── infra/
│   ├── mongodb.py
│   ├── redis.py
│   └── qdrant.py
├── config/
│   └── settings.py
├── tests/                # 독립 검증 프레임워크
│   ├── unit/             # 모듈별 단위 테스트
│   ├── integration/      # 스테이지 간 통합 테스트
│   ├── regression/       # 회귀 테스트 (기준선 대비 검증)
│   ├── fixtures/         # 기본 제공 테스트 셋
│   └── external/         # 외부 주입 테스트 셋 (도메인별 샘플 문서 + 기대 결과)
│       └── README.md     # 테스트 셋 포맷 명세
├── providers/            # 외부 자원 관리 (유료 서비스 추상화)
│   ├── base.py           # Provider ABC (사용량 추적, 비용 계산 인터페이스)
│   ├── openai.py         # OpenAI API 제공자
│   ├── upstage.py        # Upstage OCR 제공자
│   ├── anthropic.py      # Anthropic API 제공자
│   ├── storage.py        # 스토리지 제공자
│   └── registry.py       # 제공자 등록·전환·한도 관리
└── console/              # 독립 관리 인터페이스
    ├── web/              # 웹 기반 대시보드 (모니터링 + 제어 + 비용)
    ├── cli/              # CUI 명령어 (xpipe status, xpipe run, xpipe cost 등)
    └── api/              # 관리 API (상태 조회, 스테이지 제어, 비용 조회, 설정 변경)
```

이렇게 하면 import 경로만 변경하면서 점진적으로 분리 가능. Phase 3에서 `xpipe/`만 별도 패키지로 추출.

---

## 5. 실행 로드맵

> **4차 검토 (2026-03-19)에서 Phase 구성 전면 재설계.**
> 3자(Alex, Gini, PM) 교차 검증으로 Phase 분리·순서 변경·게이트 조건·롤백 전략 보완.

### 전체 구조

```
Foundation (엔진 분리)                    Evolution (플랫폼 진화)

Phase 0: 선행조건 (3-4주)                 Phase 5-A: Quality Gate (2주)
Phase 1: 인터페이스 (3주)                 Phase 5-B: Provider 추상화 (3-4주)
Phase 2: 도메인 분리 (5-6주)              Phase 6-A: 이벤트/웹훅 (2주)
Phase 3-A: 패키지화 (2주)         ──M1──  Phase 6-B: 감사 로그 (2-3주)    ──M4──
Phase 3-B: 검증+제어 인터페이스 (3-4주)    Phase 7: 파이프라인 DSL (3-4주)
Phase 4: PoC (1-2주)              ──M2──  Phase 8: 멀티테넌시 (5-7주)     ──M5──
                                     │
                                     └──► Phase 5-A                     ──M3──
```

### 마일스톤 정의

| 마일스톤 | 완료 지점 | 의미 | 비즈니스 가치 |
|---------|---------|------|-------------|
| **M1: 분리 완료** | Phase 3-A | xPipe 독립 패키지 + AIMS 기존 동작 보존 | 기술 부채 해소, 개발 속도 향상 |
| **M2: 검증된 플랫폼** | Phase 4 | 독립 테스트 + 이식성 PoC 성공 | 이식성 원칙 입증, Evolution 진입 자격 |
| **M3: AIMS 품질 도약** | Phase 5-A+5-B+6-A | Quality Gate + Provider 핫스왑 + 이벤트/웹훅 | 사용자 체감 품질 향상, 비용 통제 |
| **M4: 컴플라이언스** | Phase 6-B | AI 판단 근거 보존 + 감사 로그 | 보험 규제 대응 |
| **M5 (조건부)** | Phase 7+8 | YAML DSL + 멀티테넌시 | 외부 고객 확보 시 |

---

### Phase 0: 선행 조건 해결 (3-4주)

> 기간 보정: 2-3주 → **3-4주** (doc_prep_main.py가 실제 1,777줄이므로 분해 기간 확대)

| 작업 | 근거 |
|------|------|
| `personal-files-routes.js` JWT 인증 우회 수정 | Gini: Critical 보안 이슈 |
| `chat-routes.js` userId 헤더 우선순위 수정 | Gini: Major 보안 이슈 |
| `/user/account/stream` SSE 인증 누락 수정 | Gini: 2번째 미보호 SSE 엔드포인트 |
| document_pipeline 인증 정책 결정 | Gini: 전역 인증 없음, CORS 전면 개방 |
| `doc_prep_main.py` God Function 분해 (1,777줄) | Alex: 오케스트레이터 + 단계별 함수로 분해 |
| **Q2 결정: Storage 추상화 여부** | Gini, PM: 미결 시 Phase 1 인터페이스 설계 불가 |
| 파이프라인 E2E 테스트 추가 | Gini: 실제 MongoDB+Redis 환경, 회귀 기준선 수치 포함 |

**Phase 0 게이트 조건 (전원 충족 시 Phase 1 진입):**
- [ ] 보안 이슈 Critical/Major 전원 해결
- [ ] E2E 테스트가 실제 인프라(MongoDB+Redis)에서 통과
- [ ] 회귀 기준선 확립: 분류 정확도 91.8%, 처리 성공률, P95 응답시간
- [ ] Q2 결정 완료 및 문서화
- [ ] `doc_prep_main.py`가 오케스트레이터 + 단계별 함수로 분해됨
- [ ] `git tag phase0-baseline` 생성 (롤백 기준점)

**롤백 전략**: 보안 수정 / God Function 분해를 별도 커밋으로 분리. 어느 시점으로든 `git reset --hard` 가능.

### Phase 1: 인터페이스 정의 (3주)

| 작업 | 설명 |
|------|------|
| `DomainAdapter` 통합 인터페이스 확정 | 분류config, 감지, 엔티티연결, 메타추출, 표시명, 단계후크 |
| Provider 역할별 ABC 인터페이스 초안 | `LLMProvider` (분류/요약), `OCRProvider` (텍스트 인식), `EmbeddingProvider` (벡터) |
| xPipe 모듈 경계 확정 (Q1 해소) | embedding pipeline 범위 포함 여부 결정 |
| 분류+요약 통합 AI 호출 보존 설계 | Alex: 어댑터가 config만 제공, xPipe가 AI 호출 관리 |
| 기존 코드에서 도메인 로직 식별 태깅 | grep으로 보험 특화 코드 마킹 |
| 어댑터 계약(contract) 테스트 구현 | Gini: 모든 DomainAdapter 구현체가 통과해야 하는 테스트 |
| SemVer 정책 확정 | 하위 호환성 원칙의 구체적 운영 규칙 문서화 |

**Phase 1 게이트 조건:**
- [ ] DomainAdapter ABC가 Python 파일로 존재 (mypy 통과)
- [ ] InsuranceAdapter 스텁이 ABC 구현체로 생성됨
- [ ] 계약 테스트 파일 존재 및 스텁 통과
- [ ] Q1 해소 (xPipe 모듈 경계 결정) 문서화
- [ ] Phase 0 E2E 테스트 ALL PASS 유지 확인

**롤백 전략**: Phase 1은 설계 단계이므로 코드 변경 최소. `git tag phase1-interface` 생성.

### Phase 2: 보험 도메인 분리 (5-6주)

| 작업 | 설명 |
|------|------|
| 디렉토리 경계 분리 (Strangler Fig) | `document_pipeline/` 내 `xpipe/`, `insurance/` 디렉토리 생성 |
| openai_service.py 비즈니스 로직 분리 | 크레딧 체크·로깅을 AI 호출에서 분리 (Phase 5-B 선행 작업) |
| openai_service.py 분류 프롬프트 → 어댑터 | M6 프롬프트+규칙 100줄+ 이동. 분류+요약 통합 호출 구조 보존 |
| doc_prep_main.py AR/CRS 감지 → 어댑터 | `detect_special_documents()` 구현 |
| 보험 메타 추출 → 어댑터 | doc_meta.py에서 추출 |
| 보험 표시명 규칙 → 어댑터 | doc_display_name.py에서 추출 |
| MongoService DB명 파라미터화 | `docupload` 하드코딩 → 설정 주입 가능 구조 (Phase 8 멀티테넌시 선행) |
| credit_pending 경로 검증 | PM: 크레딧 체크 스킵 경로가 분리 후 정상 동작 확인 |
| 회귀 테스트 전원 통과 확인 | Phase 0 기준선 대비 동일 결과 |

**Phase 2 게이트 조건:**
- [ ] `grep -r "annual_report\|AR_\|CRS_\|25소분류\|7대분류" xpipe/` → 0건
- [ ] InsuranceAdapter가 DomainAdapter 계약 테스트 통과
- [ ] 회귀 테스트 전원 통과 (분류 정확도 91.8% 이상, 처리 성공률 Phase 0 측정값 이상)
- [ ] credit_pending 경로 통합 테스트 통과

**롤백 전략**: Strangler Fig 3단계 롤백 기준.
- 단계 1 (디렉토리만 생성): `git revert` 1커밋
- 단계 2 (코드 이동 + 양쪽 import 공존): 기존 경로 import 복원 (`git tag phase2-mid`)
- 단계 3 (구 경로 삭제): `git tag phase2-before-cleanup` 필수 생성 후 삭제

### Phase 3-A: 패키지화 (2주)

| 작업 | 설명 |
|------|------|
| `xpipe` Python 패키지 생성 | pyproject.toml, 의존성 분리 |
| AIMS document_pipeline이 패키지를 import하도록 전환 | 기존 동작 유지 검증 |
| deploy_all.sh 배포 절차 갱신 | PM: 9번 단계 변경 필요 여부 확인 |
| 패키지 독립 실행 테스트 | AIMS 없이 xPipe 단독 동작 확인 |

**Phase 3-A 게이트 조건 (= M1 분리 완료):**
- [ ] `pip install -e /path/to/xpipe` 설치 후 AIMS 없이 단독 실행 가능
- [ ] xpipe 패키지 import 시 insurance/ 코드를 전혀 참조하지 않음
- [ ] AIMS `from xpipe import ...` 형태로 전환 완료
- [ ] Phase 0 E2E 테스트 재통과 (API 응답 형식 불변 확인)

**롤백 전략**: `git tag phase3a-package`. 패키지화 실패 시 Phase 2 상태(디렉토리 분리)로 즉시 복귀 가능.

### Phase 3-B: 독립 검증 + 독립 제어 인터페이스 (3-4주)

| 작업 | 설명 |
|------|------|
| 테스트 스위트 완성 | unit + integration + regression 테스트 내장 |
| 외부 테스트 셋 주입 인터페이스 | `tests/external/` 포맷 명세 + 주입 메커니즘 |
| console/cli 구현 | 최소 기능: `xpipe status`, `xpipe run`, `xpipe test` |
| console/api 구현 | 관리 API: 상태 조회, 스테이지 제어, 설정 변경 |
| Quick Start 가이드 초안 | 최소 코드로 xPipe 기동 → 문서 처리 → 결과 수신 |

**Phase 3-B 게이트 조건:**
- [ ] `xpipe test` 명령으로 전체 테스트 스위트 실행·판정 가능
- [ ] 외부 테스트 셋 1개 이상 추가하여 파이프라인 검증 성공
- [ ] `xpipe status` 명령으로 파이프라인 상태 확인 가능
- [ ] 관리 API로 스테이지 on/off 제어 가능

### Phase 4: 다른 도메인 PoC (1-2주)

> **Phase 4는 Foundation의 정식 완료 게이트. "보너스"가 아님.**

| 작업 | 설명 |
|------|------|
| 법률/의료 등 1개 도메인 어댑터 PoC | xPipe 재사용성 검증 |
| PoC 결과 기반 인터페이스 조정 | 범용성 부족한 부분 수정 |

**Phase 4 게이트 조건 (= M2 검증된 플랫폼):**
- [ ] 어댑터 구현 시 xPipe 코어 코드 수정 불필요
- [ ] DomainAdapter ABC에 보험 전용 메서드가 남아있지 않음
- [ ] PoC 어댑터가 DomainAdapter 계약 테스트 통과
- [ ] `xpipe test --adapter=poc-adapter` 로 외부 테스트 셋 검증 통과

**PoC 실패 시**: Phase 1로 복귀하여 인터페이스 재설계. 범용성 부족 목록 작성 → Phase 1 재작업 범위 확정.

---

### 확장 로드맵 (Evolution)

> Foundation(Phase 0~4) 완료 후 진입.
> **각 Phase는 독립적으로 가치를 제공**하며, 중간에 멈춰도 시스템은 안정 동작한다.
> Evolution Phase는 선택적·점진적으로 진행 가능하되, 순서 의존성을 준수한다.

```
Phase 4 완료 (M2)
       │
       ▼
Phase 5-A: Quality Gate (2주) ─── AIMS 품질 즉시 개선, Provider 불필요
       │
       ├──────────────────────────────────┐
       ▼                                  ▼
Phase 5-B: Provider 추상화 (3-4주)   Phase 6-B: 감사 로그 (2-3주) ── 병렬 가능
       │                                  │
       ▼                                  │
Phase 6-A: 이벤트/웹훅 (2주)              │
       │                                  │
       └──────────┬───────────────────────┘
                  ▼
       Phase 7: 파이프라인 DSL (3-4주)
                  │
                  ▼
       Phase 8: 멀티테넌시 (5-7주) ── 조건부: 외부 테넌트 확정 시에만
```

### Phase 5-A: Quality Gate (2주)

> **선행 조건**: Phase 4 완료 (M2)
> **목표**: 파이프라인 처리 결과의 품질을 자동 측정하고, 기준 미달 문서를 자동 분류한다
> **가치**: AIMS 사용자가 즉시 체감하는 품질 향상. Provider 추상화 없이 독립 구현 가능.

| 작업 | 설명 |
|------|------|
| **Quality Gate 프레임워크** | 분류 confidence 임계치, OCR 품질 점수 자동 산출 |
| **수동 검토 큐** | Quality Gate 미달 문서를 자동 플래그 → 검토 큐로 분리 |
| **정기 품질 측정** | Ground Truth 대비 정확도 주기적 자동 측정 + 품질 저하 시 알림 |
| **품질 대시보드** | 관리 인터페이스에 품질 지표 표시 |

**Phase 5-A 게이트 조건:**
- [ ] Quality Gate 미달 문서가 자동으로 검토 큐에 분류됨
- [ ] Ground Truth 대비 정확도 측정이 자동으로 실행·보고됨
- [ ] Phase 0 회귀 기준선 대비 처리 성능 10% 이내 유지

**롤백 전략**: Quality Gate는 신규 기능 추가이므로 기존 파이프라인에 영향 없음. `XPIPE_QUALITY_GATE=false` 환경 변수로 즉시 비활성화 가능.

### Phase 5-B: AI Provider 추상화 (3-4주)

> **선행 조건**: Phase 5-A 완료 (품질 측정이 가능한 상태에서 Provider 전환 효과를 검증)
> **목표**: 외부 AI 서비스를 교체 가능한 부품으로 만들고, 비용을 실시간 추적한다

| 작업 | 설명 |
|------|------|
| **Provider 역할별 ABC 구현** | `LLMProvider` (분류/요약), `OCRProvider` (텍스트 인식), `EmbeddingProvider` (벡터) |
| **기존 서비스 Provider화** | OpenAI, Anthropic, Upstage OCR, PaddleOCR을 Provider 구현체로 래핑 |
| **Provider Registry** | 런타임 제공자 등록·전환·한도 관리. 설정 파일로 제공자 매핑 |
| **폴백 체인** | 1순위 API 오류 시 자동으로 2순위 전환 |
| **런타임 핫스왑** | 관리 인터페이스에서 Provider 실시간 전환 |
| **비용 추적 엔진** | Provider별 호출 수·토큰 수·비용 실시간 집계 |
| **비용 대시보드** | 일별/월별/서비스별 비용 + 임계치 알림 |

**Phase 5-B 게이트 조건:**
- [ ] 새로운 AI Provider 추가 시 코드 변경 없이 설정만으로 연동 가능
- [ ] Provider 전환 후 Ground Truth 163건 A/B 검증: 정확도 차이 2%p 이내
- [ ] 비용 대시보드에서 Provider별 실시간 사용량·비용 확인 가능
- [ ] 폴백 체인: 1순위 Provider 강제 장애 주입 → 2순위 자동 전환 확인

**롤백 전략**: Provider 추상화 레이어를 bypass하는 직접 호출 경로 보존. `XPIPE_USE_PROVIDER_REGISTRY=false` 환경 변수로 즉시 기존 하드코딩 방식 복귀.

**핫스왑 안전 가드**: 처리 중 문서는 현재 Provider 유지, 새 문서부터 전환. 전환 후 10건 샘플링 → 품질 점수 임계치 미달 시 자동 롤백.

### Phase 6-A: 이벤트/웹훅 시스템 (2주)

> **선행 조건**: Phase 5-B 완료
> **목표**: 파이프라인 이벤트를 외부 시스템에 통지한다 (현재 AIMS SSE 알림의 범용화)

| 작업 | 설명 |
|------|------|
| **이벤트 발행** | `on_document_processed`, `on_stage_complete`, `on_error` 등 |
| **웹훅 URL 등록** | 관리 인터페이스에서 이벤트별 웹훅 URL 등록·관리 |
| **비동기 통지** | Fire-and-forget + 지수 백오프 재시도 (최대 3회) |
| **Dead Letter Queue** | 최종 실패 시 DLQ 저장 + 관리 인터페이스 알림 |

**Phase 6-A 게이트 조건:**
- [ ] 이벤트 발행 후 등록된 웹훅이 호출됨 (자동 테스트)
- [ ] 웹훅 실패 시 파이프라인 처리는 영향 없음 (Fire-and-forget 검증)
- [ ] DLQ에 실패 이벤트가 보존됨

**웹훅 실패 처리 정책**: 웹훅은 비동기, 파이프라인 처리 결과에 영향 없음. 재시도 3회 → DLQ → 관리 인터페이스 알림.

### Phase 6-B: 감사 로그 — Audit Trail (2-3주)

> **선행 조건**: Phase 5-A 완료 (Quality Gate가 있어야 품질 판단 근거 기록 의미 있음)
> **Phase 5-B와 병렬 진행 가능** — Provider 추상화와 무관하게 구현 가능
> **목표**: 규제 대응이 필요한 도메인에서 사용할 수 있는 변경 불가 감사 로그 (단일 테넌트에서도 동작)

| 작업 | 설명 |
|------|------|
| **처리 이력 기록** | 문서별: 누가, 언제, 어떤 스테이지를, 어떤 Provider로, 어떤 결과로 처리했는지 |
| **AI 판단 근거 보존** | 분류/요약 시 사용된 프롬프트 버전, AI 응답 원문, confidence 스코어 보존 |
| **Immutable Log Storage** | MongoDB write 전용 Role (삭제/수정 권한 없음) + 레코드별 SHA-256 해시 |
| **감사 로그 조회 API** | 문서 ID, 기간, 스테이지별 감사 로그 검색 |
| **관리 인터페이스 반영** | 감사 로그 뷰어: 문서별 처리 타임라인, AI 판단 근거 열람 |

**Phase 6-B 게이트 조건:**
- [ ] 모든 문서 처리 단계가 변경 불가 로그로 기록됨
- [ ] 감사 로그 삭제/수정 시도 → 권한 오류 확인 (자동 테스트)
- [ ] 레코드별 SHA-256 해시로 무결성 검증 가능
- [ ] 감사 로그 기록 후 처리 성능 Phase 0 기준선 대비 10% 이내 유지

**롤백 전략**: 감사 로그는 신규 기능 추가. `XPIPE_AUDIT_LOG=false`로 즉시 비활성화 가능.

### Phase 7: 파이프라인 커스터마이징 (3-4주)

> **선행 조건**: Phase 5-B + Phase 6-A 완료 (Provider가 교체 가능 + 이벤트 발행 가능)
> **목표**: 고정된 파이프라인을 유연한 조립식 구조로 전환한다

| 작업 | 설명 |
|------|------|
| **Stage ABC 인터페이스** | 각 스테이지를 독립된 플러그인 단위로 정의 |
| **조건부 스테이지 실행** | "이미 텍스트가 있으면 OCR 스킵" 같은 조건부 분기 |
| **커스텀 스테이지 삽입** | 솔루션별 전/후처리 스테이지를 파이프라인 임의 위치에 삽입 |
| **파이프라인 정의 (YAML/JSON)** | 설정 파일로 스테이지 순서·조건·파라미터를 선언적으로 정의 |
| **기본 프리셋** | 기존 AIMS 파이프라인을 기본 프리셋으로 제공 (하위 호환) |
| **YAML 스키마 검증** | 잘못된 파이프라인 정의를 기동 전 차단 (dry-run 모드) |
| **Q3 결정: 멀티테넌시 격리 수준** | Phase 8 진입 전 반드시 결정 (DB/컬렉션/필드 레벨) |

```yaml
# 예시: 파이프라인 정의 (xpipe-pipeline.yaml)
pipeline:
  name: "insurance-pipeline"
  stages:
    - stage: ingest
      config: { queue: redis, max_concurrent: 10 }
    - stage: extract
      config: { ocr_provider: paddleocr }
      skip_if: "document.has_text == true"
    - stage: custom:ar_detection
      module: "insurance.ar_crs_detection"
    - stage: enrich
      config: { classification_provider: openai, embedding_provider: openai }
    - stage: search
      config: { vector_db: qdrant }
  webhooks:
    on_document_processed: "https://aims.example.com/api/webhook/doc-done"
    on_error: "https://aims.example.com/api/webhook/error"
```

**Phase 7 게이트 조건:**
- [ ] 설정 파일만으로 파이프라인 스테이지 순서·조건 변경 가능
- [ ] 기존 AIMS 파이프라인이 기본 프리셋으로 **수정 없이** 동작 (Golden File 테스트)
- [ ] 커스텀 스테이지 예외 발생 시 전체 파이프라인 중단 없음 (skip_on_error 정책)
- [ ] Q3 결정 완료 및 문서화

**하위 호환 검증**: CI/CD에서 구 방식(코드 직접 호출) + 신 방식(기본 프리셋 YAML) 결과를 자동 비교. 차이 발생 시 PR 머지 차단.

**롤백 전략**: `XPIPE_USE_YAML_PIPELINE=false`로 즉시 기존 고정 파이프라인 복귀.

### Phase 8: 멀티테넌시 (5-7주) — 조건부

> **게이트 조건: 외부 테넌트가 1개 이상 확정된 경우에만 착수. 미충족 시 무기한 보류.**
> **선행 조건**: Phase 7 완료 (파이프라인이 설정 기반) + Q3 결정 완료
> **목표**: 하나의 xPipe 인스턴스에서 여러 테넌트를 격리 운영한다

| 작업 | 설명 |
|------|------|
| **테넌트 격리 구현** | Q3 결정에 따른 격리 구현 (DB/컬렉션/필드 레벨) |
| **테넌트별 설정 격리** | 어댑터·Provider·파이프라인 정의를 테넌트 단위로 관리 |
| **테넌트별 비용 할당** | Provider 비용을 테넌트별로 분리 집계 |
| **사용량 쿼터** | 테넌트별 처리 건수·스토리지·API 호출 한도 + 초과 시 정책 |
| **테넌트 관리 API** | 테넌트 CRUD + 상태 조회 + 관리 인터페이스 반영 |
| **테넌트 간 데이터 격리 검증** | 교차 접근/설정 격리/비용 격리/부하 격리 자동 테스트 |
| **감사 로그 테넌트 확장** | Phase 6-B 감사 로그에 테넌트 ID 추가 |

**Phase 8 게이트 조건 (= M5):**
- [ ] 2개 이상 테넌트가 격리 운영됨
- [ ] 교차 접근 테스트: 테넌트 A 데이터를 테넌트 B 컨텍스트로 조회 → 404/권한 오류
- [ ] 비용 격리 테스트: 테넌트 A API 호출이 테넌트 B 비용에 미포함
- [ ] 부하 격리 테스트: 테넌트 A 대량 처리 중 테넌트 B P95 응답시간 보장

**롤백 전략**: `XPIPE_MULTITENANT=false`로 단일 테넌트 모드 복귀. 마이그레이션 스크립트의 역방향(rollback 스크립트) 필수 작성.

---

### 총 소요 추정

**Foundation (Phase 0~4): xPipe 독립 분리**

| Phase | 기간 | 비고 |
|-------|------|------|
| Phase 0 | **3-4주** | 보안 + God Function 1,777줄 분해 + E2E 기준선 |
| Phase 1 | **3주** | 인터페이스 + 계약 테스트 + SemVer 정책 |
| Phase 2 | **5-6주** | Strangler Fig + openai_service 분리 |
| Phase 3-A | **2주** | 패키지화 (= M1) |
| Phase 3-B | **3-4주** | 테스트 스위트 + CLI/API |
| Phase 4 | **1-2주** | PoC (= M2) |
| **소계** | **17-21주** | |

**Evolution: 플랫폼 진화**

| Phase | 기간 | 필수/선택 | 비고 |
|-------|------|---------|------|
| Phase 5-A | **2주** | 필수 권장 | Quality Gate (AIMS 즉시 가치) |
| Phase 5-B | **3-4주** | 권장 | Provider 추상화 + 비용 추적 |
| Phase 6-A | **2주** | 권장 | 이벤트/웹훅 |
| Phase 6-B | **2-3주** | 필수 권장 | 감사 로그 (보험 규제 대응) |
| Phase 7 | **3-4주** | 권장 | 파이프라인 YAML DSL |
| Phase 8 | **5-7주** | 조건부 | 멀티테넌시 (외부 고객 확정 시) |
| **소계 (필수+권장)** | **12-15주** | | Phase 8 제외 |
| **소계 (전체)** | **17-22주** | | Phase 8 포함 |

| 구간 | 기간 |
|------|------|
| **Foundation** | **17-21주** |
| **Evolution (필수+권장)** | **12-15주** |
| **전체 (Phase 8 제외)** | **29-36주** |
| **전체 (Phase 8 포함)** | **34-43주** |

> Phase 5-B와 Phase 6-B는 병렬 진행 가능하여 Evolution을 **2-3주 단축** 가능.

---

## 6. 리스크 및 대응

### Foundation 리스크 (기존)

| # | 리스크 | 심각도 | 대응 |
|---|--------|--------|------|
| 1 | 과도한 추상화 → 개발 속도 저하 | Medium | Phase 1에서 인터페이스만 정의, 구현은 기존 코드 재사용 |
| 2 | 통합 테스트 부재 상태에서 분리 | High | Phase 0에서 파이프라인 E2E 테스트 먼저 추가 |
| 3 | **Storage 추상화 미결 → 인터페이스 재작업** | **High** | **Phase 0에서 Q2 결정 필수. 미결 시 Phase 1 진입 불가** |
| 4 | **분류+요약 통합 AI 호출 분리 → 비용 2배** | **High** | **어댑터가 config만 제공, xPipe가 AI 호출 관리** |
| 5 | **M6 분류 정확도 저하** | **High** | **Phase 2에서 회귀 테스트로 91.8% 유지 검증** |
| 6 | **리팩토링 중 파이프라인 중단** | **High** | **Strangler Fig + 각 Phase 롤백 전략 (환경 변수 기반)** |
| 7 | 보험 도메인 특화가 범용화로 희석 | Medium | Layer 3에서 도메인 특화 유지 |
| 8 | 인터페이스 설계 오류 (범용성 부족) | Medium | Phase 4 PoC에서 검증. 실패 시 Phase 1 재작업 |
| 9 | **document_pipeline 인증 부재** | **Critical** | **Phase 0에서 인증 정책 결정** |
| 10 | 기존 mock 테스트가 분리 후 무효화 | Medium | 어댑터 계약 테스트로 보완 |

### Evolution 리스크 (신규)

| # | 리스크 | 심각도 | Phase | 대응 |
|---|--------|--------|-------|------|
| 11 | **Provider 전환 시 분류 정확도 하락** (M6는 OpenAI 튜닝) | **High** | 5-B | Ground Truth A/B 검증 게이트 + 자동 롤백 |
| 12 | **런타임 핫스왑 중 결과 불일치** | **High** | 5-B | 처리 중 문서는 현재 Provider 유지, 새 문서부터 전환 |
| 13 | **YAML DSL 파이프라인 정의 오류 → 프로덕션 중단** | **Critical** | 7 | 스키마 검증 + dry-run 모드 필수 |
| 14 | **웹훅 실패가 파이프라인 처리 차단** | **High** | 6-A | Fire-and-forget + DLQ 정책 |
| 15 | **테넌트 격리 버그 → 데이터 노출** | **Critical** | 8 | 교차 접근 자동 테스트 + 배포 전 격리 검증 필수 |
| 16 | **Q3 미결 상태로 Phase 8 진입 → DB 마이그레이션 재작업** | **High** | 8 | Q3를 Phase 7 게이트 조건에 포함 |
| 17 | MongoDB에서 진정한 immutability 불가 → 규제 감사 실패 | Medium | 6-B | MongoDB write 전용 Role + SHA-256 해시 검증 |
| 18 | 감사 로그 대용량 → 처리 성능 10% 이상 하락 | Medium | 6-B | 비동기 로그 기록 + 성능 벤치마크 게이트 조건 포함 |

---

## 7. 기술 부채 (Gini 감사 결과, 모듈화 전 해결 권장)

| 순위 | 심각도 | 항목 | 위치 |
|------|--------|------|------|
| 1 | **Critical** | personal-files-routes.js JWT 우회 인증 | routes/personal-files-routes.js:30 |
| 2 | **Critical** | document_pipeline 전역 인증 없음 + CORS 전면 개방 | document_pipeline/main.py |
| 3 | **Major** | chat-routes.js userId 헤더 우선 | routes/chat-routes.js:29 |
| 4 | **Major** | SSE 엔드포인트 인증 누락 (2건) | customers-routes.js:3298, :3381 |
| 5 | **Major** | doc_prep_main.py God Function (600줄+) | document_pipeline/routers/doc_prep_main.py |
| 6 | **Major** | App.tsx 2,644줄 God Component | src/App.tsx |
| 7 | **Major** | raw fetch 직접 사용 11곳+ | App.tsx, LoginPage.tsx, DocumentStatusProvider.tsx 등 |
| 8 | **Major** | Store 3곳 분산 + 인증 상태 이중화 | stores/user.ts, shared/stores/, shared/store/ |
| 9 | **Major** | services → UI 스토어 직접 import | services/customerService.ts |
| 10 | **Minor** | as any 남용 | PersonalFilesView.tsx 18회 등 |

---

## 8. 토의 기록

### 2026-03-13 초기 토의

**참여자**: Alex, Gini, Architect, PM, Moderator (Claude)

**주요 합의사항**:
1. 3-Layer 아키텍처 (xPipe → Domain Adapter → Application) 채택
2. 제공 형태는 Python 패키지 우선, API는 수익화 후
3. Phase 0 (보안+선행조건) → Phase 1 (인터페이스) → Phase 2 (분리) → Phase 3 (패키지화) → Phase 4 (PoC) 순서
4. "리팩토링으로서의 모듈화" — 새 서비스를 만들지 말고, 기존 코드에서 경계를 나누는 방식
5. PG 결제 연동 / SaaS API 제공은 현재 스코프 밖

**미결 사항**:
- [ ] Q1: xPipe의 정확한 분리 범위 (embedding pipeline 포함 여부 등)
- [ ] **Q2: 데이터 저장소 전략 — Phase 0에서 반드시 결정** (Gini, PM: 미결 시 Phase 1 진입 불가)
- [ ] Q3: 멀티테넌시 수준 (DB 레벨 격리 vs 컬렉션 레벨 격리 vs 필드 레벨 격리)
- [ ] 다른 도메인 PoC 대상 선정 (법률? 의료? 금융?)
- [ ] xPipe 하위 모듈 이름 (리팩토링 진행하며 경계가 드러난 후 결정)

### 2026-03-13 2차 토의 — 엔진 이름 확정 및 방향 합의

**합의사항**:
1. **엔진 이름: xPipe** 확정
   - x = 어떤 문서든, 어떤 도메인이든 — 범용성을 한 글자로 표현
   - Pipe = 문서 처리 파이프라인이라는 본질
   - *"xPipe 위에 보험 어댑터를 얹으면 AIMS가 된다"*
2. **하위 모듈 이름은 지금 정하지 않는다** — 리팩토링하며 실제 경계가 드러난 후 결정
3. **PG 연동 / SaaS API 제공은 현재 스코프 밖** — 시기상조
4. **마일스톤 정의**: 현재 혼재된 구조에서 레이어를 완전히 독립시키고, 분리된 구조 위에서 AIMS가 안정적으로 동작하는 것을 검증하는 것

**방향성**:
- 새 서비스를 만드는 것이 아니라, 기존 코드의 **리팩토링**으로 레이어를 분리한다
- xPipe(범용 코어)와 보험 도메인 로직의 경계를 명확히 나눈다
- 분리 후 AIMS 전체 파이프라인이 기존과 동일하게 동작하는 것을 검증한다

### 2026-03-13 3차 — 에이전트 리뷰 피드백

보고서 초안에 대해 Alex, Gini, PM이 실제 코드를 검증하며 리뷰를 수행함.

#### Alex (아키텍트/개발자) 피드백

**핵심 지적:**

1. **Adapter 4개로 부족 — DetectionAdapter 누락이 치명적**
   - AR/CRS 감지가 파이프라인 **중간 단계**에서 발생하며, 감지 결과에 따라 후속 처리가 완전히 달라짐
   - `PostProcessAdapter.onComplete()`로는 커버 불가 — 감지가 파이프라인 완료 전에 발생하기 때문
   - 필요한 추가 어댑터: `DetectionAdapter`, `SummarizationAdapter`, `EntityResolutionAdapter`

2. **분류+요약이 한 번의 AI 호출로 통합되어 있음**
   - `openai_service.py`의 `summarize_text()`가 분류/요약/제목을 한번에 반환
   - 어댑터로 분리하면 **AI 호출 횟수 2배 → 비용 2배**
   - `ClassificationAdapter.classify(text, filename)` 인터페이스로는 이 최적화가 깨짐

3. **`doc_prep_main.py`가 600줄+ God Function**
   - Ingest + Extract + Enrich + 도메인 로직이 모두 혼재된 오케스트레이터
   - 모듈화 전에 먼저 분해해야 함 → Phase 0에 포함 권장

4. **서비스 수 불일치**: 문서 "13개" → 실제 11개

5. **embedding/full_pipeline.py 범위 미결정**
   - cron으로 1분마다 실행되는 별도 프로세스
   - xPipe에 포함할지 결정 필요

6. **Phase 기간 과소평가**: 문서 9-12주 → 현실적 추정 **14-18주**

**제안:**
- Strangler Fig 패턴 — 별도 패키지 대신 기존 코드 내 디렉토리 경계(`xpipe/`, `insurance/`)부터 나누기
- 어댑터를 통합하여 `PipelineAdapter` 단일 인터페이스로 재설계 (AI 호출 최적화 보존)

#### Gini (품질 엔지니어) 피드백

**핵심 지적:**

1. **기술 부채 목록 정확도 문제**
   - SSE 인증 누락: 문서는 1건(`:3298`)만 명시 → 실제 2건 (`:3381` `/user/account/stream`도 미보호)
   - raw fetch: 문서 "3곳" → 실제 **11곳 이상** (Minor가 아닌 Major 재분류 필요)

2. **Critical 누락 — document_pipeline 인증 부재**
   - FastAPI :8100에 전역 인증 미들웨어 **전혀 없음**
   - CORS `allow_origins=["*"]` 전면 개방
   - 현재 Tailscale VPN으로 보호되지만, xPipe를 외부 API로 전환 시 심각한 문제
   - 섹션 7에 이 항목이 전혀 없음

3. **Storage 추상화(Q2)가 미결인 채 Phase 1 진입은 위험**
   - `MongoService`가 싱글턴 클래스 메서드, DB명 `docupload` 하드코딩
   - Storage 추상화 여부에 따라 인터페이스 자체가 달라짐
   - Medium이 아닌 **High** 리스크

4. **테스트 전략 구체성 부족**
   - "E2E 테스트"의 정의 없음 (실제 인프라 vs mock 기반)
   - 어댑터 계약(contract) 테스트 전략 없음
   - 회귀 테스트 기준선 수치 없음

5. **Phase 0 "1주"는 비현실적** — E2E 테스트가 실제 인프라 기반이면 최소 2-3주

**판정**: 조건부 승인 — 기술 부채 목록 보완 + Phase 0 선행 조건 보완 + Q2 우선 결정 후 재검토

#### PM (제품 매니저) 피드백

**핵심 지적:**

1. **Definition of Done(완료 기준)이 전혀 없다** (0/10)
   - "안정적으로 동작" 을 어떻게 측정하는가?
   - 제안한 DoD:
     - 기능 보존: E2E 테스트 전/후 동일, M6 정확도 91.8% 유지, 처리 시간 10% 이내 오차
     - 코드 구조: 보험 도메인 키워드가 어댑터 외에 존재하지 않음 (grep 검증)
     - 독립성: xPipe 패키지가 AIMS 없이 단독 실행 가능

2. **WHY NOW가 없다** — 비즈니스 관점 불충분 (3/10)
   - 왜 지금 해야 하는가, 기회 비용은?
   - 9-12주 리소스의 트레이드오프 명시 필요
   - "리팩토링 + 미래 옵션 확보"라는 이중 목적이 뒤섞여 있음

3. **AIMS 운영 리스크 부족** (4/10)
   - M6 분류 정확도 보존 검증 방법 없음
   - AR/CRS 분리 시 SKILL.md 규칙 보존 여부 미검토
   - credit_pending 처리 경로 분리 후 정상 동작 미검토
   - 배포 파이프라인(deploy_all.sh) 변경 필요 여부 미언급

4. **PM 의견과 합의사항 상충**
   - 섹션 2.4: "수익화(PG 연동) 병행 필수"
   - 섹션 8 합의: "PG 연동은 스코프 밖"
   - → 불일치 해소 필요

5. **문서 구조 제안**: 토의 기록은 별도 파일로 분리, 이 문서는 의사결정 결과와 실행 계획만

#### 3개 리뷰 공통 지적 (교차 검증)

| 지적 사항 | Alex | Gini | PM | 합의 |
|-----------|:----:|:----:|:--:|------|
| Phase 기간 과소평가 | ✓ | ✓ | - | 9-12주 → 14-18주 재산정 필요 |
| Phase 0 "1주" 비현실적 | ✓ | ✓ | - | 최소 2-3주 |
| Definition of Done 없음 | - | - | ✓ | 측정 가능한 완료 기준 추가 필수 |
| openai_service.py 분리 난이도 과소평가 | ✓ | ✓ | - | 분류+요약 통합 호출 구조 고려 필요 |
| Q2(Storage 추상화) Phase 1 전 결정 필요 | - | ✓ | ✓ | 미결로 두면 인터페이스 재설계 불가피 |
| document_pipeline 인증 부재 | - | ✓ | - | Critical 항목으로 기술 부채 추가 |

### 2026-03-13 최종 — 우선순위 확정 및 보고서 보완

**확정사항**:
- xPipe 모듈화는 **AIMS 프로젝트의 최우선 일정**으로 확정
- 마일스톤: Phase 3 완료 (xPipe 독립 패키지 + AIMS 안정 동작 검증)
- Phase 4(다른 도메인 PoC)는 마일스톤 이후 보너스

**보고서 보완 (3차 리뷰 피드백 반영)**:
- 섹션 1.3 WHY NOW 추가 (PM)
- 섹션 1.4 Definition of Done 추가 (PM)
- 어댑터 인터페이스: 4개 개별 → 1개 통합 `DomainAdapter` 재설계 (Alex)
- Phase 기간: 9-12주 → 13-17주 보정 (Alex, Gini)
- Phase 0: 1주→2-3주, 게이트 조건 추가, 5개 작업 추가 (Gini)
- Phase 2: Strangler Fig 패턴 적용 (Alex)
- 리스크 테이블: 5개→10개 확장 (전원)
- 기술 부채: 8개→10개, 정확도 보정 (Gini)
- PM 의견 상충 해소: "PG 병행 필수" → "PG는 스코프 밖" 통일

### 2026-03-19 4차 — 현행화 검토 + 확장 전략 수립 + Phase 전면 재설계

**참여자**: Alex, Gini, PM, Moderator (Claude)

#### 4차-1: 현행화 검토 결과

**3자 공통 지적**:
- Phase 0 게이트 조건 5개 중 0개 충족 — Phase 1 진입 불가 상태
- doc_prep_main.py: 문서 기재 600줄+ → 실제 1,777줄 (3배 과소평가)
- raw fetch: 문서 기재 11곳+ → 실제 23파일/39회
- 기술 부채 10개 항목 전원 미해결
- 전략적 프레임워크 자체는 유효, 수치 보정 필요

#### 4차-2: 신규 요구사항 반영

1. **xPipe 최우선 원칙 — AIMS First**
   - xPipe는 AIMS 지원을 최우선으로 한다
   - AIMS에서 xPipe를 효율적으로 사용할 수 있는 구조가 기본 설계 방향
   - 범용성은 AIMS 최적화를 해치지 않는 범위에서 추구한다
   - 최고의 아키텍트(Alex)가 AIMS-xPipe 간 구조를 설계·개선한다

2. xPipe "자동차 엔진" 철학 — 6가지 독립성 원칙 수립
   - 독립 실행, 독립 검증, 독립 제어, 이식성, 외부 자원 투명성, 하위 호환성

3. 확장 로드맵 Phase 5~8 추가 (B,C,D,E,G 아이디어 반영)

#### 4차-3: Phase 전면 재설계 (Alex, Gini, PM 3자 교차 검토)

**3자 공통 합의**:

| 합의 사항 | Alex | Gini | PM |
|-----------|:----:|:----:|:--:|
| Phase 3 과부하 → 3-A(패키지화)/3-B(검증+제어) 분리 | ✓ | ✓ | ✓ |
| Phase 5의 Provider + Quality Gate 분리 | ✓ | ✓ | ✓ |
| Phase 4를 "보너스" → 정식 게이트 격상 | - | ✓ | ✓ |
| 감사 로그를 멀티테넌시 앞으로 이동 | ✓ | - | ✓ |
| 멀티테넌시를 조건부 Phase로 (외부 고객 확정 시) | ✓ | ✓ | ✓ |
| 전 Phase에 게이트 조건 + 롤백 전략 추가 | ✓ | ✓ | - |
| Phase 0 기간: 2-3주 → 3-4주 (1,777줄 분해) | ✓ | ✓ | ✓ |
| 멀티테넌시 기간: 3-4주 → 5-7주 (과소평가) | ✓ | ✓ | - |
| Phase 간 병렬 진행 가능성 활용 (5-B ∥ 6-B) | ✓ | - | ✓ |

**재설계 결과**:
- Foundation: Phase 0 → 1 → 2 → 3-A (M1) → 3-B → 4 (M2)
- Evolution: 5-A → 5-B ∥ 6-B → 6-A → 7 → 8 (조건부)
- 마일스톤 5단계: M1(분리) → M2(검증) → M3(품질도약) → M4(컴플라이언스) → M5(멀티플랫폼, 조건부)
- 각 Phase에 게이트 조건(진입 조건) + 롤백 전략(환경 변수 기반) 추가
- 리스크 테이블: 10개 → 18개 (Evolution 리스크 8개 추가)

---

## 부록: 확장 아이디어 (참고용)

> 아래는 xPipe 플랫폼 진화를 위해 검토된 아이디어 목록이다.
> ★ 표시는 로드맵에 반영 완료된 항목, ○ 표시는 미반영 참고 항목이다.

### A. 플러그인 마켓플레이스 / 어댑터 레지스트리 ○

현재 어댑터는 직접 코드를 작성해야 한다. 한 단계 더 나아가면:
- **어댑터 레지스트리**: `xpipe install insurance-adapter`처럼 어댑터를 패키지로 배포·설치
- 제3자가 만든 어댑터도 등록 가능 → 생태계 확장
- 버전 관리: 어댑터 버전과 xPipe 코어 버전 호환성 매트릭스

> **미반영 사유**: 생태계 규모가 충분해진 후 검토. 현재는 어댑터 수가 소수이므로 시기상조.

### B. 멀티테넌시 기본 지원 ★ → Phase 8 (조건부)

제3의 솔루션이 xPipe를 쓸 때, 하나의 xPipe 인스턴스에서 여러 테넌트(고객사)를 격리하여 운영:
- 테넌트별 설정·어댑터·스토리지·비용 격리
- 테넌트별 사용량 쿼터 및 비용 할당
- Q3(멀티테넌시 수준) 미결 사항과 직결

### C. 파이프라인 스테이지 커스터마이징 ★ → Phase 7

현재 파이프라인은 고정 순서(Ingest → Extract → Enrich → Search)이지만:
- **스테이지 선택적 실행**: "OCR 불필요 → Extract 스킵" 같은 조건부 파이프라인
- **커스텀 스테이지 삽입**: 솔루션별 전/후처리 스테이지를 파이프라인에 끼워넣기
- 설정 파일(YAML/JSON)로 파이프라인 흐름을 정의하는 **파이프라인 DSL**

### D. AI 제공자 추상화 + 핫스왑 ★ → Phase 5-B

현재 OpenAI, Anthropic, Upstage 등이 하드코딩되어 있는 상태에서:
- **Provider 인터페이스**로 추상화 → 새 AI 서비스 추가 시 코드 변경 없이 설정만으로 전환
- **런타임 핫스왑**: 관리 인터페이스에서 "분류는 Anthropic → OpenAI로 전환" 같은 실시간 변경
- **폴백 체인**: 1순위 API 오류 시 자동으로 2순위로 전환 (비용/속도/품질 트레이드오프 설정)

### E. 처리 결과 품질 자동 측정 — Quality Gate ★ → Phase 5-A

파이프라인이 돌아간 뒤 결과의 품질을 자동으로 측정:
- 분류 confidence가 임계값 이하 → 자동 플래그 + 수동 검토 큐
- OCR 품질 점수 (글자 인식률) 자동 산출
- 주기적으로 Ground Truth 대비 정확도 측정 → 품질 저하 시 알림
- 이 데이터가 관리 인터페이스의 품질 대시보드에 표시

### F. 이벤트/웹훅 시스템 ★ → Phase 6-A (독립 Phase로 분리)

xPipe를 탑재한 솔루션이 파이프라인 이벤트를 구독할 수 있도록:
- `on_document_processed`, `on_classification_complete`, `on_error` 등 이벤트
- 웹훅 URL 등록 → 이벤트 발생 시 외부 시스템에 자동 통지
- 현재 AIMS의 SSE 알림이 이 패턴의 특수 사례 → 범용화

### G. 문서 처리 감사 로그 — Audit Trail ★ → Phase 6-B (멀티테넌시 앞으로 이동)

규제가 있는 도메인(금융, 의료, 법률)에서 필수:
- 문서별 처리 이력: 누가, 언제, 어떤 스테이지를, 어떤 결과로 처리했는지
- AI 판단 근거 보존: 분류 시 사용된 프롬프트 버전, 응답 원문
- 변경 불가(immutable) 로그 → 컴플라이언스 대응

---

*이 문서는 토의가 진행됨에 따라 계속 업데이트됩니다.*
