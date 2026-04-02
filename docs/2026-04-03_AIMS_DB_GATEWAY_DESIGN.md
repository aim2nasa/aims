# aims_api 데이터 게이트웨이 설계안

> 작성일: 2026-04-03
> 목표: aims_api를 `files`/`customers` 컬렉션의 **유일한 데이터 게이트웨이**로 만든다
> 원칙: 다른 서비스는 aims_api HTTP API를 통해서만 데이터에 접근한다

---

## 1. 현재 직접 DB 접근 전수 목록

### 1.1 annual_report_api → files (65건)

AR/CRS 파싱 상태 관리와 결과 기록이 핵심. 가장 많은 직접 접근.

| 파일 | 라인 | 연산 | R/W | 용도 |
|------|------|------|:---:|------|
| `routes/background.py` | 55, 74 | find_one | R | AR 파일 조회 (경로, 상태 확인) |
| | 84, 98, 142, 225, 238 | update_one | W | ar_parsing_status → error 마킹 |
| | 115 | update_one | W | 중복 AR → completed 마킹 |
| | 209 | update_one | W | AR 파싱 결과 메타데이터 기록 |
| | 283 | find | R | 미파싱 AR 문서 배치 조회 |
| | 301 | update_one | W | customerId backfill |
| | 334, 346, 373, 438, 446, 459 | update_one | W | 배치 파싱 상태 전이 |
| | 539, 553, 635, 679 | find_one/find | R | 큐 정합성 체크, 재파싱 |
| `routes/cr_background.py` | 89 | find_one | R | CRS 파일 조회 |
| | 101, 112, 173, 258, 271 | update_one | W | cr_parsing_status → error |
| | 152, 154 | update_one | W | CRS 복구/완료 마킹 |
| | 250 | update_one | W | CRS 파싱 결과 기록 |
| | 336, 361, 438 | find_one/find | R | CRS 상태 조회 |
| | 346, 369, 481 | update_one | W | CRS 배치 상태 전이 |
| `services/db_writer.py` | 322, 338, 428, 440, 1108, 1123, 1213 | find/find_one | R | 파싱 갭 검출, file_hash 조회 |
| `main.py` | 82, 92, 122, 141 | find | R | 스케줄러: 미파싱/고아/타임아웃 문서 스캔 |
| | 113, 130, 150 | update_one | W | 고아 문서 상태 리셋 (pending) |
| | 231, 241, 271, 290 | find | R | CRS 스케줄러 스캔 |
| | 262, 279, 299 | update_one | W | CRS 고아/타임아웃 리셋 |
| | 324, 354, 456 | update_one | W | CRS 처리 중/에러/재시도 |
| | 543 | find_one | R | 큐 정합성 체크 |

**패턴 요약:** `ar_parsing_status`/`cr_parsing_status` 필드의 상태 머신 (pending→processing→completed/error)

### 1.2 annual_report_api → customers (37건)

| 파일 | 라인 | 연산 | R/W | 용도 |
|------|------|------|:---:|------|
| `services/db_writer.py` | 89-90, 293, 516, 653, 868, 1080, 1282 | find_one | R | 고객 존재 확인, AR/CRS 배열 조회 |
| | 205 | update_one | W | `$push annual_reports[]` — AR 파싱 결과 추가 |
| | 572 | update_one | W | `$set annual_reports` — AR 삭제 후 배열 교체 |
| | 755 | update_one | W | `$set annual_reports` — 중복 제거 후 배열 교체 |
| | 990 | update_one | W | `$push customer_reviews[]` — CRS 결과 추가 |
| | 1315 | update_one | W | `$set customer_reviews` — CRS 삭제 후 배열 교체 |
| `routes/background.py` | 108, 519, 668 | find_one | R | 중복 체크, 권한 확인 |
| `routes/cr_background.py` | 122, 318, 470 | find_one | R | CRS 중복 체크, 권한 확인 |
| | 147 | update_one | W | `customer_reviews.$.product_name` 복구 |
| `routes/query.py` | 125, 226, 363, 499, 668 | find_one | R | 권한 확인 (meta.created_by) |
| | 561 | update_one | W | `annual_reports.<idx>.registered_at` 설정 |
| `routes/parse.py` | 225 | find_one | R | 고객명 조회 (OCR 보정용) |
| | 358, 472 | find_one | R | 권한 확인 |
| `routes/cr_routes.py` | 315, 438, 547 | find_one | R | 권한 확인 |
| `main.py` | 105, 254 | find_one | R | 고아 복구: AR/CRS 결과 존재 여부 |

