/**
 * Customer Entity Model Tests
 * @since 2025-10-14
 *
 * CustomerUtils 유틸리티 함수 테스트
 * 고객 데이터 처리 및 변환 로직 검증
 */

import { describe, it, expect } from 'vitest';
import { CustomerUtils, CustomerTypeUtils, type Customer } from './model';

// ============================================
// 테스트 데이터
// ============================================
const mockCustomer: Customer = {
  _id: 'test-customer-1',
  personal_info: {
    name: '홍길동',
    name_en: 'Hong Gildong',
    birth_date: '1990-05-15',
    gender: 'M',
    mobile_phone: '010-1234-5678',
    home_phone: '02-123-4567',
    work_phone: '02-987-6543',
    email: 'hong@example.com',
    address: {
      postal_code: '12345',
      address1: '서울시 강남구 테헤란로 123',
      address2: '삼성빌딩 4층',
    },
  },
  insurance_info: {
    customer_type: '개인',
    risk_level: 'low',
    annual_premium: 1000000,
    total_coverage: 50000000,
  },
  contracts: [],
  documents: [],
  consultations: [],
  meta: {
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    created_by: null,
    last_modified_by: null,
    status: 'active',
    original_name: null,
  },
  tags: ['VIP', '우수고객'],
};

const mockCustomerMinimal: Customer = {
  _id: 'test-customer-2',
  personal_info: {
    name: '김철수',
  },
  contracts: [],
  documents: [],
  consultations: [],
  meta: {
    created_at: '2025-02-01T00:00:00Z',
    updated_at: '2025-02-01T00:00:00Z',
    created_by: null,
    last_modified_by: null,
    status: 'inactive',
    original_name: null,
  },
  tags: [],
};

const mockCustomerNoName: Customer = {
  _id: 'test-customer-3',
  personal_info: {} as any,
  contracts: [],
  documents: [],
  consultations: [],
  meta: {
    created_at: '2025-03-01T00:00:00Z',
    updated_at: '2025-03-01T00:00:00Z',
    created_by: null,
    last_modified_by: null,
    status: 'active',
    original_name: null,
  },
  tags: [],
};

// ============================================
// getDisplayName 테스트
// ============================================
describe('CustomerUtils.getDisplayName', () => {
  it('고객 이름을 반환한다', () => {
    expect(CustomerUtils.getDisplayName(mockCustomer)).toBe('홍길동');
  });

  it('personal_info가 없으면 "이름 없음"을 반환한다', () => {
    expect(CustomerUtils.getDisplayName(mockCustomerNoName)).toBe('이름 없음');
  });

  it('name이 빈 문자열이면 "이름 없음"을 반환한다', () => {
    const customer = { ...mockCustomerNoName, personal_info: { name: '' } };
    expect(CustomerUtils.getDisplayName(customer)).toBe('이름 없음');
  });
});

// ============================================
// getCustomerTypeText 테스트
// ============================================
describe('CustomerUtils.getCustomerTypeText', () => {
  it('개인 고객 타입을 반환한다', () => {
    expect(CustomerUtils.getCustomerTypeText(mockCustomer)).toBe('개인');
  });

  it('법인 고객 타입을 반환한다', () => {
    const corporateCustomer = {
      ...mockCustomer,
      insurance_info: { ...mockCustomer.insurance_info!, customer_type: '법인' as const },
    };
    expect(CustomerUtils.getCustomerTypeText(corporateCustomer)).toBe('법인');
  });

  it('insurance_info가 없으면 "개인"을 반환한다', () => {
    expect(CustomerUtils.getCustomerTypeText(mockCustomerMinimal)).toBe('개인');
  });
});

// ============================================
// getContactInfo 테스트
// ============================================
describe('CustomerUtils.getContactInfo', () => {
  it('전화번호와 이메일을 쉼표로 연결하여 반환한다', () => {
    const result = CustomerUtils.getContactInfo(mockCustomer);
    expect(result).toContain('010-1234-5678');
    expect(result).toContain('hong@example.com');
    expect(result).toContain(', ');
  });

  it('연락처가 없으면 "연락처 없음"을 반환한다', () => {
    expect(CustomerUtils.getContactInfo(mockCustomerMinimal)).toBe('연락처 없음');
  });

  it('전화번호만 있으면 전화번호만 반환한다', () => {
    const customer = {
      ...mockCustomerMinimal,
      personal_info: { ...mockCustomerMinimal.personal_info, mobile_phone: '010-9999-8888' },
    };
    expect(CustomerUtils.getContactInfo(customer)).toBe('010-9999-8888');
  });

  it('이메일만 있으면 이메일만 반환한다', () => {
    const customer = {
      ...mockCustomerMinimal,
      personal_info: { ...mockCustomerMinimal.personal_info, email: 'test@test.com' },
    };
    expect(CustomerUtils.getContactInfo(customer)).toBe('test@test.com');
  });
});

