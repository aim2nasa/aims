# 파일 처리 파이프라인 전체 분석

**일자:** 2026-02-23
**목적:** 파일 업로드 50MB 제한 철폐 및 AI 처리 기준 정의를 위한 현황 분석
**관련:** [ISSUE-upload-50mb-limit-ux.md](ISSUE-upload-50mb-limit-ux.md)

---

## 아키텍처 개요

파일 유형에 따라 **세 가지 텍스트 추출 경로**가 존재한다.

```
파일 업로드 → document_pipeline (:8100) → MetaService.extract_metadata()
  │
  ├─ [경로 1] 직접 파서 — MetaService에 전용 파서 보유
  │    PDF → PyMuPDF, XLSX → openpyxl, XLS → xlrd, DOCX → python-docx
  │    PPTX → python-pptx, TXT/CSV/HTML → decode("utf-8")
  │    ⇒ 텍스트 추출 후 → OpenAI 요약 → 임베딩
  │
  ├─ [경로 2] PDF 변환 → 파서 — 직접 파서 없는 문서 포맷 (비용 절감)
  │    HWP, DOC, PPT, ODT, ODS, ODP, RTF
  │    → pdf_converter (:8005, LibreOffice/pyhwp) → PDF 변환
  │    → 변환된 PDF를 PyMuPDF로 텍스트 추출 (AI/OCR 불필요)
  │    ⇒ 텍스트 추출 후 → OpenAI 요약 → 임베딩
  │
  └─ [경로 3] OCR — 이미지/스캔 문서 전용
       이미지(JPEG, PNG, TIFF, BMP, WebP), 스캔PDF(텍스트 없는 PDF)
       → Upstage OCR (AI, 크레딧 소모)
       ⇒ OCR 텍스트 → OpenAI 요약 → 임베딩
```

**핵심 원칙:**
- 전용 파서가 있으면 직접 사용 (경로 1) — 비용 0
- 전용 파서가 없는 문서 포맷은 PDF 변환 후 PyMuPDF로 추출 (경로 2) — 비용 0
- OCR은 이미지/스캔 문서 전용 (경로 3) — AI 크레딧 소모
- 텍스트 추출 후 요약(OpenAI)에는 AI 사용

---

## 파일 형식별 코드 추적 (전수 검증)

### 검증 방법

1. 서버에서 `python3 mimetypes.guess_type()` 실행 → 실제 MIME 확인
2. `meta_service.py:134-159` MIME 분기 코드에 대입 → 핸들러 매칭 확인
3. 핸들러의 실제 동작 확인 (텍스트 추출 성공/실패)
4. `doc_prep_main.py:1258-1350` 라우팅 로직에 대입 → Case 판정
5. `pdfConversionService.js` CONVERTIBLE_EXTENSIONS 포함 여부 확인

### 코드 참조: MetaService MIME 분기 (meta_service.py:134-159)

```python
if mime_type == "application/pdf":                          # ← PDF
    pdf_info = await cls._extract_pdf_info(content)
elif mime_type and mime_type.startswith("image/"):          # ← 모든 이미지
    image_info = cls._extract_image_info(content, mime_type)
elif mime_type and mime_type.startswith("text/"):           # ← text/* 전부
    result["extracted_text"] = content.decode("utf-8", errors="ignore")
elif mime_type in (                                         # ← XLSX, XLS
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel"
):
    xlsx_info = cls._extract_xlsx_info(content, mime_type)
elif mime_type in (                                         # ← DOCX, DOC
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword"
):
    docx_info = cls._extract_docx_info(content, mime_type)
elif mime_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation":  # ← PPTX만
    pptx_info = cls._extract_pptx_info(content)
# ← 그 외: 아무 핸들러 없음, extracted_text = None 유지
```

### 코드 참조: doc_prep_main.py 라우팅 (process_document_pipeline)

