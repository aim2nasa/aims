# 문서 처리 상태(overallStatus) 정의서

> 최초 작성: 2026-03-26
> 근거 커밋: `fdfd1cda` (2026-03-24) — "feat: 문서 처리 overallStatus 12단계 세분화"
> 타입 정의: `frontend/aims-uix3/src/types/documentStatus.ts`

---

## 1. 왜 12단계로 나눴는가

이전에는 문서가 업로드되고 처리되는 동안 상태가 `processing` 하나뿐이었다.
PDF 변환 중인지, OCR 중인지, AI 분류 중인지, 임베딩 대기 중인지 알 수 없었다.
사용자에게도, 개발자에게도 "지금 뭘 하고 있는 건지" 보이지 않았다.

그래서 파이프라인의 실제 단계를 그대로 반영하여 12개 상태로 세분화했다.

---

## 2. 12개 상태 목록

### 정상 처리 흐름 (순서대로)

| # | 상태 | 한글 | 설명 |
|---|------|------|------|
| 1 | `pending` | 큐 대기 | 업로드 큐에 등록됨. 워커가 아직 픽업하지 않은 상태 |
| 2 | `uploading` | 파일 저장 중 | 워커가 파일을 디스크에 쓰는 중 |
| 3 | `converting` | PDF 변환 중 | HWP, PPTX, XLSX 등 비-PDF 파일을 LibreOffice로 PDF로 변환하는 중. PDF/JPG 등은 이 단계를 건너뜀 |
| 4 | `extracting` | 텍스트 추출 중 | pdfplumber 등으로 PDF에서 텍스트와 메타데이터를 뽑아내는 중 |
| 5 | `ocr_queued` | OCR 대기 | 텍스트가 없는 문서(이미지, 스캔 PDF 등)가 Redis Stream OCR 큐에 등록됨 |
| 6 | `ocr_processing` | OCR 처리 중 | Upstage OCR API가 이미지에서 글자를 인식하는 중 |
| 7 | `classifying` | AI 분류 중 | gpt-4o-mini가 문서를 22개 유형 중 하나로 분류하고, 요약과 제목을 생성하는 중 |
| 8 | `embed_pending` | 임베딩 대기 | 텍스트 처리(추출 + 분류)가 모두 끝남. 매 1분마다 도는 임베딩 크론이 이 문서를 찾아서 처리할 때까지 대기하는 상태 |
| 9 | `embedding` | 임베딩 생성 중 | 텍스트를 벡터(숫자 배열)로 변환하여 Qdrant 벡터 DB에 저장하는 중. 이 벡터가 있어야 AI 검색에서 찾을 수 있음 |
| 10 | `completed` | **전체 완료** | **임베딩까지 전부 끝남.** 이 문서는 AI 검색이 가능한 상태. `docembed.status === "done"` |

### 특수 상태

| # | 상태 | 한글 | 설명 |
|---|------|------|------|
| 11 | `credit_pending` | 크레딧 부족 | OCR이나 임베딩에 필요한 크레딧이 부족하여 처리가 보류됨. 크레딧이 충전되면 `full_pipeline.py` 크론이 자동으로 재처리 |
| 12 | `error` | 실패 | 처리 중 에러 발생 (미지원 파일, OCR 실패, 변환 실패 등) |

### 레거시 호환

| 상태 | 설명 |
|------|------|
| `processing` | 12단계 세분화 이전에 생성된 문서에 남아있는 값. 새로 생성되는 문서에는 사용되지 않음 |
| `timeout` | 처리 시간 초과. 드문 경우 |

---

## 3. 상태 흐름도

### 텍스트가 있는 문서 (PDF, DOCX 등)

```
pending → uploading → extracting → classifying → embed_pending → embedding → completed
```

### 비-PDF 파일 (HWP, PPTX, XLSX)

```
pending → uploading → converting → extracting → classifying → embed_pending → embedding → completed
```

### 이미지/스캔 문서 (JPG, 스캔 PDF)

```
pending → uploading → extracting → ocr_queued → ocr_processing → classifying → embed_pending → embedding → completed
```

### 에러 경로

```
어느 단계에서든 → error   (복구 불가능한 실패)
어느 단계에서든 → credit_pending   (크레딧 부족, 자동 복구 가능)
```

### 시각화

```
                                 ┌─ credit_pending (자동 복구 대기)
                                 │
pending → uploading ─┬→ converting ─┐
                     │              │
                     └──────────────┤
                                    ▼
                               extracting
                                    │
                        ┌───────────┴───────────┐
                        │                       │
                   텍스트 있음              텍스트 없음
                        │                       │
                        │              ocr_queued → ocr_processing
                        │                       │
                        └───────────┬───────────┘
                                    ▼
                              classifying
                                    │
                                    ▼
                             embed_pending ← 여기까지가 doc_prep_main의 관할
                                    │
                                    ▼
                              embedding   ← 여기서부터 full_pipeline.py의 관할
                                    │
                                    ▼
                              completed   ← 임베딩까지 완료. AI 검색 가능
```

