---
name: customer-skill
description: AIMS 고객 비즈니스 로직 가이드. 고객 생성, 삭제, 휴면, 계약, 고객명 작업 시 자동 사용
---

# AIMS 고객 비즈니스 로직 가이드

> 고객 CRUD, 삭제/휴면, 고객명 규칙, 문서 연결 작업 시 참조

## 고객 상태 흐름

```
[생성] ──────────────────────────► active
active ──(DELETE, 기본)──────────► inactive (휴면 처리)
inactive ──(POST /:id/restore)──► active (복원)
active/inactive ──(DELETE ?permanent=true)──► [DB 완전 삭제]
```

- 상태: `active`(활성), `inactive`(휴면)만 존재
- **`deleted` 상태 없음**
- 휴면 = soft delete (DB에 남음, 문서/계약 그대로 유지)
- 삭제 = **Hard Delete** (개발자 모드에서만, 연쇄 삭제)

## 삭제 규칙

### 휴면 처리 (soft delete, 기본)
- `meta.status = 'inactive'`로 변경
- 문서/계약/관계 모두 **그대로 유지**
- 프론트엔드: `CustomerService.deleteCustomer()`

### 완전 삭제 (hard delete, `?permanent=true`)
순차 연쇄 삭제 (트랜잭션 없음):
1. `customer_relationships` — 관련 모든 관계 삭제
2. `contracts` — 해당 고객 계약 전부 삭제
3. `files` — 연결된 문서: 물리 파일 삭제 + MongoDB 삭제 + Qdrant 임베딩 삭제
4. `customers` — 고객 레코드 자체 삭제
- 프론트엔드: `CustomerService.permanentDeleteCustomer()`

## 고객명 유일성

### 규칙
- **같은 설계사(meta.created_by) 내에서 고객명 중복 절대 불가**
- 개인/법인 구분 없이 동일 네임스페이스
- 활성/휴면 구분 없이 (휴면 고객명도 차단)
- 대소문자 무관 (MongoDB collation `locale: 'ko', strength: 2`)

### API
- 실시간 체크: `GET /api/customers/check-name?name=xxx&userId=xxx`
- 생성 시 백엔드에서 최종 검증, 충돌 시 **409** 반환

### 주의: 수정 시 미검증
`PUT /api/customers/:id`에서 이름 변경 시 중복 체크가 **수행되지 않음** (알려진 갭)

## 고객-문서 관계

### 이중 저장 (양방향) — SSOT 예외
- `customers.documents[]` — 고객에 문서 ID 배열
- `files.customerId` — 문서에 고객 ID 참조
- Qdrant 임베딩에도 `customer_id` 페이로드
- **이 이중 저장은 SSOT 원칙의 의도적 예외**: document_pipeline과 aims_api 간 비동기 처리 호환성을 위한 레거시 설계. 다른 엔티티에 이 패턴을 모방하지 말 것

### 연결 (`POST /api/customers/:id/documents`)
1. 소유권 검증 (고객 + 문서 모두)
2. 중복 file_hash 체크 → 409 `DUPLICATE_FILE`
3. customers.documents에 push + files.customerId 설정
4. Qdrant customer_id 동기화
5. AR 문서면 ar_parse_queue에 등록
6. SSE 알림 발송

### 연결 해제 (`DELETE /api/customers/:id/documents/:doc_id`)
1. customers.documents에서 pull + files.customerId 해제
2. Qdrant customer_id 제거
3. AR 문서면 파싱 데이터도 제거
4. SSE 알림 발송

## 소유자 격리 (필수)

모든 고객 쿼리에 반드시 소유자 필터 적용:
```javascript
{ 'meta.created_by': userId, deleted_at: null }
```

## 주소 변경 시 자동 처리

- 이전 주소 → `address_history` 컬렉션에 아카이브
- 새 주소 → Kakao API로 자동 검증 (`verification_status`)