### 1.3 document_pipeline → files (~60건)

파이프라인 전 과정에서 문서 상태를 직접 관리. **가장 빈도가 높고 가장 대체 난이도가 높음.**

| 파일 | 라인 | 연산 | R/W | 용도 |
|------|------|------|:---:|------|
| `services/mongo_service.py` | 57 | insert_one | W | 파일 문서 초기 생성 |
| | 64 | find_one_and_update | W | 범용 파일 업데이트 헬퍼 |
| | 74 | find_one | R | 파일 조회 헬퍼 |
| `routers/doc_prep_main.py` | 458 | insert_one | W | 스트리밍 업로드 시 문서 생성 |
| | 471, 491, 562 | update_one | W | 저장 경로, 메타데이터, 크레딧 대기 |
| | 805 | update_one | W | AR 감지 결과 기록 |
| | 1018 | update_one | W | CRS 감지 결과 기록 |
| | 1086 | delete_one | W | 실패 시 문서 삭제 |
| | 1150 | update_one | W | 진행률/상태 업데이트 (매 스테이지) |
| | 1263~1966 | insert/update/find/delete | W/R | 파이프라인 전 단계 (20+ 지점) |
| | 2093~2759 | insert/update/find | W/R | xPipe 경로 (15+ 지점) |
| `routers/doc_display_name.py` | 204~503 | find_one/find/update_one | R/W | 별칭 생성/저장 |
| `routers/doc_summary.py` | 22 | find_one | R | 요약용 텍스트 조회 |
| `routers/smart_search.py` | 247 | find | R | 키워드 검색 |
| `workers/ocr_worker.py` | 110, 279, 365 | find_one/update_one | R/W | OCR 상태 관리 |
| `workers/pdf_conversion_worker.py` | 201~594 | find_one/find/update_one | R/W | PDF 변환 상태 관리 |

### 1.4 document_pipeline → customers (7건)

| 파일 | 라인 | 연산 | R/W | 용도 |
|------|------|------|:---:|------|
| `routers/doc_prep_main.py` | 1068 | update_one | **W** | 실패 시 고객 documents[] 에서 제거 |
| `routers/doc_display_name.py` | 252, 344 | find_one | R | 고객명 조회 (별칭 생성용) |
| `routers/smart_search.py` | 308 | find | R | 검색 결과 고객명 enrichment |
| `workers/ocr_worker.py` | 116, 379 | find_one | R | 고객명 조회 (요약/별칭 생성용) |
| `workers/pdf_conversion_worker.py` | 323 | find_one | R | 고객명 조회 (요약 생성용) |

### 1.5 aims_mcp → customers (25건, 3건 Write)

| 파일 | 라인 | 연산 | R/W | 용도 |
|------|------|------|:---:|------|
| `tools/customers.ts` | 211, 229, 233, 300 | find/countDocuments/aggregate/findOne | R | 고객 검색, 상세 조회 |
| | 392, 477, 491 | findOne | R | 중복 체크, 권한 확인 |
| | **428** | **insertOne** | **W** | **고객 생성** |
| | **543** | **updateOne** | **W** | **고객 수정** |
| `tools/memos.ts` | **138** | **updateOne** | **W** | **customers.memo 동기화** |
| | 158, 453 | findOne/find | R | 권한 확인, 고객 ID 목록 |
| `tools/annual_reports.ts` | 64, 169 | findOne | R | AR 조회 (권한 확인 + 데이터) |
| `tools/contracts.ts` | 332, 645, 659 | find | R | 계약 검색 (annual_reports 내장) |
| `tools/customer_reviews.ts` | 123, 262, 499 | findOne/find | R | CRS 조회 |
| `tools/birthdays.ts` | 96 | aggregate | R | 생일 고객 검색 |
| `tools/network.ts` | 163, 205, 334 | findOne/find | R | 관계 네트워크 enrichment |
| `tools/relationships.ts` | 188, 349, 387, 402, 508, 537 | findOne/find | R | 권한 확인, 관계 enrichment |
| `tools/utilities.ts` | 515 | findOne | R | 고객명 중복 체크 |

### 1.6 aims_mcp → customer_memos (9건, 3건 Write)

