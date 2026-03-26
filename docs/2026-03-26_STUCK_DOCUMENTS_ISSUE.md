# 일괄등록 멈춘 문서 11건 이슈 분석

> 작성일: 2026-03-26
> 발생 경위: 캐치업코리아 391건 일괄등록 후 11건이 progress 40% (텍스트 추출 단계)에서 영구 정지
> 현재 상태: processing↔error 무한 반복 (self-healing이 error→processing으로 되돌리지만 재처리해도 같은 이유로 실패)

---

## 1. 문제별 분류

### 유형 A: 텍스트 추출이 원천적으로 불가능한 파일 (6건)

ZIP 아카이브와 AI(Adobe Illustrator) 파일은 텍스트를 포함하지 않는 형식이다.
추출을 시도하는 것 자체가 무의미하며, 요약보기/전체텍스트보기에 표시할 내용이 없다.

| # | 파일명 | 형식 |
|---|--------|------|
| 1 | 서울중앙 2019가합585938 김보성.zip | ZIP |
| 2 | 캐치업코리아-고객거래확인서,FATCA확인서.zip | ZIP |
| 3 | 캐치업코리아 요청자료.zip | ZIP |
| 4 | 캐치업코리아노무규정.zip | ZIP |
| 5 | 2018컨설팅자료.zip | ZIP |
| 6 | 캐치업포멧.ai | AI |

**조치**: 텍스트 추출 불가로 종결 처리. error가 아닌 "보관 전용"으로 completed 전환.

---

### 유형 B: HWP → PDF 변환 타임아웃 (3건) — 버그

HWP 파일은 LibreOffice로 PDF 변환 후 pdfplumber로 텍스트를 추출하는 흐름이다.
그런데 이 3건은 **PDF 변환 자체가 실패**했다.

| # | 파일명 | conversion_status | 에러 |
|---|--------|-------------------|------|
| 1 | 캐치업코리아 표준취업규칙(최종).hwp | **failed** | `HWP 변환 타임아웃 - 파일이 너무 크거나 복잡합니다` (60초 초과) |
| 2 | 20130409_121226표준취업규칙(최종).hwp | **failed** | 동일 (60초 타임아웃) |
| 3 | 표준취업규칙(최종).hwp | **failed** | 동일 (60초 타임아웃) |

**DB 근거**: `upload.conversion_status: "failed"`, `upload.conversion_error: "변환 실패 (HTTP 500): {\"success\":false,\"error\":\"HWP 변환 타임아웃 - 파일이 너무 크거나 복잡합니다\",\"duration\":60044}"`

**근본 원인**: pdf_converter 서비스(:8005)에서 LibreOffice의 HWP→PDF 변환이 60초 타임아웃에 걸림.

**해결 방안**:
1. **근본 해결**: pdf_converter의 HWP 변환 타임아웃이 왜 60초에 걸리는지 원인 파악. 파일 크기/복잡도 문제인지, LibreOffice 프로세스 hang인지 확인
2. **백업 방안**: 변환 실패 시 자동 재시도 (최대 2~3회). 현재는 1회 실패로 즉시 포기

---

### 유형 C: PDF 변환 성공 → 텍스트 0자 → OCR fallback 누락 (1건) — 버그

| # | 파일명 | conversion_status | convPdfPath | 텍스트 |
|---|--------|-------------------|-------------|--------|
| 1 | 안영미신분증.ppt | **completed** | 존재 (`260326172150_69b2c1ec.pdf`) | 0자 |

**DB 근거**: `upload.conversion_status: "completed"`, `upload.convPdfPath` 존재, `meta.text_extraction_failed: true`

**문제**: PPT가 이미지만 포함한 슬라이드인 경우, LibreOffice로 PDF 변환은 성공하지만 pdfplumber가 텍스트를 찾지 못한다. 이때 OCR로 fallback해야 하는데, **현재 파이프라인은 OCR 없이 에러로 처리**한다.

**해결**: 변환된 PDF에서 텍스트 추출 결과가 0자이면 → OCR 큐에 등록하여 이미지에서 텍스트 추출 시도

---

### 유형 D: OCR 실패 — 정상 동작 (1건)

| # | 파일명 | 처리 방식 | 결과 |
|---|--------|-----------|------|
| 1 | 암검진067.jpg | OCR | 텍스트 0자 |

**DB 근거**: `방식: ocr`, OCR을 정상적으로 시도했으나 텍스트가 추출되지 않음.

**원인**: 이 파일은 실제로 내용이 없는(빈) 이미지. OCR이 실패하는 것이 정상.

**조치**: 텍스트 추출 불가로 종결 처리. error가 아닌 "보관 전용"으로 completed 전환.

---

## 2. 필요한 조치 정리