```python
UNSUPPORTED_MIME_TYPES = ["application/postscript", "application/zip", "application/octet-stream"]

# Case 1: text/plain 전용 처리
if detected_mime == "text/plain": ...

# Case 2: 지원 불가 MIME → 415
if detected_mime in UNSUPPORTED_MIME_TYPES: ...

# Case 2.5: 직접 파서 없지만 PDF 변환 가능 → 변환 후 텍스트 추출 (✅ 2026-02-23 추가)
if (not full_text) and is_convertible_mime(detected_mime):
    converted_text = await convert_and_extract_text(dest_path)
    if converted_text: full_text = converted_text

# Case 3: 텍스트 없음 → OCR 큐
if not full_text or len(full_text.strip()) == 0: ...

# Case 4: 텍스트 있음 → OpenAI 요약 → 완료
```

---

## 경로 1: 직접 파서 — 코드 추적 결과

### PDF (확장자: .pdf)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/pdf` |
| MetaService 매칭 | `_extract_pdf_info()` (meta_service.py:134) |
| 파서 | PyMuPDF (fitz) — `page.get_text()` |
| 텍스트 추출 | ✅ 텍스트 레이어 있으면 성공 |
| doc_prep_main | Case 4 (text 있음 → OpenAI 요약 → 완료) |
| 스캔 PDF (텍스트 없음) | text=null → Case 3 → OCR 큐 (경로 3) |
| CONVERTIBLE | No (PREVIEW_NATIVE) |

### XLSX (확장자: .xlsx)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| MetaService 매칭 | `_extract_xlsx_info()` (meta_service.py:143) |
| 파서 | openpyxl — 시트별 셀→탭 구분 텍스트 |
| 텍스트 추출 | ✅ 셀 내용이 있으면 성공 |
| doc_prep_main | Case 4 |
| CONVERTIBLE | Yes (하지만 직접 파서 있으므로 변환 불필요) |

### XLS (확장자: .xls)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/vnd.ms-excel` |
| MetaService 매칭 | `_extract_xlsx_info()` (meta_service.py:145) |
| 파서 | xlrd — 레거시 XLS 읽기 |
| 텍스트 추출 | ✅ |
| doc_prep_main | Case 4 |
| CONVERTIBLE | Yes (직접 파서 있으므로 변환 불필요) |

### DOCX (확장자: .docx)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| MetaService 매칭 | `_extract_docx_info()` (meta_service.py:151) |
| 파서 | python-docx — 단락별 텍스트 |
| 텍스트 추출 | ✅ |
| doc_prep_main | Case 4 |
| CONVERTIBLE | Yes (직접 파서 있으므로 변환 불필요) |

### PPTX (확장자: .pptx)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| MetaService 매칭 | `_extract_pptx_info()` (meta_service.py:157) |
| 파서 | python-pptx — 슬라이드별 shape.text |
| 텍스트 추출 | ✅ |
| doc_prep_main | Case 4 |
| CONVERTIBLE | Yes (직접 파서 있으므로 변환 불필요) |

### TXT (확장자: .txt)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `text/plain` |
| MetaService 매칭 | `text/*` 분기 (meta_service.py:140) |
| 파서 | `content.decode("utf-8")` — 직접 읽기 |
| 텍스트 추출 | ✅ |
| doc_prep_main | **Case 1** (text/plain 전용 분기, 즉시 완료) |
| CONVERTIBLE | Yes (직접 읽기 가능하므로 변환 불필요) |

### CSV (확장자: .csv)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `text/csv` |
| MetaService 매칭 | `text/*` 분기 (meta_service.py:140) |
| 파서 | `content.decode("utf-8")` — 직접 읽기 |
| 텍스트 추출 | ✅ (탭/쉼표 구분 원문 그대로) |
| doc_prep_main | Case 4 (text/csv ≠ text/plain이므로 Case 1 아님) |
| CONVERTIBLE | Yes (직접 읽기 가능하므로 변환 불필요) |

### HTML/HTM (확장자: .html, .htm)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `text/html` |
| MetaService 매칭 | `text/*` 분기 (meta_service.py:140) |
| 파서 | `content.decode("utf-8")` — 직접 읽기 |
| 텍스트 추출 | ⚠️ HTML 태그 포함된 채 추출 (품질 문제) |
| doc_prep_main | Case 4 |
| CONVERTIBLE | Yes |
| 참고 | 태그 포함 텍스트가 임베딩됨. 경로 2(LibreOffice→PDF→PyMuPDF)로 하면 깨끗한 텍스트 가능 |

