# AIMS MCP Integration

> **문서 생성일**: 2025-12-20
> **목적**: AIMS DB를 MCP(Model Context Protocol)를 통해 LLM(ChatGPT 등)이 접근할 수 있게 하는 서비스 설계

---

## 1. 프로젝트 개요

### 1.1 배경
AIMS(Agent Intelligent Management System)는 보험 설계사를 위한 지능형 문서 관리 시스템으로, 설계사와 고객에 대한 정보를 MongoDB에 저장하고 있다.

이 데이터를 MCP 서버를 통해 LLM이 접근할 수 있게 하면, 자연어로 고객 정보를 조회하고 영업 인사이트를 얻을 수 있다.

### 1.2 도메인 모델
```
설계사 ─(1:N)─► 고객 ─(1:N)─► 문서
                  └─(0:N)─► 계약 ─(N:1)─► 보험상품 ─(N:1)─► 보험사
```

---

## 2. 유스케이스

### 2.1 자연어 고객 조회
```
"이번 달 생일인 고객 알려줘"
"최근 3개월간 연락 안 한 고객은?"
"자동차보험 만기 다가오는 고객 목록"
"서울 강남구에 사는 고객들"
```

### 2.2 영업 인사이트
```
"올해 신규 계약 통계 분석해줘"
"고객별 보험료 총액 순위"
"갱신율이 낮은 상품 분석"
"이번 분기 실적 요약"
```

### 2.3 고객 상담 지원
```
"홍길동 고객 정보 요약해줘"
"이 고객에게 추천할 만한 상품은?"
"김영희 고객의 보장 공백 분석"
"가족 관계로 연결된 고객들 보여줘"
```

### 2.4 문서/계약 관리
```
"만기 30일 이내 계약 리마인더"
"미처리 문서가 있는 고객 목록"
"특정 보험사 계약 현황"
"Annual Report 미등록 고객"
```

### 2.5 맞춤 메시지 생성
```
"이번 주 생일 고객에게 보낼 축하 문자 만들어줘"
"계약 갱신 안내 멘트 작성해줘"
"신규 상품 소개 문자 템플릿"
```

---

## 3. 보안 고려사항

| 항목 | 요구사항 |
|------|----------|
| **인증** | 설계사별 JWT/API Key 인증 필수 |
| **데이터 격리** | 해당 설계사의 고객만 접근 가능 |
| **권한** | 읽기 전용 권장 (수정/삭제 금지) |
| **로깅** | 모든 MCP 쿼리 감사 로그 기록 |
| **민감정보** | 주민번호, 계좌번호 등 마스킹 처리 |

---

## 4. 기존 AIMS 백엔드 구조 분석

### 4.1 재사용 가능한 코드

#### A. 인증 시스템
- **파일**: `backend/api/aims_api/middleware/auth.js`
- **기능**: JWT 생성/검증, API Key 인증, 역할 기반 접근 제어
- **재사용**: MCP 서버에서 설계사 인증에 그대로 활용

#### B. 유틸리티 함수
| 파일 | 용도 |
|------|------|
| `lib/timeUtils.js` | 시간 처리 (UTC, 정규화) |
| `lib/activityLogger.js` | 감사 로그 (민감정보 자동 마스킹) |
| `lib/documentStatusHelper.js` | 문서 상태/형식 검사 |
| `escapeRegex()` | 안전한 정규식 쿼리 |
| `toSafeObjectId()` | 안전한 ObjectId 변환 |

#### C. 데이터 격리 패턴
```javascript
// 모든 쿼리에 userId 필터 적용
{ 'meta.created_by': userId }  // customers
{ 'ownerId': userId }          // files
{ 'agent_id': userId }         // contracts
```

### 4.2 기존 API 엔드포인트 (MCP로 래핑 가능)

#### 고객 관리
```
GET /api/customers                  # 고객 목록 (필터/검색)
GET /api/customers/:id              # 고객 상세
GET /api/customers/:id/relationships # 관계 네트워크
GET /api/customers/:id/network-analysis # 관계 분석
```

#### 계약 관리
```
GET /api/contracts                  # 계약 목록
GET /api/contracts/:id              # 계약 상세
```

