# DGX Spark 도입 및 AI Gateway 이중화 아키텍처 설계

> **작성일**: 2026-03-11
> **상태**: 설계 검토 완료 (PoC 전)
> **목표**: 외부 API(OpenAI, Upstage) 의존성을 DGX Spark 로컬 추론으로 점진적 전환

---

## 1. 현황 분석

### 1.1 현재 외부 API 사용 현황

AIMS는 두 개의 외부 AI API에 의존하고 있다.

#### OpenAI API

| 기능 | 사용 위치 | 모델 |
|------|-----------|------|
| 문서 분류 | `document_pipeline/services/openai_service.py` | gpt-4.1 |
| 문서 요약 | `document_pipeline/routers/doc_summary.py` | gpt-4.1 |
| AI 채팅/어시스턴트 | `aims_api/lib/chatService.js` | gpt-4.1 |
| 임베딩 생성 | `embedding/create_embeddings.py` | text-embedding-3-small |
| AR/CRS 파싱 | `annual_report_api/services/parser.py` | gpt-4.1 |
| RAG 쿼리 분석 | `aims_rag_api/query_analyzer.py` | gpt-4o-mini |
| 음성 전사 | `aims_api/lib/transcribeService.js` | whisper-1 |

#### Upstage API

| 기능 | 사용 위치 |
|------|-----------|
| OCR (문서 텍스트 추출) | `document_pipeline/services/upstage_service.py` |
| AR/CRS 테이블 파싱 | `annual_report_api/services/parser_upstage.py` |
| AutoClicker OCR | `tools/auto_clicker_v2/ocr/upstage_ocr_api.py` |

**총 84개 파일**에서 외부 API를 참조하고 있다.

### 1.2 현재 문제점

- **API 비용**: OpenAI + Upstage 월별 과금
- **데이터 보안**: 고객 보험 문서가 외부 서버로 전송됨
- **속도 제한**: OpenAI 429 에러, rate limit (동시 처리 제한)
- **레이턴시**: 네트워크 왕복 시간
- **외부 종속성**: API 장애 시 AIMS 전체 AI 기능 마비

---

## 2. DGX Spark 클러스터 구성

### 2.1 하드웨어 스펙

| 항목 | 1대 | 2대 연결 (NVLink-C2C) |
|------|-----|----------------------|
| GPU | GB10 Grace Blackwell | 동일 × 2 |
| 메모리 | 128GB 통합메모리 | 256GB |
| CPU | Grace ARM 20코어 | 40코어 |
| AI 성능 | 1 PetaFLOP (FP4) | 2 PetaFLOP |
| 저장소 | 4TB NVMe SSD | 8TB |
| 연결 | — | NVLink-C2C 900GB/s |

256GB 통합메모리로 **70B~128B급 모델**을 양자화 없이 또는 가벼운 양자화로 구동 가능.

### 2.2 기능별 로컬 대체 모델

| 현재 기능 | 현재 모델 | 로컬 대체 후보 | 배치 노드 |
|-----------|-----------|----------------|-----------|
| 문서 분류 | gpt-4.1 | Llama 3.3 70B / Qwen 2.5 72B | Spark #1 |
| 문서 요약 | gpt-4.1 | 동일 LLM | Spark #1 |
| AI 채팅 | gpt-4.1 | 동일 LLM | Spark #1 |
| RAG 쿼리 분석 | gpt-4o-mini | 동일 LLM | Spark #1 |
| AR/CRS 파싱 | gpt-4.1 | 동일 LLM | Spark #1 |
| 임베딩 | text-embedding-3-small | BGE-M3 | Spark #2 |
| 음성 전사 | Whisper API | Whisper Large v3 | Spark #2 |
| OCR | Upstage | PaddleOCR / GOT-OCR2 / Florence-2 | Spark #2 |
| 테이블 파싱 | Upstage | Table Transformer + LLM 후처리 | Spark #2 |

---

## 3. AI Gateway 이중화 아키텍처

### 3.1 설계 원칙

1. **기능별 독립 라우팅** — 분류는 로컬, OCR은 외부 등 개별 선택 가능
2. **자동 Failover** — Spark 장애 시 외부 API로 즉시 전환 (이중화 대상만)
3. **설정 기반 전환** — 코드 변경 없이 DB 설정만으로 전환
4. **완전 분리 가능** — 외부 의존성 제거 시점에 설정 한 줄로 차단