---

## 경로 2: PDF 변환 → 파서 — 코드 추적 결과

이 포맷들은 MetaService에 전용 파서가 없어 텍스트를 직접 추출할 수 없다.
pdf_converter(:8005)로 PDF 변환 후 PyMuPDF로 텍스트를 추출하는 것이 올바른 경로.
AI/OCR 불필요. 비용 절감.

### HWP (확장자: .hwp)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/x-hwp` |
| MetaService 매칭 | **없음** — 어떤 분기에도 해당 안 됨 → extracted_text = null |
| doc_prep_main | ✅ PDF 변환 → PyMuPDF 텍스트 추출 (수정 완료 `63f0baa4`) |
| CONVERTIBLE | ✅ Yes — `CONVERTIBLE_MIMES` in pdf_conversion_text_service.py |
| 변환 방식 | pyhwp → ODT → LibreOffice headless → PDF |
| 경로 | **경로 2: PDF 변환 → PyMuPDF 텍스트 추출 (AI/OCR 불필요)** |

### DOC (확장자: .doc, 구형 Word)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/msword` |
| MetaService 매칭 | `_extract_docx_info()` 진입 (meta_service.py:152) |
| 파서 동작 | **"DOC format not supported" 로그 출력 후 return null** (meta_service.py:346-347) |
| 텍스트 추출 | ❌ null — python-docx는 DOC 미지원, DOCX만 지원 |
| doc_prep_main | ✅ PDF 변환 → PyMuPDF 텍스트 추출 (수정 완료 `63f0baa4`) |
| CONVERTIBLE | ✅ Yes |
| 변환 방식 | LibreOffice headless → PDF |
| 경로 | **경로 2: PDF 변환 → PyMuPDF 텍스트 추출** |

### PPT (확장자: .ppt, 구형 PowerPoint)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/vnd.ms-powerpoint` |
| MetaService 매칭 | **없음** — PPTX 분기는 `presentationml.presentation`만 매칭 |
| 텍스트 추출 | ❌ null — python-pptx는 PPT 미지원, PPTX만 지원 |
| doc_prep_main | ✅ PDF 변환 → PyMuPDF 텍스트 추출 (수정 완료 `63f0baa4`) |
| CONVERTIBLE | ✅ Yes |
| 변환 방식 | LibreOffice headless → PDF |
| 경로 | **경로 2: PDF 변환 → PyMuPDF 텍스트 추출** |

### ODT (확장자: .odt, OpenDocument Text)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/vnd.oasis.opendocument.text` |
| MetaService 매칭 | **없음** |
| doc_prep_main | ✅ PDF 변환 → PyMuPDF 텍스트 추출 (수정 완료 `63f0baa4`) |
| CONVERTIBLE | ✅ Yes |
| 변환 방식 | LibreOffice headless → PDF |
| 경로 | **경로 2: PDF 변환 → PyMuPDF 텍스트 추출** |

### ODS (확장자: .ods, OpenDocument Spreadsheet)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/vnd.oasis.opendocument.spreadsheet` |
| MetaService 매칭 | **없음** |
| doc_prep_main | ✅ PDF 변환 → PyMuPDF 텍스트 추출 (수정 완료 `63f0baa4`) |
| CONVERTIBLE | ✅ Yes |
| 경로 | **경로 2: PDF 변환 → PyMuPDF 텍스트 추출** |

### ODP (확장자: .odp, OpenDocument Presentation)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/vnd.oasis.opendocument.presentation` |
| MetaService 매칭 | **없음** |
| doc_prep_main | ✅ PDF 변환 → PyMuPDF 텍스트 추출 (수정 완료 `63f0baa4`) |
| CONVERTIBLE | ✅ Yes |
| 경로 | **경로 2: PDF 변환 → PyMuPDF 텍스트 추출** |

### RTF (확장자: .rtf)

