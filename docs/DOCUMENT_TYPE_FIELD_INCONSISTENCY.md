# document_type 필드 이중 저장 문제

> 작성일: 2026-03-27 | 상태: **구현 완료 (Phase 1~3), Phase 4 보류** | 분석: Alex, Gini

## 문제 요약

문서의 유형(document_type)이 DB에 **두 곳**에 나뉘어 저장되며, 경로에 따라 어느 필드에 값이 있는지가 다르다. 정렬은 한쪽만 참조하고, 화면 표시는 다른 쪽을 참조하여 **정렬과 표시가 불일치**한다.

## 현상

### 사용자 경험
- 전체 문서 보기에서 "문서 유형" 칼럼으로 정렬하면 순서가 뒤섞임
- 예: "통장사본"(ㅌ) 뒤에 "신분증"(ㅅ)이 나오고, "-"(미분류)가 중간에 섞임
- 마지막 페이지에서 "분류불가" 문서가 "-" 뒤에 나옴 (가나다순 위반)

### 데이터 불일치 실측 (2026-03-27)

| 문서 | `document_type` (top-level) | `meta.document_type` | 화면 표시 | 정렬 기준 |
|------|---------------------------|---------------------|----------|----------|
| 마장사은품.pptx | **null** | unclassifiable | 분류불가 | 미지정(맨 뒤) |
| 안영미신분증.ppt | **null** | id_card | 신분증 | 미지정(맨 뒤) |
| 암검진067.jpg | null | null | - | 미지정(맨 뒤) |
| 캐치업포멧.ai | null | null | - | 미지정(맨 뒤) |

- `document_type`(top-level)이 null인 문서: **749건 (전체의 33%)**
- 이 중 `meta.document_type`에 실제 값이 있는 문서: 다수

## 근본 원인

### 1. 두 필드의 역할

| 필드 | 위치 | 용도 |
|------|------|------|
| `document_type` | top-level | 정렬, 통계, 유형 변경 API, AR/CRS 플래그 |
| `meta.document_type` | meta 하위 | 파이프라인 내부 AI 분류 결과 저장 |

의도된 SSoT는 **top-level `document_type`**이다 (통계 집계, 유형 CRUD, AI 분류 API 모두 이 필드 사용).

### 2. 파이프라인 경로별 저장 불일치

| 파이프라인 경로 | `meta.document_type` 저장 | top-level `document_type` 저장 | 비고 |
|---------------|:------------------------:|:-----------------------------:|------|
| 레거시 일반 (`_step_update_meta_to_db`) | O | **X (누락!)** | **버그 원인** |
| xPipe 경로 | O | O | 정상 |
| AR/CRS 감지 경로 | X | O | AR/CRS만 저장 |
| OCR 워커 | O | O | 정상 (meta.document_type → top-level 복사) |
| 수동 유형 변경 API | X | O | 사용자가 직접 변경 |

**레거시 일반 경로**(`doc_prep_main.py` `_step_update_meta_to_db`, 라인 1437~1462)에서 `meta.document_type`은 저장하지만 **top-level `document_type`을 저장하지 않는 것**이 버그의 근본 원인이다.

### 3. API/프론트엔드의 우회 코드 (6곳)

두 필드 불일치를 우회하기 위해 API 응답 생성 시 이미 fallback 패턴이 6곳에 적용되어 있다:

```javascript
// 이 패턴이 6곳에 반복됨
document_type: doc.document_type || (doc.meta && doc.meta.document_type) || null
```

| 위치 | 파일:라인 |
|------|----------|
| 1 | `documentStatusHelper.js:92` |
| 2 | `documents-routes.js:681` |
| 3 | `documents-routes.js:966` |
| 4 | `documents-routes.js:1622` (정렬 파이프라인 — $ifNull 추가됨) |
| 5 | `documents-routes.js:1888` |
| 6 | `customers-routes.js:2564` |

**화면 표시가 정상적으로 보이는 이유**는 이 fallback 덕분이다. 하지만 **정렬 파이프라인**은 MongoDB aggregate 내부에서 `$document_type` 단일 필드만 참조하므로, fallback이 적용되지 않아 정렬이 깨진다.

### 4. 정렬 vs 표시 불일치 구조

```
[정렬] MongoDB aggregate → $match → $sort by document_type (top-level)
                                        ↑ null → 미지정 취급 → 맨 뒤

[표시] API 응답 → doc.document_type || doc.meta.document_type
                                        ↑ meta에서 가져옴 → "분류불가", "신분증" 등 표시

→ 정렬은 null(미지정)로 처리하는데 화면에는 실제 유형이 표시됨 → 사용자에게 정렬이 깨져 보임
```

## 현재 적용된 임시 조치

정렬 파이프라인에 `$ifNull` fallback 추가 (아직 미커밋):
```javascript
default: { $ifNull: ['$document_type', '$meta.document_type'] }
```

**이것은 미봉책이다.** 두 필드 불일치 자체를 해결하지 않으며, 제거하면 문제가 즉시 재현된다.

## 근본 해결 방향 (설계 필요)

### 필수 작업 3개

1. **레거시 파이프라인 수정** — `_step_update_meta_to_db`에서 top-level `document_type`도 함께 저장
   - 파일: `backend/api/document_pipeline/routers/doc_prep_main.py`
   - 위치: 라인 1437~1462 (meta_update 딕셔너리)
   - 예상 수정: 1줄 추가 (`"document_type": ctx.ai_document_type`)

