# Docling 도입 분석: AIMS PDF 파싱 스택 평가

> **작성일**: 2026-02-07
> **관련 문서**: [DOCUMENT_PIPELINE_PRODUCT_ANALYSIS.md](DOCUMENT_PIPELINE_PRODUCT_ANALYSIS.md)

---

## 1. 배경

AIMS는 현재 PDF 문서 처리에 **pdfplumber + PyMuPDF** 조합을 사용 중이다.
IBM이 오픈소스로 공개한 **Docling** (MIT 라이선스, GitHub 52,300+ stars)이 테이블 추출에서 97.9% 정확도를 보이면서, 교체 또는 도입 가능성을 검토한다.

---

## 2. 현재 AIMS PDF 파싱 스택

### Python (백엔드)

| 라이브러리 | 버전 | 용도 | 사용 위치 |
|-----------|------|------|----------|
| **pdfplumber** | 0.11.4 | AR/CRS 테이블 추출 (핵심) | `annual_report_api/services/parser_pdfplumber.py`, `cr_parser.py`, `table_extractor.py`, `cr_table_extractor.py`, `pdf_utils.py` |
| **PyMuPDF (fitz)** | >=1.23.0 | PDF 메타데이터, 썸네일, 전문 추출 | `document_pipeline/services/meta_service.py`, `pdf_proxy/main.py`, `ocr_worker.py` |
| **PyPDF2** | 3.0.1 | PDF 기본 처리 (보조) | `annual_report_api/requirements.txt` |
| **pdfminer.six** | - | 텍스트 추출 (도구용) | `tools/pdf_sorter/`, `tools/CustomerReviewService/` |

### JavaScript/TypeScript (프론트엔드)

| 라이브러리 | 용도 | 사용 위치 |
|-----------|------|----------|
| **pdfjs-dist (PDF.js)** | PDF 뷰어 + AR/CRS 감지 텍스트 추출 | `PDFViewer.tsx`, `pdfParser.ts` |
| **pdf-parse** | 서버측 PDF 텍스트 추출 | `tools/mime_type_analyzer/` |
| **pdf-lib** | PDF 생성 (테스트용) | `tools/ar_generator/` |

### 역할별 구조

```
프론트엔드 (브라우저)
  └─ pdfjs-dist: PDF 뷰잉 + AR/CRS 감지용 텍스트 추출

백엔드 핵심 파이프라인
  ├─ PyMuPDF (fitz): PDF 메타데이터, 페이지 수, OCR 전처리, 썸네일 생성
  └─ pdfplumber: AR/CRS 테이블 파싱 (find_tables)

백엔드 보조
  ├─ PyPDF2: 기본 PDF 조작
  └─ pdfminer.six: 텍스트 추출 (도구용)
```

---

## 3. Docling 현황 (2026년 2월 기준)

### 기본 정보

| 항목 | 내용 |
|------|------|
| 최신 버전 | v2.72.0 (2026-02-03) |
| 라이선스 | MIT (완전 무료, 상업적 사용 가능) |
| GitHub Stars | 52,300+ |
| PyPI 다운로드 | 15.1M+ (누적) |
| 일일 다운로드 | ~5,000-7,000 |
| 운영 주체 | LF AI & Data Foundation (Linux Foundation) |
| 원개발 | IBM Research Zurich |

### 지원 문서 유형

| 포맷 | 지원 수준 |
|------|----------|
| PDF (디지털) | 완전: 레이아웃, 테이블, 수식, 코드, 읽기 순서 |
| PDF (스캔) | OCR 엔진 경유 (EasyOCR, Tesseract, RapidOCR) |
| DOCX, PPTX, XLSX | 완전 |
| HTML | 완전 |
| 이미지 (PNG, JPG) | OCR 경유 |
| 오디오/비디오 | ASR 전사 (WAV, MP3, MP4) |

### TableFormer 모델 (테이블 추출 핵심)

| 모드 | 설명 | 용도 |
|------|------|------|
| `TableFormerMode.ACCURATE` | 기본, 높은 품질 | 병합 셀, 다단 헤더 등 복잡한 표 |
| `TableFormerMode.FAST` | 빠르지만 품질 낮음 | 단순 표, 대량 처리 |

**벤치마크 정확도:**