| 항목 | 값 |
|------|-----|
| 서버 MIME | `application/rtf` (**주의: `text/rtf` 아님!**) |
| MetaService 매칭 | **없음** — `text/*` 분기에 미해당 (application/rtf) |
| 텍스트 추출 | ❌ null |
| doc_prep_main | ✅ PDF 변환 → PyMuPDF 텍스트 추출 (수정 완료 `63f0baa4`) |
| CONVERTIBLE | ✅ Yes |
| 변환 방식 | LibreOffice headless → PDF |
| 경로 | **경로 2: PDF 변환 → PyMuPDF 텍스트 추출** |
| 참고 | 서버 MIME이 `application/rtf`이므로 `text/*`에 해당하지 않음 |

---

## 경로 3: OCR — 코드 추적 결과

### 이미지 파일 (OCR 대상)

모든 이미지는 `image/*` → `_extract_image_info()` → PIL/EXIF만 추출 → text=null → OCR 큐.

| 확장자 | 서버 MIME | MetaService | OCR 대상 | 비고 |
|--------|----------|-------------|---------|------|
| .jpg/.jpeg | image/jpeg | `_extract_image_info()` → text=null | ✅ Upstage OCR | 문서 스캔에 유효 |
| .png | image/png | `_extract_image_info()` → text=null | ✅ Upstage OCR | 문서 스캔에 유효 |
| .tif/.tiff | image/tiff | `_extract_image_info()` → text=null | ✅ Upstage OCR | 문서 스캔에 유효 |
| .bmp | image/bmp | `_extract_image_info()` → text=null | ✅ Upstage OCR | 문서 스캔에 유효 |
| .webp | image/webp | `_extract_image_info()` → text=null | ✅ Upstage OCR | 문서 스캔에 유효 |
| .gif | image/gif | `_extract_image_info()` → text=null | ⚠️ OCR 큐 진입 | 아이콘/애니 → 실질적 효과 없음 |
| .svg | image/svg+xml | `_extract_image_info()` → text=null | ⚠️ OCR 큐 진입 | 벡터 그래픽 → OCR 무의미 |
| .ico | image/vnd.microsoft.icon | `_extract_image_info()` → text=null | ⚠️ OCR 큐 진입 | 아이콘 → OCR 무의미 |

### 스캔 PDF (OCR 대상)

| 조건 | 처리 |
|------|------|
| PDF + 텍스트 레이어 있음 | 경로 1 (PyMuPDF 직접 추출) |
| PDF + 텍스트 레이어 없음 | 경로 3 (OCR 큐 → Upstage OCR) |

---

## 처리 불가 파일 — 코드 추적 결과

### UNSUPPORTED_MIME_TYPES → 415 에러 (업로드 가능, 처리 중단)

| 확장자 | 서버 MIME | doc_prep_main 결과 |
|--------|----------|-------------------|
| .zip | application/zip | Case 2 → 415 "OCR 생략: 지원하지 않는 문서 형식" |
| .ai | application/postscript | Case 2 → 415 |
| .eps | application/postscript | Case 2 → 415 |
| .hwpx | application/octet-stream | Case 2 → 415 ← **주의: HWPX 처리 불가** |

### UNSUPPORTED_MIME_TYPES에 없지만 파서도 없는 파일

| 확장자 | 서버 MIME | MetaService | doc_prep_main | 결과 |
|--------|----------|-------------|---------------|------|
| .rar | application/vnd.rar | 핸들러 없음 | Case 3 (OCR 큐) | Upstage 처리 불가, 무의미 |
| .7z | application/x-7z-compressed | 핸들러 없음 | Case 3 (OCR 큐) | Upstage 처리 불가, 무의미 |
| .mp3 | audio/mpeg | 핸들러 없음 | Case 3 (OCR 큐) | 오디오 → OCR 무의미 |
| .mp4 | video/mp4 | 핸들러 없음 | Case 3 (OCR 큐) | 비디오 → OCR 무의미 |
| .avi | video/x-msvideo | 핸들러 없음 | Case 3 (OCR 큐) | 비디오 → OCR 무의미 |

