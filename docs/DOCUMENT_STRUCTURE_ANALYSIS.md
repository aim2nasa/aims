# 문서 구조 차이 분석

## 개요

AIMS 시스템에서 처리하는 문서는 파일 타입에 따라 서로 다른 구조를 가집니다.
이 문서는 이미지 파일(JPG/PNG)과 텍스트형 PDF의 구조적 차이를 분석합니다.

---

## 문서 타입별 처리 흐름

### 1️⃣ 이미지 파일 (JPG/PNG)
```
업로드 → 메타데이터 추출 → OCR 처리 → 임베딩 생성 → 완료
```

### 2️⃣ 텍스트형 PDF
```
업로드 → 메타데이터 추출 → PDF 텍스트 추출 → 임베딩 생성 → 완료
```

---

## 실제 문서 구조 비교

### 이미지 파일 예시 (캐치업자동차견적.jpg)

```json
{
  "_id": "ObjectId('6907185fd055d948668b5c49')",
  "ownerId": "tester",
  "upload": {
    "originalName": "캐치업자동차견적.jpg",
    "saveName": "251102083750_ogsg19j3.jpg",
    "destPath": "/data/files/users/tester/2025/11/251102083750_ogsg19j3.jpg",
    "uploaded_at": "2025-11-02T17:37:50.997+09:00"
  },
  "meta": {
    "filename": "251102083750_ogsg19j3.jpg",
    "extension": ".jpg",
    "mime": "image/jpeg",
    "size_bytes": "297195",
    "meta_status": "ok",
    "full_text": null,
    "pdf_text_ratio": null,
    "summary": "null",
    "tags": null
  },
  "ocr": {
    "status": "done",
    "queued_at": "2025-11-02T17:37:52.013+09:00",
    "started_at": "2025-11-02T17:37:52.584+09:00",
    "done_at": "2025-11-02T17:37:59.283+09:00",
    "confidence": "0.9817",
    "full_text": "24. 11. 28. 오후 2:57 보험료 출력 ...",
    "summary": "2024년 12월 18일 자동차 보험 만기일...",
    "tags": [
      "자동차 보험",
      "만기일",
      "보험료 비교",
      "...더 많은 태그"
    ]
  },
  "overallStatus": "completed",
  "docembed": {
    "status": "done",
    "dims": 1536,
    "chunks": 1,
    "text_source": "ocr",
    "updated_at": "2025-11-02T08:38:05.395085+00:00"
  }
}
```

**특징:**
- ✅ `ocr` 필드 존재 (status: "done")
- ✅ OCR 신뢰도: `0.9817` (98.17%)
- ✅ `ocr.full_text` - OCR로 추출한 텍스트
- ✅ `ocr.summary` - OCR 텍스트 기반 요약
- ✅ `ocr.tags` - OCR 텍스트 기반 태그
- ❌ `meta.full_text` = null (PDF 텍스트 없음)
- ✅ `docembed.text_source`: **"ocr"** ← 임베딩은 OCR 텍스트 사용

---

### 텍스트형 PDF 예시 (등기부등본.pdf)

```json
{
  "_id": "ObjectId('6905fe33d055d948668b5c3d')",
  "ownerId": "tester",
  "upload": {
    "originalName": "(완료)등기부등본_(주)캐치업코리아_250326.pdf",
    "saveName": "251101123355_e8p4s8fg.pdf",
    "destPath": "/data/files/users/tester/2025/11/251101123355_e8p4s8fg.pdf",
    "uploaded_at": "2025-11-01T21:33:55.060+09:00"
  },
  "overallStatus": "completed",
  "meta": {
    "filename": "251101123355_e8p4s8fg.pdf",
    "extension": ".pdf",
    "mime": "application/pdf",
    "size_bytes": "75032",
    "meta_status": "ok",
    "pdf_pages": "2",
    "full_text": "이 용 등기사항증명서(현재 유효사항) 등기번호 036973...",
    "pdf_text_ratio": "{\"total_pages\":2,\"text_pages\":2,\"text_ratio\":100}",
    "summary": "주식회사 캐치업코리아는 경기도 고양시 일산동구에 본점을 둔 기업으로...",
    "tags": [
      "주식회사 캐치업코리아",
      "경기도 고양시",
      "본점 이전",
      "...더 많은 태그"
    ]
  },
  "docembed": {
    "status": "done",
    "dims": 1536,
    "chunks": 2,
    "text_source": "meta",
    "updated_at": "2025-11-01T12:35:48.358917+00:00"
  }
}
```

