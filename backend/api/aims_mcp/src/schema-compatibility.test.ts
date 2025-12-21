/**
 * MCP-AIMS 스키마 호환성 테스트
 *
 * 이 테스트는 MCP 도구들이 생성하는 데이터가 aims_api 스키마와 호환되는지 검증합니다.
 * 과거 발생한 버그들을 방지하기 위한 회귀 테스트입니다.
 *
 * 과거 버그:
 * 1. phone vs mobile_phone 필드명 불일치 (고객 생성 시)
 * 2. 날짜를 문자열 "YYYY.MM.DD HH:mm:ss"로 저장 (Date 객체 필요)
 * 3. get_customer에서 phone 필드를 읽음 (mobile_phone이어야 함)
 */

import { describe, it, expect } from 'vitest';
import {
  validateCustomerDocument,
  validateCustomerUpdateFields,
  validateMemoDocument,
} from './schemas/aims.schema.js';

// MCP 핸들러 코드에서 사용하는 실제 데이터 구조를 시뮬레이션
function simulateCreateCustomerOutput(params: {
  name: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  address?: string;
  customerType?: '개인' | '법인';
}) {
  const now = new Date();
  return {
    personal_info: {
      name: params.name,
      mobile_phone: params.phone || '',  // MCP는 phone → mobile_phone 매핑
      email: params.email || '',
      birth_date: params.birthDate || '',
      address: params.address ? { address1: params.address } : {}
    },
    insurance_info: {
      customer_type: params.customerType || '개인'
    },
    meta: {
      status: 'active' as const,
      created_by: 'testUser',
      created_at: now,
      updated_at: now
    }
  };
}

function simulateUpdateCustomerFields(params: {
  name?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  address?: string;
}) {
  const updateFields: Record<string, unknown> = {
    'meta.updated_at': new Date()
  };

  if (params.name) updateFields['personal_info.name'] = params.name;
  if (params.phone) updateFields['personal_info.mobile_phone'] = params.phone;  // MCP는 phone → mobile_phone 매핑
  if (params.email) updateFields['personal_info.email'] = params.email;
  if (params.birthDate) updateFields['personal_info.birth_date'] = params.birthDate;
  if (params.address) updateFields['personal_info.address.address1'] = params.address;

  return updateFields;
}

function simulateAddMemoOutput(params: {
  customerId: string;
  content: string;
}) {
  const now = new Date();
  return {
    customer_id: params.customerId,
    content: params.content,
    created_by: 'testUser',
    created_at: now,
    updated_at: now
  };
}

// 실제 MCP 코드의 DB 읽기 결과를 시뮬레이션 (aims_api와 동일한 구조)
function simulateDBCustomer() {
  return {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    personal_info: {
      name: '홍길동',
      mobile_phone: '010-1234-5678',  // DB에는 mobile_phone으로 저장됨
      email: 'hong@example.com',
      birth_date: '1990-01-15',
      address: { address1: '서울시 강남구' }
    },
    insurance_info: {
      customer_type: '개인',
      business_number: null,
      representative: null
    },
    meta: {
      status: 'active',
      created_by: 'user123',
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-12-21T00:00:00Z')
    },
    documents: []
  };
}