**문제:** RAR/7Z/오디오/비디오가 UNSUPPORTED_MIME_TYPES에 없어서 OCR 큐로 잘못 전송됨.

### 프론트엔드 차단 (업로드 자체 거부)

실행 파일 36종 확장자 + 위험 MIME 26종 (`shared/file-validation-constants.json`)
exe, bat, cmd, msi, dll, sh, py, rb, pl 등

---

## pdf_converter 서비스 상세

### 서비스 정보

| 항목 | 값 |
|------|-----|
| 위치 | `/home/rossi/aims/tools/convert/` |
| PM2 프로세스 | `pdf_converter` (포트 8005) |
| 변환 엔진 | LibreOffice headless (일반), pyhwp→ODT→LibreOffice (HWP) |
| 동시 실행 | **1개** (ConvertQueue 제한) |
| 타임아웃 | 120초 (일반), 60초 (HWP→ODT) |
| 파일 크기 제한 | **50MB** (multer) |

### 변환 가능 확장자 (CONVERTIBLE_EXTENSIONS, pdfConversionService.js:28-38)

```
.doc .docx .xls .xlsx .ppt .pptx
.odt .ods .odp .rtf .txt .csv .html .htm .hwp
```

### 네이티브 프리뷰 (PREVIEW_NATIVE, 변환 불필요)

```
.pdf .jpg .jpeg .png .gif .bmp .webp .svg .ico .tif .tiff
```

### 프리뷰 트리거 (현재 구현)

- `pdfConversionTrigger.js` → `triggerPdfConversionIfNeeded(document)`
- 호출 시점: 문서에 customerId 연결 시, 문서 처리 완료 시
- 변환 결과: `upload.convPdfPath`, `upload.conversion_status`
- **현재는 프리뷰 전용** — 텍스트 추출 파이프라인과 미연결

---

## 임베딩 파이프라인 (full_pipeline.py, 크론 1분)

텍스트 소스 우선순위:
1. `meta.full_text` (직접 파서 또는 PDF 변환 후 파서)
2. `ocr.full_text` (Upstage OCR)
3. `text.full_text` (text/plain 직접 읽기)

텍스트 없으면 → `docembed.status = 'skipped'`, `overallStatus = 'completed'`

---

## 파일 크기 제한 현황

| 위치 | 제한 | 파일 |
|------|------|------|
| Nginx 서버 레벨 (`aims.giize.com :443`) | 10GB | nginx.conf |
| Nginx `/shadow/` 로케이션 | **50MB** | nginx.conf |
| Nginx 전역 기본값 | 50MB | nginx.conf |
| 프론트엔드 (구형: userContextService) | 50MB | userContextService.ts:183 |
| 프론트엔드 (신형: fileValidation) | 50MB | shared/lib/fileValidation/constants.ts:34 |
| 프론트엔드 (신형: batch-upload) | 50MB | features/batch-upload/types/index.ts:188 |
| pdf_converter (multer) | **50MB** | tools/convert/server.js multer.limits |
| 백엔드 FastAPI | 명시적 제한 없음 | Nginx에 의존 |

**제한 철폐 시 변경 필요 지점: 최소 5곳**

---

## 관련 코드 위치 색인

### 경로 1: 직접 파서

| 역할 | 파일 | 핵심 위치 |
|------|------|----------|
| 업로드 오케스트레이터 | `backend/api/document_pipeline/routers/doc_prep_main.py` | `process_document_pipeline()` |
| 메타/텍스트 추출 허브 | `backend/api/document_pipeline/services/meta_service.py` | MIME 분기: 134-159행 |
| PDF 파서 | 위 파일 `_extract_pdf_info()` | PyMuPDF `page.get_text()` |
| XLSX 파서 | 위 파일 `_extract_xlsx_info()` | openpyxl, xlrd |
| DOCX 파서 | 위 파일 `_extract_docx_info()` | python-docx (DOC 미지원: 346행) |
| PPTX 파서 | 위 파일 `_extract_pptx_info()` | python-pptx |
| OpenAI 요약 | `backend/api/document_pipeline/services/openai_service.py` | `summarize_text()` |
| 임베딩 | `backend/embedding/full_pipeline.py` | 크론 1분 |