**특징:**
- ❌ `ocr` 필드 **완전히 없음**
- ✅ `meta.full_text` - PDF에서 직접 추출한 텍스트
- ✅ `meta.pdf_text_ratio` - 텍스트 추출 비율 (100%)
- ✅ `meta.summary` - PDF 텍스트 기반 요약
- ✅ `meta.tags` - PDF 텍스트 기반 태그
- ✅ `docembed.text_source`: **"meta"** ← 임베딩은 PDF 텍스트 사용

---

## 핵심 차이점 요약

| 항목 | 이미지 (JPG/PNG) | PDF (텍스트형) |
|------|-----------------|---------------|
| **OCR 필드** | ✅ 존재 | ❌ 없음 |
| **텍스트 출처** | `ocr.full_text` | `meta.full_text` |
| **요약 위치** | `ocr.summary` | `meta.summary` |
| **태그 위치** | `ocr.tags` | `meta.tags` |
| **임베딩 소스** | `text_source: "ocr"` | `text_source: "meta"` |
| **신뢰도** | `ocr.confidence` 있음 | ❌ 없음 |
| **PDF 텍스트 비율** | ❌ null | `meta.pdf_text_ratio` 있음 |

---

## 개발 시 주의사항

### 1. OCR 필드는 선택적

이미지 파일(JPG/PNG)만 OCR 처리되므로 `ocr` 필드는 모든 문서에 존재하지 않습니다.

```typescript
// ❌ 잘못된 코드 - ocr이 없을 수 있음
const confidence = doc.ocr.confidence;

// ✅ 올바른 코드 - 옵셔널 체이닝 사용
const confidence = doc.ocr?.confidence;
```

### 2. 요약/태그 접근 시 주의

요약과 태그는 `ocr` 또는 `meta` 둘 중 하나에만 존재합니다.

```typescript
// ✅ 올바른 접근 방법
const summary = doc.ocr?.summary || doc.meta?.summary;
const tags = doc.ocr?.tags || doc.meta?.tags;
```

### 3. 임베딩 소스 확인

`docembed.text_source`로 어디서 텍스트를 가져왔는지 확인할 수 있습니다.

```typescript
// 임베딩 소스 확인
const textSource = doc.docembed?.text_source;
// "ocr" = 이미지 OCR
// "meta" = PDF 직접 추출
```

### 4. 신뢰도 정보

OCR 처리된 문서만 신뢰도 정보를 가집니다.

```typescript
// OCR 신뢰도 확인 (0~1 사이의 값)
const confidence = doc.ocr?.confidence;
if (confidence && parseFloat(confidence) < 0.7) {
  console.warn('낮은 OCR 신뢰도:', confidence);
}
```

---

## 문서 타입 판별 방법

```typescript
function getDocumentType(doc: DocumentStatus): 'image-ocr' | 'pdf-text' | 'unknown' {
  // OCR 필드가 있고 완료된 경우
  if (doc.ocr?.status === 'done') {
    return 'image-ocr';
  }

  // PDF 텍스트가 있는 경우
  if (doc.meta?.full_text && doc.meta?.pdf_text_ratio) {
    return 'pdf-text';
  }

  return 'unknown';
}
```

---

## 관련 문서

- [OCR 신뢰도 색상 규정](./OCR_CONFIDENCE_COLOR_SPEC.md)
- [문서 뱃지 시스템 명세](./DOCUMENT_BADGES_SPEC.md)

---

**작성일**: 2025-11-03
**버전**: 1.0
