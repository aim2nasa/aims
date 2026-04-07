# 토의: 0B 파일 완료 표시 버그 — 메타 저장 실패 에러 처리

## 배경
- GitHub 이슈: #17
- 파일: 이선주/황호석 메리츠 보험금 청구서 (6~7MB PDF)
- 증상: 크기 0B + 상태 "완료" + 텍스트/메타 없음

## 근본 원인
1. Express body limit 기본값 100KB → OCR 텍스트 포함 PATCH 요청이 거부됨
2. `doc_prep_main.py:2304`의 `update_file()` 호출이 500 에러 반환
3. 반환값을 체크하지 않고 다음 단계로 진행 → 결국 "완료"로 마킹

## 수정
- `update_file()` 반환값 체크 추가
- 실패 시 `_notify_progress(doc_id, user_id, -1, "error", ...)` 호출
- 후속 처리 중단 (`return`)

## 향후
- Express body limit 상향: #18에서 처리
- 파이프라인 에러 처리 전수 점검: #18