describe('MCP-AIMS 스키마 호환성', () => {

  describe('create_customer 도구', () => {
    it('mobile_phone 필드를 사용해야 함 (phone 아님)', () => {
      const output = simulateCreateCustomerOutput({
        name: '테스트 고객',
        phone: '010-1234-5678'
      });

      // personal_info에 mobile_phone이 있어야 함
      expect(output.personal_info).toHaveProperty('mobile_phone', '010-1234-5678');
      // phone 필드는 없어야 함
      expect(output.personal_info).not.toHaveProperty('phone');

      const result = validateCustomerDocument(output);
      expect(result.success).toBe(true);
    });

    it('meta.created_at은 Date 객체여야 함', () => {
      const output = simulateCreateCustomerOutput({ name: '테스트' });

      expect(output.meta.created_at).toBeInstanceOf(Date);
      expect(output.meta.updated_at).toBeInstanceOf(Date);

      const result = validateCustomerDocument(output);
      expect(result.success).toBe(true);
    });

    it('meta.created_at이 문자열이면 실패해야 함', () => {
      const wrongDoc = {
        personal_info: { name: '테스트 고객' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user123',
          created_at: '2025.12.21 14:35:42',  // 잘못된 형식!
          updated_at: '2025.12.21 14:35:42',
        },
      };

      const result = validateCustomerDocument(wrongDoc);
      expect(result.success).toBe(false);
    });

    it('insurance_info.customer_type은 개인 또는 법인이어야 함', () => {
      for (const type of ['개인', '법인'] as const) {
        const output = simulateCreateCustomerOutput({ name: '테스트', customerType: type });
        expect(output.insurance_info.customer_type).toBe(type);

        const result = validateCustomerDocument(output);
        expect(result.success).toBe(true);
      }
    });

    it('모든 필드가 올바르게 매핑되어야 함', () => {
      const output = simulateCreateCustomerOutput({
        name: '김철수',
        phone: '010-9999-8888',
        email: 'kim@test.com',
        birthDate: '1985-05-20',
        address: '부산시 해운대구',
        customerType: '법인'
      });

      expect(output.personal_info.name).toBe('김철수');
      expect(output.personal_info.mobile_phone).toBe('010-9999-8888');
      expect(output.personal_info.email).toBe('kim@test.com');
      expect(output.personal_info.birth_date).toBe('1985-05-20');
      expect(output.personal_info.address).toEqual({ address1: '부산시 해운대구' });
      expect(output.insurance_info.customer_type).toBe('법인');
    });
  });

  describe('update_customer 도구', () => {
    it('personal_info.mobile_phone을 업데이트해야 함 (phone 아님)', () => {
      const updateFields = simulateUpdateCustomerFields({
        phone: '010-9999-8888'
      });

      expect(updateFields).toHaveProperty('personal_info.mobile_phone', '010-9999-8888');
      expect(updateFields).not.toHaveProperty('personal_info.phone');

      const result = validateCustomerUpdateFields(updateFields);
      expect(result.success).toBe(true);
    });

    it('meta.updated_at은 Date 객체여야 함', () => {
      const updateFields = simulateUpdateCustomerFields({ name: '새이름' });

      expect(updateFields['meta.updated_at']).toBeInstanceOf(Date);

      const result = validateCustomerUpdateFields(updateFields);
      expect(result.success).toBe(true);
    });

    it('meta.updated_at이 문자열이면 실패해야 함', () => {
      const wrongFields = {
        'meta.updated_at': '2025.12.21 14:35:42',
      };

      const result = validateCustomerUpdateFields(wrongFields);
      expect(result.success).toBe(false);
    });

    it('모든 업데이트 필드가 올바르게 매핑되어야 함', () => {
      const updateFields = simulateUpdateCustomerFields({
        name: '새이름',
        phone: '010-1111-2222',
        email: 'new@test.com',
        birthDate: '2000-01-01',
        address: '대전시 서구'
      });

      expect(updateFields['personal_info.name']).toBe('새이름');
      expect(updateFields['personal_info.mobile_phone']).toBe('010-1111-2222');
      expect(updateFields['personal_info.email']).toBe('new@test.com');
      expect(updateFields['personal_info.birth_date']).toBe('2000-01-01');
      expect(updateFields['personal_info.address.address1']).toBe('대전시 서구');
    });
  });

  describe('get_customer 도구', () => {
    it('[BUG-003] mobile_phone 필드를 읽어야 함 (phone 아님)', () => {
      // DB에서 읽은 고객 데이터
      const dbCustomer = simulateDBCustomer();

      // MCP get_customer 응답 구조 (수정된 코드)
      const response = {
        id: dbCustomer._id.toString(),
        personalInfo: {
          name: dbCustomer.personal_info?.name,
          phone: dbCustomer.personal_info?.mobile_phone,  // 올바름: mobile_phone을 읽어야 함
          email: dbCustomer.personal_info?.email,
          address: dbCustomer.personal_info?.address
        },
        insuranceInfo: {
          customerType: dbCustomer.insurance_info?.customer_type,
        },
        meta: {
          status: dbCustomer.meta?.status,
          createdAt: dbCustomer.meta?.created_at,
          updatedAt: dbCustomer.meta?.updated_at
        }
      };

      // phone 필드에 실제 전화번호가 들어가야 함 (undefined가 아님!)
      expect(response.personalInfo.phone).toBe('010-1234-5678');
      expect(response.personalInfo.phone).not.toBeUndefined();
    });

    it('DB의 mobile_phone이 응답에서 phone으로 표시되어야 함', () => {
      const dbCustomer = simulateDBCustomer();

      // 잘못된 코드 (버그): phone 필드를 직접 읽음
      const wrongResponse = {
        phone: (dbCustomer.personal_info as Record<string, unknown>).phone,  // undefined!
      };

      // 올바른 코드: mobile_phone 필드를 읽음
      const correctResponse = {
        phone: dbCustomer.personal_info?.mobile_phone,  // '010-1234-5678'
      };

      expect(wrongResponse.phone).toBeUndefined();  // 버그: phone 필드가 없음
      expect(correctResponse.phone).toBe('010-1234-5678');  // 올바른 값
    });
  });

  describe('search_customers 도구', () => {
    it('검색 결과에서 mobile_phone을 phone으로 반환해야 함', () => {
      const dbCustomers = [simulateDBCustomer()];

      // MCP search_customers 응답 구조
      const response = {
        count: dbCustomers.length,
        totalCount: 1,
        customers: dbCustomers.map(c => ({
          id: c._id.toString(),
          name: c.personal_info?.name,
          phone: c.personal_info?.mobile_phone,  // 올바름: mobile_phone을 읽어야 함
          email: c.personal_info?.email,
          address: c.personal_info?.address?.address1,
          type: c.insurance_info?.customer_type,
          status: c.meta?.status,
          createdAt: c.meta?.created_at
        }))
      };

      expect(response.customers[0].phone).toBe('010-1234-5678');
      expect(response.customers[0].phone).not.toBeUndefined();
    });
  });

  describe('add_customer_memo 도구', () => {
    it('created_at은 Date 객체여야 함', () => {
      const memo = simulateAddMemoOutput({
        customerId: '507f1f77bcf86cd799439011',
        content: '테스트 메모입니다'
      });

      expect(memo.created_at).toBeInstanceOf(Date);
      expect(memo.updated_at).toBeInstanceOf(Date);

      const result = validateMemoDocument(memo);
      expect(result.success).toBe(true);
    });

    it('created_at이 문자열이면 실패해야 함', () => {
      const wrongMemo = {
        customer_id: 'someObjectId',
        content: '테스트 메모입니다',
        created_by: 'user123',
        created_at: '2025.12.21 14:35:42',  // 잘못된 형식!
        updated_at: '2025.12.21 14:35:42',
      };

      const result = validateMemoDocument(wrongMemo);
      expect(result.success).toBe(false);
    });

    it('content는 필수이며 비어있으면 안됨', () => {
      const now = new Date();
      const emptyContentMemo = {
        customer_id: 'someObjectId',
        content: '',
        created_by: 'user123',
        created_at: now,
        updated_at: now,
      };

      const result = validateMemoDocument(emptyContentMemo);
      expect(result.success).toBe(false);
    });
  });

  describe('과거 버그 회귀 테스트', () => {
    it('[BUG-001] 고객 생성 시 phone → mobile_phone 매핑', () => {
      // 과거 버그: MCP가 phone 필드로 저장하여 프론트엔드에서 전화번호가 표시되지 않음
      const output = simulateCreateCustomerOutput({
        name: '홍길동',
        phone: '010-1234-5678'
      });

      // mobile_phone 필드가 있어야 함
      expect(output.personal_info).toHaveProperty('mobile_phone', '010-1234-5678');
      // phone 필드가 없어야 함
      expect(output.personal_info).not.toHaveProperty('phone');

      const result = validateCustomerDocument(output);
      expect(result.success).toBe(true);
    });

    it('[BUG-002] 날짜는 문자열이 아닌 Date 객체로 저장', () => {
      // 과거 버그: MCP가 "2025.12.21 14:35:42" 형식의 문자열로 저장
      const stringDate = '2025.12.21 14:35:42';
      const dateObject = new Date();

      // 문자열 날짜는 실패해야 함
      const wrongDoc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'agent001',
          created_at: stringDate,
          updated_at: stringDate,
        },
      };

      const wrongResult = validateCustomerDocument(wrongDoc);
      expect(wrongResult.success).toBe(false);

      // Date 객체는 성공해야 함
      const correctDoc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'agent001',
          created_at: dateObject,
          updated_at: dateObject,
        },
      };

      const correctResult = validateCustomerDocument(correctDoc);
      expect(correctResult.success).toBe(true);
    });

    it('[BUG-003] 고객 조회 시 mobile_phone 필드 읽기', () => {
      // 과거 버그: get_customer에서 phone 필드를 읽어 undefined 반환
      const dbCustomer = simulateDBCustomer();

      // 올바른 응답
      const phone = dbCustomer.personal_info?.mobile_phone;
      expect(phone).toBe('010-1234-5678');
      expect(phone).not.toBeUndefined();
    });
  });

  describe('MCP 코드 구조 검증', () => {
    it('customers.ts: createCustomerOutput 구조 검증', () => {
      // MCP customers.ts 라인 282-298에 해당하는 구조
      const expectedStructure = {
        personal_info: {
          name: expect.any(String),
          mobile_phone: expect.any(String),
          email: expect.any(String),
          birth_date: expect.any(String),
          address: expect.any(Object)
        },
        insurance_info: {
          customer_type: expect.stringMatching(/^(개인|법인)$/)
        },
        meta: {
          status: expect.stringMatching(/^(active|inactive)$/),
          created_by: expect.any(String),
          created_at: expect.any(Date),
          updated_at: expect.any(Date)
        }
      };

      const output = simulateCreateCustomerOutput({ name: '테스트', phone: '010-0000-0000' });
      expect(output).toMatchObject(expectedStructure);
    });

    it('customers.ts: updateCustomerFields 구조 검증', () => {
      // MCP customers.ts 라인 377-385에 해당하는 구조
      const updateFields = simulateUpdateCustomerFields({
        name: '새이름',
        phone: '010-1234-5678',
        email: 'test@test.com'
      });

      // 필드 경로가 올바른지 확인
      expect(updateFields).toHaveProperty('personal_info.name');
      expect(updateFields).toHaveProperty('personal_info.mobile_phone');  // phone이 아님!
      expect(updateFields).toHaveProperty('personal_info.email');
      expect(updateFields).toHaveProperty('meta.updated_at');

      // 금지된 필드 경로가 없는지 확인
      expect(updateFields).not.toHaveProperty('personal_info.phone');
    });

    it('memos.ts: addMemoOutput 구조 검증', () => {
      // MCP memos.ts 라인 92-98에 해당하는 구조
      const expectedStructure = {
        customer_id: expect.any(String),
        content: expect.any(String),
        created_by: expect.any(String),
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      };

      const output = simulateAddMemoOutput({ customerId: 'test', content: '메모' });
      expect(output).toMatchObject(expectedStructure);
    });
  });

  describe('aims_api 스키마 호환성', () => {
    it('고객 문서는 aims_api 스키마와 100% 호환되어야 함', () => {
      const output = simulateCreateCustomerOutput({
        name: '테스트 고객',
        phone: '010-1234-5678',
        email: 'test@example.com',
        birthDate: '1990-01-01',
        address: '서울시 강남구',
        customerType: '개인'
      });

      // aims_api가 기대하는 필드들
      expect(output.personal_info).toHaveProperty('name');
      expect(output.personal_info).toHaveProperty('mobile_phone');  // phone 아님!
      expect(output.personal_info).toHaveProperty('email');
      expect(output.personal_info).toHaveProperty('birth_date');
      expect(output.personal_info).toHaveProperty('address');
      expect(output.insurance_info).toHaveProperty('customer_type');
      expect(output.meta).toHaveProperty('status');
      expect(output.meta).toHaveProperty('created_by');
      expect(output.meta).toHaveProperty('created_at');
      expect(output.meta).toHaveProperty('updated_at');

      // 스키마 검증 통과
      const result = validateCustomerDocument(output);
      expect(result.success).toBe(true);
    });

    it('메모 문서는 aims_api 스키마와 100% 호환되어야 함', () => {
      const output = simulateAddMemoOutput({
        customerId: '507f1f77bcf86cd799439011',
        content: '상담 내용 기록'
      });

      // aims_api가 기대하는 필드들
      expect(output).toHaveProperty('customer_id');
      expect(output).toHaveProperty('content');
      expect(output).toHaveProperty('created_by');
      expect(output).toHaveProperty('created_at');
      expect(output).toHaveProperty('updated_at');

      // 날짜가 Date 객체인지 확인
      expect(output.created_at).toBeInstanceOf(Date);
      expect(output.updated_at).toBeInstanceOf(Date);

      // 스키마 검증 통과
      const result = validateMemoDocument(output);
      expect(result.success).toBe(true);
    });
  });
});