| 메트릭 | 수치 | 출처 |
|--------|------|------|
| 셀 정확도 (복잡한 표) | 97.9% | Bayer 2023 재무 테이블 |
| 평균 정확도 (대규모 테이블 뱅크) | 93.6% | TableFormer 논문 |
| vs Tabula | +25.7pp (Tabula: 67.9%) | TableFormer 논문 |
| vs Camelot | +20.6pp (Camelot: 73.0%) | TableFormer 논문 |

### Granite-Docling-258M

IBM이 문서 변환 전용으로 만든 258M 파라미터 비전-언어 모델.
훨씬 큰 모델과 경쟁하는 성능. 900M 변형도 로드맵에 있음.

---

## 4. 성능 비교

### 속도 (페이지당)

| 하드웨어 | Docling | pdfplumber | 배율 |
|---------|---------|------------|------|
| NVIDIA L4 GPU (24GB) | 481ms | - | GPU 전용 |
| x86 CPU (AMD EPYC) | 3.1s | ~0.1-0.3s | **10-30x 느림** |
| Apple M3 Max | 1.26s | ~0.1s | **~13x 느림** |

### GPU 가속 효과 (vs x86 CPU)

| 컴포넌트 | 가속 배율 |
|---------|----------|
| OCR | 8x |
| 레이아웃 모델 | 14x |
| 테이블 구조 인식 | 4.3x |

### 리소스 사용량

| 항목 | Docling | pdfplumber |
|------|---------|------------|
| 설치 크기 | 2-5GB (PyTorch + 모델) | ~50MB |
| 메모리 사용 | 2-8GB | <500MB |
| GPU 필요 | 권장 (없으면 10x 느림) | 불필요 |
| Python 버전 | 3.10+ (3.9 제거됨) | 3.7+ |

### 최적화 효과

| 비활성화 기능 | CPU 시간 절감 | GPU 시간 절감 |
|-------------|-------------|-------------|
| 테이블 구조 OFF | 16% | 24% |
| OCR + 테이블 OFF | ~75% | ~75% |

---

## 5. 기능 비교: pdfplumber vs Docling

| 차원 | pdfplumber | Docling |
|------|-----------|---------|
| **접근 방식** | 규칙 기반 (선 감지, 텍스트 클러스터링) | 딥러닝 (TableFormer CNN) |
| **단순 표 정확도** | 85-96% | 94%+ |
| **복잡한 표 정확도** | 60-75% (수동 튜닝 필요) | 93-98% |
| **AIMS AR/CRS 정확도** | **100%** (215/215 테스트) | 미검증 |
| **병합 셀** | 미지원 | 개선 중 (RichTableCell, row_span/col_span) |
| **테두리 없는 표** | 실패 | 비전 모델로 처리 가능 |
| **다중 페이지 표** | 미구현 | 부분 지원 |
| **스캔 PDF** | 미지원 (텍스트 레이어 전용) | 내장 OCR (EasyOCR/Tesseract) |
| **한국어** | 텍스트 PDF는 문제없음 | EasyOCR 한국어 지원 (별도 다운로드 필요) |
| **설정 유연성** | 매우 높음 (snap_tolerance, join_tolerance 등) | 제한적 (ACCURATE/FAST 모드) |
| **출력 형식** | 2D 리스트 | Markdown, HTML, DataFrame, CSV, JSON |
| **LLM 연동** | 없음 | LangChain, LlamaIndex, Haystack 통합 |
| **MCP 서버** | 없음 | 내장 지원 |

---

## 6. AIMS 코드의 pdfplumber 결합도 분석

### 강하게 결합된 부분 (교체 난이도 HIGH)

#### 1. AR 테이블 추출 (`table_extractor.py`, ~337줄)

```python
# 핵심 패턴: pdfplumber의 find_tables() + 동적 컬럼 매핑
tables = page.find_tables()
for table in tables:
    data = table.extract()  # List[List[Optional[str]]]
    column_map = build_column_map(header_row)
    contract = parse_contract_row_by_columns(row, column_map)
```

- `find_tables()`의 반환 구조에 의존
- 동적 컬럼 매핑이 pdfplumber 테이블 구조 전제

#### 2. CRS 테이블 추출 (`cr_table_extractor.py`, ~431줄)

```python
# 펀드 컬럼 매핑 + 행 타입 감지
column_map = build_fund_column_map(header_row)
row_type = identify_row_type(row)  # amount/ratio/return/principal
```

