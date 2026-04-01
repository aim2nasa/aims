# 고객별 문서함 검색 결과 메타데이터 누락 버그

**날짜**: 2026-04-01
**심각도**: Major
**상태**: 수정 중

## 증상

전체 문서 보기(documents-library)와 고객별 문서함(documents-explorer)에서 동일 문서 검색 시 표시가 다름:

| 항목 | 전체 문서 보기 (정상) | 고객별 문서함 (버그) |
|------|---------------------|---------------------|
| 배지 | OCR, TXT | BIN |
| 날짜 | 업로드 날짜 표시 | 날짜 없음 |
| 상태 | 완료 | 대기 |
| 요약/전체텍스트 버튼 | 활성화 | 비활성화 |

## 원인

`/api/documents/status/explorer-tree` 엔드포인트의 검색 aggregation pipeline에서 `$group → $push` 시 필드가 9개만 반환됨. `/documents/status` 엔드포인트는 68개 필드를 반환.

**파일**: `backend/api/aims_api/routes/documents-routes.js` (lines 1007-1025)

### 누락 필드

| 필드 | 용도 | 결과 |
|------|------|------|
| `badgeType` | 배지 표시 (OCR/TXT/BIN) | `$badgeType`로 참조하나 DB에 없는 필드 → undefined → BIN 폴백 |
| `overallStatus` | 상태 표시 (완료/대기/에러) | 누락 → 상태 판단 불가 → 대기로 표시 |
| `_hasMetaText` | 요약/전체텍스트 버튼 활성화 | TEXT_FLAG_STAGES 미적용 → false → 비활성화 |
| `_hasOcrText` | 요약/전체텍스트 버튼 활성화 | TEXT_FLAG_STAGES 미적용 → false → 비활성화 |
| `upload` 전체 객체 | 날짜, 변환 상태 등 | 일부만 추출 → 날짜 등 누락 |
| `ocr.*`, `meta.*` | 상태 판단 보조 | 누락 |

### 두 코드 경로 비교

```
[정상] /documents/status
  → TEXT_FLAG_STAGES 적용 ✅
  → analyzeDocumentStatus() 호출 ✅
  → badgeType 계산 로직 포함 ✅
  → 68개 필드 반환

[버그] /documents/status/explorer-tree (검색 시)
  → TEXT_FLAG_STAGES 미적용 ❌
  → overallStatus 미포함 ❌
  → badgeType를 DB 필드로 직접 참조 (존재하지 않음) ❌
  → 9개 필드만 반환
```

## 수정 방향

explorer-tree 검색 aggregation의 `$push`에 누락 필드 추가:
1. `overallStatus` 포함
2. `badgeType` 계산 로직 추가 (또는 프론트엔드에서 계산)
3. TEXT_FLAG_STAGES 적용하여 `_hasMetaText`, `_hasOcrText` 포함
4. `upload`, `meta`, `ocr` 객체 필요 필드 포함