### 3.2 전체 구조도

```
┌─────────────────────────────────────────────────────────────┐
│  AIMS 서버 (tars.giize.com)                                  │
│  ├─ aims_api (Node.js)                                       │
│  ├─ document_pipeline (FastAPI)                              │
│  ├─ annual_report_api (FastAPI)                              │
│  └─ aims_rag_api (FastAPI)                                   │
│       │                                                      │
│       │  OpenAI-compatible API (동일 인터페이스)                │
│       ▼                                                      │
│  ┌─────────────────────────────────────────────────────┐     │
│  │           AI Gateway (FastAPI) :8200                  │     │
│  │                                                      │     │
│  │  ┌─ 이중화 그룹 (Failover 지원) ─────────────────┐   │     │
│  │  │  OCR, 전사, 일반 채팅/요약                      │   │     │
│  │  │  primary: local │ fallback: external            │   │     │
│  │  └────────────────────────────────────────────────┘   │     │
│  │                                                      │     │
│  │  ┌─ 고정 그룹 (단일 provider, Failover 없음) ─────┐   │     │
│  │  │  임베딩, 분류, 구조화 파싱, RAG 쿼리 분석        │   │     │
│  │  │  provider: 확정된 1개만                          │   │     │
│  │  │  장애 시 → 해당 기능 일시 중단                    │   │     │
│  │  └────────────────────────────────────────────────┘   │     │
│  └──────────┬──────────────────────────┬─────────────────┘     │
└─────────────┼──────────────────────────┼─────────────────────-─┘
              │ Tailscale VPN            │ HTTPS
              ▼                          ▼
  ┌────────────────────┐         ┌──────────────┐
  │ DGX Spark 클러스터   │         │ OpenAI API    │
  │ (100.x.x.x)        │         │ Upstage API   │
  │                     │         │ (클라우드)      │
  │ Spark #1: LLM 전용  │         └──────────────┘
  │  └─ Llama 3.3 70B  │
  │                     │
  │ Spark #2: Vision/Emb│
  │  ├─ BGE-M3 (임베딩)  │
  │  ├─ Whisper v3      │
  │  ├─ OCR 모델        │
  │  └─ Table Parser    │
  └────────────────────┘
```

### 3.3 이중화 vs 고정 — 분류 기준

**기준: 출력이 비정형 텍스트면 이중화 가능, 정형 데이터면 고정.**

| 기능 | 이중화 | 이유 |
|------|--------|------|
| OCR | ✅ 가능 | 출력이 텍스트, 포맷 무관 |
| 음성 전사 | ✅ 가능 | 출력이 텍스트 |
| 일반 채팅/요약 | ✅ 가능 | 자유 텍스트 응답 |
| **임베딩** | ❌ 고정 | 벡터 공간 자체가 모델마다 다름 (3장 참조) |
| **문서 분류** | ❌ 고정 | 프롬프트가 특정 모델에 최적화됨 |
| **AR/CRS 파싱** | ❌ 고정 | JSON 구조화 출력, 모델별 안정성 차이 |
| **RAG 쿼리 분석** | ❌ 고정 | 의도 분류 결과가 정형 데이터 |

**"잘못된 Failover보다 정직한 중단이 낫다"** — 분류가 Failover로 엉뚱한 결과를 내면 잘못된 데이터가 DB에 쌓이고, 그것이 훨씬 더 큰 문제다.

### 3.4 Failover 흐름

```
요청 수신
  │
  ▼
라우팅 테이블에서 기능(function) 조회
  │
  ├─ 이중화 그룹
  │   ├─ primary provider 호출
  │   │   ├─ 성공 → 응답 반환
  │   │   └─ 실패 (타임아웃/5xx/연결불가)
  │   │       └─ fallback provider 호출
  │   │           ├─ 성공 → 응답 반환 + ⚠️ 알림 발송
  │   │           └─ 실패 → 에러 반환
  │   │
  │   └─ Health Check (백그라운드, 10초 간격)
  │       ├─ 정상 → "healthy"
  │       └─ 실패 3회 연속 → "unhealthy" → 즉시 fallback 전환
  │           → 복구 감지 시 cooldown(60초) 후 primary 복귀
  │
  └─ 고정 그룹
      ├─ 지정 provider 호출
      │   ├─ 성공 → 응답 반환
      │   └─ 실패 → 에러 반환 (Failover 없음)
      └─ 장애 시 해당 기능만 일시 중단
```

