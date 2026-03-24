# xPipe 레이어 아키텍처

**작성일**: 2026-03-24
**검증**: Alex 교차검증 완료

---

## 1. 구조 변천

### xPipe 도입 전 (모놀리식)

```
AIMS (프론트엔드)
  └→ document_pipeline (전부 직접 처리)
       ├→ 텍스트 추출 (자체 코드)
       ├→ AI 분류 (자체 코드)
       ├→ AR/CRS 감지 (자체 코드)
       └→ MongoDB 저장, SSE 알림
```

document_pipeline이 파일 저장부터 텍스트 추출, AI 분류, 특수문서 감지, DB 저장, 알림까지 모든 것을 직접 처리하는 모놀리식 구조.

### xPipe 도입 후 (레이어 분리)

```
AIMS (프론트엔드)
  └→ document_pipeline (접착 + 후처리 오케스트레이션)
       └→ xPipe 엔진 (추출, 분류, 감지)
            └→ InsuranceAdapter (보험 도메인 로직)
```

핵심 처리 로직을 xPipe 엔진으로 분리. document_pipeline은 AIMS-xPipe 간 접착 계층 + 파이프라인 후처리 오케스트레이션을 담당.

---

## 2. 현재 레이어 구조

```
┌──────────────────────────────────────────────────────────┐
│                       상위 레이어                          │
│                                                          │
│   AIMS (document_pipeline)   │  xPipeWeb                 │
│   InsuranceAdapter 고정 사용   │  기본 범용, 어댑터 주입 가능 │
├──────────────────────────────────────────────────────────┤
│                       하위 레이어                          │
│                                                          │
│                    xPipe (코어 엔진)                       │
│   Pipeline, Stage, Adapter 인터페이스                      │
│   EventBus, CostTracker, QualityGate, Scheduler 등       │
└──────────────────────────────────────────────────────────┘
```

### 각 레이어의 역할

| 레이어 | 구성 요소 | 역할 |
|--------|----------|------|
| **xPipe 코어** | `xpipe/pipeline.py`, `xpipe/stage.py`, `xpipe/adapter.py` + 보조 모듈(`events.py`, `cost_tracker.py`, `quality.py`, `scheduler.py`, `queue.py`) | 도메인 무관한 범용 파이프라인 엔진. 스테이지 실행, 어댑터 인터페이스 정의, 이벤트 버스, 비용 추적, 품질 게이트 |
| **AIMS** | `document_pipeline` + `InsuranceAdapter` | 접착 계층(파일 저장, MongoDB 매핑, SSE 알림) + 후처리 오케스트레이션(AR/CRS 결과 매핑, 엔티티 연결, HookResult 실행) + 보험 도메인 로직 |
| **xPipeWeb** | `xpipe/console/web/server.py` | xPipe 파이프라인 모니터링/관리 UI. 기본값은 어댑터 없이 범용 동작하지만, 설정 API를 통해 InsuranceAdapter 등 어댑터 주입 가능 |

### AIMS 내부 상세

```
AIMS 프론트엔드 (React)
  │
  ▼
document_pipeline (FastAPI :8100)
  │
  ├─ 접착 역할
  │   ├→ 파일 저장 (디스크)
  │   ├→ MongoDB 스키마 매핑
  │   ├→ SSE 웹훅 알림
  │   ├→ 고객 연결
  │   └→ overallStatus 관리
  │
  ├─ 후처리 오케스트레이션 (xPipe 실행 후)
  │   ├→ AR/CRS 감지 결과 → document_type 오버라이드
  │   ├→ resolve_entity (고객명 → 고객 ID 매핑)
  │   ├→ generate_display_name (표시명 생성)
  │   └→ HookResult 실행 (DB 업데이트, SSE 알림, 파싱 트리거)
  │
  └─ xPipe 엔진 호출
      │
      ├→ ExtractStage (텍스트 추출)
      ├→ ClassifyStage (AI 분류)
      ├→ DetectSpecialStage (특수문서 감지)
      │   └→ InsuranceAdapter.detect_special_documents()
      └→ CompleteStage (완료)
```

> **참고**: 후처리 오케스트레이션은 현재 document_pipeline에서 직접 수행하고 있다.
> 향후 xPipe 코어 내부로 이동하여 document_pipeline을 순수한 접착 계층으로 만드는 것이 목표.

---

## 3. 어댑터 패턴

xPipe는 어댑터를 통해 도메인별 로직을 주입받는다.

| 소비자 | 어댑터 | 주입하는 도메인 로직 |
|--------|--------|-------------------|
| AIMS | `InsuranceDomainAdapter` (고정) | AR/CRS 감지, 분류 프롬프트(get_classification_config), 표시명 생성, 고객 연결(resolve_entity), HookResult, 도메인 메타데이터 추출(스텁) |
| xPipeWeb | 없음 (기본) / 설정 API로 주입 가능 | 기본: 범용 파이프라인 모니터링. 설정 시: AIMS와 동일한 도메인 로직 |
| (향후 확장) | `LegalAdapter` 등 | 법률 문서, 의료 문서 등 다른 도메인 |

### DomainAdapter ABC 인터페이스

| 메서드 | 용도 | InsuranceAdapter 구현 |
|--------|------|---------------------|
| `get_classification_config()` | 분류 체계 + 프롬프트 | 보험 문서 유형 16종 |
| `detect_special_documents()` | 특수문서 감지 | AR/CRS 패턴 매칭 |
| `resolve_entity()` | 문서 → 엔티티 연결 | 고객명 → 고객 ID |
| `generate_display_name()` | 표시명 생성 | 고객명_AR_날짜.pdf |
| `on_stage_complete()` | 스테이지 완료 후 HookResult | DB 업데이트, SSE, 파싱 트리거 |
| `extract_domain_metadata()` | 도메인 메타데이터 | 스텁 (미구현) |

---

## 4. 엔진 전환 메커니즘

`PIPELINE_ENGINE` 환경변수로 즉시 전환 가능.

```
process_document_pipeline()
  │
  ├─ PIPELINE_ENGINE=xpipe  →  _process_via_xpipe()
  │   └→ xPipe Pipeline 실행 + InsuranceAdapter
  │
  └─ PIPELINE_ENGINE=legacy  →  _process_via_legacy()
      └→ 이전 모놀리식 코드 (fallback 보존)
```

- xPipe 실패 시 자동 legacy fallback (안전장치)
- Legacy 코드는 xPipe 안정 운영 확인 후 제거 예정

---

## 5. 알려진 아키텍처 이슈

| # | 이슈 | 영향 | 향후 계획 |
|---|------|------|----------|
| 1 | 후처리 오케스트레이션이 document_pipeline에 잔존 | document_pipeline이 순수 접착 계층이 아님 | xPipe 코어 내부로 이동 |
| 2 | `xpipe/console/web/server.py`가 `insurance.adapter`를 직접 import | xPipe 패키지 독립 배포 시 의존성 문제 | 동적 import 또는 플러그인 구조로 전환 |
| 3 | `xpipe/tests/`에서 InsuranceAdapter 직접 import | 코어 테스트가 도메인에 의존 | 테스트용 MockAdapter로 교체 |

---

## 6. 참조

- [xPipe × AIMS 통합 보고서](2026-03-24_XPIPE_AIMS_INTEGRATION_REPORT.md)
- [xPipe × AIMS 통합 기획안](XPIPE_AIMS_INTEGRATION_PLAN.md)
- [xPipe 모듈화 전략](XPIPE_MODULARIZATION_STRATEGY.md)
