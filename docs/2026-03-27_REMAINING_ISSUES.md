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

## 기술 부채 (Gini 검수에서 발견, 별도 리팩토링)

> 2026-03-27 Gini 검수 시 발견. 이번 버그 수정 범위 밖이며 별도 작업으로 진행.

### TD-1: `_is_convertible_mime` / `is_convertible_mime` 이중 정의 (Major)

**현상**: 동일 목적의 함수가 두 곳에 각각 다른 로직으로 존재
- `doc_prep_main.py:2482` — `_is_convertible_mime()`: `startswith` 매칭, XLS/XLSX/haansofthwp 포함
- `pdf_conversion_text_service.py:32` — `is_convertible_mime()`: 정확 `in` 매칭, 7개 MIME (XLS/XLSX 미포함)

**위험**: 동일 파일이 일반 경로 vs xPipe 경로에서 다르게 판단될 수 있음. 특히 XLS/XLSX 파일은 xPipe에서만 convertible로 인식됨.

**해결 방향**: 두 함수를 하나로 통합. XLS/XLSX를 변환 대상에 포함할지 비즈니스 결정 필요 → `CONVERTIBLE_MIMES` 단일 정의로 통합.

### TD-2: `import shutil` 함수 내 중복 선언 (Minor)

**현상**: `_process_via_xpipe` 함수 내 3곳(L2236, L2281, L2468)에서 `import shutil`이 반복됨.

**해결 방향**: 파일 상단 import로 이동.

### TD-3: 일반 경로 / xPipe 경로 필드 설정 불일치 (Minor)

**현상**: `conversion_pending` 설정 시
- 일반 경로(L1867): `progressStage`, `progress` 미설정
- xPipe 경로(L2209): `progressStage: "conversion_queued"`, `progress: 60` 설정

xPipe 쪽이 더 완전하므로 기능 문제는 없으나, 양쪽 일관성이 부족함.

**해결 방향**: 일반 경로에도 `progressStage`, `progress` 필드 추가하여 일관성 확보.

---

## 테스트 증거

### 수정 전 (2026-03-27 03:30)
**F5 전**: HWP 2건 BIN + 미지정, 안영미신분증 요약 비활성, 암검진 BIN
**F5 후**: HWP 2건 TXT + 인사/노무 ✅, 안영미신분증 요약 여전히 비활성 ❌, 암검진 여전히 BIN ❌
캡처: `D:/tmp/issues_before_f5.png`, `D:/tmp/issues_after_f5.png`

### 수정 후 (2026-03-27 04:30) — 36건 재업로드 테스트
- HWP 3건: BIN → TXT + 인사/노무 **자동 전환 (F5 불필요)** ✅
- 안영미신분증.ppt: OCR 배지 + 신분증 + 완료 ✅
- 암검진067.jpg: OCR 배지 ✅
캡처: `D:/tmp/processing_1~5.png`, `D:/tmp/issue2_3_check.png`