### 3.5 라우팅 설정 (MongoDB `system_settings`)

```javascript
{
  "_id": "ai_gateway",

  "routes": {
    // 이중화 그룹
    "chat":           { "primary": "local", "fallback": "openai",  "fallback_enabled": true },
    "summarization":  { "primary": "local", "fallback": "openai",  "fallback_enabled": true },
    "ocr":            { "primary": "local", "fallback": "upstage", "fallback_enabled": true },
    "transcription":  { "primary": "local", "fallback": "openai",  "fallback_enabled": true },

    // 고정 그룹 (Failover 없음)
    "classification": { "primary": "local", "fallback": null, "fallback_enabled": false },
    "embedding":      { "primary": "local", "fallback": null, "fallback_enabled": false },
    "table_parsing":  { "primary": "local", "fallback": null, "fallback_enabled": false },
    "rag_analysis":   { "primary": "local", "fallback": null, "fallback_enabled": false }
  },

  "providers": {
    "local": {
      "name": "DGX Spark",
      "base_url": "http://100.x.x.x:8000/v1",
      "api_key": "local-key",
      "health_check_url": "http://100.x.x.x:8000/health",
      "health_check_interval_sec": 10,
      "timeout_ms": 30000,
      "models": {
        "llm": "llama-3.3-70b",
        "embedding": "bge-m3",
        "whisper": "whisper-large-v3",
        "ocr": "got-ocr2"
      }
    },
    "openai": {
      "name": "OpenAI",
      "base_url": "https://api.openai.com/v1",
      "api_key_env": "OPENAI_API_KEY",
      "models": {
        "llm": "gpt-4.1",
        "embedding": "text-embedding-3-small",
        "whisper": "whisper-1"
      }
    },
    "upstage": {
      "name": "Upstage",
      "base_url": "https://api.upstage.ai/v1",
      "api_key_env": "UPSTAGE_API_KEY",
      "models": {
        "ocr": "document-parse",
        "table_parsing": "document-parse"
      }
    }
  },

  "global": {
    "mode": "hybrid",              // "hybrid" | "local_only" | "external_only"
    "failover_cooldown_sec": 60,
    "log_provider_usage": true
  }
}
```

### 3.6 코드 변경 최소화 전략

**A안: Gateway 프록시 (코드 변경 0) — 권장**

```bash
# .env.shared만 변경
OPENAI_BASE_URL=http://localhost:8200/v1      # Gateway 경유
UPSTAGE_BASE_URL=http://localhost:8200/upstage/v1
```

기존 코드의 `openai.ChatCompletion.create()` 호출을 한 줄도 바꾸지 않고 로컬 모델로 전환 가능. LiteLLM 또는 vLLM이 OpenAI API 포맷을 그대로 지원.

**B안: SDK 래퍼 (더 정밀한 제어)**

```python
# 기능별 라우팅이 명확하지만, 각 서비스에 import 변경 필요
response = ai_gateway.chat(function="classification", messages=[...])
```

**권장: A안으로 시작 → 필요 시 B안으로 전환**

### 3.7 Gateway SPOF 해소

Gateway 자체가 단일 장애점이 되는 문제 대응:

```
일반 모드:
  서비스 → Gateway → Provider

Gateway 장애 시 (bypass):
  서비스 → 직접 외부 API (기존 .env 설정 유지)

구현: 각 서비스에 GATEWAY_ENABLED=true 플래그 1개 추가
      Gateway 응답 없으면 자동으로 기존 경로 사용
```

---

## 4. 고정 상수 분석 — 이중화 불가능한 영역

모델을 바꾸면 기존 데이터나 자산이 무효화되는 것을 "고정 상수"로 정의한다. 이 영역은 이중화가 아닌 **모델 확정 후 고정** 전략이 필요하다.

### 4.1 임베딩 벡터 공간

```
OpenAI embedding:  문서 A → [0.12, -0.34, ..., 0.56]  (1536차원)
BGE-M3 embedding:  문서 A → [0.78, 0.11, ..., -0.23]  (1024차원)
```

- 차원이 다름 — 벡터 비교 자체가 성립 안 함
- 같은 차원이라도 벡터 공간 자체가 다름 — 유사도 계산 결과 완전히 다름
- 모델 A로 저장한 벡터를 모델 B로 검색하면 엉뚱한 결과
- **Failover 불가능** — 임베딩은 일회성 마이그레이션(clean cut)으로만 전환 가능