- 펀드 컬럼 매핑이 pdfplumber 셀 구조에 의존
- 행 타입 감지 로직이 복잡

#### 3. 멀티 전략 Fallback (`parser_pdfplumber.py`, ~302줄)

```python
# pdfplumber 전용 설정
table_settings_list = [
    {"vertical_strategy": "lines", "horizontal_strategy": "lines",
     "snap_tolerance": 3, "join_tolerance": 3},
    {"vertical_strategy": "text", "horizontal_strategy": "lines",
     "snap_tolerance": 5, "join_tolerance": 5, "text_tolerance": 3},
]
for settings in table_settings_list:
    tables = page.extract_tables(settings)
    if tables: break
```

- pdfplumber 전용 파라미터 (vertical_strategy, snap_tolerance 등)
- Docling에는 동등한 튜닝 메커니즘 없음

### 중간 결합도 (교체 난이도 MEDIUM)

#### 4. CRS 텍스트 파싱 (`cr_parser.py`, ~478줄)
- `page.extract_text()` + 정규식 기반
- 텍스트 추출 자체는 라이브러리 무관

#### 5. PDF 유틸리티 (`pdf_utils.py`, ~234줄)
- 단순 텍스트 추출: `pdfplumber.open()` → `page.extract_text()`

### 교체 불가능한 부분 (PyMuPDF 유지 필수)

#### 6. 썸네일 생성 (`pdf_proxy/main.py`)

```python
page = doc[0]
matrix = fitz.Matrix(scale, scale)
pix = page.get_pixmap(matrix=matrix, alpha=False)
```

- Docling은 렌더링 라이브러리가 아님 → PyMuPDF 대체 불가

#### 7. 메타데이터 수정 (`pdf_proxy/main.py`)

```python
doc.set_metadata(new_metadata)
result_bytes = doc.tobytes()
```

- PDF 바이너리 조작 → Docling 범위 밖

#### 8. 전문 텍스트 추출 (`meta_service.py`)

```python
doc = fitz.open(stream=content, filetype="pdf")
for page in doc:
    text_parts.append(page.get_text())
```

- 임베딩용 전문 추출 → PyMuPDF가 가장 빠름

---

## 7. 교체 비용 산정

| 컴포넌트 | 현재 라이브러리 | 코드량 | 교체 난이도 | 예상 공수 |
|---------|--------------|-------|-----------|----------|
| AR 테이블 추출 | pdfplumber | ~337줄 | HIGH | 1-2일 |
| CRS 테이블 추출 | pdfplumber | ~431줄 | HIGH | 1-2일 |
| AR 텍스트 파싱 | pdfplumber | ~302줄 | MEDIUM | 0.5-1일 |
| CRS 텍스트 파싱 | pdfplumber | ~478줄 | MEDIUM | 0.5-1일 |
| PDF 유틸리티 | pdfplumber | ~234줄 | LOW | 0.5일 |
| 파서 팩토리 | - | ~86줄 | LOW | 0.5일 |
| 프로덕션 PDF 테스트 | - | - | HIGH | 2-3일 |
| 에러 핸들링/Fallback | - | - | MEDIUM | 1-2일 |
| **합계** | | **~1,868줄** | | **6-10일** |

**PyMuPDF는 교체 대상이 아님** — 썸네일 생성, 메타데이터 수정, 전문 추출은 Docling 범위 밖.

---

## 8. Docling 알려진 한계/이슈

### 성능
- pdfplumber 대비 **10x 느림** (CPU 기준)
- `DocumentConverter.convert()`가 대형 문서에서 메모리 전부 소진 가능 (OOM kill)
- 32GB 노트북에서 9페이지 PDF → 3분+ (CPU 모드)
- `docling-serve`가 동시 수백 문서 처리 시 불안정

### 테이블 추출
- 중첩 테이블 (표 안의 표) 에러 발생
- 병합 셀 여전히 문제 (개선 중이나 완벽하지 않음)
- CSV/DataFrame 내보내기 시 병합 정보 손실 가능
- 일부 PDF에서 셀 정렬 오류

### 한국어
- 기본 모델 다운로드에 영어/라틴만 포함 — **한국어는 별도 다운로드 필수**
- 오프라인 환경에서 비영어 문서 **조용히 실패** (에러 없이 빈 결과)

```bash
# 한국어 모델 별도 다운로드 필요
docling-tools models download easyocr --lang ko
```

