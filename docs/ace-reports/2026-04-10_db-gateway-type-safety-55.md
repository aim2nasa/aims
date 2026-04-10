# DB 게이트웨이 타입 안전성 강화 (#55)

- **날짜**: 2026-04-10
- **이슈**: [aims#55](https://github.com/aim2nasa/aims/issues/55)
- **브랜치**: `fix/createdat-string-bug-55`
- **프로세스**: ACE Process L 경로
- **작업 규모**: L (15+ 컬렉션 검토, 게이트웨이 구조 변경, 마이그레이션, validator)

## 발단

`/full-deploy` 후 주식회사마리치 일괄 업로드 모니터링 중, MongoDB 쿼리 디버깅에서 `files.createdAt`이 `ISODate`가 아닌 Python `datetime.isoformat()` 문자열로 저장되는 이상을 발견. 날짜 기반 `$gte`, `$lte`, `$sort` 쿼리가 silently 실패.

## 핵심 결정과 맥락

### 본질적 해결 vs 단순 수정

처음 제안한 1줄 수정 (Node.js gateway에서 `createdAt`만 `new Date()`로 변환)은 **미봉책**이라 거부됨. 사용자가 명시적으로 "본질적 해결"을 요구하여 다음 결정:

1. **Zod 스키마 게이트웨이 검증**(애플리케이션 레이어) + **MongoDB JSON Schema validator**(DB 레이어) **이중 방어** 채택
2. **모든 핵심 컬렉션에 광범위 적용** (한 컬렉션만 → 시한폭탄 잔존 가능성 차단)
3. **기존 오염 데이터 마이그레이션** 병행

### 왜 이중 방어인가

- **Zod만**: 게이트웨이 우회 시(직접 mongosh, Python 스크립트) 무력
- **MongoDB Native만**: ISO 문자열 자동 Date 변환 없음 → 모든 클라이언트가 미리 Date 객체로 보내야 함 (현재 Python isoformat 그대로면 모든 insert 거부)
- **두 개 다**: Zod에서 `z.coerce.date()`로 ISO 문자열 → Date 자동 변환, MongoDB validator는 마지막 안전망

## Merlin 전수 조사 결과

### 오염 경로 3개 (코드 직접 확인)

| 경로 | 위치 | 영향 필드 |
|------|------|----------|
| A | `document_pipeline/services/internal_api.py` `_serialize_for_api()` | `files.createdAt`, `upload.converted_at` |
| B | `document_pipeline/workers/ocr_worker.py` 직접 `.isoformat()` | `files.overallStatusUpdatedAt` |
| C | `customers-routes.js` `utcNowISO()` 잘못된 사용 | `customers.meta.updated_at` |

경로 C는 HTTP 직렬화 문제가 아닌 **Node.js 자체 버그** — `utcNowISO()`는 응답 JSON용 헬퍼인데 DB 저장에 사용됨.

### 오염 데이터 (DB 직접 조회 2026-04-10)

| 컬렉션 | 필드 | string 건수 |
|--------|------|------------|
| files | createdAt | 1,384 |
| files | overallStatusUpdatedAt | 60 |
| files | upload.converted_at | 209 |
| customers | meta.updated_at | 105 |
| **합계** | | **1,758** |

### 범위 밖 (의도적 string)

- `upload.uploaded_at` (3,492건 전부 string) — 쿼리 대상 아님, 의도적 설계 추정
- `docembed.updated_at` (3,432건 전부 string) — embedding 전용, 쿼리 대상 아님

## 함정 / 주의점

### 함정 1: validator 적용 순서

`validationLevel: "moderate"`도 **기존 문서를 update할 때** 검증을 적용한다. 마이그레이션 전 validator를 적용하면 오염 문서를 update하려는 모든 작업이 거부되어 시스템 마비.

**올바른 순서**:
1. 코드 배포 (신규 string 생성 차단)
2. 마이그레이션 (기존 string → Date)
3. validator 적용

### 함정 2: 마이그레이션 → 코드 배포 사이 race

마이그레이션 완료 ~ 코드 배포 사이에 새 string이 생성될 수 있음. 대응:
- 코드 배포 직후 마이그레이션 1회 더 실행 (보통 0~수 건만 정리)
- validator 적용 직전 최종 0건 확인

### 함정 3: Python isoformat 마이크로초 + 타임존 누락

`datetime.utcnow().isoformat()` 결과는 `2026-04-07T01:23:10.919750` (마이크로초 6자리, Z 없음). Node.js `new Date()`는 이를 **로컬 타임이 아닌 UTC**로 파싱함이 확인되었으나, 마이그레이션 스크립트에서 샘플 검증 권장.

### 함정 4: Zod strict 모드 금지

`files` 컬렉션은 `meta.full_text` (수 MB), `json_data` (동적 구조) 등 가변 필드 다수. **`.passthrough()` 필수** — 스키마 정의 안 된 필드는 그대로 통과.

### 함정 5: customerId nullable

`files.customerId`는 `null` 가능 (고아 문서). Zod에서 `z.string().nullable().optional()` 명시 필수. 기존 ObjectId 변환 로직과 충돌 없게 처리.

## 작업 순서 (4단계, 안전 우선)

| Step | 내용 | 효과 |
|------|------|------|
| 1 | Node.js 자체 버그 수정 (customers-routes.js 2곳, internal-routes.js 1곳) → 배포 | 즉각 신규 오염 차단 (저위험) |
| 2 | Zod 스키마 + 게이트웨이 날짜 coerce 추가 → 단위 테스트 → 배포 | document_pipeline → gateway 경로 보호 |
| 3 | 마이그레이션 (dev 우선 검증 → prd 실행) | 기존 1,758건 정리 |
| 4 | MongoDB JSON Schema validator 적용 (moderate, error) | DB 레이어 최후 방어 |

## 변경 파일 (계획)

| 파일 | 작업 |
|------|------|
| `backend/api/aims_api/routes/internal-routes.js` | 수정 (POST/PATCH files 핸들러) |
| `backend/api/aims_api/routes/customers-routes.js` | 수정 (utcNowISO → utcNowDate, 1372/1663줄) |
| `backend/api/aims_api/routes/internal-routes.js:2054` | 수정 (`new Date().toISOString()` → `new Date()`) |
| `backend/shared/schema/zod-schemas.ts` | 신규 (FileDocumentSchema, FilePatchSetSchema 등) |
| `backend/shared/schema/index.ts` | 수정 (export 추가) |
| `backend/scripts/migrate_date_fields_v1.js` | 신규 (마이그레이션) |
| `backend/scripts/apply_json_schema_validators.js` | 신규 (validator 적용) |
| 단위 테스트 (신규) | Zod 스키마 검증, 게이트웨이 coerce 검증 |

## 진행 기록 (단계별 업데이트)

- ACE 0/6: Merlin 기획 완료. 변경 대상 8개 파일, 엣지 케이스 5건, 위험 5건 식별
- ACE 1/6: AC 10건 + 작업 4단계 사용자 승인
- ACE 2/6: (작성 중)