### 4.2 튜닝된 프롬프트

문서 분류 M6 프롬프트는 gpt-4.1에 최적화되어 91.8% 달성. 동일 프롬프트를 다른 모델에 넣으면 정확도 보장 불가.

- 모델 전환 시 **프롬프트 재튜닝 + 158건 Ground Truth 재검증** 필요
- 이중화(Failover) 시 로컬용/OpenAI용 프롬프트 별도 관리 필요 → 관리 복잡도 2배

### 4.3 구조화된 출력 (Structured Output) 포맷

OpenAI의 `response_format: { type: "json_object" }`, `function calling` 등은 OpenAI 고유 스펙.

- 오픈소스 모델은 JSON 출력 안정성이 다름 (가끔 깨짐, 파싱 에러)
- AIMS에서 분류 결과, AR/CRS 파싱 결과를 JSON으로 받아 DB에 저장 중
- **모델별 파서/검증 레이어** 추가 필요

### 4.4 결론

이 세 가지 고정 상수로 인해 **모든 기능의 이중화는 오히려 문제를 만든다**. 이중화는 출력 호환성이 보장되는 기능에만 적용하고, 고정 상수 영역은 모델 확정 후 단일 provider로 운영한다.

---

## 5. BGE-M3 임베딩 모델 평가

### 5.1 벤치마크 비교

| | **BGE-M3** | **OpenAI 3-large** | **OpenAI 3-small** (현재) |
|---|---|---|---|
| MTEB (영어 중심) | 63.0 | **64.6** | 62.3 |
| MIRACL (다국어 검색) | **71.5** | 54.9 | — |
| **한국어 검색 (nDCG@10)** | **72.1** | ~55 추정 | — |
| 차원 | 1024 | 3072 (가변) | 1536 (가변) |
| 비용 | 무료 (셀프호스팅) | $0.13/1M토큰 | $0.02/1M토큰 |
| 파라미터 | 568M | 비공개 | 비공개 |

**영어는 OpenAI가 1.6점 앞서지만, 한국어 검색은 BGE-M3가 17점 이상 앞선다.**

### 5.2 BGE-M3의 강점

- **3가지 검색 모드 지원**: Dense + Sparse(키워드) + ColBERT(다중 벡터)
- 현재 AIMS는 Dense만 사용 중 → Sparse 추가 시 보험 전문 용어 매칭 대폭 개선
- **BGE-M3-ko**: 한국어 추가 파인튜닝 변종 존재 (HuggingFace: dragonkue/BGE-m3-ko)
- NVIDIA NIM 공식 모델카드 존재 → DGX Spark 배포 용이

### 5.3 평가

AIMS는 한국어 보험 문서 시스템이므로, BGE-M3 전환 시 **현재보다 검색 품질이 올라갈 가능성이 높다**. PoC에서 AIMS 실제 문서로 실증 필요.

---

## 6. 현재 RAG 시스템 분석 및 외부 솔루션 평가

### 6.1 현재 AIMS RAG 구조

```
쿼리 입력
  → 의도 분류 (entity/concept/mixed, GPT-4o-mini)
  → 하이브리드 검색
      ├─ Entity: MongoDB 메타데이터 검색 (60% 가중치)
      └─ Vector: Qdrant 벡터 검색 (40% 가중치)
  → 고객 관계 확장 (가족 문서까지 검색)
  → Cross-Encoder 리랭킹 (ms-marco-MiniLM-L-12-v2)
  → Top 5 컨텍스트 조립
  → LLM 답변 생성
```

**주요 컴포넌트:**

| 컴포넌트 | 파일 | 설명 |
|----------|------|------|
| 청킹 | `embedding/split_text_into_chunks.py` | 1500자, 150 오버랩 |
| 임베딩 | `embedding/create_embeddings.py` | OpenAI text-embedding-3-small, 1536차원 |
| 벡터 저장 | `embedding/save_to_qdrant.py` | Qdrant (localhost:6333), cosine |
| 하이브리드 검색 | `aims_rag_api/hybrid_search.py` | 메타+벡터 결합 |
| 의도 분류 | `aims_rag_api/query_analyzer.py` | GPT 기반 entity/concept/mixed |
| 리랭킹 | `aims_rag_api/reranker.py` | Cross-Encoder, 파일명 부스트 |
| RAG 오케스트레이션 | `aims_rag_api/rag_search.py` | 전체 파이프라인 |

