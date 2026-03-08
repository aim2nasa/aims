# 문서 파이프라인 버그 보고서

> **작성일**: 2026-03-08
> **발견 경위**: 캐치업코리아 문서 재업로드 테스트 중 발견
> **조사**: Alex (아키텍트) + Gini (품질 검증)
> **교차 검증**: Gini 2차 검증 완료 — 초기 보고서 오류 4건 수정됨

---

## 버그 목록

### BUG-1: customers.documents 고아 참조 (CRITICAL)

**현상**: 문서를 삭제해도 `customers.documents` 배열에 삭제된 파일의 `document_id` 참조가 남아있음

**실측 데이터** (캐치업코리아 고객):
- customers.documents 배열: 1,522개 참조
- files에 실제 존재: 419건
- 고아 참조: **1,103건 (72%)**

**원인 코드**:
- `backend/api/aims_api/routes/customers-routes.js` 2176~2182행: 문서 연결 해제 시 `$pull`로 참조 제거

```javascript
// 현재 코드 (2176~2182행) — 정상 구현되어 있음
await db.collection(CUSTOMERS_COLLECTION).updateOne(
  { _id: new ObjectId(id) },
  {
    $pull: { documents: { document_id: new ObjectId(document_id) } },
    $set: { 'meta.updated_at': utcNowDate() }
  }
);
```

**근본 원인 추정**:
현재 코드에서 `$pull`은 정상적으로 구현되어 있음. 고아 참조 1,103건은 다음 중 하나로 추정:
1. 과거 버전에서 문서 삭제 시 `$pull` 로직이 없었던 시점의 잔여 데이터
2. DB 직접 조작(mongosh 등)으로 files를 삭제하고 customers.documents는 정리하지 않은 경우
3. BUG-2(DuplicateKeyError cleanup 부재)로 인한 누적

> **Gini 검증 노트**: 초기 보고서의 "2393~2396행에서 warn 후 계속 진행" 주장은 **틀림**. 해당 행은 SSE 주석이며, 실제 $pull 코드(2176행)는 try-catch 없이 await로 직접 호출됨.

**영향**:
- 고객 문서 목록 조회 시 존재하지 않는 문서에 대한 불필요한 DB 쿼리
- documents 배열 크기 무한 증가 → 성능 저하
- 문서 수 통계 불일치

**수정 방안**:
1. 고아 참조 일괄 정리 스크립트 실행 (즉시)
2. 정기적 고아 참조 정리 배치 추가 (방어적)

---

### BUG-2: DuplicateKeyError 발생 시 cleanup 없음 (CRITICAL)

**현상**: 파일 업로드 중 중복 해시로 `DuplicateKeyError` 발생 시, 실패한 파일 레코드와 관련 데이터가 정리되지 않음

**실측 데이터**:
- DuplicateKeyError로 실패한 파일: **32건**
- 모두 `customers.documents`에 참조 잔존 (고객 연결은 1229행에서 이미 완료된 후 에러 발생)
- 모두 디스크에 파일 잔존 (`upload.destPath` 존재)
- 모두 `meta` 필드 전체가 null (0B, 미지정 표시 원인)

**원인 코드**:
- `backend/api/document_pipeline/routers/doc_prep_main.py` 1340~1344행: DuplicateKeyError 처리
- `backend/api/document_pipeline/routers/doc_prep_main.py` 1540~1558행: 상위 exception handler (에러 기록만, cleanup 없음)

```python
# DuplicateKeyError 처리 (1340~1344행)
except DuplicateKeyError as e:
    error_msg = "동일한 파일이 이미 등록되어 있습니다."
    logger.error(f"🔴 중복 파일 에러: {doc_id} - {error_msg}")
    await _notify_progress(doc_id, user_id, -1, "error", error_msg)
    raise Exception(error_msg) from e
    # ← cleanup 없음

# 상위 exception handler (1540~1558행)
# error 필드만 추가 업데이트, cleanup 없음
```

**발생 흐름**:
1. 파일 업로드 + 디스크 저장 (1202행)
2. `_connect_document_to_customer` 호출 → customers.documents에 추가 (1229행)
3. MetaService.extract_metadata → meta_update 생성 (1284행)
4. `files_collection.update_one(meta_update)` → **DuplicateKeyError** (1337행)
5. 에러 발생 시점에 이미 2번(고객 연결)이 완료된 상태 → 참조가 남음

**영향**:
- 실패한 파일이 UI에 "0B", "미지정", "-1%" 상태로 표시
- customers.documents에 실패 파일 참조가 남아 문서 수 불일치
- 디스크 공간 낭비

**수정 방안**:
DuplicateKeyError 발생 시 즉시 cleanup 수행:
1. `customers.documents`에서 해당 `doc_id` `$pull`
2. 업로드된 디스크 파일 삭제 (`upload.destPath`)
3. `files` 컬렉션에서 해당 문서 레코드 삭제

---

### BUG-3: overallStatus 동기화 불일치 (MAJOR)

**현상**: `status=failed`인 파일의 `overallStatus`가 `processing`으로 설정됨

**실측 데이터**:
- `status=failed` + `overallStatus=processing`: **32건**
- `status=failed` + `overallStatus=error`: 0건 (전부 덮어씌워짐)
- 32건 모두 `overallStatusUpdatedAt`이 `error.timestamp`보다 이후 (덮어쓰기 증거)

**원인 코드** (2가지 경로):

