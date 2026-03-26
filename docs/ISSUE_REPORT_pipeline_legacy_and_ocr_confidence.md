# 이슈 보고서: 레거시 경로 잔존 + xPipe OCR confidence 미반영

**작성일**: 2026-03-27
**상태**: 미수정
**발견 경위**: 캐치업코리아 785MB 문서일괄등록 테스트 중 발견

---

## 이슈 1: 레거시 경로가 여전히 사용됨 — xPipe 100% 전환 필요

**증거**: `PIPELINE_ENGINE=xpipe` 설정임에도 `안영미 자동차운전면허증.ppt`가 레거시 OCR 경로(Redis Stream → OCR Worker)를 통해 처리됨. OCR 92.9% confidence가 정상 표시된 것이 레거시 경로 경유의 증거.

**문제**: 레거시 경로는 삭제 대상이며, 모든 문서는 반드시 xPipe에서 처리되어야 함. 레거시 경로로 빠지는 분기가 남아있으면 향후 레거시 코드 삭제 시 장애 발생.

**원인 추정**: `doc_prep_main.py`의 `_step_route_by_mime()`에서 변환 파일(PPT/HWP)의 텍스트 추출 실패 시, xPipe 경로가 아닌 레거시 Redis OCR 큐로 전달하는 분기가 존재.

**수정 방향**:
- `doc_prep_main.py`에서 레거시 OCR 큐(Redis Stream) 전달 분기를 모두 제거
- 변환 파일의 OCR fallback도 xPipe extract stage 내부에서 처리
- 최종 목표: `PIPELINE_ENGINE=xpipe` 시 레거시 경로 코드가 일절 실행되지 않아야 함

**영향 파일**:
- `backend/api/document_pipeline/routers/doc_prep_main.py`

---

## 이슈 2: xPipe 경로에서 OCR confidence를 0.0으로 하드코딩

**증거**: xPipe 경로로 처리된 JPG 이미지들이 모두 "OCR 0.0% · 매우 낮음" 빨간 뱃지로 표시됨. 그러나 전체 텍스트 보기에는 정상적으로 OCR 텍스트가 존재.

**근본 원인**: `doc_prep_main.py:2227`에서 xPipe 결과를 DB에 저장할 때 `ocr.confidence = 0.0`으로 하드코딩.

```python
# 현재 코드 (버그)
meta_update["ocr.confidence"] = 0.0
```

Upstage OCR provider(`providers_builtin.py:107`)는 `confidence` 값을 정상 반환하지만, xPipe extract stage(`extract.py`)에서 `_try_ocr()` 호출 시 confidence를 `context`나 `stage_data`에 기록하지 않아 `doc_prep_main.py`에서 접근 불가.

**수정 방향**:
1. `extract.py`의 `_try_ocr()`에서 Upstage 반환 confidence를 `context["_ocr_confidence"]`에 저장
2. `extract.py`의 `stage_data`에 `ocr_confidence` 필드 추가
3. `doc_prep_main.py`에서 `stage_data.extract.output.ocr_confidence` 값을 읽어 `ocr.confidence`에 저장

**영향 파일**:
- `backend/api/document_pipeline/xpipe/stages/extract.py`
- `backend/api/document_pipeline/routers/doc_prep_main.py`

---

## 구현 우선순위

| 순서 | 이슈 | 심각도 | 영향 |
|------|------|--------|------|
| 1 | OCR confidence 0.0 하드코딩 | High | 모든 xPipe OCR 문서의 품질 표시가 "매우 낮음" |
| 2 | 레거시 경로 잔존 | High | 레거시 삭제 시 일부 파일 유형(PPT/HWP) 처리 불가 |