### 경로 2: PDF 변환 → 파서

| 역할 | 파일 |
|------|------|
| 변환 서버 | `tools/convert/server.js` (PM2: pdf_converter, :8005) |
| 변환 엔진 | `tools/convert/convert2pdf.js` (LibreOffice + pyhwp) |
| **✅ 텍스트 추출 서비스** | `backend/api/document_pipeline/services/pdf_conversion_text_service.py` |
| **✅ CONVERTIBLE_MIMES** | `pdf_conversion_text_service.py` (7개 MIME) |
| 변환 트리거 (프리뷰용) | `backend/api/aims_api/lib/pdfConversionTrigger.js` |
| 변환 서비스 (프리뷰 클라이언트) | `backend/api/aims_api/lib/pdfConversionService.js` |
| CONVERTIBLE_EXTENSIONS (프리뷰) | `pdfConversionService.js:28-38` |

### 경로 3: OCR

| 역할 | 파일 |
|------|------|
| OCR 워커 | `backend/api/document_pipeline/workers/ocr_worker.py` |
| Upstage OCR | `backend/api/document_pipeline/services/upstage_service.py` |
| UNSUPPORTED_MIME_TYPES | `doc_prep_main.py:90-94` |

### 프론트엔드

| 역할 | 파일 |
|------|------|
| 50MB 제한 (구형) | `frontend/aims-uix3/src/components/.../services/userContextService.ts:183` |
| 50MB 제한 (신형 공통) | `frontend/aims-uix3/src/shared/lib/fileValidation/constants.ts:34` |
| 50MB 제한 (batch-upload) | `frontend/aims-uix3/src/features/batch-upload/types/index.ts:188` |
| 차단 확장자/MIME | `shared/file-validation-constants.json` |

---

## 근본 원인: n8n → FastAPI 마이그레이션 시 HWP 텍스트 추출 누락

### 타임라인

| 일자 | 커밋 | 내용 |
|------|------|------|
| 2025-12-14 | `3363446d` | DOC 텍스트 추출 추가 (`enhanced_file_analyzer.js`, word-extractor) |
| 2025-12-14 | `d3a707f1` | PDF 변환 프리뷰 기능 구현 |
| 2025-12-17 | `a5a290a7` | **HWP 텍스트 추출 구현** (`enhanced_file_analyzer.js`, HWP→PDF→텍스트) |
| 2025-12-23 | `8ae8801c` | HWP 텍스트 추출 복구 (포트 3011→8005 수정) + 회귀 테스트 추가 |
| **2026-01-06** | **`aa96725c`** | **서비스 모드 FASTAPI로 전환** ← 이 시점부터 HWP 텍스트 추출 깨짐 |
| 2026-01-17 | `d241af30` | MetaService에 Office 파서 추가 (XLSX/DOCX/PPTX만, HWP 누락) |
| 2026-02-07 | `23f42dad` | server.js 리팩토링 (12,986→501줄) |
| **2026-02-23** | **`63f0baa4`** | **✅ PDF 변환 텍스트 추출 기능 복원** (pdf_conversion_text_service.py + 회귀 테스트 56개) |

### 원래 동작 (n8n 시절 — 정상)

```
n8n DocMeta 워크플로우
  → 파일 저장 → node enhanced_file_analyzer.js <파일경로>
  → enhanced_file_analyzer.js가 MIME별 텍스트 추출:
      application/x-hwp → extractHwpText() → PDF Converter(:8005) → PDF → pdf-parse → 텍스트
      application/msword → extractDocText() → word-extractor → 텍스트
      application/pdf → extractPdfText() → pdf-parse → 텍스트
      ...기타 모든 형식 지원
  → JSON 출력 (extracted_text 포함) → n8n이 DB에 meta.full_text 저장
```

### 수정 전 동작 (FastAPI — 결함, 2026-01-06 ~ 2026-02-23)

