# 남은 이슈 목록 (2026-03-27 테스트 결과)

> 작성일: 2026-03-27 03:30 KST
> 상태: **미해결 — 일괄 수정 대기**

---

## 이슈 1: HWP 폴링 마지막 fetch 누락

**현상**: HWP 파일 2건(표준취업규칙)이 변환 완료 후에도 BIN 배지로 남아있음. F5하면 TXT로 바뀜.

**원인**: 3초 폴링의 "처리중 → 완료" 전환 감지(`wasProcessingRef`) 시 마지막 1회 fetch가 변환 워커의 비동기 처리를 놓침. HWP는 파이프라인 완료 후 변환 워커가 별도로 3~5분 후에 텍스트를 추출하므로, 폴링이 이미 중단된 시점에 데이터가 바뀜.

**파일**: `DocumentExplorerView.tsx` 폴링 useEffect

**해결 방향**: 이전에 분석한 "조기 completed" 이슈(2026-03-26_PREMATURE_COMPLETED_BUG.md)의 근본 원인. `conversion_pending` 상태 도입으로 폴링이 변환 완료까지 유지되도록 해야 함.

---

## 이슈 2: explorer-tree API에 ocr.summary 미포함

**현상**: 안영미신분증.ppt — OCR로 요약 생성됨(ocr.summary: 50자)인데 요약 버튼 비활성

**원인**: `documents-routes.js` L951-955에서 ocr 응답에 `summary` 필드를 포함하지 않음

**해결 방향**: ocr 응답 매핑에 `summary: doc.ocr.summary` 추가

**상세**: [2026-03-27_OCR_SUMMARY_NOT_IN_API.md](2026-03-27_OCR_SUMMARY_NOT_IN_API.md)

---

## 이슈 3: 이미지 파일에 OCR 배지 아닌 BIN 배지

**현상**: 암검진067.jpg — 이미지 파일인데 BIN 배지로 표시. OCR 배지여야 함.

**원인**: 이 파일은 텍스트가 없는 빈 이미지. OCR 시도 후 텍스트 없음 → `_hasMetaText: false`, `_hasOcrText: false` → BIN 배지. 하지만 이미지 파일(JPG/PNG)은 MIME 타입으로 OCR 대상임을 알 수 있으므로 OCR 배지가 붙어야 함.

**DB 상태**:
- `meta.full_text: 0`, `ocr.full_text: 0`
- `ocr.status: -` (OCR 미실행)
- `mime: image/jpeg`

**해결 방향**: 배지 계산 로직에서 MIME 타입이 이미지(`image/*`)이면 텍스트 유무와 관계없이 OCR 배지 부여. 또는 OCR을 시도했으면(`ocr.status === 'done'`) OCR 배지.

**참고**: 이 파일은 OCR 자체가 실행되지 않은 것일 수 있음 (`ocr.status: -`). xPipe에서 이미지 파일의 OCR 처리 경로를 확인 필요.

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

**F5 전**: HWP 2건 BIN + 미지정, 안영미신분증 요약 비활성, 암검진 BIN
**F5 후**: HWP 2건 TXT + 인사/노무 ✅, 안영미신분증 요약 여전히 비활성 ❌, 암검진 여전히 BIN ❌

캡처: `D:/tmp/issues_before_f5.png`, `D:/tmp/issues_after_f5.png`
