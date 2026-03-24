---
name: database-skill
description: AIMS 데이터베이스 가이드. MongoDB, 컬렉션, 쿼리, DB, 스키마 작업 시 자동 사용
---

# AIMS 데이터베이스 가이드

> MongoDB 쿼리, 컬렉션 조회, 스키마 확인, 데이터 작업 시 참조

## 데이터베이스 구성

| DB | 용도 | 접속 |
|----|------|------|
| `docupload` | 핵심 데이터 | `tars:27017/docupload` |
| `aims_analytics` | 로그/분석 | `tars:27017/aims_analytics` |

## 컬렉션 & 핵심 필드

### `files` — 문서 (가장 많이 사용)
```
_id, ownerId(String), customerId(ObjectId|null), batchId
upload: { originalName, uploaded_at, saveName, destPath, fileSize, mimeType }
meta:   { full_text★, summary, document_type, confidence, file_hash(UNIQUE+ownerId) }
ocr:    { status, full_text★, summary, confidence }
docembed: { status(pending|done|failed|credit_pending) }
status, overallStatus, displayName, is_annual_report, is_customer_review
```
- **텍스트 유무 판단: `meta.full_text` 또는 `ocr.full_text`로만** (파일 확장자 금지)
- 소유자 필터: `ownerId: userId`

### `customers` — 고객
```
_id
personal_info: { name★, birth_date, gender, mobile_phone, email, address: { postal_code, address1, address2 } }
insurance_info: { customer_type("개인"|"법인"), risk_level }
documents: [ObjectId]    — 연결된 files._id 배열
memo, meta: { created_at, updated_at, created_by★(소유자), status("active"|"inactive") }
```
- 고객명: **`personal_info.name`** (NOT `name`)
- 소유자 격리: `meta.created_by: userId`
- 상태: `active`(활성), `inactive`(휴면). **deleted 상태 없음**
- 삭제 = Hard Delete (DB 완전 제거)

### `contracts` — 계약
```
_id, agent_id(ObjectId, 소유자), customer_id(ObjectId), insurer_id, product_id
customer_name, product_name, contract_date, policy_number(UNIQUE)
premium, payment_day, payment_cycle, payment_period, payment_status
meta: { created_at, updated_at, created_by, source("manual"|"ar") }
```

### `users` — 사용자
```
_id, kakaoId, naverId, googleId, name, email, phone, role("user"|"admin")
authProvider("kakao"|"naver"|"google"|"dev"), storage: { tier }, hasOcrPermission
```

### `customer_relationships` — 고객 관계
```
from_customer(ObjectId), related_customer(ObjectId), family_representative(ObjectId)
relationship_info: { relationship_type, relationship_category, is_bidirectional, status }
```

### `config` — 설정
```
{ _id: "ac_latest_version", latest: "(현재 버전)", installerUrl: "...", releaseNotes: "..." }
```

### `system_settings` — 시스템 설정
```
{ _id: "ai_models", chat: { model }, rag: { model }, annualReport: { model, parser } }
{ _id: "file_validation", extensionValidation, fileSizeValidation, ... }
```

### `settings` — 티어 정의
```
{ key: "tier_definitions", tiers: { free_trial, standard, premium, vip, admin } }
```

### `upload_queue` — 업로드 큐
```
_id, status("pending"|"processing"|"completed"|"failed"), file_data, owner_id, retry_count
```

## 관계 다이어그램

```
users(1) ──── (N)customers       meta.created_by = users._id
customers(1) ── (N)files         files.customerId = customers._id
customers(N) ── (N)contracts     contracts.customer_id = customers._id
contracts(N) ── (1)insurance_products
customers(N) ── (N)customer_relationships
```

## 필드 명명 규칙 (주의!)

- customers, contracts: **snake_case** (`personal_info.name`, `agent_id`)
- files.upload: **camelCase** (`originalName`, `uploaded_at`)
- users: **camelCase** (`createdAt`, `lastLogin`)
- **혼재되어 있으므로 코드에서 반드시 확인 후 사용**

## 자주 틀리는 패턴

| 잘못 | 올바른 |
|------|--------|
| `customer.name` | `customer.personal_info.name` |
| `db.collection("documents")` | `db.collection("files")` |
| `db.collection("settings")` (AC 버전) | `db.collection("config")` |
| `customerId: "string"` | `customerId: new ObjectId("string")` |
| 텍스트 유무를 확장자로 판단 | `meta.full_text` 또는 `ocr.full_text`로 판단 |

## 주요 인덱스

- `files`: `{meta.file_hash, ownerId}` UNIQUE, `{ownerId, customerId}`
- `customers`: `{meta.created_by, personal_info.name, insurance_info.customer_type}` UNIQUE (collation: ko, strength: 2)
- `personal_files`: `{userId, parentId}`, `{userId, isDeleted}`
- `system_metrics`: `timestamp` TTL 7일

## 컬렉션 상수 사용

```javascript
const { COLLECTIONS } = require('@aims/shared-schema');
// COLLECTIONS.USERS, CUSTOMERS, CONTRACTS, FILES, ...
// 문자열 직접 사용 금지
```

## MCP 서버로 조회

SSH 터널 필수: `ssh -f -N -L 127.0.0.1:27017:127.0.0.1:27017 rossi@100.110.215.65`
연결: `mongodb://127.0.0.1:27017/docupload`
