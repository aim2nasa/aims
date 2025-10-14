/**
 * Customer Schema Validation Tests
 * @since 2025-10-14
 *
 * Zod 스키마 검증 테스트
 */

import { describe, it, expect } from 'vitest';
import {
  AddressSchema,
  PersonalInfoSchema,
  InsuranceInfoSchema,
  MetaSchema,
  CustomerSchema,
  CreateCustomerSchema,
  UpdateCustomerSchema,
  CustomerSearchQuerySchema,
  CustomerSearchResponseSchema,
} from './model';

// ============================================
// AddressSchema 테스트
// ============================================
describe('AddressSchema', () => {
  it('유효한 주소를 검증한다', () => {
    const validAddress = {
      postal_code: '12345',
      address1: '서울시 강남구',
      address2: '테헤란로 123',
    };

    expect(() => AddressSchema.parse(validAddress)).not.toThrow();
  });

  it('선택적 필드를 허용한다', () => {
    const minimalAddress = {};
    expect(() => AddressSchema.parse(minimalAddress)).not.toThrow();
  });

  it('부분 주소를 허용한다', () => {
    const partialAddress = {
      address1: '서울시 강남구',
    };
    expect(() => AddressSchema.parse(partialAddress)).not.toThrow();
  });
});

// ============================================
// PersonalInfoSchema 테스트
// ============================================
describe('PersonalInfoSchema', () => {
  it('유효한 개인 정보를 검증한다', () => {
    const validPersonalInfo = {
      name: '홍길동',
      birth_date: '1990-01-01',
      gender: 'M' as const,
      mobile_phone: '010-1234-5678',
      email: 'hong@example.com',
    };

    expect(() => PersonalInfoSchema.parse(validPersonalInfo)).not.toThrow();
  });

  it('이름이 필수이다', () => {
    const invalidPersonalInfo = {
      email: 'test@example.com',
    };

    // name 필드가 없으면 에러 발생
    expect(() => PersonalInfoSchema.parse(invalidPersonalInfo)).toThrow();
  });

  it('빈 이름을 거부한다', () => {
    const invalidPersonalInfo = {
      name: '',
    };

    expect(() => PersonalInfoSchema.parse(invalidPersonalInfo)).toThrow();
  });

  it('유효하지 않은 이메일을 거부한다', () => {
    const invalidPersonalInfo = {
      name: '홍길동',
      email: 'invalid-email',
    };

    expect(() => PersonalInfoSchema.parse(invalidPersonalInfo)).toThrow('유효한 이메일');
  });

  it('빈 문자열 이메일을 허용한다', () => {
    const validPersonalInfo = {
      name: '홍길동',
      email: '',
    };

    expect(() => PersonalInfoSchema.parse(validPersonalInfo)).not.toThrow();
  });

  it('올바른 gender 값만 허용한다', () => {
    const invalidGender = {
      name: '홍길동',
      gender: 'X',
    };

    expect(() => PersonalInfoSchema.parse(invalidGender)).toThrow();
  });
});

// ============================================
// InsuranceInfoSchema 테스트
// ============================================
describe('InsuranceInfoSchema', () => {
  it('유효한 보험 정보를 검증한다', () => {
    const validInsuranceInfo = {
      customer_type: '개인' as const,
      risk_level: 'low',
      annual_premium: 1000000,
      total_coverage: 50000000,
    };

    expect(() => InsuranceInfoSchema.parse(validInsuranceInfo)).not.toThrow();
  });

  it('기본값으로 "개인"을 사용한다', () => {
    const result = InsuranceInfoSchema.parse({});
    expect(result.customer_type).toBe('개인');
  });

  it('법인 고객 유형을 허용한다', () => {
    const corporateInfo = {
      customer_type: '법인' as const,
    };

    const result = InsuranceInfoSchema.parse(corporateInfo);
    expect(result.customer_type).toBe('법인');
  });

  it('선택적 필드를 허용한다', () => {
    const minimalInfo = {
      customer_type: '개인' as const,
    };

    expect(() => InsuranceInfoSchema.parse(minimalInfo)).not.toThrow();
  });
});