// ============================================
// getAge 테스트 (경계값 중요!)
// ============================================
describe('CustomerUtils.getAge', () => {
  it('생년월일로부터 나이를 계산한다 (1990년생 → 35세)', () => {
    const age = CustomerUtils.getAge(mockCustomer);
    expect(age).toBeGreaterThanOrEqual(34);
    expect(age).toBeLessThanOrEqual(35);
  });

  it('생일이 지나지 않았으면 나이를 1 적게 계산한다', () => {
    const today = new Date();
    // 올해 12월 31일생 (미래 생일)
    const futureBirthday = {
      ...mockCustomer,
      personal_info: {
        ...mockCustomer.personal_info,
        birth_date: `${today.getFullYear()}-12-31`,
      },
    };
    const age = CustomerUtils.getAge(futureBirthday);
    // 12월 31일이 아직 지나지 않았다면 0세, 이미 지났다면 -1세 (올해생)
    expect(age).toBeGreaterThanOrEqual(-1);
    expect(age).toBeLessThanOrEqual(0);
  });

  it('생년월일이 없으면 null을 반환한다', () => {
    expect(CustomerUtils.getAge(mockCustomerMinimal)).toBeNull();
  });

  it('잘못된 날짜 형식이면 null 또는 NaN을 반환한다', () => {
    const invalidCustomer = {
      ...mockCustomer,
      personal_info: { ...mockCustomer.personal_info, birth_date: 'invalid-date' },
    };
    const age = CustomerUtils.getAge(invalidCustomer);
    expect(age === null || isNaN(age)).toBe(true);
  });
});

// ============================================
// getGenderText 테스트
// ============================================
describe('CustomerUtils.getGenderText', () => {
  it('남성(M)을 "남성"으로 반환한다', () => {
    expect(CustomerUtils.getGenderText(mockCustomer)).toBe('남성');
  });

  it('여성(F)을 "여성"으로 반환한다', () => {
    const femaleCustomer = {
      ...mockCustomer,
      personal_info: { ...mockCustomer.personal_info, gender: 'F' as const },
    };
    expect(CustomerUtils.getGenderText(femaleCustomer)).toBe('여성');
  });

  it('성별이 없으면 "미입력"을 반환한다', () => {
    expect(CustomerUtils.getGenderText(mockCustomerMinimal)).toBe('미입력');
  });
});

// ============================================
// getStatusText 테스트
// ============================================
describe('CustomerUtils.getStatusText', () => {
  it('활성 상태를 "활성"으로 반환한다', () => {
    expect(CustomerUtils.getStatusText(mockCustomer)).toBe('활성');
  });

  it('비활성 상태를 "비활성"으로 반환한다', () => {
    expect(CustomerUtils.getStatusText(mockCustomerMinimal)).toBe('비활성');
  });
});

// ============================================
// getAddressText 테스트
// ============================================
describe('CustomerUtils.getAddressText', () => {
  it('주소1과 주소2를 공백으로 연결하여 반환한다', () => {
    const result = CustomerUtils.getAddressText(mockCustomer);
    expect(result).toBe('서울시 강남구 테헤란로 123 삼성빌딩 4층');
  });

  it('주소1만 있으면 주소1만 반환한다', () => {
    const customer = {
      ...mockCustomer,
      personal_info: {
        ...mockCustomer.personal_info,
        address: { address1: '서울시 강남구' },
      },
    };
    expect(CustomerUtils.getAddressText(customer)).toBe('서울시 강남구');
  });

  it('주소가 없으면 "주소 없음"을 반환한다', () => {
    expect(CustomerUtils.getAddressText(mockCustomerMinimal)).toBe('주소 없음');
  });

  it('주소 필드는 있지만 address1, address2가 모두 없으면 "주소 없음"을 반환한다', () => {
    const customer = {
      ...mockCustomer,
      personal_info: { ...mockCustomer.personal_info, address: {} },
    };
    expect(CustomerUtils.getAddressText(customer)).toBe('주소 없음');
  });
});

// ============================================
// sortByName 테스트 (한글 정렬 중요!)
// ============================================
describe('CustomerUtils.sortByName', () => {
  it('한글 이름을 가나다순으로 정렬한다', () => {
    const customers = [
      { ...mockCustomer, personal_info: { name: '홍길동' } },
      { ...mockCustomer, personal_info: { name: '가나다' } },
      { ...mockCustomer, personal_info: { name: '나다라' } },
    ] as Customer[];

    const sorted = [...customers].sort(CustomerUtils.sortByName);

    expect(sorted[0]?.personal_info?.name).toBe('가나다');
    expect(sorted[1]?.personal_info?.name).toBe('나다라');
    expect(sorted[2]?.personal_info?.name).toBe('홍길동');
  });

  it('이름이 없는 고객도 정렬된다', () => {
    const customerWithEmptyName = {
      ...mockCustomer,
      personal_info: {},
    };
    const customers = [
      { ...mockCustomer, personal_info: { name: '홍길동' } },
      customerWithEmptyName,
      { ...mockCustomer, personal_info: { name: '김철수' } },
    ] as Customer[];

    const sorted = [...customers].sort(CustomerUtils.sortByName);

    // localeCompare는 빈 문자열을 첫번째로 정렬함
    expect(sorted[0]?.personal_info?.name).toBeUndefined();
    expect(sorted[1]?.personal_info?.name).toBe('김철수');
    expect(sorted[2]?.personal_info?.name).toBe('홍길동');
  });

  it('숫자가 포함된 이름도 올바르게 정렬한다', () => {
    const customers = [
      { ...mockCustomer, personal_info: { name: '고객2' } },
      { ...mockCustomer, personal_info: { name: '고객10' } },
      { ...mockCustomer, personal_info: { name: '고객1' } },
    ] as Customer[];

    const sorted = [...customers].sort(CustomerUtils.sortByName);

    expect(sorted[0]?.personal_info?.name).toBe('고객1');
    expect(sorted[1]?.personal_info?.name).toBe('고객2');
    expect(sorted[2]?.personal_info?.name).toBe('고객10');
  });
});