**AIMS 고유 기능** (범용 RAG에 없는 것):
- 고객 관계 확장 (가족 문서까지 검색 범위 자동 확대)
- 소유자 격리 (owner_id 기반 멀티테넌시)
- 크레딧 시스템 연동
- 보험 도메인 로직 내장

### 6.2 외부 RAG 솔루션 평가

#### SaaS RAG — 전부 탈락

| 솔루션 | 탈락 이유 |
|--------|-----------|
| Google Vertex AI RAG | Google 자체 임베딩 강제 |
| Vectara | 자체 임베딩 강제, SaaS 전용 |
| Cohere RAG | Cohere Embed 강제 |
| Pinecone | 클라우드 전용, 로컬 불가 |

**임베딩 모델을 선택할 수 없으면 DGX Spark 로컬 독립 목표와 충돌.**

#### 자체 호스팅 RAG 프레임워크 — 도입 불필요

| 솔루션 | BGE-M3 호환 | 도입 가치 |
|--------|-------------|-----------|
| RAGFlow | ✅ | 청킹 전략 참고할 만하나, 프레임워크 교체 비용 > 이득 |
| LlamaIndex | ✅ | 이미 커스텀 RAG가 충분히 정교함 |
| LangChain | ✅ | 오버헤드 가장 큼, 전환 이점 불분명 |
| Haystack | ✅ | 토큰 효율 좋으나 교체 불필요 |
| Dify | ✅ | AI 워크플로우 빌더, RAG 교체 용도 아님 |

**프레임워크 교체 시 AIMS 도메인 로직(고객 관계 확장, 소유자 격리, 크레딧 등)을 전부 재구현해야 한다.**

#### NVIDIA RAG 생태계 — 참고

| 솔루션 | 특징 |
|--------|------|
| NVIDIA RAG Blueprint | NIM 기반 참조 파이프라인, DGX Spark 공식 지원 |
| NeMo Retriever | 임베딩+리랭킹 NIM 마이크로서비스 |
| AI Workbench | Agentic RAG 앱, DGX Spark 전용 |

BGE-M3가 NVIDIA NIM에 공식 등록되어 있어 DGX Spark에서의 배포는 용이하다.

### 6.3 결론: 프레임워크 교체가 아닌 부품 업그레이드

외부 RAG 솔루션에 의존하는 것은 권장하지 않는다. 대신 **개별 기술만 차용**한다:

| 업그레이드 항목 | 현재 | 개선 | 효과 |
|----------------|------|------|------|
| 임베딩 모델 | OpenAI text-embedding-3-small | **BGE-M3** (Dense + Sparse) | 한국어 검색 +17점, 비용 제거 |
| 리랭커 | ms-marco-MiniLM (영어) | **BGE-Reranker-v2-m3** (다국어) | 한국어 리랭킹 품질 향상 |
| 청킹 | 고정 1500자 분할 | **Parent-Child 청킹** (RAGFlow 참고) | 맥락 보존 개선 |
| (향후) 지식 그래프 | DB 조회 기반 관계 확장 | **GraphRAG / LightRAG** | 복합 질의 지원 |

---

## 7. 점진적 전환 로드맵

### Phase 0: PoC (DGX Spark 도착 즉시)

**세 가지 고정 상수를 먼저 검증한다.** 이 결과가 전체 방향을 결정.

```
1. 임베딩 PoC
   - BGE-M3 / BGE-M3-ko를 DGX Spark에 배포
   - AIMS 실제 문서 100건으로 임베딩 생성
   - 현재 OpenAI 임베딩 RAG 검색 결과와 품질 비교
   - Dense only vs Dense+Sparse 결합 비교

2. 프롬프트 PoC
   - M6 분류 프롬프트를 Llama 70B에서 실행
   - 158건 Ground Truth 대비 정확도 측정 (기준: 91.8%)
   - JSON 구조화 출력 안정성 확인

3. 구조화 출력 PoC
   - AR/CRS 파싱 JSON 출력 성공률 측정
   - 파싱 에러율 비교
```

### Phase 1: 임베딩 마이그레이션 (최우선)

임베딩은 고정 상수이므로 **가장 먼저** 해결해야 한다. 이를 미루면 OpenAI 의존성을 끊을 수 없다.