2. **기존 749건 마이그레이션** — `document_type=null`이고 `meta.document_type`에 값이 있는 문서에 대해 top-level로 복사
   ```javascript
   db.files.updateMany(
     { document_type: null, 'meta.document_type': { $ne: null } },
     [{ $set: { document_type: '$meta.document_type' } }]
   )
   ```

3. **API fallback 코드 6곳 정리** — 1, 2 완료 후 `|| doc.meta.document_type` 우회 코드 제거

### 선택 작업

4. **정렬 파이프라인 `$ifNull` 유지 여부** — 방어 코드로 남길 수도 있으나, SSoT가 확립되면 불필요

## 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `backend/api/document_pipeline/routers/doc_prep_main.py` | 레거시 경로 document_type 저장 추가 |
| `backend/scripts/` (신규) | 마이그레이션 스크립트 |
| `backend/api/aims_api/lib/documentStatusHelper.js` | fallback 제거 |
| `backend/api/aims_api/routes/documents-routes.js` | fallback 제거 (3곳) |
| `backend/api/aims_api/routes/customers-routes.js` | fallback 제거 (1곳) |

## 리스크

- 마이그레이션 시 `meta.document_type` 값이 잘못된 문서가 있으면 top-level로 전파됨
- AR/CRS 문서는 `document_type`이 이미 정상 저장되어 있으므로 마이그레이션에서 제외 필요
- fallback 제거 후 아직 미처리된 문서가 있으면 화면에 유형이 표시되지 않을 수 있음

---

## 작업 결과 보고 (2026-03-28)

### 설계 방향 변경

초기 분석에서는 "레거시 경로에 top-level 저장 추가"(두 곳에 쓰고 동기화)를 제안했으나, 이는 **미봉책**이었다.

**근본 해결:** `meta.document_type` 쓰기/읽기를 **완전히 제거**하고, top-level `document_type`만 SSoT로 사용.
두 곳에 쓰고 동기화하는 방식은 구조적으로 동기화 문제가 재발하므로 금지.

상세 설계: `docs/DOCUMENT_DATA_SSOT_DESIGN.md` (전체 문서 데이터 SSoT 구조 설계안)

### 실행 결과

| Phase | 내용 | 상태 | 커밋 |
|-------|------|------|------|
| 설계 | 8개 칼럼 전수 진단 + SSoT 설계안 | 완료 | `d001a1f6` |
| **1** | 파이프라인 7곳 `meta.document_type` 쓰기 삭제 → top-level 교체 | 완료 | `ef33497a` |
| **2** | DB 마이그레이션 — 723건 `document_type` null → `meta.document_type` 값 복사 | 완료 | `c69a0ec8` |
| **3** | API fallback 18곳 제거 + 임베딩 읽기 경로 수정 + 테스트 수정 | 완료 | `c69a0ec8` |
| **4** | DB에서 `meta.document_type` 필드 $unset | **보류** | 안정화 후 실행 |

### 수정 파일 (총 14개)

**Phase 1 — 파이프라인 (쓰기 제거)**
| 파일 | 변경 |
|------|------|
| `doc_prep_main.py` | W1: 레거시 경로 `meta.document_type` 삭제 → top-level 교체, W2: xPipe 경로 `meta.document_type` 삭제 |
| `adapter.py` | W3,W4: AR/CRS 훅 `meta.document_type` 삭제 |
| `pdf_conversion_worker.py` | W5: PDF 워커 `meta.document_type` 2건 삭제 |
| `ocr_worker.py` | W6: OCR 워커 `meta.document_type` 삭제 → top-level 교체 |
| `reclassify_from_db.py` | W7: 재분류 도구 `meta.document_type` 쓰기 삭제 + R18: projection 제거 |
| `reembed_all.py` | R14,R15: 임베딩 읽기 경로 `meta.document_type` → top-level 교체 |
| `test_insurance_adapter_hooks.py` | T-P1-1,2: `meta.document_type` assert → `document_type` assert |
| `test_characterization_process_pipeline.py` | T-P1-3: 동일 |
| `test_pipeline_e2e.py` | T-P1-4: 동일 |

**Phase 2 — 마이그레이션**
| 파일 | 변경 |
|------|------|
| `backfill_document_type.py` (신규) | 멱등성 보장 마이그레이션 스크립트 |

**Phase 3 — API fallback 제거**
| 파일 | 변경 |
|------|------|
| `documentStatusHelper.js` | R1,R9: fallback 제거 |
| `documents-routes.js` | R2,R3,R4,R7,R8,R10,R11,R12,R17: fallback 8곳 + 정렬 $ifNull 제거 |
| `customers-routes.js` | R5,R13,RC1: fallback 3곳 제거 |
| `test_chunk_by_doc_type.py` | T1: fixture + 주석 수정 |

### Phase 4 보류 사항

`meta.document_type` 필드가 DB에 남아 있지만, **코드가 더 이상 읽지도 쓰지도 않으므로 동작에 영향 없음.**
1주 이상 안정화 확인 후 아래 쿼리로 정리 가능:

```javascript
db.files.updateMany(
  { 'meta.document_type': { $exists: true } },
  { $unset: { 'meta.document_type': '', 'meta.document_type_auto': '', 'meta.document_type_confidence': '' } }
)
```

### 검증 결과

- 백엔드 테스트 **1120개 전체 PASS**
- 파이프라인 Python 문법 검증 통과
- grep 전수 조사: `meta.document_type` 런타임 참조 **0건** (테스트 단언만 잔존)
- DB 마이그레이션 잔여: **0건**