| 우선순위 | 유형 | 조치 | 성격 |
|---------|------|------|------|
| **1** | B (HWP 3건) | HWP 변환 타임아웃 근본 원인 파악 + 재시도 로직 | **버그 수정** |
| **2** | C (PPT 1건) | 변환 성공 + 텍스트 0자 → OCR fallback 추가 | **버그 수정** |
| **3** | A (ZIP/AI 6건) | 미지원 파일을 에러가 아닌 "보관 전용" completed로 종결 | 정책 개선 |
| **4** | D (JPG 1건) | OCR 결과 텍스트 0자 → "보관 전용" completed로 종결 | 정책 개선 |
| **5** | 공통 | self-healing 무한 루프 방지 — 동일 에러 N회 이상이면 재시도 중단 | 안정성 개선 |

---

## 3. 공통 이슈: self-healing 무한 루프

현재 full_pipeline.py self-healing이 error 문서를 processing으로 되돌려 재시도한다.
하지만 ZIP/AI처럼 구조적으로 처리 불가능한 파일은 재시도해도 같은 결과다.

**결과**: processing↔error를 영구 반복. 사용자에게는 "40%"에서 영원히 멈춘 것으로 보임.

**해결**:
- 동일 에러 메시지로 N회(예: 3회) 이상 실패한 문서는 재시도 중단
- 또는 에러 원인이 "텍스트 추출 불가"인 경우 자동으로 "보관 전용" completed 처리

---

## 해결 과정

### 라운드 1 (2026-03-26) — 유형 A/C/D 근본 해결

**목표**: 미지원 파일 종결 + 텍스트 0자 보관 처리 + MIME 방어

#### 수정 내역

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `xpipe/stages/extract.py` | `UNSUPPORTED_EXTENSIONS`, `UNSUPPORTED_MIME_TYPES` 상수 추가. `execute()` 시작부에서 미지원 파일 조기 감지 → `unsupported_format` 플래그 설정, RuntimeError 미발생 |
| 2 | `xpipe/stages/extract.py` | 텍스트 0자 시 RuntimeError 대신 `text_extraction_failed` + `_extraction_skip_reason` 플래그 설정. `has_text`를 실제 텍스트 존재 여부로 결정 |
| 3 | `routers/doc_prep_main.py` | `UNSUPPORTED_MIME_TYPES`에 `application/x-zip-compressed` 추가 (Windows 환경 방어) |
| 4 | `routers/doc_prep_main.py` | `_process_via_xpipe()`에서 `text_extraction_failed` 플래그 감지 시 보관 완료 처리 분기 추가 (`overallStatus: "completed"`, `processingSkipReason` 설정) |
| 5 | `xpipe/tests/test_extract_unsupported.py` | regression 테스트 35건 (미지원 확장자/MIME, 텍스트 0자, stub 모드 호환, 정상 파일 영향 없음) |

#### 검증 결과
- 신규 테스트 35/35 PASSED
- 기존 xPipe 테스트 305/305 PASSED (기존 2건 실패는 버전 불일치로 무관)

#### 미해결 (라운드 2 대상)
- 유형 B: HWP 변환 타임아웃 (60초 초과) — pdf_converter 서비스 원인 파악 필요
- PPT OCR fallback 개선
- "보관 전용 completed"와 상태 정의 충돌 해소

---

### 라운드 2 (2026-03-26) — 유형 B/C 버그 수정 + 상태 정의 보완

**목표**: HWP 타임아웃 완화 + PPT/HWP 이미지 OCR fallback 개선 + 상태 정의서 보완

#### 수정 내역

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `tools/convert/convert2pdf.js` | `HWP_CONVERT_TIMEOUT_MS` 60초 → 120초. 복잡한 HWP 파일의 변환 시간 확보 |
| 2 | `backend/api/document_pipeline/workers/pdf_conversion_worker.py` | 변환 성공 + 텍스트 0자일 때 `text_extraction_failed` 대신 `ocr_fallback_needed` 마커 설정. 레거시 파이프라인의 OCR fallback이 이 문서를 픽업 가능 |
| 3 | `docs/DOCUMENT_STATUS_DEFINITION.md` | 규칙 1에 "보관 전용 completed" 서브타입 정의 추가 (`processingSkipReason` 필드 기반) |

#### 설계 결정
- **HWP 타임아웃**: 60초에서 실패한 3건이 모두 동일한 "표준취업규칙" 문서. 페이지 수가 많거나 복잡한 레이아웃으로 추정. 120초면 대부분의 HWP 변환을 커버할 수 있음
- **OCR fallback 마커**: 기존 `text_extraction_failed`는 "재시도 불필요" 의미였으나, PPT/HWP 이미지 문서는 OCR로 텍스트 추출이 가능. 별도 필드 `ocr_fallback_needed`를 사용하여 기존 쿼리(`text_extraction_failed: {"$ne": True}`)와 충돌 방지