#### 문서 관리
```
GET /api/documents                  # 문서 목록
GET /api/customers/:id/documents    # 고객별 문서
```

#### 통계
```
GET /api/insurance-products/statistics # 상품 통계
GET /api/customers/:id/relationship-stats # 관계 통계
```

### 4.3 MongoDB 컬렉션 구조

#### customers (고객)
```javascript
{
  _id: ObjectId,
  personal_info: {
    name: string,
    phone: string,
    email: string,
    address: { address1, address2, address3 }
  },
  insurance_info: {
    customer_type: "개인|법인",
    business_number: string,
    representative: string
  },
  documents: [{ document_id, upload_date, notes }],
  meta: {
    created_by: "userId",      // 설계사 ID (데이터 격리 키)
    created_at: Date,
    updated_at: Date,
    status: "active|inactive"
  }
}
```

#### contracts (계약)
```javascript
{
  _id: ObjectId,
  agent_id: ObjectId,          // 설계사 ID
  customer_id: ObjectId,
  customer_name: string,
  policy_number: string,
  product_name: string,
  status: string,
  meta: { created_at, updated_at }
}
```

#### files (문서)
```javascript
{
  _id: ObjectId,
  ownerId: "userId",           // 설계사 ID
  customerId: ObjectId,        // 연결된 고객
  filename: string,
  mimeType: string,
  upload: { originalName, destPath, uploaded_at, size_bytes },
  is_annual_report: boolean
}
```

---

## 5. MCP 서버 설계

### 5.1 디렉토리 구조 (구현 완료)
```
backend/api/aims_mcp/
├── package.json
├── tsconfig.json
├── .env.example
├── deploy_aims_mcp.sh
└── src/
    ├── index.ts              # MCP 서버 메인
    ├── db.ts                 # MongoDB 연결
    ├── auth.ts               # JWT 인증
    ├── transports/
    │   ├── stdio.ts          # stdio transport (개발용)
    │   └── http.ts           # HTTP transport (프로덕션)
    └── tools/
        ├── index.ts          # Tool 등록
        ├── customers.ts      # search_customers, get_customer
        ├── contracts.ts      # list_contracts
        ├── birthdays.ts      # find_birthday_customers
        ├── expiring.ts       # find_expiring_contracts
        ├── statistics.ts     # get_statistics
        └── network.ts        # get_customer_network
```

### 5.2 MCP Tools 정의

| Tool 이름 | 설명 | 파라미터 |
|-----------|------|----------|
| `search_customers` | 고객 검색 | `query`, `filters`, `limit` |
| `get_customer_detail` | 고객 상세 정보 | `customer_id` |
| `list_contracts` | 계약 목록 조회 | `customer_id?`, `status?`, `limit` |
| `get_contract_detail` | 계약 상세 | `contract_id` |
| `find_birthday_customers` | 생일 고객 조회 | `month`, `day?` |
| `find_expiring_contracts` | 만기 예정 계약 | `days_before` |
| `get_customer_network` | 관계 네트워크 | `customer_id` |
| `get_statistics` | 통계 조회 | `type`, `period?` |
| `search_documents` | 문서 검색 | `query`, `customer_id?` |

### 5.3 Tool 구현 예시

```javascript
// tools/customers.js
const searchCustomers = {
  name: 'search_customers',
  description: '고객을 이름, 연락처, 지역 등으로 검색합니다',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '검색어 (이름, 전화번호)' },
      customer_type: { type: 'string', enum: ['개인', '법인'] },
      status: { type: 'string', enum: ['active', 'inactive'] },
      region: { type: 'string', description: '지역 (시/도)' },
      limit: { type: 'number', default: 20 }
    }
  },
  handler: async ({ query, customer_type, status, region, limit }, { userId, db }) => {
    // 기존 /api/customers 쿼리 로직 재사용
    const filter = { 'meta.created_by': userId };

    if (query) {
      filter.$or = [
        { 'personal_info.name': { $regex: escapeRegex(query), $options: 'i' } },
        { 'personal_info.phone': { $regex: escapeRegex(query) } }
      ];
    }
    if (customer_type) filter['insurance_info.customer_type'] = customer_type;
    if (status) filter['meta.status'] = status;
    if (region) filter['personal_info.address.address1'] = { $regex: region };

    const customers = await db.collection('customers')
      .find(filter)
      .limit(limit)
      .toArray();

    return { customers, count: customers.length };
  }
};
```

