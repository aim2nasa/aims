# AIMS 연락처 용어 표준

> 이 문서는 AIMS 시스템 전반에서 사용하는 연락처 관련 용어의 표준을 정의합니다.
> 모든 개발자는 이 표준을 준수해야 합니다.

## 용어 계층 구조

```
연락처 (Contact Info)
├── 전화번호 (Phone Numbers)
│   ├── 휴대폰 (mobile_phone)
│   ├── 집 전화 (home_phone)
│   └── 회사 전화 (work_phone)
└── 이메일 (email)
```

## 용어 정의

| 용어 | 영문 | DB 필드 | 정의 |
|------|------|---------|------|
| **연락처** | Contact Info | - | 전화번호 + 이메일을 포함하는 **상위 개념** |
| **전화번호** | Phone Number | - | 휴대폰/집전화/회사전화의 **통칭** |
| **휴대폰** | Mobile Phone | `mobile_phone` | 개인 휴대전화 |
| **집 전화** | Home Phone | `home_phone` | 가정 유선전화 |
| **회사 전화** | Work Phone | `work_phone` | 직장 전화 |
| **대표전화** | Main Phone | `mobile_phone` | 법인의 대표 전화번호 |
| **이메일** | Email | `email` | 전자우편 주소 |

## 사용 기준

### UI 레이블

| 위치 | 사용 용어 | 예시 |
|------|----------|------|
| 탭/섹션 제목 | **연락처** | "연락처" 탭 (전화+이메일 포함) |
| 개별 입력 필드 | **휴대폰**, **집 전화**, **회사 전화** | `<label>휴대폰</label>` |
| 검색 placeholder | **전화번호** | "이름, 전화번호, 이메일로 검색..." |

### 엑셀 열 이름

| 시트 | 열 이름 | 매핑 필드 | 설명 |
|------|---------|----------|------|
| 개인고객명단 | **휴대폰** | `mobile_phone` | 개인 고객의 휴대전화 |
| 법인고객명단 | **대표전화** | `mobile_phone` | 법인의 대표 전화번호 |

### 도움말/안내 문구

| 상황 | 사용 용어 | 예시 |
|------|----------|------|
| 일반 안내 | **전화번호** | "전화번호로 검색할 수 있습니다" |
| 구체적 설명 | **휴대폰/집 전화/회사 전화** | "휴대폰, 집 전화, 회사 전화를 등록할 수 있습니다" |
| 검색 대상 설명 | **전화번호** | "이름, 전화번호, 이메일로 검색" |

### 코드 내 필드명

| 레이어 | 필드명 | 비고 |
|--------|--------|------|
| DB (MongoDB) | `personal_info.mobile_phone` | 반드시 `mobile_phone` 사용 |
| DB (MongoDB) | `personal_info.home_phone` | |
| DB (MongoDB) | `personal_info.work_phone` | |
| API 요청 파라미터 | `phone` + `phoneType` | MCP API에서 사용 |
| API 응답 | `mobilePhone`, `homePhone`, `workPhone` | camelCase |
| TypeScript 인터페이스 | `mobile_phone`, `home_phone`, `work_phone` | snake_case (DB 일치) |

## 금지 용어

| 금지 용어 | 이유 | 대체 용어 |
|----------|------|----------|
| **핸드폰** | 비표준 표현 | 휴대폰 |
| **연락처** (단일 번호 의미) | 모호함 | 휴대폰 또는 전화번호 |
| **phone** (코드 내 단독) | DB 필드와 불일치 | `mobile_phone` |
| **personal_info.phone** | 존재하지 않는 필드 | `personal_info.mobile_phone` |
| **전화** (단독) | 모호함 | 휴대폰/집 전화/회사 전화 |

## 적용 예시

### 올바른 사용

```typescript
// ✅ DB 쿼리
{ 'personal_info.mobile_phone': { $regex: searchTerm } }

// ✅ UI 레이블
<label>휴대폰</label>
<input name="mobile_phone" />

// ✅ 검색 안내
placeholder="이름, 전화번호, 이메일로 검색..."

// ✅ 도움말
"고객의 휴대폰, 집 전화, 회사 전화를 등록할 수 있습니다."
```

### 잘못된 사용

```typescript
// ❌ DB 쿼리 - phone 필드 존재하지 않음
{ 'personal_info.phone': { $regex: searchTerm } }

// ❌ UI 레이블 - 비표준 용어
<label>핸드폰</label>

// ❌ 엑셀 열 이름 - 모호함
"연락처"  // 개인? 법인? 휴대폰? 대표전화?

// ❌ 코드 - phone 단독 사용
const phone = customer.personal_info?.phone;  // ❌
const phone = customer.personal_info?.mobile_phone;  // ✅
```

## 마이그레이션 체크리스트

이 표준을 적용하기 위해 수정이 필요한 항목:

### 즉시 수정 필요 (버그)

- [x] `server.js:3497` - `personal_info.phone` → `personal_info.mobile_phone` ✅ 완료 (2025-01-15)

### 용어 통일 (엑셀)

- [x] `EXCEL_IMPORT_SPECIFICATION.md` - "연락처" → "휴대폰" (개인), "대표전화" (법인) ✅ 완료 (2026-01-15)
- [x] `ExcelRefiner.tsx` - 엑셀 열 이름 변경, 열 인식 로직 수정 (하위 호환) ✅ 완료 (2026-01-15)
- [x] 샘플 엑셀 파일 - 열 이름 변경 ✅ 완료 (2026-01-15)

### 용어 통일 (도움말/FAQ)

- [ ] `insert_customer_faqs.js` - 용어 일관성 검토
- [ ] `seed-help-content.js` - 용어 일관성 검토
- [ ] `insert_usage_guides.js` - 용어 일관성 검토

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-01-15 | 1.1.0 | 엑셀 용어 통일 완료 - UI/샘플 파일/열 인식 로직 수정 |
| 2025-01-15 | 1.0.0 | 최초 작성 |

---

**참고 문서**
- [EXCEL_IMPORT_SPECIFICATION.md](./EXCEL_IMPORT_SPECIFICATION.md) - 엑셀 임포트 명세
- [PHONE_FORMAT_SYSTEM.md](../frontend/aims-uix3/docs/PHONE_FORMAT_SYSTEM.md) - 전화번호 포맷 시스템