```
FastAPI document_pipeline (:8100)
  → MetaService.extract_metadata() (Python)
  → MIME별 분기:
      application/x-hwp → ❌ 핸들러 없음 → extracted_text = null
      application/msword → ❌ "DOC not supported" → null
      application/vnd.ms-powerpoint → ❌ 핸들러 없음 → null
      ...
  → text 없음 → OCR 큐 → AI 크레딧 소모 (불필요한 비용!)
```

### 수정 후 동작 (FastAPI — 정상, 2026-02-23~)

```
FastAPI document_pipeline (:8100)
  → MetaService.extract_metadata() (Python)
  → MIME별 분기: PDF/XLSX/DOCX/PPTX → 직접 파서로 텍스트 추출
  → text 없음 + CONVERTIBLE_MIMES 해당?
      ✅ YES → pdf_conversion_text_service.convert_and_extract_text()
               → pdf_converter(:8005) → PDF 변환 → PyMuPDF 텍스트 추출
               → 텍스트 성공 시 OpenAI 요약 → 완료 (AI 크레딧 절감!)
               → 텍스트 실패 시 OCR 큐로 fallback
      NO → OCR 큐 (이미지/스캔 문서)
```

### 핵심 코드 위치

| 항목 | 파일 | 설명 |
|------|------|------|
| **n8n 원본 (참조)** | `tools/mime_type_analyzer/enhanced_file_analyzer.js` | HWP→PDF→텍스트 (line 457-497) |
| n8n 워크플로우 | `backend/n8n_flows/modules/DocMeta.json` (line 40) | `node enhanced_file_analyzer.js` 호출 |
| MetaService (직접 파서) | `backend/api/document_pipeline/services/meta_service.py` | PDF/XLSX/DOCX/PPTX 핸들러 |
| **✅ PDF 변환 텍스트 추출** | `backend/api/document_pipeline/services/pdf_conversion_text_service.py` | HWP/DOC/PPT 등 7개 포맷 |
| 파이프라인 라우팅 | `backend/api/document_pipeline/routers/doc_prep_main.py` | 메인/credit_pending/shadow 3경로 |
| 회귀 테스트 (MIME 분류) | `backend/api/document_pipeline/tests/test_pdf_conversion_text_service.py` | 33개 테스트 |
| 회귀 테스트 (라우팅) | `backend/api/document_pipeline/tests/test_pipeline_routing.py` | 23개 테스트 |
| 기존 회귀 테스트 | `backend/api/aims_api/__tests__/pdfConversion.test.js` (line 119) | "HWP는 OCR 아님" 명시 |

### enhanced_file_analyzer.js의 HWP 텍스트 추출 코드 (참조)

```javascript
// enhanced_file_analyzer.js:457-497
async function extractHwpText(filePath) {
  const outputDir = path.dirname(filePath);
  const baseName = path.basename(filePath, '.hwp');
  const pdfPath = path.join(outputDir, baseName + '.pdf');

  // PDF Converter 서비스로 HWP → PDF 변환
  await new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    const options = {
      hostname: PDF_CONVERTER_HOST,  // 172.17.0.1
      port: PDF_CONVERTER_PORT,       // 8005
      path: '/convert',
      method: 'POST',
      headers: form.getHeaders(),
      timeout: 120000
    };
    // ... HTTP request → 변환된 PDF 저장
  });

  // 변환된 PDF에서 텍스트 추출
  return await extractPdfText(pdfPath);
}
```

### 영향 범위 및 수정 상태

