# T3 워크플로우 에러처리 (Case-001 ~ 009)

| Case | 에러명               | 발생 조건                                      | 대응 결과 |
|------|---------------------|-----------------------------------------------|-----------|
| 001  | REQUEST_INVALID     | Webhook에 binary 파일 누락, 파싱 실패          | 400 응답 + 에러코드 반환 |
| 002  | TEMP_SAVE_FAILED    | Temp 저장 실패 (디스크 full, 권한 없음)        | 500 응답 + Failed to save file to temp storage |
| 003  | PATH_GEN_FAILED     | 경로 생성 실패 (JS 오류, 파싱 실패)            | **제거** (Generate Final Path 완전 무결 보장) |
| 004  | MKDIR_FAILED        | 대상 폴더 생성 실패 (권한, NFS 오류)           | 500 응답 + stderr 메시지 |
| 005  | MOVE_FAILED         | 파일 이동 실패 (경로 없음, I/O 오류)           | 500 응답 + stderr 메시지 |
| 006  | META_GEN_FAILED     | 메타데이터 생성 실패 (JSON 참조 오류)          | **제거** (Edit Fields 실패 가능성 0%) |
| 007  | DB_INSERT_FAILED    | MongoDB insert 실패 (연결/인증/스키마 오류)    | 500 응답 + DB 오류 메시지 |
| 008  | RESPONSE_FAILED     | 응답 직렬화 실패 (JSON stringify 오류 등)      | **제거** (실패 가능성 극단적으로 낮음) |
| 009  | SYSTEM_RESOURCE_ERR | 디스크/메모리 부족, race condition 등 시스템 장애 | **제거** (시스템 모니터링으로 대응) |

---

## ✅ 구현 완료
- Case-001, 002, 004, 005, 007  

## ❌ 제거된 케이스  
- Case-003, 006, 008, 009  
  - 실패 가능성 0% 혹은 시스템 레벨 문제로 워크플로우 대응 불필요