### 의존성
- 무거운 의존성 체인: PyTorch, ONNX Runtime
- NumPy 1.x 필요 (다른 패키지와 충돌 가능)
- macOS x86_64 호환성 문제
- Jupyter Notebook에서 크래시 보고

---

## 9. 전략적 판단

### AIMS AR/CRS에 한정하면 — 교체할 이유가 없다

| 항목 | 현재 (pdfplumber) | Docling으로 교체 시 |
|------|-------------------|-------------------|
| 정확도 | 100% (215/215) | 미검증 (93-98% 범용) |
| 속도 | ~0.93초/문서 | ~3-10초/문서 (CPU) |
| 서버 요구사항 | 현재 그대로 | GPU 추가 권장 |
| 메모리 | <500MB | 2-8GB |
| 리스크 | 없음 (검증됨) | 높음 (미검증) |

**pdfplumber가 100%인 이유**: MetLife AR/CRS라는 좁은 범위에서 파라미터가 완벽하게 튜닝되어 있기 때문. 범용 모델(Docling)이 이 특정 케이스에서 더 나을 보장이 없다.

### "제품화" 관점에서 보면 — 이야기가 달라진다

[DOCUMENT_PIPELINE_PRODUCT_ANALYSIS.md](DOCUMENT_PIPELINE_PRODUCT_ANALYSIS.md)에서 논의한 방향:
- 한국형 클라이언트 문서 포털
- Self-hosted Document AI
- 업종 특화 문서 처리

이 방향으로 가면 **다양한 문서 유형**을 처리해야 하는데, 문서 유형마다 pdfplumber 파라미터를 튜닝하는 것은 스케일이 안 된다.

---

## 10. 추천 전략: 교체가 아니라 계층화

### 아키텍처

```
                    ┌─────────────────────────┐
                    │    문서 유형 판별         │
                    └──────┬──────────────────┘
                           │
              ┌────────────┼────────────────┐
              ▼            ▼                ▼
     ┌────────────┐  ┌──────────┐   ┌──────────────┐
     │ 알려진 형식  │  │ 단순 표   │   │ 복잡/미지 문서 │
     │ (AR/CRS)   │  │ (테두리有)│   │ (새로운 업종) │
     │            │  │          │   │              │
     │ pdfplumber │  │pdfplumber│   │  Docling     │
     │ (기존 파서) │  │ (빠르고   │   │  (정확하지만  │
     │ 100% 정확  │  │  가벼움)  │   │   느림)      │
     └────────────┘  └──────────┘   └──────────────┘
```

### 이유

| 전략 | 근거 |
|------|------|
| AR/CRS → pdfplumber 유지 | 검증된 100% 정확도, 빠름, 변경 불필요 |
| 새 업종 문서 → Docling | 파라미터 튜닝 없이 범용으로 처리 가능 |
| 단순 표 → pdfplumber | 0.1초면 끝나는 걸 3초 걸리게 할 이유 없음 |
| 복잡한 표 → Docling fallback | 병합 셀, 테두리 없는 표 등 pdfplumber 한계 보완 |
| 썸네일/메타데이터 → PyMuPDF 유지 | Docling은 렌더링 라이브러리가 아님 |

### 구현 방법 (기존 플러그인 패턴 활용)

`parser_factory.py`에 이미 플러그인 패턴이 존재:

```python
# parser_factory.py 현재 구조
def get_parser(parser_type):
    if parser_type == "pdfplumber":
        from services.parser_pdfplumber import parse_annual_report
    elif parser_type == "pdfplumber_table":
        from services.parser_pdfplumber_table import parse_annual_report
    # ↓ 여기에 추가만 하면 됨
    # elif parser_type == "docling":
    #     from services.parser_docling import parse_annual_report
```

### 단계별 도입 로드맵

```
Phase 1: PoC (1-2일)
  ├─ Docling 설치 + MetLife AR/CRS 샘플 테스트
  ├─ pdfplumber 결과와 비교
  └─ 성능 측정 (정확도, 속도, 메모리)

Phase 2: 플러그인 추가 (2-3일)
  ├─ parser_docling.py 작성
  ├─ parser_factory.py에 등록
  └─ 기존 pdfplumber 파서와 공존

Phase 3: 새 문서 유형 적용 (필요 시)
  ├─ 새 업종 문서 → Docling 우선
  ├─ pdfplumber 실패 시 → Docling fallback
  └─ 점진적 확대
```