| 포맷 | MIME | n8n 시절 | 수정 전 (결함) | 수정 후 (✅) |
|------|------|----------|---------------|-------------|
| **HWP** | `application/x-hwp` | PDF변환→텍스트 (비용 0) | OCR (AI 크레딧 소모) | ✅ PDF변환→텍스트 (비용 0) |
| **DOC** | `application/msword` | word-extractor 직접 추출 (비용 0) | OCR (AI 크레딧 소모) | ✅ PDF변환→텍스트 (비용 0) |
| **PPT** | `application/vnd.ms-powerpoint` | (미확인) | OCR (AI 크레딧 소모) | ✅ PDF변환→텍스트 (비용 0) |
| **ODT** | `application/vnd.oasis.opendocument.text` | (미확인) | OCR (AI 크레딧 소모) | ✅ PDF변환→텍스트 (비용 0) |
| **ODS** | `application/vnd.oasis.opendocument.spreadsheet` | (미확인) | OCR (AI 크레딧 소모) | ✅ PDF변환→텍스트 (비용 0) |
| **ODP** | `application/vnd.oasis.opendocument.presentation` | (미확인) | OCR (AI 크레딧 소모) | ✅ PDF변환→텍스트 (비용 0) |
| **RTF** | `application/rtf` | (미확인) | OCR (AI 크레딧 소모) | ✅ PDF변환→텍스트 (비용 0) |

---

## 수정 내역 (2026-02-23, 커밋 `63f0baa4`)

### 채택한 방안: doc_prep_main.py에서 분기 추가 (방안 B 변형)

MetaService는 변경하지 않고, `doc_prep_main.py`의 파이프라인 라우팅에서 변환 분기를 추가.
별도 서비스 `pdf_conversion_text_service.py`로 분리하여 단일 책임 원칙 준수.

### 구현 상세

1. **`pdf_conversion_text_service.py`** (신규)
   - `CONVERTIBLE_MIMES`: 7개 MIME 세트 (HWP, DOC, PPT, ODT, ODS, ODP, RTF)
   - `is_convertible_mime(mime)`: MIME 확인
   - `convert_and_extract_text(file_path)`: pdf_converter(:8005) → PDF 변환 → PyMuPDF 텍스트 추출
   - 실패 시 None 반환 → 호출측에서 OCR fallback 결정

2. **`doc_prep_main.py`** (3개 경로 수정)
   - **메인 파이프라인**: MetaService 추출 실패 + convertible MIME → PDF 변환 시도
   - **credit_pending 경로**: 동일 분기 (크레딧 소모 없는 텍스트 추출)
   - **shadow mode**: 임시 파일 삭제 전에 PDF 변환 수행

3. **`config.py`**: `PDF_CONVERTER_HOST`, `PDF_CONVERTER_PORT`, `PDF_CONVERTER_URL` 추가

### 회귀 테스트 (56개)

| 테스트 파일 | 테스트 수 | 커버리지 |
|------------|----------|---------|
| `test_pdf_conversion_text_service.py` | 33 | MIME 분류 18, 변환 시나리오 7, PyMuPDF 추출 4, 회귀 가드 4 |
| `test_pipeline_routing.py` | 23 | 핸들러 커버리지 12, 라우팅 통합 11 |

### 미수정 사항 (별도 이슈)

1. **UNSUPPORTED_MIME_TYPES 보완** — RAR, 7Z, 오디오, 비디오가 OCR 큐로 잘못 전송되는 문제
2. **HWPX 지원** — 현재 `application/octet-stream` → 415 에러. pyhwp 또는 별도 파서 검토
3. **convPdfPath 재활용** — PDF 변환은 프리뷰와 텍스트 추출 양쪽에서 동일한 결과를 사용 가능

---

## 기존 버그 (ISSUE 문서에서 이관)

| # | 심각도 | 내용 | 위치 |
|---|--------|------|------|
| ~~B0~~ | ~~Critical~~ | ~~HWP/DOC/PPT 등 OCR 잘못 전송 (n8n→FastAPI 마이그레이션 누락)~~ **✅ 수정 완료 (`63f0baa4`)** | pdf_conversion_text_service.py, doc_prep_main.py |
| B1 | Critical | `estimated_pages=1` 고정 → 크레딧 체크 무력화 | doc_prep_main.py:235 |
| B2 | Critical | fail-open (오류 시 무조건 허용) 양쪽 관문 | doc_prep_main.py:79, ocr_worker.py:141 |
| B3 | Critical | OCR 워커 요약 시 owner_id 미전달 | ocr_worker.py:170 |
| B4 | Major | 서버사이드 파일 크기 검증 없음 (Nginx만 의존) | doc_prep_main.py |
