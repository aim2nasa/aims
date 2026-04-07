# 토의 보고서: 메타 저장 실패 문서의 크기/타입 미표시 + 에러 메시지 상세화

**날짜**: 2026-04-08
**이슈**: #21, #22 (aims-admin 에러 로그 — 별도)

## 이슈 1: 0B / 타입 없음

### 근본 원인
- 정상 처리 경로 `_step_save_file()`에서 `upload.fileSize`, `upload.mimeType`을 저장하지 않음
- 메타 저장(`_step_update_meta_to_db`)이 실패하면 `meta.size_bytes`, `meta.mime`이 없음
- API가 `meta.*` 필드만 참조 → 0B / null 표시

### 해결
- SSoT: upload 단계에서 fileSize/mimeType 저장 (파일 저장 시점에 확정되는 정보)
- API: `meta.size_bytes ?? upload.fileSize ?? 0` fallback 체인

### 주의점
- 기존 DB 문서에는 `upload.fileSize` 없음 — meta도 없으면 여전히 0B (점진적 해결)

## 이슈 2: 에러 메시지 상세화

### 근본 원인
- `update_file()` 실패 시 `"HTTP 500"`만 반환, 응답 body는 로그에만 기록
- `_notify_progress()`의 error 객체에 statusCode, statusMessage만 저장

### 해결
- `update_file()`: 응답 body를 `detail` 필드로 반환
- `_notify_progress()`: `error_detail` 파라미터로 상세 정보를 error 객체에 저장
- 프론트 클릭 복사: error.detail이 있으면 기술 정보 포함하여 복사
- `progressMessage`: 설계사에게 보여줄 수준 유지 (변경 없음)

### #22 준비
- DB error 객체에 `detail` 필드가 저장되므로, aims-admin에서 조회 가능한 기반 완료
