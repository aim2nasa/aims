# ISSUE-3: 중복 에러 후 고아 데이터 발생 가능성

> **발견일**: 2026-03-08
> **심각도**: Warning (확인 필요)
> **연관 작업**: 캐치업코리아 446건 v4 분류 체계 튜닝 샘플 업로드
> **상태**: 확인 필요

---

## 현상

- 에러 로그에 다음 경고 발견:
  ```
  Failed to connect document to customer: 문서를 찾을 수 없거나 접근 권한이 없습니다.
  ```
- DuplicateKeyError 발생 후 customers.documents 배열에 문서 연결 실패

## 근본 원인 (추정)

- DuplicateKeyError 발생 시 파일 레코드는 삭제되지만, 그 전에 customers.documents 배열에 push된 참조가 cleanup되지 않음
- 또는 반대로, 파일이 삭제된 후 연결을 시도하여 "문서를 찾을 수 없음" 에러 발생

## 영향

- customers.documents 배열에 존재하지 않는 파일 ID가 남아있을 수 있음 (고아 참조)
- UI에서 해당 고객의 문서 목록에 깨진 참조가 표시될 수 있음

## 연관 이슈

- BUG-2 (docs/2026-03-08_DOCUMENT_PIPELINE_BUGS.md): DuplicateKeyError 시 cleanup 누락 -- 동일 패턴
- 이미 BUG-2에서 수정 커밋(d9eb7149)이 적용되었으나, 본 업로드에서 동일 패턴 재발생

## 확인 방법

```javascript
// 캐치업코리아 고객의 documents 배열에서 고아 참조 확인
db.customers.find(
  { name: /캐치업/ },
  { documents: 1 }
).forEach(c => {
  c.documents.forEach(docId => {
    if (!db.files.findOne({ _id: docId })) {
      print(`고아 참조: customer=${c._id}, file=${docId}`)
    }
  })
})
```

## 해결 방향

1. 위 쿼리로 고아 참조 존재 여부 확인
2. 고아 참조가 있으면 customers.documents 배열에서 제거
3. BUG-2 수정이 이번 케이스에도 적용되었는지 확인

---

> 연관: [파이프라인 처리 완료 요약](2026-03-08_PIPELINE_PROCESSING_SUMMARY.md)
> 연관: [문서 파이프라인 버그 보고서](2026-03-08_DOCUMENT_PIPELINE_BUGS.md) -- BUG-2
