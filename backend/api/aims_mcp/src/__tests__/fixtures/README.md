# AIMS MCP E2E 테스트 Fixtures

이 폴더는 aims-mcp e2e 테스트에 필요한 샘플 데이터와 파일을 포함합니다.

## 폴더 구조

```
fixtures/
├── index.ts                    # 메인 로더 유틸리티
├── generate-sample-files.cjs   # 샘플 PDF/이미지 생성 스크립트
├── README.md                   # 이 파일
│
├── customers/
│   └── index.json              # 고객 샘플 데이터 (6명)
│
├── contracts/
│   └── index.json              # 계약 샘플 데이터 (8개)
│
├── relationships/
│   └── index.json              # 관계 샘플 데이터 (5개)
│
├── documents/
│   └── index.json              # 문서 메타데이터 (7개)
│
├── files/
│   ├── sample_insurance_certificate.pdf  # 보험증권 샘플
│   ├── sample_annual_report.pdf          # 연간보장분석표 샘플
│   ├── sample_annual_report_2.pdf        # AR 파싱 대기 샘플
│   ├── sample_pension_plan.pdf           # 연금설계서 샘플
│   ├── sample_business_registration.pdf  # 사업자등록증 샘플
│   ├── sample_application_form.pdf       # 청약서 샘플
│   └── sample_id_card.jpg                # 신분증 이미지 샘플
│
└── products/                   # (예정) 보험상품 샘플 데이터
```

## 사용법

### 기본 사용

```typescript
import {
  loadCustomers,
  loadContracts,
  getFilePath,
  getFileBuffer,
} from '../fixtures';

// 고객 목록 로드
const customers = loadCustomers();

// 계약 목록 로드 (만기일 자동 계산)
const contracts = loadContracts();

// 샘플 파일 경로 가져오기
const pdfPath = getFilePath('sample_insurance_certificate.pdf');

// 파일 Buffer로 읽기
const pdfBuffer = getFileBuffer('sample_annual_report.pdf');
```

### 테스트 시나리오

```typescript
import {
  getFamilyScenario,
  getCorporateScenario,
  getAnnualReportScenario,
  getExpiringContracts,
  getCustomersByBirthMonth,
} from '../fixtures';

// 가족 관계 테스트
const { father, mother, child, relationships } = getFamilyScenario();

// 법인 고객 테스트
const { customer, contracts, documents } = getCorporateScenario();

// Annual Report 테스트
const { completed, pending } = getAnnualReportScenario();

// 만기 임박 계약 (30일 이내)
const expiringContracts = getExpiringContracts(30);

// 1월 생일 고객
const januaryBirthdays = getCustomersByBirthMonth(1);
```

## 샘플 데이터 설명

### 고객 (6명)

| ID | 이름 | 타입 | 특징 |
|----|------|------|------|
| `customer_hong` | 홍길동 | 개인 | 메인 테스트 고객, VIP |
| `customer_kim` | 김영희 | 개인 | 홍길동 배우자 |
| `customer_hongminsu` | 홍민수 | 개인 | 홍길동/김영희 자녀 |
| `customer_lee` | 이철수 | 개인 | 홍길동 직장동료 |
| `customer_park` | 박지민 | 개인 | 신규 고객 |
| `customer_corp_test` | (주)테스트법인 | 법인 | 법인 고객 테스트 |

### 계약 (8개)

| ID | 고객 | 상품 | 만기 |
|----|------|------|------|
| `contract_hong_life` | 홍길동 | 종신보험 | 2040년 |
| `contract_hong_auto` | 홍길동 | 자동차보험 | 30일 후 |
| `contract_hong_health` | 홍길동 | 건강보험 | 7일 후 |
| `contract_kim_pension` | 김영희 | 연금저축 | 2049년 |
| `contract_kim_child` | 김영희 | 어린이보험 | 2035년 |
| `contract_lee_life` | 이철수 | 변액종신 | 2075년 |
| `contract_park_new` | 박지민 | 건강보험 | 2044년 |
| `contract_corp_group` | 법인 | 단체보험 | 2024년말 |

### 관계 (5개)

```
홍길동 ── 배우자 ── 김영희
   │                  │
   └──── 부모 ────┬───┘
                  │
               홍민수

홍길동 ── 동료 ── 이철수 ── 친구 ── 박지민
```

## 샘플 파일 재생성

PDF/이미지 파일이 손상되었거나 수정이 필요한 경우:

```bash
cd backend/api/aims_mcp/src/__tests__/fixtures
node generate-sample-files.cjs
```

## 테스트에서 활용

### e2e 테스트 예시

```typescript
import { describe, it, beforeAll, afterAll } from 'vitest';
import { fixtures } from '../fixtures';
import { TestDataFactory } from '../../test-utils';

describe('고객 검색 e2e', () => {
  let factory: TestDataFactory;
  let createdCustomerIds: string[] = [];

  beforeAll(async () => {
    factory = new TestDataFactory();

    // fixtures의 고객 데이터를 실제 DB에 생성
    const customers = fixtures.loadCustomers();
    for (const customer of customers) {
      const created = await factory.createCustomer({
        name: customer.personal_info.name,
        customer_type: customer.insurance_info.customer_type,
        mobile_phone: customer.personal_info.mobile_phone,
      });
      createdCustomerIds.push(created._id);
    }
  });

  afterAll(async () => {
    // 테스트 후 정리
    await factory.cleanup();
  });

  it('이름으로 고객 검색', async () => {
    const result = await mcpClient.callTool('search_customers', {
      query: '홍길동',
    });
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0].name).toBe('홍길동');
  });
});
```

## 주의사항

1. **테스트 격리**: 테스트용 데이터는 반드시 테스트 종료 후 정리해야 합니다.
2. **실제 파일**: `files/` 폴더의 PDF는 최소한의 구조만 가진 테스트용 파일입니다. 실제 OCR 테스트 시에는 실제 보험 문서를 사용하세요.
3. **민감 정보**: 실제 고객 정보를 fixtures에 포함하지 마세요.
4. **상대 날짜**: 계약의 `expiry_date_relative_days` 필드는 테스트 실행 시점 기준으로 자동 계산됩니다.