경로 A — 업로드 워커 재시도:
- `backend/api/document_pipeline/workers/upload_worker.py`: 재시도 시 `process_document_pipeline` 재호출
- 파이프라인 초기 코드에서 `overallStatus`를 리셋하여 "processing"으로 덮어쓰기

경로 B — set-annual-report / set-customer-review API (잠재적 버그):
- `backend/api/aims_api/routes/documents-routes.js` 2097~2099행, 2239~2241행
- 파일의 현재 `status`를 확인하지 않고 `overallStatus: "processing"`을 무조건 설정

```javascript
// documents-routes.js 2097~2099행
updateFields.overallStatus = 'processing';
updateFields.overallStatusUpdatedAt = new Date();
// ← status: "failed" 체크 없음
```

> **Gini 검증 노트**: 현재 32건의 실제 원인은 경로 A(워커 재시도)로 추정됨. 32건 모두 AR/CRS 문서가 아니므로 경로 B(set-annual-report)가 직접 원인은 아님. 단, 경로 B의 status 미확인 버그는 별도로 존재하며 수정 필요.

**영향**:
- 관리자 통계에서 failed 파일이 "처리 중"으로 잘못 집계
- UI에서는 `progress: -1`을 우선 사용하므로 에러 표시는 되나, overallStatus 기반 필터링 시 누락

**수정 방안**:
1. `set-annual-report` / `set-customer-review` API에서 `status: "failed"` 문서에는 `overallStatus` 변경 금지
2. 업로드 워커 재시도 시 이미 failed인 문서의 overallStatus를 덮어쓰지 않도록 가드 추가

---

### BUG-4: customers.documents 배열 중복 $push (MAJOR)

**현상**: 같은 `document_id`가 `customers.documents` 배열에 여러 번 추가됨

**실측 데이터** (캐치업코리아):
- documents 배열: 1,522개 항목
- 유니크 document_id: 1,381개
- 중복: **141건**

**원인 코드**:
- `backend/api/aims_api/routes/customers-routes.js` 1957행: `$push` 사용 (중복 체크 없음)
- `backend/api/aims_api/routes/documents-routes.js` 2136~2143행: set-annual-report에서도 `$push` 사용
- `backend/api/document_pipeline/workers/upload_worker.py`: 재시도 시 `_connect_document_to_customer` 재호출 → `$push` 중복 실행

```javascript
// customers-routes.js 1957행 — 중복 체크 없음
{ $push: { documents: { document_id: docId, upload_date: new Date(), notes: '' } } }
```

> **비일관성**: set-annual-report API(2126~2128행)에는 `findOne`으로 이미 존재하는지 체크 후 추가하는 로직이 있으나, `/api/customers/:id/documents` POST(1957행)에는 없음.

**영향**:
- 고객 문서 목록에 같은 문서가 여러 번 표시될 가능성
- documents 배열 크기 불필요하게 증가

**수정 방안**:
push 전 중복 체크 추가:
```javascript
// 방안: push 전 중복 체크 (가장 안전)
const existing = await collection.findOne({ _id: customerId, 'documents.document_id': docId });
if (!existing) {
  await collection.updateOne({ _id: customerId }, { $push: { documents: documentLink } });
}
```

> 주의: `$addToSet`은 객체 전체가 동일해야 중복으로 인식하므로, `upload_date`가 다르면 중복으로 안 잡힘. findOne 방식이 더 안전.

---

## 즉시 필요한 데이터 정리

### 1. 고아 참조 제거
```javascript
// customers.documents 배열에서 files에 존재하지 않는 document_id 제거
// 전체 고객 대상으로 실행 필요
```

### 2. 중복 참조 제거
```javascript
// customers.documents 배열에서 동일 document_id 중복 제거
```

### 3. overallStatus 불일치 수정
```javascript
// status=failed인 파일의 overallStatus를 "error"로 일괄 수정
db.files.updateMany(
  { status: "failed", overallStatus: { $ne: "error" } },
  { $set: { overallStatus: "error" } }
)
```

### 4. 실패 파일 레코드 정리 (선택)
```javascript
// status=failed + meta.file_hash=null인 파일 레코드 삭제
// + customers.documents에서 해당 참조 제거
// + 디스크 파일 삭제
```

---

## 참고: 정상 동작으로 확인된 사항

| 현상 | 판정 | 이유 |
|---|---|---|
| 32건 중복 실패 | 정상 | 같은 파일 `_1` 복사본 업로드 → unique index 정상 동작 |
| 6건 unsupported format (ZIP, AI) | 정상 | 지원 불가 형식 → 보관 처리 |
| 3건 conversion_failed (HWP, PPT) | 정상 | LibreOffice 변환 한계 |
| OCR 에러 1건 | Upstage 외부 이슈 | Upstage 모델 변경/폐지 |

---

## 관련 파일

| 파일 | 역할 |
|---|---|
| `backend/api/aims_api/routes/customers-routes.js` | 문서 삭제 API, 고객-문서 연결 |
| `backend/api/aims_api/routes/documents-routes.js` | set-annual-report/set-cr-flag API |
| `backend/api/document_pipeline/routers/doc_prep_main.py` | 문서 처리 파이프라인 메인 |
| `backend/api/document_pipeline/workers/upload_worker.py` | 업로드 워커 (재시도 로직) |
| `backend/api/document_pipeline/workers/ocr_worker.py` | OCR 워커 |
