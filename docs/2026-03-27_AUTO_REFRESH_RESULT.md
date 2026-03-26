# 문서 처리 완료 후 UI 자동 갱신 — 결과 보고서

> 작성일: 2026-03-27 04:30 KST
> 작업 기간: 2026-03-26 22:00 ~ 2026-03-27 04:30 (약 6.5시간)
> 상태: **전체 완료**

---

## 요약

문서 업로드 후 HWP/PPT 등 변환 대상 파일의 처리 결과가 **새로고침 없이** UI에 자동 반영되지 않는 문제를 해결했다. 근본 원인은 변환 대상 파일이 `overallStatus: "completed"`로 조기 마킹되어 폴링이 중단되는 것이었으며, `conversion_pending` 상태 분기를 도입하여 폴링이 변환 완료까지 유지되도록 수정했다.

---

## 해결한 이슈 (3건)

### 이슈 1: 조기 completed (근본 원인)

| 항목 | 내용 |
|------|------|
| 현상 | HWP 파일이 변환 완료 전에 `completed`로 마킹 → 폴링 중단 → BIN 배지 고착 |
| 근본 원인 | `text_extraction_failed` 시 변환 대상 파일도 `completed` 처리 |
| 수정 | `_is_convertible_mime` 체크 → True면 `conversion_pending`으로 분기 |
| 수정 파일 | `doc_prep_main.py` L1867 (일반 경로) + L2209 (xPipe 경로) |
| 커밋 | `1cdfad79` (일반), `907133bc` (xPipe) |
| 검증 | HWP 3건이 BIN→TXT(인사/노무)로 F5 없이 자동 전환 |

### 이슈 2: ocr.summary API 미포함

| 항목 | 내용 |
|------|------|
| 현상 | 안영미신분증.ppt — DB에 ocr.summary 있지만 API 응답에 미포함 → 요약 버튼 비활성 |
| 수정 | `documents-routes.js` L954에 `summary: doc.ocr.summary` 추가 |
| 커밋 | `1cdfad79` |
| 검증 | 안영미신분증.ppt → OCR 배지 + 신분증 + 완료 |

### 이슈 3: 이미지 OCR 배지

| 항목 | 내용 |
|------|------|
| 현상 | 암검진067.jpg — 이미지인데 BIN 배지 |
| 수정 | badgeType 계산 4곳에 `image/*` MIME → OCR 배지 분기 추가 |
| 커밋 | `1cdfad79` |
| 검증 | 암검진067.jpg → OCR 배지 표시 |

---

## 커밋 이력 (전체 7건, 최신순)

| 커밋 | 내용 |
|------|------|
| `907133bc` | xPipe 경로 조기completed 방지 — conversion_pending 분기 추가 |
| `1cdfad79` | 3건 이슈 일괄 수정 — 조기completed + ocr.summary + 이미지OCR배지 |
| `eee35d55` | 폴링 3초 + 조건 단순화 + 처리 완료 시 마지막 fetch |
| `9db78889` | .gitignore에 _tmp_upload/ 추가 |
| `5a43bba4` | 요약/전체텍스트 버튼 6곳 disabled + xPipe summary 누락 수정 |
| `cc74421d` | 요약/전체텍스트 버튼 — meta + ocr 양쪽 확인 |
| `b583e1fe` | F5 로그아웃 — PIN 세션 TTL 7일 |

---

## 테스트 결과

### 테스트 환경
- 고객: 캐치업코리아 (`698f3ed781123c52a305ab1d`)
- 파일: 36건 (PDF 16, HWP 4, XLSX 2, XLS 1, PPTX 2, PPT 1, JPG 2, ZIP 5, AI 1, PDF+기타 2)
- 방법: 문서 일괄등록 → 전체 문서 보기에서 새로고침 없이 관찰

### 타임라인

| 시점 | 진행률 | 관찰 |
|------|--------|------|
| 업로드 직후 | 0/36 | 전체 10%, BIN 배지 |
| +30초 | 15/36 (42%) | PDF들 TXT 배지 전환 시작 |
| +1분 | 22/36 (61%) | 대부분 PDF 완료, HWP 60% |
| +2분 | 30/36 (83%) | PPT/PPTX → OCR/TXT 완료, 안영미신분증 완료 |
| +4분 | 32/36 (89%) | 정관.hwp TXT 완료, 취업규칙.hwp TXT 완료 |
| +7분 | 34/36 (94%) | 표준취업규칙 2건 100% (변환 워커 텍스트 추출 중) |

### 핵심 검증 결과

| 검증 항목 | 결과 |
|-----------|------|
| HWP: BIN→TXT 자동 전환 (F5 불필요) | ✅ 3건 모두 TXT+인사/노무로 자동 전환 |
| PPT: OCR 배지 + 신분증 분류 | ✅ 안영미신분증.ppt 정상 |
| JPG: OCR 배지 | ✅ 암검진067.jpg OCR 배지 표시 |
| 폴링 유지 | ✅ conversion_pending 상태에서 폴링 계속 |
| 요약 버튼 활성 | ✅ ocr.summary 있는 파일 요약 버튼 활성 |

---

## 스크린샷 증거

| 파일 | 내용 |
|------|------|
| `D:/tmp/processing_1.png` | 22/36 완료 (61%), HWP 60% 진행 중 |
| `D:/tmp/processing_2.png` | 30/36 완료 (83%), PPT/PPTX 완료 |
| `D:/tmp/processing_3.png` | 32/36 완료 (89%), 취업규칙.hwp TXT 전환 |
| `D:/tmp/processing_4.png` | 34/36 완료 (94%), 표준취업규칙 100% |
| `D:/tmp/processing_5.png` | 34/36, 표준취업규칙 TXT+인사/노무 전환 확인 |
| `D:/tmp/issue2_3_check.png` | 안영미신분증 OCR+신분증, 암검진 OCR 배지 |

---

## 기술 부채 (별도 작업)

Gini 검수에서 발견된 3건. 이번 수정 범위 밖이며 별도 리팩토링으로 진행.

| # | 심각도 | 이슈 |
|---|--------|------|
| TD-1 | Major | `_is_convertible_mime` / `is_convertible_mime` 이중 정의 통합 |
| TD-2 | Minor | `import shutil` 함수 내 중복 선언 |
| TD-3 | Minor | 일반 경로 / xPipe 경로 필드 설정 불일치 |

상세: [2026-03-27_REMAINING_ISSUES.md](2026-03-27_REMAINING_ISSUES.md)

---

## 관련 문서

- [작업 계획](2026-03-27_AUTO_REFRESH_PLAN.md)
- [조기 completed 분석](2026-03-26_PREMATURE_COMPLETED_BUG.md)
- [테스트 절차서](2026-03-26_STUCK_DOCUMENTS_TEST_PROCEDURE.md)
- [남은 이슈 + 기술 부채](2026-03-27_REMAINING_ISSUES.md)
- [F5 로그아웃 버그](2026-03-27_F5_LOGOUT_BUG.md)
- [버튼 센서](2026-03-27_BUTTON_SENSOR_SIMPLE.md)
- [ocr.summary API](2026-03-27_OCR_SUMMARY_NOT_IN_API.md)
