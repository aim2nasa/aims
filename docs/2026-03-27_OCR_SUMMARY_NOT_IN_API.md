# 이슈 보고서: explorer-tree API에 ocr.summary 미포함

> 작성일: 2026-03-27 03:20 KST
> 상태: **미해결 — 일괄 수정 대기**
> 심각도: MEDIUM

---

## 현상

이미지 PPT/PPTX 등 OCR 경로로 처리된 파일의 요약 버튼이 비활성화됨.
DB에 `ocr.summary`가 있는데 UI에서 접근 불가.

**예시**: 안영미신분증.ppt
- DB: `ocr.full_text: 198자`, `ocr.summary: 50자` ✅
- UI: 녹색 PDF 배지 ✅, 요약 버튼 비활성 ❌, 전체텍스트 버튼 비활성 ❌

---

## 근본 원인

`documents-routes.js` L951-955의 explorer-tree API 응답에서 `ocr` 객체에 `summary`를 포함하지 않음.

```javascript
// 현재 (L951-955)
ocr: doc.ocr ? {
  status: doc.ocr.status,
  confidence: doc.ocr.confidence,
  done_at: doc.ocr.done_at,
  // ← summary 없음!
} : null,
```

반면 `meta` 객체에는 `summary`가 포함됨 (L948):
```javascript
meta: doc.meta ? {
  mime: doc.meta.mime,
  size_bytes: doc.meta.size_bytes,
  pdf_pages: doc.meta.pdf_pages,
  meta_status: doc.meta.meta_status,
  summary: doc.meta.summary,  // ← 있음
  created_at: doc.meta.created_at,
} : null,
```

---

## 영향 범위

OCR 경로로 처리된 모든 문서:
- 이미지 PPT/PPTX (텍스트 없는 프레젠테이션)
- 이미지 PDF (스캔 문서)
- JPG/PNG 이미지 파일

이 파일들은:
- `meta.summary` = 없음 (meta 경로로 텍스트 추출 안 됨)
- `ocr.summary` = 있음 (OCR 후 AI 요약 생성됨)
- → 프론트엔드에서 요약 접근 불가 → 요약 버튼 항상 비활성

---

## 해결 방향

### 수정 1: API 응답에 `ocr.summary` 추가
`documents-routes.js` L951-955:
```javascript
ocr: doc.ocr ? {
  status: doc.ocr.status,
  confidence: doc.ocr.confidence,
  done_at: doc.ocr.done_at,
  summary: doc.ocr.summary,  // ← 추가
} : null,
```

### 수정 2: 같은 파일의 다른 엔드포인트도 확인
explorer-tree 외에 다른 API 엔드포인트에서도 `ocr.summary`가 누락될 수 있음.
전수 확인 필요.

---

## 관련 파일

| 파일 | 위치 | 설명 |
|------|------|------|
| `documents-routes.js` L951-955 | 백엔드 | explorer-tree API ocr 응답 매핑 |
| `DocumentExplorerTree.tsx` L375-382 | 프론트엔드 | 요약 버튼 disabled 조건 (`doc.ocr.summary`) |

---

## 참고

- 프론트엔드 요약 버튼 disabled 조건은 이미 `ocr.summary`를 확인하도록 구현됨:
  ```typescript
  disabled={!(typeof doc.meta === 'object' && doc.meta?.summary)
         && !(typeof doc.ocr === 'object' && (doc.ocr as any)?.summary)}
  ```
- API만 수정하면 프론트엔드 수정 불필요
