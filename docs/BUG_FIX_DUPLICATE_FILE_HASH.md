# 중복 파일 해시 에러 처리 버그 수정

> **수정일**: 2026-01-19
> **수정 파일**: `backend/api/document_pipeline/routers/doc_prep_main.py`

---

## 문제

### 1. 프론트엔드에 에러 메시지 미표시
- 백엔드에서 `DuplicateKeyError` 발생 시 프론트엔드에는 "완료"로 표시
- 사용자가 업로드 실패 여부를 알 수 없음

### 2. 고아 MongoDB 문서로 인한 중복 에러
- 업로드 후 고객 연결 실패 시 `customerId: null`인 문서가 DB에 남음
- 같은 파일 재업로드 시 `(ownerId, customerId, file_hash)` 유니크 인덱스 충돌
- 실제 파일(파일시스템)은 중복 에러와 무관, DB 문서가 원인

---

## 해결책

### 1. SSE 에러 전달 추가
```python
except DuplicateKeyError as e:
    error_msg = "동일한 파일이 이미 등록되어 있습니다."
    await _notify_progress(doc_id, user_id, -1, "error", error_msg)
    # document-processing-complete webhook도 호출하여 프론트엔드에 실패 상태 전달
```

### 2. 고아 문서 자동 정리 (5중 보호)
```python
delete_result = await files_collection.delete_one({
    "ownerId": user_id,           # 같은 사용자
    "customerId": None,           # 고아 상태만
    "meta.file_hash": file_hash,  # 같은 파일 해시
    "_id": {"$ne": doc_id},       # 현재 문서 제외
    "status": {"$ne": "completed"},  # 처리 완료 문서 보호
    "createdAt": {"$lt": now - 30초}  # 동시 업로드 보호
})
```

---

## 삭제 조건 설계 근거

| 조건 | 목적 |
|------|------|
| `customerId: None` | 고객 연결된 정상 문서 보호 |
| `status ≠ completed` | 처리 완료된 문서 보호 |
| `createdAt < now-30s` | 동시 업로드 시 처리 중인 문서 보호 |
| `_id ≠ doc_id` | 자기 자신 삭제 방지 |
| Atomic `delete_one` | 삭제 시점에 조건 재확인 (race condition 방지) |

---

## 결과

### 정상 동작 케이스
- 첫 업로드 → 성공
- 30초 이상 된 고아 문서 + 재업로드 → 고아 삭제 후 성공
- 다른 고객에게 같은 파일 → 성공 (다른 조합)

### 에러 처리 케이스
- 30초 이내 같은 파일 재업로드 → SSE로 "동일한 파일이 이미 등록되어 있습니다" 표시
- 이미 고객 연결된 파일 재업로드 → SSE로 에러 표시

### Race Condition 보호
- 동시 업로드 시 정상 문서 삭제 방지 (30초 보호 + status 보호)
- 고아 삭제 직전 고객 연결 시 삭제 방지 (atomic 조건 확인)

---

## 참고

- **고아 파일**(파일시스템)은 별도 문제로, 중복 에러와 무관
- 주기적인 고아 파일 정리는 추후 별도 배치로 처리 예정