### 5.4 Resources 정의

```javascript
// resources/schema.js
const customerSchema = {
  uri: 'aims://schema/customer',
  name: 'Customer Schema',
  description: 'AIMS 고객 데이터 구조',
  mimeType: 'application/json',
  content: {
    fields: {
      name: '고객 이름',
      phone: '연락처',
      email: '이메일',
      customer_type: '고객 유형 (개인/법인)',
      address: '주소',
      status: '상태 (active/inactive)'
    },
    relationships: '가족, 친척, 사회, 직장, 법인 관계 지원'
  }
};
```

---

## 6. 구현 현황

### Phase 1: 기본 구조 (MVP) ✅ 완료
- [x] MCP 서버 기본 틀 구현 (`src/index.ts`)
- [x] MongoDB 연결 설정 (`src/db.ts`)
- [x] 인증 미들웨어 연동 (`src/auth.ts`)
- [x] `search_customers` tool 구현
- [x] `get_customer` tool 구현

### Phase 2: 계약/생일/만기 ✅ 완료
- [x] `list_contracts` tool 구현
- [x] `find_birthday_customers` tool 구현
- [x] `find_expiring_contracts` tool 구현

### Phase 3: 분석/통계 ✅ 완료
- [x] `get_statistics` tool 구현
- [x] `get_customer_network` tool 구현

### Phase 4: 고급 기능 (추후)
- [ ] 자연어 쿼리 파싱 개선
- [ ] 캐싱 레이어 추가
- [ ] Rate limiting
- [ ] 사용량 분석 대시보드

---

## 7. 배포

### 7.1 서버 위치
```
tars.giize.com:/home/rossi/aims/backend/api/aims_mcp/
```

### 7.2 배포 스크립트
```bash
# deploy_aims_mcp.sh
#!/bin/bash
cd /home/rossi/aims/backend/api/aims_mcp
npm install --production
pm2 restart aims_mcp || pm2 start index.js --name aims_mcp
```

### 7.3 포트
- 기본 포트: `3011` (aims_api: 3010)

### 7.4 테스트 방법

#### 헬스 체크
```bash
curl http://localhost:3011/health
```

#### Tool 목록 조회
```bash
curl http://localhost:3011/tools
```

#### Tool 호출 (X-User-ID 헤더 사용)
```bash
# 고객 검색
curl -X POST http://localhost:3011/call \
  -H 'Content-Type: application/json' \
  -H 'X-User-ID: <userId>' \
  -d '{"tool": "search_customers", "arguments": {"limit": 3}}'

# 고객 상세
curl -X POST http://localhost:3011/call \
  -H 'Content-Type: application/json' \
  -H 'X-User-ID: <userId>' \
  -d '{"tool": "get_customer", "arguments": {"customerId": "<customerId>"}}'

# 계약 목록
curl -X POST http://localhost:3011/call \
  -H 'Content-Type: application/json' \
  -H 'X-User-ID: <userId>' \
  -d '{"tool": "list_contracts", "arguments": {"limit": 5}}'

# 통계
curl -X POST http://localhost:3011/call \
  -H 'Content-Type: application/json' \
  -H 'X-User-ID: <userId>' \
  -d '{"tool": "get_statistics", "arguments": {"type": "customer_count"}}'
```

#### 인증 방식
| 방식 | 용도 | 헤더 |
|------|------|------|
| JWT | 프로덕션 | `Authorization: Bearer <token>` |
| X-User-ID | 개발/테스트 | `X-User-ID: <userId>` |
| 환경변수 | stdio 모드 | `USER_ID=<userId>` |

---

## 8. 참고 자료

- [MCP 공식 문서](https://modelcontextprotocol.io/)
- [AIMS 백엔드 구조](../backend/api/aims_api/)
- [보안 로드맵](./SECURITY_ROADMAP.md)

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2025-12-20 | 초기 문서 작성 - 유스케이스 및 구조 분석 |
| 2025-12-20 | MCP 서버 v1.0.0 구현 완료 - 7개 Tools |
| 2025-12-20 | X-User-ID 인증 및 테스트 방법 문서화 |