---

## 4. 핵심 규칙

### 규칙 1: completed = 임베딩까지 모두 완료

`completed`는 "전부 다 끝났다"를 의미한다.
텍스트 추출만 끝나고 임베딩이 안 됐으면 `embed_pending`이지 `completed`가 아니다.

이 규칙은 커밋 `292d0f3e`에서 버그 수정을 통해 확립되었다:
- **버그**: OCR만 완료되고 임베딩은 대기 중인데 `completed`로 설정됨
- **수정**: `docembed.status === "done"`일 때만 `completed`로 전환

### 규칙 2: 관할권 분리

각 서비스는 자기 관할 필드만 수정한다. (커밋 `f3483280`, 2026-02-14)

| 서비스 | 관할 필드 | 관할 외 |
|--------|-----------|---------|
| doc_prep_main | `overallStatus` (pending ~ embed_pending), `status` | - |
| full_pipeline.py | `overallStatus` (embed_pending ~ completed), `docembed.*` | - |
| CRS 스캐너 | `cr_parsing_status`만 | overallStatus 건드리지 않음 |
| AR 스캐너 | `ar_parsing_status`만 | overallStatus 건드리지 않음 |

**위반 시 일어나는 일**: CRS 스캐너가 overallStatus를 `completed`로 덮어써서,
임베딩이 안 된 "유령 문서" 45건이 발생한 사례가 있다. (상세: `docs/report_overallStatus_jurisdiction.md`)

### 규칙 3: embed_pending에서 끊기는 것이 정상

텍스트 처리가 끝나면 `embed_pending`으로 설정된다.
임베딩 크론(`full_pipeline.py`)은 매 1분마다 `embed_pending` 문서를 찾아서 처리한다.
따라서 `embed_pending` 상태가 최대 1분간 유지되는 것은 정상이다.

### 규칙 4: self-healing (자동 복구)

`full_pipeline.py` 크론은 매분 실행되며, 상태 불일치를 자동 수정한다:

- **1단계**: `docembed` 상태와 `overallStatus` 불일치 자동 수정
- **1단계-B**: `status`와 `overallStatus` 전체 불일치 수정
- **1.5단계**: `credit_pending` → 크레딧 재확인 → 충분하면 자동 재처리
- **1.6단계**: OCR 쿼터 에러 → API 복구 확인 → 자동 재OCR
- **2단계**: `embed_pending` 문서 임베딩 실행

---

## 5. 관련 코드 위치

| 파일 | 역할 |
|------|------|
| `frontend/aims-uix3/src/types/documentStatus.ts` | TypeScript 타입 정의 (12개 상태 enum) |
| `backend/api/document_pipeline/routers/doc_prep_main.py` | pending ~ embed_pending 상태 전이 |
| `backend/api/document_pipeline/workers/ocr_worker.py` | ocr_queued ~ ocr_processing 상태 전이 |
| `backend/embedding/full_pipeline.py` | embed_pending ~ completed 상태 전이 + self-healing |
| `backend/api/aims_api/lib/documentStatusHelper.js` | raw → computed 상태 계산 (프론트엔드 표시용) |
| `frontend/aims-uix3/src/entities/document/DocumentProcessingModule.ts` | UI 아이콘/라벨 매핑 |

---

## 6. 관련 문서

| 문서 | 내용 |
|------|------|
| `docs/report_overallStatus_jurisdiction.md` | 관할권 침범 버그 보고서 (2026-02-14) |
| `backend/api/aims_api/overallStatus_implementation.md` | overallStatus 자동 업데이트 구현 (2025-10-29) |
| `docs/EMBEDDING_CREDIT_POLICY.md` | 크레딧 정책 설계 |
| `docs/2026-03-17_PIPELINE_SELF_HEALING_REPORT.md` | Self-Healing 구현 보고서 |

---

## 7. 변경 이력

| 날짜 | 커밋 | 내용 |
|------|------|------|
| 2025-10-29 | `97013eb` | overallStatus 필드 최초 도입 (폴링 시 자동 생성) |
| 2025-12-20 | `292d0f3e` | completed 의미 확립 — 임베딩 완료 후에만 completed |
| 2026-02-14 | `f3483280` | 관할권 분리 — CRS/AR 스캐너 overallStatus 침범 금지 |
| 2026-03-17 | `1860bfe1` | status↔overallStatus 불일치 원천 버그 수정 |
| 2026-03-24 | `fdfd1cda` | **12단계 세분화** — processing을 8개 세부 상태로 분리 |
