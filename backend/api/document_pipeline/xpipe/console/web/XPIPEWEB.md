# xPipeWeb 가이드

**xPipeWeb**은 xPipe 엔진의 동작을 검증하기 위한 **개발자 전용 웹 데모 도구**입니다.
문서를 업로드하면 파이프라인 각 단계의 입출력을 실시간으로 확인할 수 있습니다.

- 버전: v0.1.0
- 접속: `http://100.110.215.65:8200` (tars 서버, Tailscale VPN 필요)
- 실행: tars에서 `cd ~/aims/backend/api/document_pipeline && source venv/bin/activate && source ~/aims/.env.shared && source .env && python -m xpipe.console.web.server`

---

## 설정 패널

설정 바를 클릭하면 3개 카드가 표시됩니다.

### 엔진 카드

| 설정 | 선택지 | 설명 |
|------|--------|------|
| **어댑터** | (도메인별 플러그인) / None | 파이프라인의 도메인 특화 플러그인. 분류 체계, 특수 문서 감지, 표시명 규칙 등을 결정 |
| **프리셋** | standard (7단계) / minimal (3단계) | 파이프라인 스테이지 조합 |
| **모드** | 시뮬레이션 / 실제 실행 | 시뮬레이션은 API 호출 없이 가짜 결과 반환 (비용 0). 실제 실행은 OpenAI/Upstage API를 호출하여 실제 처리 수행 |

#### 어댑터란?

xPipe 코어는 도메인에 무관한 범용 파이프라인입니다 (파일 수신 → 변환 → 텍스트 추출 → 분류 → 임베딩).
"무엇을 어떻게 분류하는지"는 **어댑터(DomainAdapter)** 가 결정합니다.

```
xPipe 코어 (도메인 무관)
  └─ 파이프라인 실행만 담당

DomainAdapter 구현 예시 A
  ├─ get_classification_config() → 도메인별 분류 체계 + 프롬프트
  ├─ detect_special_documents() → 특수문서 A, 특수문서 B 감지
  ├─ resolve_entity() → 엔티티명→엔티티ID 매칭
  └─ generate_display_name() → 표시명 규칙

DomainAdapter 구현 예시 B
  ├─ get_classification_config() → 다른 도메인 분류 체계
  ├─ detect_special_documents() → 해당 도메인 특수문서 감지
  └─ ...
```

> **현재 상태 (Phase 0):** 어댑터 ABC 인터페이스만 정의됨 (`xpipe/adapter.py`).
> DomainAdapter 구현체는 아직 없음.
> UI에서 선택해도 실제 동작 차이 없이 config 문자열만 저장됨.
> 구현은 Phase 2에서 기존 도메인 로직을 DomainAdapter 구현체로 이동할 예정.

#### 프리셋 스테이지 구성

**standard (7단계):**
1. **Ingest (업로드)** — 파일 수신, MIME 타입 감지, 메타데이터 기록
2. **Convert (PDF변환)** — HWP/DOC/XLS 등 비-PDF 파일을 PDF로 변환
3. **Extract (텍스트추출)** — PDF에서 텍스트 추출, 이미지/스캔 문서는 OCR 수행
4. **Classify (AI분류)** — LLM을 사용하여 문서 유형 분류 (예: 문서 유형 A, 유형 B, 유형 C 등)
5. **DetectSpecial (감지)** — 특수 문서 감지 (예: 특수문서 A, 특수문서 B)
6. **Embed (임베딩)** — 텍스트를 벡터로 변환하여 유사도 검색에 활용
7. **Complete (완료)** — 최종 결과 정리, 감사로그 기록

**minimal (3단계):** Ingest → Extract → Complete (변환/분류/감지/임베딩 스킵)

### OpenAI 카드

| 설정 | 설명 |
|------|------|
| **LLM** | Classify(AI분류) 스테이지에서 사용하는 모델. gpt-4.1-mini(가성비), gpt-4.1(정확도↑ 비용↑) |
| **Embedding** | Embed 스테이지에서 텍스트→벡터 변환 모델. text-embedding-3-small(기본, 저렴+빠름) |
| **API Key** | OpenAI API 키. 서버 환경변수(`OPENAI_API_KEY`)에서 자동 로드됨 |

### Upstage 카드

| 설정 | 설명 |
|------|------|
| **OCR** | Extract(텍스트추출) 스테이지에서 이미지/스캔PDF 글자 인식에 사용하는 OCR 엔진 |
| **API Key** | Upstage API 키. 서버 환경변수(`UPSTAGE_API_KEY`)에서 자동 로드됨 |

---

## 파이프라인 상태 흐름

```
queued → processing → completed
                   └→ error (재시도 가능)
```

- **queued (대기):** 업로드 완료, 처리 대기 중
- **processing (처리중):** 파이프라인 스테이지 순차 실행 중. 각 스테이지 뱃지가 실시간 업데이트
- **completed (완료):** 모든 스테이지 성공. AI 요약, 전체 텍스트 조회 가능
- **error (에러):** 특정 스테이지에서 실패. 재시도 버튼으로 재처리 가능

---

## 주요 기능

### 문서 업로드
- 드래그 앤 드롭 또는 클릭하여 파일 선택
- 지원 형식: PDF, 이미지(JPG/PNG), HWP, DOC, DOCX, XLS, XLSX, TXT
- 최대 50MB, 복수 파일 배치 업로드 가능

### 파이프라인 뱃지
테이블의 상태 컬럼에 각 스테이지 진행 상황이 뱃지로 표시됩니다.
뱃지 클릭 시 해당 스테이지의 INPUT/OUTPUT 데이터를 하단 패널에서 확인할 수 있습니다.

### AI 요약 / 전체 텍스트
- 완료된 문서의 파일명 클릭 → 파일 프리뷰 + AI 요약 모달
- 행 액션의 ★ 버튼 → AI 요약, 📄 버튼 → 전체 텍스트

### 벤치마크
하단 바의 "벤치마크" 버튼 → 처리량(건/분), 품질 통과율, 총 비용 등 집계 결과.
CSV/JSON 다운로드 가능.

### SSE 실시간 이벤트
서버와 SSE(Server-Sent Events)로 연결되어, 파이프라인 진행 상황이 자동 갱신됩니다.
연결 끊김 시 3초 간격 폴링으로 fallback.

---

## 아키텍처

```
브라우저 (Vanilla JS, 외부 의존 없음)
    ↕ REST API + SSE
FastAPI 서버 (uvicorn, 포트 8200)
    ↕
xPipe 코어 (Pipeline, Stages, EventBus, CostTracker, AuditLog)
    ↕
외부 API (OpenAI, Upstage) — 실제 실행 모드에서만
```

- **인메모리 동작:** 외부 DB 없이 서버 메모리에 문서/이벤트/감사로그 저장. 서버 재시작 시 초기화됨.
- **정적 파일:** `index.html`, `style.css`, `app.js` — FastAPI가 직접 서빙

---

## 미구현 / 보류 기능

| 항목 | 상태 | 비고 |
|------|------|------|
| DomainAdapter 구현체 | Phase 2 예정 | ABC만 정의됨. 어댑터 선택해도 동작 차이 없음 |
| Quality Gate UI | 제거됨 | 서버 기본값 true 유지, 시뮬레이션에서는 항상 스킵 |
| 배치 업로드 큐 | 미구현 | 동시 업로드 시 리소스 경합 가능 ([상세](../../../../../memory/xpipeweb-queue-issue.md)) |
