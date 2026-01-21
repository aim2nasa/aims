# PDF 손글씨 메모 추출 가이드

## 질문

> AR PDF 문서를 iPad에서 열어서 Apple Pencil로 메모를 남겼을 때, 원본 텍스트 기반 문서에서 사용자가 남긴 손글씨만 따로 추출이 가능한가?

## 답변

네, 기술적으로 가능합니다.

---

## PDF 주석 구조

iPad에서 Apple Pencil로 메모를 남기면 PDF의 **Annotation Layer**에 저장됩니다:

```
PDF 구조
├── Content Stream (원본 텍스트/이미지)
└── Annotations (사용자 추가 메모)
    ├── /Subtype /Ink (손글씨)
    ├── /Subtype /Highlight (형광펜)
    └── /Subtype /Text (텍스트 메모)
```

---

## 추출 방법

### 1. Annotation만 분리 추출

```python
import fitz  # PyMuPDF

doc = fitz.open("annotated_ar.pdf")
for page in doc:
    annotations = page.annots()
    for annot in annotations:
        if annot.type[0] == 15:  # Ink annotation
            # 손글씨 좌표 데이터 추출
            ink_list = annot.vertices
```

### 2. 손글씨 영역만 이미지로 렌더링

```python
# annotation 영역만 crop해서 이미지로 추출
rect = annot.rect
pix = page.get_pixmap(clip=rect)
pix.save("handwriting.png")
```

### 3. 손글씨 → 텍스트 변환 (OCR)

추출된 손글씨 이미지를 텍스트로 변환하려면 OCR 서비스 사용:

- **Apple Vision Framework** (iOS/macOS 네이티브)
- **Google Cloud Vision API**
- **Azure Computer Vision**
- **Tesseract OCR** (오픈소스, 손글씨 인식률 낮음)

---

## 주의사항

| 상황 | 추출 가능 여부 |
|------|---------------|
| 표준 PDF annotation | ✅ 쉽게 분리 가능 |
| Apple Notes에서 PDF 열기 | ⚠️ 별도 저장 방식일 수 있음 |
| "평탄화(Flatten)" 된 PDF | ❌ 원본과 병합되어 분리 불가 |

**핵심**: PDF를 저장할 때 "평탄화(Flatten)"하지 않으면 annotation layer가 분리되어 있어서 추출 가능합니다.

---

## iPad 앱별 Annotation 저장 방식

| 앱 | Annotation Layer 분리 | 비고 |
|----|----------------------|------|
| **Apple 마크업** (Files/Preview) | ✅ 표준 준수 | 가장 안정적 |
| **PDF Expert** | ✅ 표준 준수 | 전문 PDF 편집 앱 |
| **Notability** (PDF 모드) | ✅ 표준 준수 | PDF 직접 편집 시 |
| **GoodNotes** | ⚠️ 내보내기 옵션 의존 | 아래 참조 |
| **Apple Notes** | ⚠️ 별도 저장 방식 | 표준 아닐 수 있음 |

### GoodNotes 주의사항

GoodNotes는 자체 포맷(`.goodnotes`)을 사용하며, PDF 내보내기 시 옵션에 따라 결과가 다릅니다:

| 내보내기 옵션 | 결과 |
|--------------|------|
| **Editable (편집 가능)** | ✅ Annotation Layer 분리 저장 → 추출 가능 |
| **Flattened (평탄화)** | ❌ Content Stream에 병합 → 추출 불가 |

**GoodNotes PDF 내보내기 방법:**
1. 공유 → PDF로 내보내기
2. **"Flattened" 옵션 해제** (또는 "Editable" 선택)
3. 저장

**Annotation 분리 여부 확인 코드:**
```python
import fitz

doc = fitz.open("goodnotes_exported.pdf")
for page in doc:
    annots = list(page.annots() or [])
    print(f"Page {page.number}: {len(annots)} annotations")
    for a in annots:
        print(f"  - Type: {a.type}")  # (15, 'Ink')면 손글씨
```

---

## PDF Annotation 타입 코드

| 코드 | 타입 | 설명 |
|------|------|------|
| 0 | Text | 텍스트 메모 |
| 1 | Link | 링크 |
| 4 | Square | 사각형 |
| 5 | Circle | 원 |
| 8 | Highlight | 형광펜 |
| 9 | Underline | 밑줄 |
| 10 | Squiggly | 물결 밑줄 |
| 11 | StrikeOut | 취소선 |
| 15 | Ink | 손글씨/자유 그리기 |
| 19 | FreeText | 자유 텍스트 |

---

## 관련 라이브러리

### Python
- **PyMuPDF (fitz)**: PDF 파싱 및 annotation 추출
- **pdf-annotate**: annotation 추가/수정
- **pdfplumber**: 텍스트 추출 특화

### JavaScript
- **pdf-lib**: PDF 생성/수정
- **pdf.js**: PDF 렌더링 및 annotation 접근

---

## 참고

- [PyMuPDF Documentation](https://pymupdf.readthedocs.io/)
- [PDF Reference - Annotation Types](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf)