// ============================================
// sortByCreatedDate 테스트
// ============================================
describe('CustomerUtils.sortByCreatedDate', () => {
  it('생성일 기준으로 최신순 정렬한다', () => {
    const customers = [
      { ...mockCustomer, meta: { ...mockCustomer.meta, created_at: '2025-01-01T00:00:00Z' } },
      { ...mockCustomer, meta: { ...mockCustomer.meta, created_at: '2025-03-01T00:00:00Z' } },
      { ...mockCustomer, meta: { ...mockCustomer.meta, created_at: '2025-02-01T00:00:00Z' } },
    ] as Customer[];

    const sorted = [...customers].sort(CustomerUtils.sortByCreatedDate);

    expect(sorted[0]?.meta?.created_at).toBe('2025-03-01T00:00:00Z');
    expect(sorted[1]?.meta?.created_at).toBe('2025-02-01T00:00:00Z');
    expect(sorted[2]?.meta?.created_at).toBe('2025-01-01T00:00:00Z');
  });

  it('생성일이 같으면 순서를 유지한다', () => {
    const customers = [
      { ...mockCustomer, _id: 'a', meta: { ...mockCustomer.meta, created_at: '2025-01-01T00:00:00Z' } },
      { ...mockCustomer, _id: 'b', meta: { ...mockCustomer.meta, created_at: '2025-01-01T00:00:00Z' } },
    ] as Customer[];

    const sorted = [...customers].sort(CustomerUtils.sortByCreatedDate);

    // 날짜가 같으면 0을 반환하므로 원래 순서 유지
    expect(sorted[0]?._id).toBe('a');
    expect(sorted[1]?._id).toBe('b');
  });
});

// ============================================
// CustomerTypeUtils 테스트
// ============================================
describe('CustomerTypeUtils.getIcon', () => {
  it('법인은 🏢 아이콘을 반환한다', () => {
    expect(CustomerTypeUtils.getIcon('법인')).toBe('🏢');
  });

  it('개인은 👤 아이콘을 반환한다', () => {
    expect(CustomerTypeUtils.getIcon('개인')).toBe('👤');
  });

  it('기타 타입은 👤 아이콘을 반환한다', () => {
    expect(CustomerTypeUtils.getIcon('기타')).toBe('👤');
  });
});

describe('CustomerTypeUtils.getColor', () => {
  it('법인은 blue 색상을 반환한다', () => {
    expect(CustomerTypeUtils.getColor('법인')).toBe('blue');
  });

  it('개인은 green 색상을 반환한다', () => {
    expect(CustomerTypeUtils.getColor('개인')).toBe('green');
  });

  it('기타 타입은 green 색상을 반환한다', () => {
    expect(CustomerTypeUtils.getColor('기타')).toBe('green');
  });
});

// ============================================
// 엣지 케이스 및 에러 처리 테스트
// ============================================
describe('CustomerUtils - Edge Cases', () => {
  it('모든 필드가 null/undefined인 고객도 처리한다', () => {
    const emptyCustomer = {
      _id: 'empty',
      personal_info: { name: 'Empty' },
      contracts: [],
      documents: [],
      consultations: [],
      meta: {
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        created_by: null,
        last_modified_by: null,
        status: 'active' as const,
        original_name: null,
      },
      tags: [],
    } as Customer;

    expect(CustomerUtils.getDisplayName(emptyCustomer)).toBe('Empty');
    expect(CustomerUtils.getContactInfo(emptyCustomer)).toBe('연락처 없음');
    expect(CustomerUtils.getAddressText(emptyCustomer)).toBe('주소 없음');
    expect(CustomerUtils.getAge(emptyCustomer)).toBeNull();
  });

  it('특수문자가 포함된 이름도 올바르게 처리한다', () => {
    const specialCustomer = {
      ...mockCustomer,
      personal_info: { name: '홍길동(Hong)' },
    };
    expect(CustomerUtils.getDisplayName(specialCustomer)).toBe('홍길동(Hong)');
  });

  it('매우 긴 이름도 처리한다', () => {
    const longNameCustomer = {
      ...mockCustomer,
      personal_info: { name: '가'.repeat(100) },
    };
    expect(CustomerUtils.getDisplayName(longNameCustomer)).toBe('가'.repeat(100));
  });
});
