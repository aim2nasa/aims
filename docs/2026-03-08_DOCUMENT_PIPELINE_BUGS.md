# 문서 파이프라인 버그 보고서

> **작성일**: 2026-03-08
> **발견 경위**: 캐치업코리아 문서 재업로드 테스트 중 발견
> **조사**: Alex (아키텍트) + Gini (품질 검증)
> **교차 검증**: Gini 2차 검증 완료 — 초기 보고서 오류 4건 수정됨
> **3차 검증 (2026-03-08)**: BUG-1 실증 검증 완료 — 근본 원인 확정 및 수정 배포됨
> **4차 검증 (2026-03-08)**: Alex(코드) + Gini(데이터) 교차 검증 — BUG-2,3,4 실측 데이터 확인, BUG-3 경로 A 부정확 수정

---

## 버그 목록

### BUG-1: customers.documents 고아 참조 (CRITICAL)

**현상**: 문서를 삭제해도 `customers.documents` 배열에 삭제된 파일의 `document_id` 참조가 남아있음

**실측 데이터** (캐치업코리아 고객):
- customers.documents 배열: 1,522개 참조
- files에 실제 존재: 419건
- 고아 참조: **1,103건 (72%)**

**원인 코드**:
- `backend/api/aims_api/routes/documents-routes.js` 2383~2396행: DELETE API의 고객 참조 정리

```javascript
// 삭제 API의 고객 참조 정리 코드 (2383~2396행)
try {
  const customersUpdateResult = await db.collection(CUSTOMERS_COLLECTION).updateMany(
    { 'documents.document_id': new ObjectId(id) },
    {
      $pull: { documents: { document_id: new ObjectId(id) } },
      $set: { 'meta.updated_at': utcNowDate() }
    }
  );
} catch (customerError) {
  console.warn('⚠️ 고객 참조 정리 실패:', customerError.message);
  // 고객 참조 정리 실패해도 문서 삭제는 진행 ← 침묵 에러!
}
```

**근본 원인 (2026-03-08 실증 확정)**:
`documents-routes.js` 파일 상단에 `CUSTOMERS_COLLECTION` 상수가 **미정의**. `$pull` 코드 자체는 올바르나, `CUSTOMERS_COLLECTION`이 `ReferenceError`를 발생시키고 catch에서 `console.warn`으로 침묵 처리 → 삭제 API는 "성공" 반환하지만 고객 참조는 제거되지 않음.

- Docker 로그 증거: `⚠️ 고객 참조 정리 실패: CUSTOMERS_COLLECTION is not defined`
- 동일 버그가 `insurance-contracts-routes.js`에서도 발견됨

> **3차 검증 결과**: 초기 보고서에서 "코드가 정상"이라는 판단은 **오류**. `customers-routes.js`의 연결 해제 코드(2176행)는 정상이나, `documents-routes.js`의 DELETE API 삭제 코드(2383행)에서 상수 미정의 버그가 있었음. Gini 2차 검증에서 "2393~2396행 warn 후 계속 진행 주장이 틀림"이라는 노트도 **오류** — 실제로 해당 catch 블록이 ReferenceError를 삼키고 있었음.

**수정 완료 (커밋 c5b4cf81, 176819d5)**:
1. `const CUSTOMERS_COLLECTION = COLLECTIONS.CUSTOMERS;` 추가 (documents-routes.js, insurance-contracts-routes.js)
2. `console.warn` → `console.error` 격상 (문서 ID 포함)
3. regression 테스트 추가 (상수 정의 + error 로깅 검증)
4. route-modules.test.js에 전체 라우트 `_COLLECTION` 상수 자동 검증 추가

**영향**:
- 고객 문서 목록 조회 시 존재하지 않는 문서에 대한 불필요한 DB 쿼리
- documents 배열 크기 무한 증가 → 성능 저하
- 문서 수 통계 불일치

**수정 방안**:
1. ~~고아 참조 일괄 정리 스크립트 실행 (즉시)~~ → 근본 원인 수정 완료 (커밋 c5b4cf81)
2. 기존 고아 참조 1,103건 일괄 정리 스크립트 실행 필요 (과거 누적분)
3. ~~정기적 고아 참조 정리 배치 추가 (방어적)~~ → regression 테스트로 재발 방지 (커밋 176819d5)

---

### BUG-2: DuplicateKeyError 발생 시 cleanup 없음 (CRITICAL)

**현상**: 파일 업로드 중 중복 해시로 `DuplicateKeyError` 발생 시, 실패한 파일 레코드와 관련 데이터가 정리되지 않음

**실측 데이터** (4차 검증 재확인 완료):
- DuplicateKeyError로 실패한 파일: **32건** ✅
- 모두 `customers.documents`에 참조 잔존: **32건 전부 확인** ✅
- 모두 디스크에 파일 잔존 (`upload.destPath` 존재): **32건 전부 확인** ✅
- 모두 `meta` 필드 전체가 null (0B, 미지정 표시 원인): **32건 전부 확인** ✅
- **BUG-3의 32건과 완전히 동일한 문서** (교차 검증 확인)

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

**실측 데이터** (4차 검증 재확인 완료):
- `status=failed` + `overallStatus=processing`: **32건** ✅
- `status=failed` + `overallStatus=error`: **0건** ✅ (전부 덮어씌워짐)
- 32건 모두 `overallStatusUpdatedAt`이 `error.timestamp`보다 약 9시간 이후 (덮어쓰기 증거) ✅
- **BUG-2의 32건과 완전히 동일한 문서** (교차 검증 확인)