| 파일 | 라인 | 연산 | R/W | 용도 |
|------|------|------|:---:|------|
| `tools/memos.ts` | 127, 246, 253, 317, 387, 480 | find/findOne/countDocuments | R | 메모 조회/검색 |
| | **192** | **insertOne** | **W** | **메모 생성** |
| | **330** | **deleteOne** | **W** | **메모 삭제** |
| | **400** | **updateOne** | **W** | **메모 수정** |

### 1.7 aims_mcp → customer_relationships (10건, 4건 Write)

| 파일 | 라인 | 연산 | R/W | 용도 |
|------|------|------|:---:|------|
| `tools/relationships.ts` | 207, 270, 374, 415, 530 | findOne/find | R | 중복 체크, 역방향 조회 |
| | **265** | **insertOne** | **W** | **관계 생성 (정방향)** |
| | **291** | **insertOne** | **W** | **관계 생성 (역방향 자동)** |
| | **444** | **deleteOne** | **W** | **관계 삭제** |
| | **451** | **deleteMany** | **W** | **역방향 관계 캐스케이드 삭제** |
| `tools/network.ts` | 176, 303 | find | R | 관계 그래프 조회 |
| `tools/customers.ts` | 324 | countDocuments | R | 관계 수 카운트 |

### 1.8 aims_mcp → files (7건, 모두 Read)

| 파일 | 라인 | 연산 | R/W | 용도 |
|------|------|------|:---:|------|
| `db.ts` | 84 | find | R | 파일 ID 유효성 검증 |
| `tools/customers.ts` | 313 | countDocuments | R | 고객별 문서 수 |
| `tools/documents.ts` | 274, 356, 378, 443 | findOne/find/countDocuments | R | 문서 조회/검색 |
| `tools/utilities.ts` | 158, 420 | aggregate | R | 스토리지/OCR 크레딧 계산 |

### 1.9 aims_rag_api (모두 Read-only)

| 파일 | 라인 | 컬렉션 | 연산 | 용도 |
|------|------|--------|------|------|
| `hybrid_search.py` | 295 | files | find | 고객별 문서 ID 목록 (Qdrant 프리필터) |
| | 344 | files | find | 엔티티 키워드 검색 |
| | 91, 104 | customers | find_one/find | 엔티티명으로 고객 매칭 |
| | 143, 182 | customers | find_one/find | 고객명 조회 (관계 enrichment) |
| | 152 | customer_relationships | find | 관계 그래프 확장 |

---

## 2. 대체 API 엔드포인트 설계

### 2.1 설계 원칙

1. **Internal API 패턴 재사용** — 기존 `/api/internal/*` 패턴 + `x-api-key` 인증
2. **Batch 지원** — N+1 호출 방지를 위해 배치 조회/업데이트 엔드포인트 제공
3. **도메인별 그룹핑** — files 상태 관리, customers 데이터, AR/CRS 파싱 결과
4. **기존 엔드포인트 재사용** — 이미 있는 CRUD는 새로 만들지 않음

### 2.2 신규 Internal API 엔드포인트

#### Group A: 파일 상태 관리 (annual_report_api + document_pipeline 공용)

```
PATCH /api/internal/files/:id/parsing-status
  Body: { field: "ar_parsing_status"|"cr_parsing_status", status, error?, extra_fields? }
  → files.update_one({ _id }, { $set: { [field]: status, ... } })
  용도: AR/CRS 파싱 상태 전이 (pending/processing/completed/error)
  대체: background.py 84,98,115,142,209,225,238,301,334,346,373,438,446,459,679
        cr_background.py 101,112,152,154,173,250,258,271,346,369,481
        main.py 113,130,150,262,279,299,324,354,456

PATCH /api/internal/files/:id/metadata
  Body: { fields: { displayName, document_type, ... } }
  → files.update_one({ _id }, { $set: fields })
  용도: 파이프라인 메타데이터 기록
  대체: doc_prep_main.py 471,491,562,805,1018,1486,1640,1754,1760,1766,1791,1825
        pdf_conversion_worker.py 201,274,290,390,447

PATCH /api/internal/files/:id/progress
  Body: { progress, progressStage, progressMessage, status?, overallStatus? }
  → files.update_one({ _id }, { $set: ... })
  용도: 실시간 진행률 업데이트
  대체: doc_prep_main.py 1150,1263,1334,1368,1390,1869,1917,1966 외 다수

POST /api/internal/files
  Body: { ownerId, customerId?, originalName, ... }
  → files.insert_one(...)
  → return { id }
  용도: 파이프라인에서 문서 레코드 초기 생성
  대체: mongo_service.py 57, doc_prep_main.py 458,1290,2093

DELETE /api/internal/files/:id
  → files.delete_one({ _id })
  용도: 실패 시 정리
  대체: doc_prep_main.py 1086,1474
```

