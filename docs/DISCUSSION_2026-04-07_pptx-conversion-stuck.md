# 토의: PPTX 변환 stuck 오판 + progress -1% 표시

## 배경
- GitHub 이슈: #16
- 파일: 퇴직연금대 경영인정기.pptx (3.05 MB, 한울 고객)
- pdf_converter 로그에서 변환 성공(1839ms) 확인했으나 DB에서는 failed 상태

## 이슈 1: 파이프라인 stuck 오판

### 원인
`_recover_stuck_pending_documents()` (pdf_conversion_worker.py:508-554)가 3분 주기로 실행되면서:
1. `conversion_status: "pending"` 문서 발견
2. 큐에서 active job만 검색 (`status: {"$in": ["pending", "processing"]}`)
3. completed job은 검색하지 않음 → "큐에 작업 없음" 판정 → failed로 오판

변환 자체는 성공했지만 `_post_process_preview()` 실행 중 오류가 발생하여
conversion_status가 "pending"에 머물러 있었고, 큐 job은 이미 completed 상태.

### 수정 방향
stuck 복구 로직에서 completed job이 존재하는 경우를 추가 확인:
- completed job 있음 → 후처리 재시도 (_post_process_preview)
- job이 전혀 없음 → 기존대로 failed 처리

## 이슈 2: 프론트엔드 -1% 표시

### 원인
DocumentStatusList.tsx:560에서 `&& progress` 조건.
-1은 truthy이므로 "-1%"로 표시됨.

### 수정 방향
`progress > 0` 조건으로 변경.
