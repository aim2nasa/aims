# ZIP 파일 처리 버그 분석 보고서

**작성일**: 2025-11-14
**대상**: ZIP/RAR 등 비지원 파일 60% 멈춤 + TXT 뱃지 오표시

---

## 문제 개요

ZIP, RAR 등 OCR/TXT 처리가 불가능한 파일들이:
1. **TXT 뱃지 오표시**: ZIP 파일에 "TXT" 뱃지 표시
2. **60% 진행률 고착**: meta 완료 후 60%에서 영구 정지
3. **가짜 stages 생성**: MongoDB에 없는 `ocr_prep`, `ocr`, `docembed` stages가 UI에 표시

---

## 🔴 문제 1: TXT 뱃지 오표시

### 위치
`frontend/aims-uix3/src/entities/document/model.ts:379-388`

### 문제 코드
```typescript
// 5. stages.meta가 있고 full_text가 있는 경우 → TXT 기반
if (document.stages && typeof document.stages === 'object') {
  const metaStage = document.stages.meta;
  if (metaStage && typeof metaStage === 'object' && metaStage.status === 'completed') {
    const ocrStage = document.stages.ocr;
    if (!ocrStage || (typeof ocrStage === 'object' && ocrStage.status !== 'completed')) {
      return 'txt';  // ❌ full_text 체크 없이 무조건 TXT 반환
    }
  }
}
```

### 원인
- **잘못된 가정**: "meta 완료 + OCR 없음 = TXT 문서"
- **누락된 조건**: `metaStage.full_text` 존재 여부를 확인하지 않음
- **실제**: ZIP 파일도 meta만 완료되고 OCR 없음 → TXT로 오분류

### 영향
ZIP, RAR, 오디오, 비디오 등 모든 비지원 MIME 타입에 TXT 뱃지 표시

---

## 🔴 문제 2: 60% 진행률 고착

### 위치
`backend/api/aims_api/lib/documentStatusHelper.js:94-101`

### 문제 코드
```javascript
// OCR 준비 (가상 단계)
if (!hasMetaText && doc.meta && doc.meta.meta_status === 'ok') {
  uiStages.ocr_prep.status = 'completed';
  uiStages.ocr_prep.message = 'OCR 준비 완료';
  uiStages.ocr_prep.timestamp = normalizeTimestamp(doc.meta.created_at);
  currentStage = 3;
  progress = 60;  // ❌ MIME 타입 확인 없이 무조건 60%
}
```

### 원인
- **MIME 타입 체크 부재**: 전체 함수(206줄)에서 `doc.meta.mime` 확인 로직 없음
- **단순 조건**: `full_text` 없으면 무조건 OCR 경로로 진입
- **무조건 60%**: meta 완료만으로 60% 설정

### 대조: Python API (정상 동작)
```python
# backend/api/doc_status_api/main.py:220-235
unsupported_mimes = [
    'text/plain', 'text/csv', 'text/markdown',
    'application/json', 'application/xml',
    'audio/', 'video/', 'application/zip',  # ← ZIP 체크!
    'application/x-rar-compressed'
]

is_unsupported = any(mime_type.startswith(unsupported) for unsupported in unsupported_mimes)

if is_unsupported:
    return 'completed', 100  # ✅ 올바름
```

**Node.js API는 이 로직이 없음**

### 영향
ZIP, 오디오, 비디오 등 OCR 불가 파일이 60%에서 영구 정지

---

## 🔴 문제 3: 가짜 Stages 생성

### 위치
`backend/api/aims_api/lib/documentStatusHelper.js:40-50`

### 문제 코드
```javascript
const uiStages = hasMetaText ? {
  // TXT 경로: 3개 stages
  upload: { name: '업로드', status: 'pending', ... },
  meta: { name: '메타데이터', status: 'pending', ... },
  docembed: { name: '임베딩', status: 'pending', ... }
} : {
  // OCR 경로: 5개 stages
  upload: { name: '업로드', status: 'pending', ... },
  meta: { name: '메타데이터', status: 'pending', ... },
  ocr_prep: { name: 'OCR 준비', status: 'pending', ... },  // ← MongoDB에 없어도 생성
  ocr: { name: 'OCR 처리', status: 'pending', ... },       // ← MongoDB에 없어도 생성
  docembed: { name: '임베딩', status: 'pending', ... }     // ← MongoDB에 없어도 생성
};
```