#### Group B: 파일 조회 (Read-only, 배치 지원)

```
GET /api/internal/files/:id
  → files.find_one({ _id })
  대체: background.py 55,74,539,635, cr_background.py 89,336,438
        doc_prep_main.py 1340,1857,1947,2155,2547 등

POST /api/internal/files/query
  Body: { filter, projection?, sort?, limit? }
  → files.find(filter, projection).sort(sort).limit(limit)
  용도: 배치 조회 (미파싱 문서 스캔, 고아 검출 등)
  대체: background.py 283,553, cr_background.py 361
        main.py 82,92,122,141,231,241,271,290
        smart_search.py 247, hybrid_search.py 295,344

POST /api/internal/files/by-customer
  Body: { customerId, filters? }
  → files.find({ customerId, ...filters })
  용도: 고객별 문서 목록
  대체: hybrid_search.py 295 (Qdrant 프리필터용)
```

#### Group C: 고객 데이터 (AR/CRS 결과 관리)

```
POST /api/internal/customers/:id/annual-reports
  Body: { report_data }
  → customers.update_one({ _id }, { $push: { annual_reports: report_data } })
  + SSE broadcast (ar 채널)
  대체: db_writer.py 205

DELETE /api/internal/customers/:id/annual-reports
  Body: { source_file_ids: [...] }
  → customers.update_one({ _id }, { $set: { annual_reports: filtered } })
  + SSE broadcast
  대체: db_writer.py 572, 755

POST /api/internal/customers/:id/customer-reviews
  Body: { review_data }
  → customers.update_one({ _id }, { $push: { customer_reviews: review_data } })
  + SSE broadcast (cr 채널)
  대체: db_writer.py 990

DELETE /api/internal/customers/:id/customer-reviews
  Body: { source_file_ids: [...] }
  → customers.update_one({ _id }, { $set: { customer_reviews: filtered } })
  대체: db_writer.py 1315

PATCH /api/internal/customers/:id/annual-reports/:index
  Body: { registered_at } 또는 { product_name } 등 부분 업데이트
  → customers.update_one({ _id }, { $set: { `annual_reports.${index}.field`: value } })
  대체: query.py 561, cr_background.py 147
```

#### Group D: 고객 조회 (Read-only, 배치 지원)

```
GET /api/internal/customers/:id/name
  → customers.find_one({ _id }, { "personal_info.name": 1 })
  용도: 별칭 생성, 요약 프롬프트에 고객명 제공
  대체: doc_display_name.py 252,344, ocr_worker.py 116,379
        pdf_conversion_worker.py 323, parse.py 225
        hybrid_search.py 143

POST /api/internal/customers/batch-names
  Body: { ids: [...] }
  → customers.find({ _id: { $in: ids } }, { "personal_info.name": 1 })
  용도: 검색 결과 enrichment, 관계 그래프
  대체: smart_search.py 308, hybrid_search.py 182
        network.ts 205,334, relationships.ts 537

GET /api/internal/customers/:id/ownership
  → customers.find_one({ _id, "meta.created_by": userId })
  → return { exists: boolean }
  용도: 권한 확인 (annual_report_api 전 라우트에서 반복)
  대체: background.py 519,668, cr_background.py 318,470
        query.py 125,226,363,499,668, parse.py 358,472
        cr_routes.py 315,438,547

POST /api/internal/customers/resolve-by-name
  Body: { name, userId }
  → customers.find_one({ "personal_info.name": name, "meta.created_by": userId })
  용도: RAG 검색에서 엔티티명으로 고객 매칭
  대체: hybrid_search.py 91,104
```

#### Group E: aims_mcp 전용 (기존 CRUD 재사용)

aims_mcp의 고객/메모/관계 CRUD는 **이미 aims_api에 동등한 엔드포인트가 존재**한다.

