---
name: pipeline-skill
description: AIMS 문서 파이프라인 가이드. 문서 업로드, OCR, 분류, 임베딩, 파이프라인 작업 시 자동 사용
---

# AIMS 문서 파이프라인 가이드

> 문서 업로드, OCR, 분류, 임베딩, AR/CRS 처리 작업 시 참조

## 전체 흐름

```
프론트엔드 업로드
    ↓
POST /webhook/docprep-main (document_pipeline :8100)
    ↓
시스템 파일 차단 → 디스크 임시저장 → 사전 텍스트 추출 (pdfplumber, 무료)
    ↓
┌─ 텍스트 있음 → 크레딧 체크 스킵 → 큐 등록
└─ 텍스트 없음 → 크레딧 체크 → 부족 시 credit_pending
    ↓
UploadWorker (MongoDB 큐, 1초 폴링, 최대 3동시)
    ↓
process_document_pipeline()
    ↓
메타 추출 → MIME 분기 → 텍스트 추출/변환 → 요약/분류 → AR/CRS 감지
    ↓
텍스트 없으면 → Redis Stream OCR → 완료 후 요약/분류
    ↓
임베딩 크론 (매 1분, full_pipeline.py) → Qdrant 저장 → 완료
```

## 상태 필드

### `overallStatus` (프론트엔드 표시용)

| 값 | 의미 |
|----|------|
| `pending` | 큐 등록 |
| `ocr_processing` | OCR 처리 중 |
| `embed_pending` | OCR 완료, 임베딩 대기 |
| `embedding` | 임베딩 생성 중 |
| `completed` | 모든 처리 완료 |
| `error` | 처리 실패 |
| `credit_pending` | 크레딧 부족 보류 |

### `ocr.status`
`queued` → `running` → `done` / `error` / `quota_exceeded` / `credit_pending`

### `docembed.status`
`pending` → `done` / `skipped` / `failed` / `credit_pending`

## 정상 경로 상태 전이

```
[업로드] → pending/processing
    ↓
텍스트 있음 → embed_pending/completed
    ↓ (크론 1분)
embedding → completed (docembed: done)

텍스트 없음 → ocr queued → ocr running → ocr done
    → embed_pending → embedding → completed
```

## credit_pending 처리

**업로드 시:**
- 텍스트 없는 파일 → 크레딧 체크 → 부족 → `credit_pending`
- pdfplumber로 텍스트 추출은 수행 (무료, AR/CRS 감지도 실행)

**크레딧 충전 후 자동 재처리:**
- `full_pipeline.py` 크론이 credit_pending 문서 탐색
- 크레딧 충분 → `pending`으로 전환, `reprocessed_from_credit_pending: true`
- 이 플래그가 있으면 크레딧 체크 재스킵

## OCR 흐름

```
doc_prep_main.py → RedisService.add_to_stream() → XADD ocr_stream
    ↓
OCRWorker (5초 블로킹 poll)
    ↓
1. 고객명 조회 (환각 방지)
2. 페이지 수 조회 (PyMuPDF)
3. OCR 쿼터 체크 (/api/internal/ocr/check-quota, fail-closed)
4. UpstageService.process_ocr()
5. 텍스트 ≥ 10자 → summarize_text() (요약+분류+title)
6. displayName 생성
7. 사용량 로깅 + 완료 알림
8. XACK + XDEL
```

- Redis Stream: `ocr_stream`, Consumer Group: `ocr_consumer_group`
- 크래시 복구: 시작 시 `xautoclaim`으로 30초+ idle 메시지 회수

## 분류 (Classification)

**서비스**: `openai_service.py` → `summarize_text()`
**조건**: `len(full_text.strip()) >= 10` (미만이면 AI 호출 안 함)
**모델**: gpt-4o-mini

### 22개 문서 유형
| 카테고리 | 유형 |
|---------|------|
| 보험계약 | `policy`, `coverage_analysis`, `application`, `plan_design`, `insurance_etc` |
| 보험금 청구 | `diagnosis`, `medical_receipt`, `claim_form`, `consent_delegation` |
| 신분/증명 | `id_card`, `family_cert`, `personal_docs` |
| 건강/의료 | `health_checkup` |
| 자산 | `asset_document`, `inheritance_gift` |
| 법인 | `corp_basic`, `hr_document`, `corp_tax`, `corp_asset`, `legal_document` |
| 기타 | `general`, `unclassifiable` |

시스템 전용 (AI 반환 시 `general`로 교체): `annual_report`, `customer_review`, `unspecified`

## AR/CRS 감지 vs 파싱 (핵심 구분)

| | 감지 (Detection) | 파싱 (Parsing) |
|---|---|---|
| **위치** | `doc_prep_main.py` | `annual_report_api` (:8004) |
| **방법** | PDF 텍스트 키워드 매칭 | pdfplumber 테이블 추출 |
| **AI 필요** | 불필요 | 불필요 |
| **출력** | `is_annual_report=True`, `ar_parsing_status='pending'` | `ar_parsing_status='completed'`, 계약 데이터 |
| **파일명 사용** | **절대 금지** | **절대 금지** |

**AR 감지 조건**: `'Annual Review Report'` 필수 + `'보유계약 현황'`/`'MetLife'` 등 1개 이상
**CRS 감지 조건**: `'Customer Review Service'` 필수 + `'변액'`/`'적립금'` 등 1개 이상
**자가 복구**: `annual_report_api`가 30초마다 `pending` 상태 문서 스캔 → 자동 파싱

## displayName 생성

### 우선순위
1. AR: `{고객명}_AR_{날짜}.pdf`
2. CRS: `{고객명}_CRS_{상품명}_{날짜}.pdf`
3. 일반: `summarize_text()` title → `generate_title_only()` → 배치 생성

### 규칙
- 40자 제한 (확장자 제외)
- 파일명 특수문자 제거
- 원본 확장자 보존
- **환각 방지**: 텍스트 < 10자이면 AI 호출 스킵, 문서에 없는 이름 생성 금지

## 임베딩 크론

- 스크립트: `backend/embedding/full_pipeline.py`
- 크론: `*/1 * * * *` (매 1분, flock 동시실행 방지)
- 로그: `/home/rossi/logs/embedding_pipeline.log`
- 모델: OpenAI `text-embedding-3-small` (1536차원)
- 저장: Qdrant 벡터 DB

### 처리 대상
```
full_text 있음 (meta/ocr/text 중 하나)
AND (docembed.status 없음 OR 'pending' OR ('failed' AND retry_count < 3))
```

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `document_pipeline/routers/doc_prep_main.py` | 메인 오케스트레이터, AR/CRS 감지 |
| `document_pipeline/workers/ocr_worker.py` | Redis Stream OCR 워커 |
| `document_pipeline/workers/upload_worker.py` | MongoDB 큐 업로드 워커 |
| `document_pipeline/services/openai_service.py` | 분류/요약/title (22개 유형) |
| `document_pipeline/services/redis_service.py` | OCR Redis Stream 관리 |
| `embedding/full_pipeline.py` | 임베딩 크론 |
