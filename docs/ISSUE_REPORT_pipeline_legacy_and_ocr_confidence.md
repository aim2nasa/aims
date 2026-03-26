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

## 수정 완료 (2026-03-26)

| 커밋 | 내용 |
|------|------|
| `770cff88` | 이슈 1+2 수정 + regression 테스트 3건 |
| `20b37104` | xPipe context에 converted_pdf_path 누락 수정 |
| `33048338` | 재처리 시 기존 변환 PDF 있으면 큐 스킵 |
| `12624874` | file_content 빈 경우 디스크 fallback으로 파일 크기 조회 |

---

## 2차 테스트 발견 이슈 (2026-03-26 캐치업코리아 25개 재테스트)

### 이슈 3: HWP 파일 xPipe extract 실패 후 레거시 재처리 시 conversion_status 불일치

**파일**: `정관_캐치업코리아.hwp`
**증상**: xPipe extract 스테이지에서 `libreoffice+pdfplumber` 방식으로 텍스트 추출 실패 → error 발생 → 레거시 fallback(제거됨)이 아닌 xPipe 내부 재시도로 최종 성공. 그러나 `conversion_status`가 `pending`으로 남음 (convPdfPath는 존재).
**원인 추정**: xPipe extract 실패 시점에 `_trigger_pdf_conversion_for_xpipe()`의 `_is_convertible_mime()` 판정에서 HWP MIME(`application/haansofthwp`)이 매칭되지 않아 `not_required`로 설정되었을 가능성. 또는 xPipe 에러 핸들링에서 `conversion_status`를 `pending`으로 덮어쓴 가능성.
**영향**: 프론트엔드에서 HWP 파일의 PDF 미리보기 불가
**수동 조치**: DB에서 `conversion_status: "completed"`로 수정 완료

### 이슈 4: xPipe 재처리 성공 시 error 필드 미클리어

**파일**: `마장사은품.pptx`, `정관_캐치업코리아.hwp`
**증상**: xPipe 첫 시도 실패 → 재처리(또는 워커 재시도)로 성공했지만, `error` 필드에 이전 실패 메시지가 그대로 남아있음.
**원인**: `_process_via_xpipe()` 성공 시 `error` 필드를 `$unset`하지 않음. 에러 기록 후 재시도 성공해도 에러가 잔존.
**영향**: 관리자가 문서 상태를 볼 때 혼란. 프론트엔드에서 에러 표시 가능성.
**수정 방향**: `_process_via_xpipe()` 최종 DB 업데이트 시 `"$unset": {"error": ""}` 추가

### 이슈 5: `캐치업코리아-자필서류-20240813.pdf` 처리 지연

**증상**: 25개 중 마지막 문서가 다른 문서 완료 후에도 `processing` 상태로 장시간 대기
**원인 추정**: 대용량 PDF(3.6MB)의 텍스트 추출에 시간이 걸리거나, 워커 동시처리 한도(3개)에 의한 큐 대기
**상태**: 추적 필요 (일시적 지연인지 영구 고착인지)

---

### 이슈 6: HWP MIME `application/haansofthwp`가 PDF 변환 대상에서 누락

**파일**: `정관_캐치업코리아.hwp`
**증상**: HWP 파일의 PDF 변환 뱃지가 회색(pending/미변환)으로 표시. 다른 변환 파일(PPTX, XLSX)은 녹색(완료).
**근본 원인**: `_trigger_pdf_conversion_for_xpipe()` → `_is_convertible_mime()` 함수의 MIME 목록에 `application/haansofthwp`가 없음.
```python
# 현재 목록 (doc_prep_main.py _is_convertible_mime)
convertible = (
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument",
    "application/msword", "application/x-hwp", "application/rtf",
    "application/vnd.ms-powerpoint", "application/vnd.hancom",
)
```
HWP의 MIME이 `application/x-hwp` 또는 `application/vnd.hancom`이면 매칭되지만, 이 파일은 `application/haansofthwp`로 탐지됨 → 매칭 실패 → `not_required`로 설정 → PDF 변환 큐 미등록.
**영향**: HWP 파일의 브라우저 PDF 미리보기 불가
**심각도**: Medium
**수정 방향**: `_is_convertible_mime()`에 `"application/haansofthwp"` 추가. 또는 `"application/haan"` prefix로 변경하여 한글 MIME 변형을 포괄.

---

### 이슈 7: OCR displayName에 텍스트 인식 오류 전파

**파일**: `캐치업사업비내역서.pdf` (스캔 PDF → OCR 처리)
**증상**: displayName이 `캐치업. 코리아 사업비내역서 2020.01.pdf`로 생성됨. "캐치업코리아" 사이에 마침표와 공백이 삽입.
**원인**: OCR 텍스트 인식 시 "캐치업코리아"를 "캐치업. 코리아"로 오인식 → AI title 생성에 전파
**영향**: displayName 표시 품질 저하 (기능에는 영향 없음)
**심각도**: Low

---

## 프론트엔드 화면 검증 (2026-03-26 2차 테스트)

| 항목 | 결과 |
|------|------|
| 25개 모두 완료 | **✓** — 전부 `✓ 완료` 표시 |
| OCR confidence 실제 값 반영 | **✓** — 빨간 10% 뱃지 사라짐, 녹색 완료 표시 (91~98%) |
| 파일 크기 정상 표시 | **✓** — 0 B 없음, 모두 정상 |
| OCR 뱃지 정상 | **✓** — JPG, 스캔 PDF, 이미지 PPT에 OCR 표시 |
| PDF 변환 뱃지 | **✓** — PPTX, XLSX, HWP, XLS에 PDF 뱃지 표시 |
| 변환 파일 OCR fallback | **✓** — 마장사은품.pptx OCR 1.55 MB 정상 |
| 별칭(displayName) 자동 생성 | **✓** — 25개 모두 생성 |

## 구현 우선순위

| 순서 | 이슈 | 심각도 | 상태 |
|------|------|--------|------|
| 1 | ~~HWP conversion_status 불일치 (이슈 3)~~ | ~~Medium~~ | **수정 완료** `fb0594d0` |
| 2 | ~~재처리 성공 시 error 미클리어 (이슈 4)~~ | ~~Low~~ | **수정 완료** `fb0594d0` |
| 3 | 대용량 PDF 처리 지연 (이슈 5) | Low | 추적 필요 |
| 4 | ~~HWP MIME 누락 (이슈 6)~~ | ~~Medium~~ | **수정 완료** `fb0594d0` |
| 5 | OCR displayName 환각 (이슈 7) | Low | AI 품질 이슈 |