| aims_mcp 직접 DB 접근 | 기존 aims_api 엔드포인트 | 비고 |
|----------------------|------------------------|------|
| customers.insertOne (428) | `POST /api/customers` | `authenticateJWTorAPIKey` 이미 지원 |
| customers.updateOne (543) | `PUT /api/customers/:id` | 동일 |
| customer_memos.insertOne (192) | `POST /api/customers/:id/memos` | 동일 |
| customer_memos.deleteOne (330) | — | **신규 필요**: `DELETE /api/customers/:id/memos/:memoId` |
| customer_memos.updateOne (400) | — | **신규 필요**: `PUT /api/customers/:id/memos/:memoId` |
| relationships.insertOne (265,291) | — | **신규 필요**: `POST /api/customer-relationships` |
| relationships.deleteOne/Many (444,451) | — | **신규 필요**: `DELETE /api/customer-relationships/:id` |
| customers.memo sync (138) | — | **제거**: API 엔드포인트에서 내부적으로 처리 |

aims_mcp Read 접근은 기존 aims_api 엔드포인트 + Group D 배치 API로 대체.

### 2.3 기존 엔드포인트 재사용 가능 목록

| 현재 접근 | 기존 엔드포인트 | 인증 |
|-----------|----------------|------|
| 고객 CRUD | `GET/POST/PUT/DELETE /api/customers/*` | authenticateJWTorAPIKey |
| 문서 목록 | `GET /api/documents` | authenticateJWT |
| 문서 삭제 | `DELETE /api/documents/:id` | authenticateJWT |
| 문서 상태 | `GET /api/documents/:id/status` | authenticateJWT |
| 크레딧 체크 | `POST /api/internal/check-credit` | x-api-key |
| OCR 쿼터 | `POST /api/internal/ocr/check-quota` | (네트워크 격리) |
| SSE 트리거 | `POST /api/webhooks/*` | x-api-key |

---

## 3. 순환 의존 해결

### 3.1 현재 순환 구조

```
aims_api ──호출──→ document_pipeline ──콜백──→ aims_api
aims_api ──호출──→ annual_report_api ──콜백──→ aims_api
aims_api ──호출──→ aims_rag_api ──────콜백──→ aims_api
```

### 3.2 순환의 본질 분석

| 호출 방향 | 용도 | 본질 |
|-----------|------|------|
| aims_api → document_pipeline | 스마트 서치, 배치 displayName | **작업 요청** |
| document_pipeline → aims_api | 크레딧 체크, 진행률 SSE, 완료 통보 | **결과 보고 + 자원 조회** |
| aims_api → annual_report_api | AR/CRS 파싱 요청 | **작업 요청** |
| annual_report_api → aims_api | 모델 설정, SSE 트리거, 로그 | **설정 조회 + 결과 보고** |
| aims_api → aims_rag_api | (없음 — aims_mcp가 호출) | — |
| aims_rag_api → aims_api | 크레딧 체크, 모델 설정, 토큰 로깅 | **자원 조회 + 결과 보고** |

### 3.3 해결 전략: "조회는 API, 보고는 이벤트"

#### 원칙
- **자원 조회** (크레딧, 모델 설정, 고객명): → aims_api Internal API 호출 (유지)
- **결과 보고** (진행률, 완료, SSE): → aims_api Webhook 호출 (유지, 이미 이 패턴)
- **DB 직접 접근**: → 위 두 가지로 완전 대체

#### 구체적 변경

**annual_report_api:**
```
[Before] db["files"].update_one({ _id }, { ar_parsing_status: "completed" })
[After]  HTTP PATCH /api/internal/files/{id}/parsing-status
         Body: { field: "ar_parsing_status", status: "completed", extra_fields: { displayName: ... } }
```

```
[Before] db["customers"].update_one({ _id }, { $push: { annual_reports: data } })
[After]  HTTP POST /api/internal/customers/{id}/annual-reports
         Body: { report_data: data }
         → aims_api가 내부적으로 push + SSE broadcast
```

**document_pipeline:**
```
[Before] files_collection.update_one({ _id }, { progress: 50, progressStage: "extracting" })
[After]  HTTP PATCH /api/internal/files/{id}/progress
         Body: { progress: 50, progressStage: "extracting" }
```

이 패턴으로 변경하면:
- 순환 호출 구조는 **유지**되지만 (작업 요청 → 결과 보고는 본질적으로 양방향)
- **DB 접근은 단방향** (오직 aims_api만)
- 순환의 해악(스키마 불일치, 우회)이 제거됨

### 3.4 성능 우려와 대책

