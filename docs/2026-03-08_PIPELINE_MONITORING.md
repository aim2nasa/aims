# 캐치업코리아 문서 파이프라인 모니터링

> **날짜**: 2026-03-08
> **목적**: v4 분류 체계 튜닝용 446건 샘플 업로드 및 파이프라인 처리 모니터링
> **고객**: 캐치업코리아 (법인)

---

## 초기 상태

- customers 컬렉션: 캐치업코리아 0건
- files 컬렉션: 캐치업코리아 관련 0건

## 파일 구성

- 총 446건 (PDF 249, JPG/PNG/JPEG 103, XLSX/XLS 48, HWP 17, PPTX/PPT 16, DOCX/DOC 7, ZIP 5, AI 1)

---

## 모니터링 로그

| 시간 (KST) | 총 건수 | completed | processing | failed | 비고 |
|------------|---------|-----------|------------|--------|------|
| 18:17 | 0 | 0 | 0 | 0 | 업로드 시작 전 |
| 18:17:21 | 3 | 0 | 3 | 0 | 첫 파일 도착 |
| 18:18 | 181 | 32 | 149 | 0 | |
| 18:18:30 | 257 | 38 | 219 | 0 | |
| 18:19 | 365 | 53 | 312 | 0 | |
| 18:19:30 | 380 | 62 | 318 | 0 | |
| 18:20 | 415 | 78 | 337 | 0 | 총 건수 안정화 — 업로드 완료 |
| 18:21 | 415 | 93 | 322 | 0 | |

---

## 발견된 이슈

### ISSUE-1: 업로드 프로그레스바 미표시 (UI)

**심각도**: Minor (기능 동작에 영향 없음, UX 이슈)
**현상**: 446건 대량 업로드 시 처리 진행 상황을 보여주는 프로그레스바가 보이지 않음
**확인 방법**: 전체 문서 보기 화면에서 processing 상태 문서가 70% 등으로 표시되지만, 전체 배치 처리 진행률 바가 없음
**영향**: 사용자가 전체 처리 진행 상황을 한눈에 파악 불가
**스크린샷**: 2026-03-08 18:20경 전체 문서 보기 화면 캡처 참조

### ISSUE-2: 중복 파일 에러 393건 (파이프라인)

**심각도**: Major (446건 중 31건 누락 가능성)
**현상**: `unique_owner_customer_file_hash` 인덱스에 의해 동일 해시 파일이 거부됨
**에러 메시지**: `🔴 중복 파일 에러: {id} - 동일한 파일이 이미 등록되어 있습니다.`
**근본 원인**: `DuplicateKeyError` (E11000) — 같은 owner+customer+file_hash 조합이 이미 존재
**로그 위치**: `/home/rossi/.pm2/logs/document-pipeline-error.log`
**건수**: 에러 로그에서 "중복 파일" 393건 (retry 포함 중복 카운트 가능)
**영향**: 로컬 446건 vs DB 415건 = **31건 차이**. 동일 내용의 파일이 다른 폴더(다른 분류)에 존재하는 경우 하나만 등록됨.
**연관**: Gini 검수에서 지적된 `캐치업-계약서(안영미).pdf`가 plan_design/insurance_etc 두 폴더에 존재하는 것과 같은 패턴

> **참고**: 393건은 retry(최대 3회) 포함 숫자이므로 실제 고유 중복 파일 수는 이보다 적을 수 있음.
> 31건 누락이 정확한 수치인지는 추후 파일별 대조 필요.

### ISSUE-3: 중복 에러 후 고아 데이터 발생 가능성

**심각도**: Warning (확인 필요)
**현상**: 에러 로그에 `Failed to connect document to customer: 문서를 찾을 수 없거나 접근 권한이 없습니다.` 경고 발견
**원인 추정**: DuplicateKeyError 발생 시 cleanup이 완전하지 않아 customers.documents 배열에 연결 실패
**연관**: BUG-2 (docs/2026-03-08_DOCUMENT_PIPELINE_BUGS.md) — DuplicateKeyError 시 cleanup 누락 이슈와 동일 패턴

### ISSUE-4: status=processing이지만 overallStatus=completed인 문서 113건

**심각도**: Major (status 전환 버그)
**현상**: `status=processing` + `overallStatus=completed` + `meta_status=done` 상태의 문서가 113건 존재
**특징**:
- `confidence=0` (정상은 0.85~0.95)
- `document_type=general` (catch-all로 빠짐)
- 메타 추출과 분류는 완료(`meta_status=done`)되었으나 `status`가 `completed`로 전환되지 않음
**영향**: UI에서 이 문서들이 영원히 "처리 중" 상태로 표시될 수 있음. 분류 결과(`general`, `confidence=0`)도 의심스러움.
**원인 추정**: 대량 업로드 시 상태 전환 로직에서 race condition 또는 에러 발생 후 status 미갱신
**확인 필요**: 이 113건의 full_text가 정상적으로 추출되었는지 확인 필요

---

## 처리 완료 대기 중

- 현재 processing 건수가 0이 될 때까지 모니터링 계속
- 완료 후 v3 분류 결과 분포 (baseline) 기록 예정