### 원인
- **클라이언트 사이드 생성**: MongoDB 실제 데이터와 무관하게 UI용 stages 생성
- **hasMetaText 조건**: `full_text` 없으면 무조건 5단계 OCR 경로 stages 생성

### 사용자가 본 상세보기 데이터
```json
{
  "stages": {
    "ocr_prep": { "status": "completed" },  // ← 가짜 (MongoDB에 없음)
    "ocr": { "status": "pending" },         // ← 가짜 (MongoDB에 없음)
    "docembed": { "status": "pending" }     // ← 가짜 (MongoDB에 없음)
  }
}
```

**실제 MongoDB**:
```json
{
  "upload": { ... },
  "meta": { ... }
  // ocr_prep, ocr, docembed 필드 없음
}
```

### 영향
프론트엔드가 존재하지 않는 stages를 표시하여 사용자 혼란 유발

---

## 🔴 문제 4: API 간 불일치

### Python API vs Node.js API

| API | MIME 타입 체크 | ZIP 결과 |
|-----|---------------|---------|
| **Python API** (포트 8000) | ✅ 있음 | `completed`, 100% |
| **Node.js API** (포트 3010) | ❌ 없음 | `processing`, 60% |

### Node.js API 엔드포인트별 차이

**1. `/api/documents` (419-430줄)**:
```javascript
let status = 'processing';
let progress = 50;

if (doc.ocr && doc.ocr.status === 'done') {
  status = 'completed';
  progress = 100;
} else if (doc.meta && doc.meta.meta_status === 'ok') {
  status = 'processing';
  progress = 60;
}
```
→ 단순 로직, stages 생성 안 함

**2. `/api/documents/status` (672줄)**:
```javascript
const statusInfo = analyzeDocumentStatus(doc);
```
→ `prepareDocumentResponse()` 호출, stages 생성됨

**3. `/api/documents/:id/status` (738줄)**:
```javascript
const response = prepareDocumentResponse(document);
```
→ stages 생성 + raw/computed 구조 반환

**문제**: 같은 서버에서도 엔드포인트마다 다른 로직 사용

---

## 🎯 근본 원인

1. **MIME 타입 체크 누락**
   - Python API는 `unsupported_mimes` 리스트로 체크
   - Node.js API는 MIME 타입을 전혀 확인하지 않음

2. **잘못된 처리 경로 판단**
   - `full_text` 유무만으로 TXT/OCR 경로 결정
   - ZIP 같은 비지원 파일은 고려하지 않음

3. **클라이언트 사이드 데이터 생성**
   - MongoDB 실제 데이터 대신 UI용 가짜 stages 생성
   - 데이터 투명성 부족

---

## 📊 데이터 흐름

```
MongoDB (실제 데이터)
  - upload: { ... }
  - meta: { mime: "application/zip", meta_status: "ok" }
  - ocr: 없음
  - docembed: 없음

        ↓

Python API (포트 8000)
  - MIME 체크: application/zip → unsupported
  - 결과: completed, 100% ✅

        ↓

Node.js API (포트 3010)
  - MIME 체크 없음
  - full_text 없음 → OCR 경로 진입
  - meta 완료 → 60% 설정
  - stages 임의 생성: { ocr_prep, ocr, docembed }
  - 결과: processing, 60% ❌

        ↓

프론트엔드
  - TXT 뱃지 표시 (model.ts 로직)
  - 60% 진행률 표시
  - 가짜 stages 표시
```

---

## 💡 수정 방향 (참고용)

### 1. TXT 뱃지 문제
`model.ts:379-388` → `full_text` 존재 여부 확인 추가

### 2. 60% 진행률 문제
`documentStatusHelper.js:94-101` → Python API의 `unsupported_mimes` 로직 이식

### 3. Stages 생성 문제
`documentStatusHelper.js:40-50` → MIME 타입에 따라 stages 구조 결정

### 4. API 통합
Node.js API에서 Python API 로직 재사용 또는 통합

---

## 📁 관련 파일

- `frontend/aims-uix3/src/entities/document/model.ts` (TXT 뱃지)
- `backend/api/aims_api/lib/documentStatusHelper.js` (60% 진행률, stages 생성)
- `backend/api/aims_api/server.js` (API 엔드포인트)
- `backend/api/doc_status_api/main.py` (Python API - 정상 동작)