| 우려 | 대책 |
|------|------|
| 파이프라인 매 스테이지마다 HTTP 호출 오버헤드 | 로컬호스트 HTTP ≈ 1ms. 현재 파이프라인 1문서 수 초~수 분. 무시 가능 |
| OCR 워커 대량 처리 시 aims_api 부하 | 이미 `/api/internal/ocr/check-quota` 등 HTTP 호출 중. 추가 부하 미미 |
| aims_api 장애 시 파이프라인 중단 | 현재도 동일 (크레딧 체크 실패 시 fail-open). Internal API에 동일 fail-open 적용 |
| 배치 스캐너 (main.py) 다수 문서 조회 | `POST /api/internal/files/query`로 1회 배치 조회. N+1 아님 |

---

## 4. 작업 순서 (위험도 낮은 것부터)

### Phase 1: Read-only 전환 (위험도: LOW)

읽기 전용 접근을 API로 전환. DB 쓰기가 없어 데이터 정합성 위험 없음.

| 단계 | 대상 | 접근 수 | 작업 내용 |
|:----:|------|:-------:|-----------|
| 1-1 | **aims_rag_api** (전체) | 5건 | hybrid_search.py의 files/customers/relationships 읽기 → Internal API |
| 1-2 | **document_pipeline** customers 읽기 | 6건 | 고객명 조회 → `GET /api/internal/customers/:id/name` |
| 1-3 | **aims_mcp** files 읽기 | 7건 | 문서 조회/카운트 → 기존 documents API 또는 Internal API |
| 1-4 | **annual_report_api** customers 읽기 | 20건 | 권한 확인 → `/api/internal/customers/:id/ownership`, 고객명 → `/name` |

**예상 소요:** Internal API 6개 신규 + 클라이언트 코드 38건 변경
**검증:** 기존 동작과 동일한 응답 확인 (golden master 비교)

### Phase 2: aims_mcp Write 전환 (위험도: LOW-MED)

MCP 도구의 CRUD를 기존 aims_api 엔드포인트로 전환. 트래픽 적음 (AI 호출 시에만).

| 단계 | 대상 | 접근 수 | 작업 내용 |
|:----:|------|:-------:|-----------|
| 2-1 | customers CRUD | 3건 W | insertOne/updateOne → `POST/PUT /api/customers/*` |
| 2-2 | customer_memos CRUD | 3건 W | → 기존 + 신규 `DELETE/PUT /api/customers/:id/memos/:memoId` |
| 2-3 | customer_relationships CRUD | 4건 W | → 신규 `POST/DELETE /api/customer-relationships/*` |
| 2-4 | customers.memo 동기화 (138) | 1건 W | 제거 — API 측에서 메모 CRUD 시 자동 동기화 |

**예상 소요:** aims_api에 메모/관계 엔드포인트 3개 신규 + aims_mcp 클라이언트 전환
**검증:** MCP 도구 호출 후 DB 상태 + SSE 알림 확인

### Phase 3: annual_report_api Write 전환 (위험도: MED)

AR/CRS 파싱 결과 기록을 API 경유로 전환. 파싱 워크플로우 핵심 경로.

| 단계 | 대상 | 접근 수 | 작업 내용 |
|:----:|------|:-------:|-----------|
| 3-1 | files parsing-status 쓰기 | ~35건 W | → `PATCH /api/internal/files/:id/parsing-status` |
| 3-2 | customers AR/CRS push/set | 6건 W | → `POST/DELETE /api/internal/customers/:id/annual-reports` 등 |
| 3-3 | files customerId backfill | 1건 W | → `PATCH /api/internal/files/:id/metadata` |

**예상 소요:** Internal API 3개 신규 + annual_report_api 클라이언트 전면 전환
**검증:** AR/CRS 업로드 → 파싱 → 완료 E2E 테스트, 스케줄러 고아 복구 테스트

### Phase 4: document_pipeline Write 전환 (위험도: HIGH)

파이프라인의 모든 DB 쓰기를 API 경유로 전환. **가장 크고 가장 위험한 단계.**

| 단계 | 대상 | 접근 수 | 작업 내용 |
|:----:|------|:-------:|-----------|
| 4-1 | 문서 생성 (insert_one) | 3건 | → `POST /api/internal/files` |
| 4-2 | 진행률 업데이트 | ~15건 | → `PATCH /api/internal/files/:id/progress` |
| 4-3 | 메타데이터 기록 | ~20건 | → `PATCH /api/internal/files/:id/metadata` |
| 4-4 | 문서 삭제 | 2건 | → `DELETE /api/internal/files/:id` |
| 4-5 | customers documents[] 제거 | 1건 | → 기존 webhook 또는 신규 internal endpoint |

