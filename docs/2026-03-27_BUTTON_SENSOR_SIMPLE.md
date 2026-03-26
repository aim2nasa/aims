# 요약/전체보기 버튼 비활성화 — 최종 보고서

> 작성일: 2026-03-27 02:00 KST
> 최종 업데이트: 2026-03-27 02:30 KST
> 상태: **PASS — 정상 작동 확인**

---

## 목표

요약보기/전체보기 버튼이 **텍스트가 채워질 때만 활성화**되고, 아이콘만 보고도 "이 문서에 텍스트가 있다/없다"를 인식할 수 있게 한다.

| 상태 | 버튼 | 시각적 표시 |
|------|------|-----------|
| 텍스트 없음 | disabled (클릭 불가) | 흐리게 (opacity 0.25) |
| 텍스트 있음 | 활성 (클릭 가능) | 정상 표시 |

---

## 구현 원칙 (센서)

- 요약 버튼: `meta.summary` 또는 `ocr.summary` 유무로만 활성/비활성
- 전체텍스트 버튼: `_hasMetaText` 또는 `_hasOcrText` 유무로만 활성/비활성
- **다른 로직(badgeType, overallStatus 등)과 결합 절대 금지**

---

## 발견된 문제 + 해결 과정

### 문제 1: 초기 구현에서 2곳만 적용

"전체 텍스트 보기" 버튼이 **6곳**에서 렌더링되는데, `DocumentExplorerTree.tsx`의 2곳만 disabled 처리.

| # | 파일 | 초기 | 최종 |
|---|------|------|------|
| 1 | `DocumentExplorerTree.tsx` L392 | ✅ | ✅ |
| 2 | `DocumentExplorerTree.tsx` L1540 | ✅ | ✅ |
| 3 | `PersonalFilesView.tsx` L2347 | ❌ | ✅ |
| 4 | `DocumentSearchView.tsx` L1871 | ❌ | ✅ |
| 5 | `DocumentStatusList.tsx` L630 | ❌ | ✅ |
| 6 | `DocumentStatusTable.tsx` L236 | ❌ | ✅ |

### 문제 2: `doc.summary` vs `doc.meta.summary`

API 응답에서 summary는 `meta.summary`에 있는데 `doc.summary`(최상위)로 접근 → 항상 undefined.
수정: `doc.meta?.summary || doc.ocr?.summary`

### 문제 3: 초성 미선택 시 다른 컴포넌트 버튼 확인

초성 미선택 상태에서는 기존 문서(텍스트 있음)의 버튼이 표시 → "disabled 안 됨"으로 오판.
실제로는 초성 선택 후 캐치업코리아 문서의 버튼을 확인해야 함.

---

## 최종 테스트 결과

**v0.555.7 (f6a2ab40), 36건 업로드, ㅋ 초성 선택**

| 구분 | 수량 | 상태 |
|------|------|------|
| disabled (텍스트 없음) | **12건** | ZIP, AI, JPG, HWP(변환 전) — 클릭 불가, opacity 0.25 |
| enabled (텍스트 있음) | **24건** | PDF, HWP(변환 완료), XLSX, PPTX — 클릭 가능, 정상 표시 |

**샘플 검증:**

| 파일 | 배지 | disabled | 정상 |
|------|------|----------|------|
| 캐치업포멧.ai | BIN | true | ✅ 텍스트 없음 |
| 캐치업코리아노무규정.zip | BIN | true | ✅ 텍스트 없음 |
| 암검진067.jpg | BIN | true | ✅ 텍스트 없음 |
| 표준취업규칙(최종).hwp | BIN | true | ✅ 변환 전, 텍스트 없음 |
| 캐치업코리아 취업규칙(최종).hwp | TXT | false | ✅ 변환 완료, 텍스트 있음 |
| Hicar 청약서 | TXT | false | ✅ 텍스트 있음 |

---

## 관련 커밋

| 커밋 | 내용 |
|------|------|
| `b6e91e88` | 요약/전체텍스트 버튼 disabled — DocumentExplorerTree 2곳 |
| `cc74421d` | 요약 버튼 meta.summary + ocr.summary 양쪽 확인 |
| `f6a2ab40` | 나머지 4곳 적용 (PersonalFiles, SearchView, StatusList, StatusTable) |