```
1. Spark에 BGE-M3 배포
2. 전체 문서 재임베딩 (배치, 야간)
3. Qdrant 컬렉션 교체 (1536차원 → 1024차원)
4. 리랭커 교체 (ms-marco → BGE-Reranker-v2-m3)
5. Sparse 검색 추가 (BGE-M3 네이티브)
6. OpenAI embedding 호출 제거
```

### Phase 2: AI Gateway 설치 + 점진적 전환

```
1. Gateway 설치 (패스스루 모드, 기존과 동일 동작)
2. classification → local (프롬프트 재튜닝 완료 후)
3. summarization → local
4. chat → local
5. ocr → local (한글 인식 품질 충분히 검증 후)
6. transcription → local
```

### Phase 3: 외부 완전 분리

```
1. global.mode → "local_only"
2. 이중화 그룹의 fallback_enabled → 모두 false
3. .env.shared에서 외부 API 키 제거
4. 비용 추적 로그로 외부 호출 0건 확인
```

---

## 8. 기대 효과

| 항목 | 현재 | DGX Spark 전환 후 |
|------|------|-------------------|
| 월 API 비용 | OpenAI + Upstage 과금 | 전기세만 (~월 5~10만원) |
| 데이터 보안 | 고객 문서 외부 전송 | 100% 로컬 처리 |
| 속도 제한 | 429 에러, rate limit | 없음 (자체 인프라) |
| 레이턴시 | 네트워크 왕복 | LAN 수준 (<5ms) |
| 동시 처리 | API 제한 (프로세스 1개씩) | GPU 자원 한도 내 병렬 |
| 한국어 검색 | MIRACL ~55 (OpenAI 추정) | MIRACL 72.1 (BGE-M3) |
| 외부 종속성 | 2개 API 의존 | 완전 독립 가능 |

---

## 9. 비용 추적 및 모니터링

### 9.1 Gateway 로그 (ai_gateway_logs 컬렉션)

```javascript
{
  "timestamp": "2026-04-01T10:30:00Z",
  "function": "classification",
  "provider_used": "local",
  "was_fallback": false,
  "latency_ms": 230,
  "tokens": { "input": 1500, "output": 50 },
  "estimated_cost_usd": 0.00,    // 로컬이면 0
  "status": "success"
}
```

### 9.2 모니터링 대시보드 (필수)

- 기능별 provider 사용 현황 (로컬 vs 외부 비율)
- Failover 발생 빈도 (Spark 안정성 판단)
- 기능별 레이턴시 추이
- 월별 외부 API 비용 추이 (전환 효과 측정)
- Health Check 상태: healthy / degraded / unhealthy

---

## 10. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Spark 장애 시 고정 그룹 중단 | 임베딩/분류/파싱 불가 | RAG 검색만 일시 중단, 문서 업로드·OCR·채팅은 정상 |
| 한국어 분류 정확도 부족 | M6 91.8% 미달 | 프롬프트 재튜닝, 부족 시 분류만 OpenAI 유지 |
| OCR 한글 인식 품질 | Upstage 대비 열화 | PoC에서 사전 검증, 부족 시 OCR만 Upstage 유지 |
| Gateway SPOF | 전체 AI 기능 마비 | PM2 클러스터 + bypass 경로 |
| 임베딩 재마이그레이션 | 전체 문서 재처리 | 야간 배치, 점진적 처리 |
| 모델 업그레이드 시 프롬프트 재검증 | 정확도 변동 | GT 158건 자동 회귀 테스트 구축 |

---

## 부록: 참조 파일 경로

### 외부 API 관련
- `.env.shared` — 모든 API 키 정의
- `backend/api/document_pipeline/services/openai_service.py` — OpenAI 서비스
- `backend/api/document_pipeline/services/upstage_service.py` — Upstage 서비스
- `backend/api/document_pipeline/config.py` — 파이프라인 설정

### RAG 관련
- `backend/embedding/` — 임베딩 파이프라인
- `backend/api/aims_rag_api/` — RAG API
- `backend/api/aims_api/lib/chatService.js` — 채팅 서비스

### 분류 프롬프트
- `tools/classification_tuner/` — M6 프롬프트 튜닝 도구
- `tools/classification_tuner/tests/classification/ground_truth_marichi_v4.json` — GT 158건

### 배포
- `deploy_all.sh` — 전체 배포 스크립트
- `.claude/skills/deploy-guide/` — 배포 가이드