**원인 코드** (2가지 경로):

경로 A — 덮어쓰기 경로 (정확한 원인 미확정):
- 32건 모두 `overallStatusUpdatedAt`이 `error.timestamp`보다 약 9시간 후 → 어떤 경로에서 `overallStatus: "processing"`으로 덮어씌워진 것은 확실
- ~~`upload_worker.py` 재시도 시 파이프라인 초기 코드에서 overallStatus 리셋~~ → **4차 검증에서 부정확 판명**: `process_document_pipeline` 내부에 `overallStatus: "processing"`을 설정하는 코드는 발견되지 않음
- 정확한 덮어쓰기 경로는 추가 조사 필요 (큐잉 시 초기 문서 생성 단계 또는 다른 API 호출 가능성)

경로 B — set-annual-report / set-customer-review API (잠재적 버그, 코드 검증 완료):
- `backend/api/aims_api/routes/documents-routes.js` 2099~2100행, 2241~2242행
- 파일의 현재 `status`를 확인하지 않고 `overallStatus: "processing"`을 무조건 설정

```javascript
// documents-routes.js 2099~2100행
updateFields.overallStatus = 'processing';
updateFields.overallStatusUpdatedAt = new Date();
// ← status: "failed" 체크 없음
```

> **4차 검증 결과**: 32건 모두 AR/CRS 문서가 아니므로 경로 B가 현재 32건의 직접 원인은 아님. 단, 경로 B의 `status` 미확인 버그는 코드에서 확인되었으며 별도 수정 필요. 경로 A의 "파이프라인 초기 코드에서 리셋"이라는 초기 주장은 코드에서 확인되지 않아 수정함.

**영향**:
- 관리자 통계에서 failed 파일이 "처리 중"으로 잘못 집계
- UI에서는 `progress: -1`을 우선 사용하므로 에러 표시는 되나, overallStatus 기반 필터링 시 누락

**수정 방안**:
1. `set-annual-report` / `set-customer-review` API에서 `status: "failed"` 문서에는 `overallStatus` 변경 금지
2. 경로 A의 정확한 덮어쓰기 원인 추가 조사 후 가드 추가

---

### BUG-4: customers.documents 배열 중복 $push (MAJOR)

**현상**: 같은 `document_id`가 `customers.documents` 배열에 여러 번 추가됨

**실측 데이터** (캐치업코리아, 4차 검증 재확인 완료):
- documents 배열: 1,520개 항목 (원래 1,522 → 검증 삭제 2건 반영)
- 유니크 document_id: **1,379개** (초기 보고서 1,381은 계산 오류 — 수정됨)
- 중복: **141건** ✅
- 전체 936명 고객 중 중복이 있는 고객: **캐치업코리아 1명만** (4차 검증 추가 발견)

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

## 버그 상태 요약 (2026-03-08 최종)

| 버그 | 심각도 | 상태 | 커밋 | Gini 검수 |
|------|--------|------|------|-----------|
| BUG-1 | CRITICAL | ✅ **수정+정리 완료** | c5b4cf81, 176819d5 | PASS |
| BUG-2 | CRITICAL | ✅ **수정+정리 완료** | e88d55ac | 3차 PASS |
| BUG-3 | MAJOR | ✅ **수정+정리 완료** | c9fb882e | 1차 PASS |
| BUG-4 | MAJOR | ✅ **수정+정리 완료** | d9eb7149 | 3차 PASS |

### 데이터 정리 실행 결과 (2026-03-08)
- overallStatus 불일치 수정: **33건** (status=failed → overallStatus=error)
- BUG-2 실패 파일 cleanup: **32건** (고객 참조 제거 + 디스크 파일 삭제 + DB 레코드 삭제)
- customers.documents 중복 제거: **45건** (캐치업코리아)
- customers.documents 고아 참조 제거: **966건** (캐치업코리아 963건, 곽승철/김보성/안영미 각 1건)
- 캐치업코리아 정합성 확인: documents 배열 384건 = files 컬렉션 384건 (**완전 일치**)

### 전체 배포: 2026-03-08 완료 (deploy_all.sh 14/14 단계)

> **핵심 발견 (4차 검증)**: BUG-2의 32건과 BUG-3의 32건은 **완전히 동일한 문서**. 즉 DuplicateKeyError로 실패한 파일이 cleanup 안 된 채 남아있고, 이후 overallStatus가 "processing"으로 덮어씌워진 것.

## 관련 파일

| 파일 | 역할 |
|---|---|
| `backend/api/aims_api/routes/customers-routes.js` | 고객-문서 연결 ($push) |
| `backend/api/aims_api/routes/documents-routes.js` | 문서 삭제 API, set-annual-report/set-cr-flag API |
| `backend/api/aims_api/routes/insurance-contracts-routes.js` | 계약 관련 (동일 CUSTOMERS_COLLECTION 버그 수정됨) |
| `backend/api/document_pipeline/routers/doc_prep_main.py` | 문서 처리 파이프라인 메인 |
| `backend/api/document_pipeline/workers/upload_worker.py` | 업로드 워커 (재시도 로직) |
| `backend/api/document_pipeline/workers/ocr_worker.py` | OCR 워커 |