---

## 11. 서버 인프라 고려사항

### 현재 AIMS 서버 (tars)

현재 서버에 GPU가 없다면 Docling은 CPU 모드로 동작:
- 페이지당 ~3초 (vs pdfplumber ~0.1초)
- 메모리 2-8GB 추가 필요

### GPU 추가 시

| 옵션 | 비용 | Docling 성능 |
|------|------|-------------|
| NVIDIA L4 (AWS g6.xlarge) | ~$0.53/hr | 481ms/page |
| NVIDIA T4 (AWS g4dn.xlarge) | ~$0.35/hr | ~700ms/page |
| 로컬 GPU (RTX 3060 등) | 일회성 ~$300 | ~500ms/page |

**Self-hosted 제품화 시**: Docker 이미지에 Docling 포함 → 고객이 GPU 있으면 빠르고, 없으면 느리지만 동작.

---

## 12. Docling Python API 요약

### 기본 사용법

```python
from docling.document_converter import DocumentConverter

converter = DocumentConverter()
result = converter.convert("financial_report.pdf")

# 테이블 순회
for table in result.document.tables:
    print(table.export_to_markdown())
    df = table.export_to_dataframe()
    csv_text = table.export_to_csv()
```

### 고급 설정 (한국어 + 고정확도)

```python
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    TableFormerMode,
    EasyOcrOptions,
)

pipeline_options = PdfPipelineOptions(
    do_table_structure=True,
    do_ocr=True,
)
pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE
pipeline_options.table_structure_options.do_cell_matching = True

# 한국어 OCR 설정
pipeline_options.ocr_options = EasyOcrOptions(
    lang=["ko", "en"],
    force_full_page_ocr=False,
)

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
    }
)

result = converter.convert("korean_insurance_report.pdf")
```

### 오프라인 모델 다운로드

```bash
# 기본 모델
docling-tools models download

# 한국어 OCR 모델 (필수! 기본 다운로드에 미포함)
docling-tools models download easyocr --lang ko
```

---

## 13. 결론

### 한 줄 요약

> **pdfplumber는 "이미 아는 문서를 빠르게", Docling은 "처음 보는 문서를 정확하게". 둘 다 필요하다.**

### 판단 기준

| 시나리오 | 권장 |
|---------|------|
| AIMS AR/CRS 현행 유지 | pdfplumber (변경 불필요) |
| 새 보험사 형식 추가 | pdfplumber 파라미터 튜닝 우선 → 실패 시 Docling |
| 다른 업종 문서 처리 | Docling (범용 97.9%) |
| Self-hosted 제품 코어 | Docling (파라미터 튜닝 없이 다양한 문서 처리) |
| 대량 배치 처리 | pdfplumber (10x 빠름) |
| GPU 없는 서버 | pdfplumber (CPU만으로 충분) |

### 하지 말아야 할 것

- ❌ 현재 잘 동작하는 AR/CRS 파서를 Docling으로 전면 교체
- ❌ GPU 없이 Docling을 실시간 처리에 사용
- ❌ PyMuPDF를 Docling으로 대체 (썸네일, 메타데이터 → Docling 범위 밖)

### 해야 할 것

- ✅ PoC: MetLife AR/CRS 샘플로 Docling 정확도/속도 비교
- ✅ parser_factory.py에 Docling 플러그인 추가 (기존 구조 활용)
- ✅ 제품화 진행 시 Docling을 범용 파서 백엔드로 채택
- ✅ pdfplumber를 "알려진 형식 고속 파서"로 유지

---

## 대화 기록

### 2026-02-07 | Docling 도입 검토

**질문**: 현재 PDF 파싱 스택을 Docling으로 교체한다면 어떻게 생각하나?

**결론**: "교체"가 아니라 "추가"가 정답.

- AIMS AR/CRS: pdfplumber 유지 (100% 정확, 빠름, 가벼움)
- 새 업종/복잡한 문서: Docling 추가 (범용 97.9%, 파라미터 튜닝 불필요)
- 썸네일/메타데이터: PyMuPDF 유지 (Docling은 렌더링 라이브러리가 아님)
- 교체 비용: 6-10일 (전면 교체 시) — 계층화하면 2-3일로 줄어듦
- Docling은 GPU 없이도 동작하지만 10x 느림 → 서버 인프라 고려 필요