**핵심 위험:**
- doc_prep_main.py 하나에 40+ 접근 지점이 집중
- 파이프라인 성능에 HTTP 오버헤드 영향 (단, 로컬호스트 1ms 수준)
- 트랜잭션적 일관성 (insert 후 update가 이어지는 패턴)

**대책:**
- Phase 4를 다시 4-1~4-5로 세분화하여 점진 전환
- 각 서브페이즈마다 golden master shadow run으로 회귀 검증
- 문서 1건 업로드 → 전체 파이프라인 E2E 테스트

### Phase 5: 정리 및 강제

| 단계 | 작업 |
|:----:|------|
| 5-1 | Python 서비스에서 MongoDB 직접 연결 코드 제거 (DB handle 자체를 제거) |
| 5-2 | `@aims/shared-schema`에 Python 버전 추가 또는 OpenAPI 스키마 공유 |
| 5-3 | Internal API에 rate-limiting + 모니터링 추가 |
| 5-4 | 아키텍처 테스트: CI에서 Python 서비스의 `db[` 패턴 grep → 0건 강제 |

---

## 5. 전체 로드맵 요약

```
Phase 1 (LOW)      Phase 2 (LOW-MED)    Phase 3 (MED)        Phase 4 (HIGH)       Phase 5
Read-only 전환      aims_mcp Write       AR/CRS Write         Pipeline Write       정리/강제
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
aims_rag_api 5건    customers 3건W       files status 35건W   files insert 3건     DB handle 제거
pipeline 6건R       memos 3건W           customers AR 6건W    progress 15건W       아키텍처 테스트
aims_mcp 7건R       relationships 4건W   files backfill 1건W  metadata 20건W       OpenAPI 스키마
AR_api 20건R                                                  delete 2건
                                                              customers 1건W
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
신규 API: 6개       신규 API: 3개        신규 API: 3개        신규 API: 3개        CI 규칙: 1개
변경: 38건          변경: 11건           변경: 42건           변경: 41건+
```

### 신규 Internal API 총 목록 (15개)

| # | Method | Path | 용도 | Phase |
|:-:|--------|------|------|:-----:|
| 1 | GET | `/api/internal/files/:id` | 단건 파일 조회 | 1 |
| 2 | POST | `/api/internal/files/query` | 배치 파일 조회 (필터) | 1 |
| 3 | POST | `/api/internal/files/by-customer` | 고객별 파일 목록 | 1 |
| 4 | GET | `/api/internal/customers/:id/name` | 고객명 조회 | 1 |
| 5 | POST | `/api/internal/customers/batch-names` | 배치 고객명 조회 | 1 |
| 6 | GET | `/api/internal/customers/:id/ownership` | 권한 확인 | 1 |
| 7 | POST | `/api/internal/customers/resolve-by-name` | 이름으로 고객 매칭 | 1 |
| 8 | DELETE | `/api/customers/:id/memos/:memoId` | 메모 삭제 | 2 |
| 9 | PUT | `/api/customers/:id/memos/:memoId` | 메모 수정 | 2 |
| 10 | POST/DELETE | `/api/customer-relationships/*` | 관계 CRUD | 2 |
| 11 | PATCH | `/api/internal/files/:id/parsing-status` | AR/CRS 파싱 상태 | 3 |
| 12 | POST | `/api/internal/customers/:id/annual-reports` | AR 결과 추가 | 3 |
| 13 | DELETE | `/api/internal/customers/:id/annual-reports` | AR 결과 삭제 | 3 |
| 14 | POST | `/api/internal/files` | 파일 문서 생성 | 4 |
| 15 | PATCH | `/api/internal/files/:id/progress` | 진행률 업데이트 | 4 |

> **`PATCH /api/internal/files/:id/metadata`**, **`DELETE /api/internal/files/:id`** 는 Phase 3-4 공용.
> CRS 엔드포인트는 AR과 동일 패턴 (`/customer-reviews`).

---

## 6. 한 줄 요약

> Phase 1(Read-only)부터 시작하면 **38건 접근을 위험 없이 전환**할 수 있고, 이것만으로도 aims_rag_api는 DB 직접 연결을 완전히 제거할 수 있다.
