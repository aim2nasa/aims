# 이슈 보고서: PDF 파일 요약(summary) 미생성 버그

> 작성일: 2026-03-27 02:40 KST
> 해결일: 2026-03-27 03:00 KST
> 상태: **해결 완료**
> 심각도: MEDIUM
> 커밋: `27ce7f48`

---

## 현상

캐치업코리아에 업로드한 PDF 파일들이 텍스트 추출은 완료되었지만 **AI 요약(summary)이 생성되지 않음**.

- `meta.full_text`: 있음 (452~49,738자)
- `meta.summary`: **없음** (필드 자체가 존재하지 않음)
- `meta.meta_status`: done
- `overallStatus`: completed

---

## 영향 범위

| 파일 유형 | 건수 | summary 있음 | summary 없음 |
|----------|------|-------------|-------------|
| PDF | 15건 | 0건 | **15건** |
| HWP (변환 완료) | 4건 | **4건** | 0건 |
| XLSX/XLS (변환 완료) | 3건 | 0건 | **3건** |
| PPTX (OCR) | 1건 | 0건 (ocr.summary: 24자) | — |
| PPT (OCR) | 1건 | 0건 (ocr.summary: 69자) | — |
| ZIP/AI/JPG (보관) | 12건 | — | — (텍스트 없음, 정상) |

---

## DB 비교

### PDF (summary 없음)
```
meta keys: confidence, document_type, extension, filename, full_text, length, meta_status, mime, size_bytes
→ summary, title 필드가 없음
```

### HWP (summary 있음)
```
meta keys: extension, filename, meta_status, mime, size_bytes, confidence, document_type, full_text, length, summary, title
→ summary, title 필드가 있음
```

**차이점**: HWP는 `summary`와 `title` 필드가 있고, PDF에는 없음

---

## 근본 원인 (확정)

**xPipe 파이프라인에 요약(summary) 생성 기능이 없음.**

서버 환경변수 `PIPELINE_ENGINE=xpipe` → 모든 문서가 xPipe 경로로 처리.

| 경로 | summary 생성 | 현재 상태 |
|------|-------------|----------|
| legacy 파이프라인 | ✅ `_step_ai_summarize()` → `OpenAIService.summarize_text()` → `meta.summary` 저장 | 미사용 |
| **xPipe 파이프라인** | ❌ `ClassifyStage`에 summary 기능 없음. `_process_via_xpipe()` L2280-2297의 `meta_update`에 `meta.summary` 미포함 | **현재 사용 중** |
| HWP 변환 워커 | ✅ `_extract_and_update_text()` → `summarize_text()` 호출 | HWP만 summary 있음 |

### 코드 증거

**xPipe ClassifyStage** (`xpipe/stages/classify.py`): `summary` 단어 자체가 없음

**`_process_via_xpipe()` L2280-2297**: meta_update 딕셔너리에 `meta.summary` 키 없음
```python
meta_update = {
    "meta.full_text": extracted_text,
    "meta.length": ...,
    "meta.mime": ...,
    "meta.meta_status": "done",
    "meta.document_type": ...,
    "meta.confidence": ...,
    # ← meta.summary 없음!
    # ← meta.title 없음!
}
```

### HWP에 summary가 있는 이유
HWP는 xPipe로 텍스트 추출 실패 → PDF 변환 큐 등록 → `pdf_conversion_worker.py`의 `_extract_and_update_text()`에서 `summarize_text()` 별도 호출 → summary 생성

---

## 해결 방향

`_process_via_xpipe()` L2280-2297 영역에서:
1. `ClassifyStage` 결과에서 summary를 가져오거나
2. `OpenAIService.summarize_text()` 를 xPipe 처리 후 별도 호출
3. 결과를 `meta.summary`, `meta.title`에 저장

---

## 참고

- 기존 AR 파일(이전 세션 업로드)에는 summary가 정상 존재
- 버튼 센서는 정상 동작 (summary 없으면 요약 버튼 비활성화)
