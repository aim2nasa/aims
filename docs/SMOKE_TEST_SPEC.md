# 스모크 테스트 샘플 파일 목록

**목적:** 배포 후 각 문서 형식의 텍스트 추출 경로가 정상 동작하는지 자동 검증
**위치:** `backend/api/document_pipeline/tests/fixtures/`
**공통 키워드:** 모든 샘플 파일에 `AIMS_SMOKE_TEST` 문자열 포함 → 추출 결과에서 이 키워드 존재 여부로 PASS/FAIL 판정

---

## 경로 1: 직접 파서 (비용 0)

MetaService에 전용 파서가 있어 텍스트를 직접 추출하는 형식.

| # | 파일명 | MIME | 파서 | 검증 조건 |
|---|--------|------|------|----------|
| 1 | `sample.pdf` | application/pdf | PyMuPDF | `meta.full_text`에 `AIMS_SMOKE_TEST` 포함 |
| 2 | `sample.docx` | application/vnd.openxmlformats-officedocument.wordprocessingml.document | python-docx | `meta.full_text`에 `AIMS_SMOKE_TEST` 포함 |
| 3 | `sample.xlsx` | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | openpyxl | `meta.full_text`에 `AIMS_SMOKE_TEST` 포함 |
| 4 | `sample.pptx` | application/vnd.openxmlformats-officedocument.presentationml.presentation | python-pptx | `meta.full_text`에 `AIMS_SMOKE_TEST` 포함 |

---

## 경로 2: PDF 변환 → 텍스트 추출 (비용 0)

MetaService에 직접 파서가 없는 형식. pdf_converter(:8005)로 PDF 변환 후 PyMuPDF로 텍스트 추출.
**이번에 복원한 기능 — 가장 중요한 검증 대상.**

| # | 파일명 | MIME | 변환 방식 | 검증 조건 |
|---|--------|------|----------|----------|
| 5 | `sample.hwp` | application/x-hwp | pyhwp → ODT → LibreOffice → PDF | `meta.full_text`에 `AIMS_SMOKE_TEST` 포함, `ocr` 필드 없음 |
| 6 | `sample.doc` | application/msword | LibreOffice → PDF | `meta.full_text`에 `AIMS_SMOKE_TEST` 포함, `ocr` 필드 없음 |
| 7 | `sample.ppt` | application/vnd.ms-powerpoint | LibreOffice → PDF | `meta.full_text`에 `AIMS_SMOKE_TEST` 포함, `ocr` 필드 없음 |
| 8 | `sample.rtf` | application/rtf | LibreOffice → PDF | `meta.full_text`에 `AIMS_SMOKE_TEST` 포함, `ocr` 필드 없음 |

---

## 경로 3: OCR (AI 크레딧 소모)

이미지 또는 텍스트 레이어 없는 스캔 PDF. Upstage OCR로 텍스트 추출.

| # | 파일명 | MIME | 검증 조건 |
|---|--------|------|----------|
| 9 | `sample_scan.pdf` | application/pdf (텍스트 레이어 없음) | `ocr.full_text`에 `AIMS_SMOKE_TEST` 포함 |
| 10 | `sample.jpg` | image/jpeg | `ocr.full_text`에 `AIMS_SMOKE_TEST` 포함 |

---

## 샘플 파일 제작 기준

- **크기:** 각 파일 10KB 이하 (git에 부담 없는 수준)
- **내용:** 1페이지, `AIMS_SMOKE_TEST`를 포함하는 간단한 텍스트
- **언어:** 한글 + 영문 혼합 (실제 사용 환경 반영)
- **예시 내용:**
  ```
  AIMS 스모크 테스트 문서
  AIMS_SMOKE_TEST
  이 문서는 배포 후 텍스트 추출 경로를 검증하기 위한 샘플입니다.
  ```

## 스모크 테스트 판정 기준

| 결과 | 조건 |
|------|------|
| **PASS** | 기대 필드에 `AIMS_SMOKE_TEST` 키워드 존재 |
| **FAIL** | 키워드 미존재, 또는 잘못된 경로로 처리됨 (경로 2 파일이 OCR로 간 경우 등) |
| **ERROR** | 업로드 실패, 타임아웃, 서비스 미응답 |

## 스모크 테스트 실행 시점

- 배포 직후 (deploy 스크립트 마지막 단계)
- 정기 점검 시 수동 실행 가능