// ============================================
// MetaSchema 테스트
// ============================================
describe('MetaSchema', () => {
  it('유효한 메타 정보를 검증한다', () => {
    const validMeta = {
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      status: 'active' as const,
    };

    expect(() => MetaSchema.parse(validMeta)).not.toThrow();
  });

  it('기본값으로 "active" 상태를 사용한다', () => {
    const meta = {
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    const result = MetaSchema.parse(meta);
    expect(result.status).toBe('active');
  });

  it('datetime 형식을 검증한다', () => {
    const invalidMeta = {
      created_at: '2025-01-01', // datetime 형식이 아님
      updated_at: '2025-01-01T00:00:00Z',
    };

    expect(() => MetaSchema.parse(invalidMeta)).toThrow();
  });

  it('inactive 상태를 허용한다', () => {
    const inactiveMeta = {
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      status: 'inactive' as const,
    };

    expect(() => MetaSchema.parse(inactiveMeta)).not.toThrow();
  });
});

// ============================================
// CustomerSchema 테스트
// ============================================
describe('CustomerSchema', () => {
  it('유효한 고객 데이터를 검증한다', () => {
    const validCustomer = {
      _id: 'customer-123',
      personal_info: {
        name: '홍길동',
        birth_date: '1990-01-01',
        gender: 'M' as const,
      },
      meta: {
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        status: 'active' as const,
      },
    };

    expect(() => CustomerSchema.parse(validCustomer)).not.toThrow();
  });

  it('배열 필드의 기본값을 설정한다', () => {
    const minimalCustomer = {
      _id: 'customer-123',
      personal_info: {
        name: '홍길동',
      },
      meta: {
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    };

    const result = CustomerSchema.parse(minimalCustomer);
    expect(result.contracts).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.consultations).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  it('필수 필드가 없으면 에러를 발생시킨다', () => {
    const invalidCustomer = {
      personal_info: {
        name: '홍길동',
      },
      // _id와 meta가 없음
    };

    expect(() => CustomerSchema.parse(invalidCustomer)).toThrow();
  });
});

// ============================================
// CreateCustomerSchema 테스트
// ============================================
describe('CreateCustomerSchema', () => {
  it('유효한 생성 데이터를 검증한다', () => {
    const validCreateData = {
      personal_info: {
        name: '홍길동',
        birth_date: '1990-01-01',
        email: 'hong@example.com',
      },
      insurance_info: {
        customer_type: '개인' as const,
      },
    };

    expect(() => CreateCustomerSchema.parse(validCreateData)).not.toThrow();
  });

  it('최소 데이터만으로 생성 가능하다', () => {
    const minimalCreateData = {
      personal_info: {
        name: '홍길동',
      },
    };

    expect(() => CreateCustomerSchema.parse(minimalCreateData)).not.toThrow();
  });

  it('_id와 meta가 없어도 생성 가능하다', () => {
    const createData = {
      personal_info: {
        name: '홍길동',
      },
    };

    const result = CreateCustomerSchema.parse(createData);
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('meta');
  });
});

// ============================================
// UpdateCustomerSchema 테스트
// ============================================
describe('UpdateCustomerSchema', () => {
  it('부분 업데이트 데이터를 검증한다', () => {
    const validUpdateData = {
      personal_info: {
        email: 'new-email@example.com',
      },
    };

    expect(() => UpdateCustomerSchema.parse(validUpdateData)).not.toThrow();
  });

  it('빈 업데이트 데이터를 허용한다', () => {
    const emptyUpdateData = {};

    expect(() => UpdateCustomerSchema.parse(emptyUpdateData)).not.toThrow();
  });

  it('personal_info만 업데이트 가능하다', () => {
    const personalInfoUpdate = {
      personal_info: {
        mobile_phone: '010-9999-8888',
      },
    };

    expect(() => UpdateCustomerSchema.parse(personalInfoUpdate)).not.toThrow();
  });

  it('insurance_info만 업데이트 가능하다', () => {
    const insuranceInfoUpdate = {
      insurance_info: {
        annual_premium: 2000000,
      },
    };

    expect(() => UpdateCustomerSchema.parse(insuranceInfoUpdate)).not.toThrow();
  });
});

// ============================================
// CustomerSearchQuerySchema 테스트
// ============================================
describe('CustomerSearchQuerySchema', () => {
  it('유효한 검색 쿼리를 검증한다', () => {
    const validQuery = {
      page: 1,
      limit: 20,
      search: '홍길동',
      customerType: '개인' as const,
    };

    expect(() => CustomerSearchQuerySchema.parse(validQuery)).not.toThrow();
  });

  it('기본값을 설정한다', () => {
    const minimalQuery = {};

    const result = CustomerSearchQuerySchema.parse(minimalQuery);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('page는 1 이상이어야 한다', () => {
    const invalidQuery = {
      page: 0,
    };

    expect(() => CustomerSearchQuerySchema.parse(invalidQuery)).toThrow();
  });

  it('limit은 1 이상 100000 이하여야 한다', () => {
    const invalidQuery = {
      limit: 0,
    };

    expect(() => CustomerSearchQuerySchema.parse(invalidQuery)).toThrow();

    const tooLargeQuery = {
      limit: 100001,
    };

    expect(() => CustomerSearchQuerySchema.parse(tooLargeQuery)).toThrow();
  });

  it('선택적 필터를 허용한다', () => {
    const queryWithFilters = {
      page: 1,
      limit: 20,
      status: 'active',
      region: '서울',
      hasDocuments: true,
      tags: ['VIP', '고액계약'],
    };

    expect(() => CustomerSearchQuerySchema.parse(queryWithFilters)).not.toThrow();
  });
});

// ============================================
// CustomerSearchResponseSchema 테스트
// ============================================
describe('CustomerSearchResponseSchema', () => {
  it('유효한 검색 응답을 검증한다', () => {
    const validResponse = {
      customers: [
        {
          _id: 'customer-123',
          personal_info: {
            name: '홍길동',
          },
          meta: {
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
      ],
      pagination: {
        currentPage: 1,
        totalPages: 10,
        totalCount: 100,
        hasMore: true,
      },
    };

    expect(() => CustomerSearchResponseSchema.parse(validResponse)).not.toThrow();
  });

  it('빈 고객 목록을 허용한다', () => {
    const emptyResponse = {
      customers: [],
    };

    expect(() => CustomerSearchResponseSchema.parse(emptyResponse)).not.toThrow();
  });

  it('추가 필드를 허용한다 (passthrough)', () => {
    const responseWithExtra = {
      customers: [],
      extraField: 'extra value',
    };

    const result = CustomerSearchResponseSchema.parse(responseWithExtra);
    expect((result as any).extraField).toBe('extra value');
  });

  it('선택적 메타데이터를 허용한다', () => {
    const responseWithMetadata = {
      customers: [],
      tags: ['VIP', '일반'],
      metadata: {
        availableTags: ['VIP', '일반', '고액'],
        totalTags: 3,
      },
    };

    expect(() => CustomerSearchResponseSchema.parse(responseWithMetadata)).not.toThrow();
  });
});
