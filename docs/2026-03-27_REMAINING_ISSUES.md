# 남은 이슈 목록 (2026-03-27 테스트 결과)

> 작성일: 2026-03-27 03:30 KST
> 최종 업데이트: 2026-03-27 04:30 KST
> 상태: **3건 이슈 전체 해결 ✅ | 기술 부채 3건 보류**

---

## 이슈 1: HWP 폴링 마지막 fetch 누락 ✅ 해결

**현상**: HWP 파일이 변환 완료 후에도 BIN 배지로 남아있음. F5하면 TXT로 바뀜.

**근본 원인**: 변환 대상 파일(HWP/DOC/PPT)이 텍스트 추출 실패 시 `overallStatus: "completed"`로 조기 마킹 → 폴링 중단 → UI 고착.

**수정**:
- `doc_prep_main.py` L1867 (일반 경로): `_is_convertible_mime` 체크 → `conversion_pending` 분기 (`1cdfad79`)
- `doc_prep_main.py` L2209 (xPipe 경로): 동일 분기 추가 (`907133bc`)

**검증**: 36건 업로드 테스트에서 HWP 3건이 BIN→TXT(인사/노무)로 F5 없이 자동 전환 확인.

---

## 이슈 2: explorer-tree API에 ocr.summary 미포함 ✅ 해결

**현상**: 안영미신분증.ppt — OCR로 요약 생성됨(ocr.summary)인데 요약 버튼 비활성

**수정**: `documents-routes.js` L954에 `summary: doc.ocr.summary` 추가 (`1cdfad79`)

**검증**: 안영미신분증.ppt → OCR 배지 + 신분증 + 완료. DB에 ocr.summary 존재 확인.

---

## 이슈 3: 이미지 파일에 OCR 배지 아닌 BIN 배지 ✅ 해결

**현상**: 암검진067.jpg — 이미지 파일인데 BIN 배지로 표시.

**수정**: badgeType 계산 4곳에 `image/*` MIME → OCR 배지 분기 추가 (`1cdfad79`)

**검증**: 암검진067.jpg → OCR 배지 표시 확인.

---

---

## 기술 부채 (Gini 검수에서 발견) ✅ 전체 해결

> 2026-03-27 Gini 검수 시 발견. 동일 세션에서 해결 완료.
> 커밋: `5f005768` | 36건 regression 테스트 PASS

### TD-1: `_is_convertible_mime` / `is_convertible_mime` 이중 정의 (Major) ✅ 해결

**문제**: 동일 목적의 함수가 3곳(xPipe 코어, doc_prep_main 로컬, 레거시 서비스)에 각각 다른 로직으로 존재.

**해결**: xPipe 코어(`xpipe/stages/convert.py`)의 `CONVERTIBLE_MIMES`(14개)를 Single Source of Truth로 통합. `doc_prep_main.py`의 로컬 함수 삭제, 레거시 서비스는 xPipe에서 re-export. AIMS-xPipe 아키텍처 원칙(파이프라인 코어 로직은 xPipe 소유)에 부합.

### TD-2: `import shutil` 함수 내 중복 선언 (Minor) ✅ 해결

**해결**: 파일 상단 import로 이동, 함수 내 3곳 중복 삭제.

### TD-3: 일반 경로 / xPipe 경로 필드 설정 불일치 (Minor) ✅ 해결

**해결**: 일반 경로에 `progressStage: "conversion_queued"`, `progress: 60` 추가하여 양 경로 일관성 확보.

---

## 테스트 증거

### 수정 전 (2026-03-27 03:30)
**F5 전**: HWP 2건 BIN + 미지정, 안영미신분증 요약 비활성, 암검진 BIN
**F5 후**: HWP 2건 TXT + 인사/노무 ✅, 안영미신분증 요약 여전히 비활성 ❌, 암검진 여전히 BIN ❌
캡처: `D:/tmp/issues_before_f5.png`, `D:/tmp/issues_after_f5.png`

### 수정 후 (2026-03-27 04:30) — 36건 재업로드 테스트 (1차)
- HWP 3건: BIN → TXT + 인사/노무 **자동 전환 (F5 불필요)** ✅
- 안영미신분증.ppt: OCR 배지 + 신분증 + 완료 ✅
- 암검진067.jpg: OCR 배지 ✅
캡처: `D:/tmp/processing_1~5.png`, `D:/tmp/issue2_3_check.png`

### 기술부채 수정 후 (2026-03-27 05:15) — 36건 regression 테스트 (2차)
- 36/36 completed ✅ (DB 확인)
- XLS/XLSX → TXT (PDF 변환 경유, 기존과 동일) ✅
- HWP → TXT + 인사/노무 (자동 전환) ✅
- PPT → OCR + 신분증 ✅
- JPG → OCR 배지 ✅
- regression 없음
캡처: `D:/tmp/regression_test.png`, `D:/tmp/regression_issue23.png`
