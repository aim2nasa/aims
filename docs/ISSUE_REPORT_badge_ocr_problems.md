# 이슈 보고서: 문서 뱃지 및 OCR 처리 문제 (v3 — 코드 검증 완료)

**작성일**: 2026-03-26
**상태**: 구현 준비 완료 (Alex/Gini 리뷰 대기)

---

## DB 진단 결과

| 파일 | ocr.status | ocr.full_text | meta.full_text | docembed.status | docembed.skip_reason |
|------|-----------|--------------|----------------|-----------------|---------------------|
| 안영미신분증.ppt | (없음) | (없음) | "변환 성공, 텍스트 없음" | done / text_source=meta | - |
| img008.jpg | done (0.96) | **긴 텍스트 있음** | "" | **skipped** | **no_text** |
| 암검진067.jpg | done (0.00) | (빈 문자열) | "" | skipped | no_text |
| 김보성 대표님-액자디자인.jpg (1) | done (0.98) | **긴 텍스트 있음** | "" | done / text_source=ocr | - |
| 김보성 대표님-액자디자인.jpg (2) | (없음) | (없음) | OCR 텍스트 복사됨 | done / text_source=meta | - |

---

## 확정 이슈 3개

### 이슈 A: OCR 완료 후 docembed가 재처리되지 않음

**증거**: `img008.jpg` — `ocr.full_text`에 긴 텍스트가 있지만 `docembed.status=skipped`, `skip_reason=no_text`

**근본 원인**: 타이밍 문제.

```
1. 문서 업로드 → meta.full_text = "" (이미지라 텍스트 없음)
2. embed 크론 실행 → meta.full_text 비어있고 ocr.full_text 아직 없음 → docembed.status = "skipped"
3. OCR 완료 → ocr.full_text에 텍스트 저장, overallStatus = "embed_pending"
4. embed 크론 재실행 → 쿼리 필터가 docembed.status가 skipped인 문서를 제외 → 영원히 재처리 안 됨
```

`full_pipeline.py:397-407`의 쿼리 필터:
```python
{'$or': [
    {'docembed.status': {'$exists': False}},
    {'docembed.status': 'pending'},
    {'docembed.status': 'failed', 'docembed.retry_count': {'$lt': 3}}
]}
# ← 'skipped'는 포함되지 않음!
```

`ocr_worker.py:325`는 `overallStatus = "embed_pending"`으로 변경하지만, `docembed.status`를 "skipped"에서 "pending"으로 리셋하지 않음.

**수정 방향**: `ocr_worker.py`에서 OCR 성공 시 `docembed.status`를 `"pending"`으로 리셋하여 embed 크론이 재처리하도록 함.

**영향 파일**: `backend/api/document_pipeline/workers/ocr_worker.py`

---

### 이슈 B: 변환 파일(PPT/HWP) 텍스트 추출 실패 시 OCR fallback 없음

**증거**: `안영미신분증.ppt` — 이미지만 포함된 PPT. PDF 변환 후 pdfplumber가 텍스트를 못 추출. OCR 시도 없이 보관 처리.

**근본 원인**: `doc_prep_main.py`의 `_step_route_by_mime()` (라인 1840-1862)에서 `is_convertible_mime()` 체크 후 변환 파일은 **OCR 큐에 보내지 않고 `processingSkipReason: "conversion_failed"`로 보관 처리**.

추가 문제: `meta.full_text`에 `"변환 성공, 텍스트 없음"` 시스템 메시지가 저장됨 (레거시 데이터. 현재 `extract.py`는 빈 문자열 반환으로 수정 완료).

**수정 방향**: 변환 가능 파일의 텍스트 추출 실패 시, 변환된 PDF가 존재하면 해당 PDF를 OCR 큐로 전달. 구현 전 `PdfConversionQueueService` 결과 스키마에서 변환된 PDF 경로 반환 여부 확인 선행.

**영향 파일**:
- `backend/api/document_pipeline/routers/doc_prep_main.py` (레거시 경로)
- `backend/api/document_pipeline/xpipe/stages/extract.py` (xPipe 경로 — 동일 이슈 존재)

---

### 이슈 C: OCR 텍스트인데 TXT 뱃지 + displayName 미생성

**증거**: `김보성 대표님-액자디자인.jpg` (2번째 업로드) — `ocr` 필드 자체가 없고, `meta.full_text`에 OCR 텍스트가 들어있고, `docembed.text_source=meta` → TXT 뱃지.

**근본 원인**: PIPELINE_ENGINE 환경변수 미설정 → 기본값 "legacy". 그러나 해당 문서는 xPipe 경로(`/webhook/process-with-xpipe`)로 처리된 것으로 추정됨. xPipe 경로는:

1. OCR 결과를 `meta.full_text`에 저장 (`doc_prep_main.py:2176`)
2. `ocr.status`, `ocr.full_text` 등 `ocr.*` 필드를 **기록하지 않음**
3. 프론트엔드 뱃지 로직에서 `ocr.status === 'done'` 조건에 해당하지 않아 TXT 뱃지로 분류

displayName 미생성 원인: xPipe 경로에서 **AR/CRS가 아닌 일반 문서의 displayName을 생성하지 않음** (`doc_prep_main.py:2198-2244`).

**수정 방향**:
1. xPipe 경로에서 OCR 수행 시 `ocr.status`, `ocr.full_text`, `ocr.confidence`를 DB에 기록
2. xPipe 경로에서 일반 문서도 displayName 생성

**영향 파일**: `backend/api/document_pipeline/routers/doc_prep_main.py` (xPipe 결과 저장부)

---

## 구현 우선순위

| 순서 | 이슈 | 심각도 | 영향 범위 | 수정 파일 |
|------|------|--------|----------|----------|
| 1 | **A**: OCR 후 docembed 재처리 안 됨 | High | OCR 완료된 모든 이미지 문서 | `ocr_worker.py` |
| 2 | **B**: 변환 파일 OCR fallback 없음 | Medium | 이미지만 포함된 PPT/HWP 등 | `doc_prep_main.py` |
| 3 | **C**: xPipe 경로 OCR 필드 미기록 | Medium | xPipe 경로로 처리된 이미지 | `doc_prep_main.py` |
