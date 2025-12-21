/**
 * 데이터 변환 시뮬레이션 테스트
 *
 * MCP 도구들이 입력 데이터를 MongoDB 문서로 변환하는 과정을 시뮬레이션
 */

import { describe, it, expect } from 'vitest';
import {
  validateCustomerDocument,
  validateCustomerUpdateFields,
  validateMemoDocument,
} from './schemas/aims.schema.js';

describe('데이터 변환 시뮬레이션', () => {

  describe('create_customer 시뮬레이션', () => {

    /**
     * 실제 customers.ts의 handleCreateCustomer 로직 시뮬레이션
     */
    function simulateCreateCustomer(params: {
      name: string;
      customerType?: '개인' | '법인';
      phone?: string;
      email?: string;
      birthDate?: string;
      address?: string;
    }, userId: string) {
      const now = new Date();
      return {
        personal_info: {
          name: params.name,
          mobile_phone: params.phone || '',  // phone → mobile_phone 변환!
          email: params.email || '',
          birth_date: params.birthDate || '',
          address: params.address ? { address1: params.address } : {}
        },
        insurance_info: {
          customer_type: params.customerType || '개인'
        },
        meta: {
          status: 'active' as const,
          created_by: userId,
          created_at: now,  // Date 객체!
          updated_at: now   // Date 객체!
        }
      };
    }

    it('기본 입력: 이름만', () => {
      const result = simulateCreateCustomer({ name: '홍길동' }, 'user123');
      expect(validateCustomerDocument(result).success).toBe(true);
    });

    it('전체 입력: 모든 필드', () => {
      const result = simulateCreateCustomer({
        name: '홍길동',
        customerType: '개인',
        phone: '010-1234-5678',
        email: 'hong@example.com',
        birthDate: '1990-01-15',
        address: '서울시 강남구'
      }, 'user123');
      expect(validateCustomerDocument(result).success).toBe(true);
      // mobile_phone 필드 확인
      expect(result.personal_info.mobile_phone).toBe('010-1234-5678');
    });

    it('법인 고객', () => {
      const result = simulateCreateCustomer({
        name: '(주)테스트회사',
        customerType: '법인'
      }, 'user123');
      expect(validateCustomerDocument(result).success).toBe(true);
      expect(result.insurance_info.customer_type).toBe('법인');
    });

    it('선택 필드 없음', () => {
      const result = simulateCreateCustomer({
        name: '김철수'
      }, 'user123');
      expect(validateCustomerDocument(result).success).toBe(true);
      expect(result.personal_info.mobile_phone).toBe('');
      expect(result.personal_info.email).toBe('');
    });

    it('날짜가 Date 객체인지 확인', () => {
      const result = simulateCreateCustomer({ name: '테스트' }, 'user123');
      expect(result.meta.created_at).toBeInstanceOf(Date);
      expect(result.meta.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('update_customer 시뮬레이션', () => {

    /**
     * 실제 customers.ts의 handleUpdateCustomer 업데이트 필드 구성 시뮬레이션
     */
    function simulateUpdateFields(params: {
      name?: string;
      phone?: string;
      email?: string;
      birthDate?: string;
      address?: string;
    }) {
      const updateFields: Record<string, unknown> = {
        'meta.updated_at': new Date()  // Date 객체!
      };

      if (params.name) updateFields['personal_info.name'] = params.name;
      if (params.phone) updateFields['personal_info.mobile_phone'] = params.phone;  // phone → mobile_phone!
      if (params.email) updateFields['personal_info.email'] = params.email;
      if (params.birthDate) updateFields['personal_info.birth_date'] = params.birthDate;
      if (params.address) updateFields['personal_info.address.address1'] = params.address;

      return updateFields;
    }

    it('이름만 업데이트', () => {
      const fields = simulateUpdateFields({ name: '새이름' });
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
      expect(fields['personal_info.name']).toBe('새이름');
    });

    it('전화번호 업데이트 - mobile_phone 경로 사용', () => {
      const fields = simulateUpdateFields({ phone: '010-9999-8888' });
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
      expect(fields['personal_info.mobile_phone']).toBe('010-9999-8888');
      expect(fields['personal_info.phone']).toBeUndefined();
    });

    it('모든 필드 업데이트', () => {
      const fields = simulateUpdateFields({
        name: '새이름',
        phone: '010-1111-2222',
        email: 'new@email.com',
        birthDate: '1985-06-20',
        address: '부산시 해운대구'
      });
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
    });

    it('updated_at이 Date 객체인지 확인', () => {
      const fields = simulateUpdateFields({ name: '테스트' });
      expect(fields['meta.updated_at']).toBeInstanceOf(Date);
    });
  });

  describe('add_customer_memo 시뮬레이션', () => {

    /**
     * 실제 memos.ts의 handleAddMemo 문서 생성 시뮬레이션
     */
    function simulateCreateMemo(params: {
      customerId: string;
      content: string;
    }, userId: string) {
      const now = new Date();
      return {
        customer_id: params.customerId,  // ObjectId가 되어야 하지만, 시뮬레이션에서는 문자열
        content: params.content,
        created_by: userId,
        created_at: now,  // Date 객체!
        updated_at: now   // Date 객체!
      };
    }

    it('기본 메모 생성', () => {
      const result = simulateCreateMemo({
        customerId: '507f1f77bcf86cd799439011',
        content: '상담 내용 기록'
      }, 'user123');
      expect(validateMemoDocument(result).success).toBe(true);
    });

    it('긴 메모 내용', () => {
      const longContent = '메모 '.repeat(5000);
      const result = simulateCreateMemo({
        customerId: '507f1f77bcf86cd799439011',
        content: longContent
      }, 'user123');
      expect(validateMemoDocument(result).success).toBe(true);
    });

    it('특수문자 포함 메모', () => {
      const result = simulateCreateMemo({
        customerId: '507f1f77bcf86cd799439011',
        content: '고객 요청: "추가 담보 필요" - 확인 완료!'
      }, 'user123');
      expect(validateMemoDocument(result).success).toBe(true);
    });

    it('날짜가 Date 객체인지 확인', () => {
      const result = simulateCreateMemo({
        customerId: '507f1f77bcf86cd799439011',
        content: '테스트'
      }, 'user123');
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('잘못된 변환 패턴 시뮬레이션', () => {

    /**
     * BUG-001: phone 필드명을 그대로 사용 (수정 전 버그)
     */
    function buggyCreateCustomer_BUG001(params: { name: string; phone?: string }, userId: string) {
      const now = new Date();
      return {
        personal_info: {
          name: params.name,
          phone: params.phone || '',  // 버그! mobile_phone이어야 함
        },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: userId,
          created_at: now,
          updated_at: now
        }
      };
    }

    it('BUG-001: phone 필드 사용 시 mobile_phone 없음 확인', () => {
      const result = buggyCreateCustomer_BUG001({ name: '테스트', phone: '010-1234-5678' }, 'user');
      // 스키마는 mobile_phone을 기대하지만, phone 필드가 있음
      expect(result.personal_info).toHaveProperty('phone');
      expect(result.personal_info).not.toHaveProperty('mobile_phone');
    });

    /**
     * BUG-002: 날짜를 문자열로 저장 (수정 전 버그)
     */
    function buggyCreateCustomer_BUG002(params: { name: string }, userId: string) {
      const now = new Date();
      const dateString = now.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).replace(/\. /g, '.').replace('. ', ' ');

      return {
        personal_info: { name: params.name },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: userId,
          created_at: dateString,  // 버그! Date 객체여야 함
          updated_at: dateString   // 버그! Date 객체여야 함
        }
      };
    }

    it('BUG-002: 날짜 문자열 사용 시 스키마 검증 실패', () => {
      const result = buggyCreateCustomer_BUG002({ name: '테스트' }, 'user');
      expect(validateCustomerDocument(result).success).toBe(false);
    });

    /**
     * BUG-003: 업데이트 시 personal_info.phone 경로 사용 (수정 전 버그)
     */
    function buggyUpdateFields_BUG003(params: { phone?: string }) {
      const updateFields: Record<string, unknown> = {
        'meta.updated_at': new Date()
      };
      if (params.phone) {
        updateFields['personal_info.phone'] = params.phone;  // 버그! mobile_phone이어야 함
      }
      return updateFields;
    }

    it('BUG-003: personal_info.phone 경로 사용 시 mobile_phone 경로 없음', () => {
      const result = buggyUpdateFields_BUG003({ phone: '010-9999-8888' });
      expect(result).toHaveProperty('personal_info.phone');
      expect(result).not.toHaveProperty('personal_info.mobile_phone');
    });
  });

  describe('데이터 정규화 테스트', () => {

    it('전화번호 정규화: 다양한 형식', () => {
      const phoneFormats = [
        '01012345678',
        '010-1234-5678',
        '010.1234.5678',
        '010 1234 5678',
        '+82-10-1234-5678',
        '82-10-1234-5678',
      ];

      for (const phone of phoneFormats) {
        const doc = {
          personal_info: {
            name: '테스트',
            mobile_phone: phone
          },
          insurance_info: { customer_type: '개인' as const },
          meta: {
            status: 'active' as const,
            created_by: 'user',
            created_at: new Date(),
            updated_at: new Date()
          }
        };
        expect(validateCustomerDocument(doc).success, `전화번호 "${phone}" 실패`).toBe(true);
      }
    });

    it('이메일 형식 다양성', () => {
      const emails = [
        'simple@example.com',
        'very.common@example.com',
        'disposable.style.email.with+symbol@example.com',
        'other.email-with-hyphen@example.com',
        'fully-qualified-domain@example.com',
        'user.name+tag+sorting@example.com',
        'x@example.com',
        'example-indeed@strange-example.com',
        'admin@mailserver1',  // 로컬 메일 서버
        '#!$%&\'*+-/=?^_`{}|~@example.org',
      ];

      for (const email of emails) {
        const doc = {
          personal_info: {
            name: '테스트',
            email: email
          },
          insurance_info: { customer_type: '개인' as const },
          meta: {
            status: 'active' as const,
            created_by: 'user',
            created_at: new Date(),
            updated_at: new Date()
          }
        };
        // 스키마는 email 형식을 강제하지 않으므로 모두 통과
        expect(validateCustomerDocument(doc).success).toBe(true);
      }
    });

    it('생년월일 형식 다양성', () => {
      const birthDates = [
        '1990-01-15',
        '2000-12-31',
        '1950-06-01',
        '19900115',  // 하이픈 없음
        '1990/01/15',  // 슬래시
        '15-01-1990',  // 역순
      ];

      for (const birthDate of birthDates) {
        const doc = {
          personal_info: {
            name: '테스트',
            birth_date: birthDate
          },
          insurance_info: { customer_type: '개인' as const },
          meta: {
            status: 'active' as const,
            created_by: 'user',
            created_at: new Date(),
            updated_at: new Date()
          }
        };
        // 스키마는 birth_date 형식을 강제하지 않으므로 모두 통과
        expect(validateCustomerDocument(doc).success).toBe(true);
      }
    });

    it('주소 형식 다양성', () => {
      const addresses = [
        '서울시 강남구 역삼동 123-45',
        '서울특별시 강남구 테헤란로 123, ABC빌딩 5층',
        '경기도 성남시 분당구 정자동 123',
        '부산광역시 해운대구 우동 123-4 마린시티아파트 101동 1001호',
        '제주특별자치도 제주시 애월읍 123',
        '인천광역시 연수구 송도동 123번지',
      ];

      for (const address of addresses) {
        const doc = {
          personal_info: {
            name: '테스트',
            address: { address1: address }
          },
          insurance_info: { customer_type: '개인' as const },
          meta: {
            status: 'active' as const,
            created_by: 'user',
            created_at: new Date(),
            updated_at: new Date()
          }
        };
        expect(validateCustomerDocument(doc).success).toBe(true);
      }
    });
  });

  describe('연속 작업 시뮬레이션', () => {

    it('고객 생성 → 업데이트 → 메모 추가 흐름', () => {
      const userId = 'user123';
      const customerId = '507f1f77bcf86cd799439011';

      // 1. 고객 생성
      const createParams = {
        name: '홍길동',
        phone: '010-1234-5678',
        email: 'hong@example.com'
      };

      const now1 = new Date();
      const customer = {
        personal_info: {
          name: createParams.name,
          mobile_phone: createParams.phone || '',
          email: createParams.email || '',
          birth_date: '',
          address: {}
        },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: userId,
          created_at: now1,
          updated_at: now1
        }
      };
      expect(validateCustomerDocument(customer).success).toBe(true);

      // 2. 고객 정보 업데이트
      const now2 = new Date();
      const updateFields = {
        'personal_info.mobile_phone': '010-9999-8888',
        'personal_info.address.address1': '서울시 강남구',
        'meta.updated_at': now2
      };
      expect(validateCustomerUpdateFields(updateFields).success).toBe(true);

      // 3. 메모 추가
      const now3 = new Date();
      const memo = {
        customer_id: customerId,
        content: '전화번호 변경 및 주소 업데이트 완료',
        created_by: userId,
        created_at: now3,
        updated_at: now3
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });

    it('여러 고객 동시 생성 시뮬레이션', () => {
      const customers = [
        { name: '홍길동', phone: '010-1111-1111' },
        { name: '김철수', phone: '010-2222-2222' },
        { name: '이영희', phone: '010-3333-3333' },
        { name: '박민수', phone: '010-4444-4444' },
        { name: '정미영', phone: '010-5555-5555' }
      ];

      const now = new Date();
      for (const customer of customers) {
        const doc = {
          personal_info: {
            name: customer.name,
            mobile_phone: customer.phone,
            email: '',
            birth_date: '',
            address: {}
          },
          insurance_info: { customer_type: '개인' as const },
          meta: {
            status: 'active' as const,
            created_by: 'user123',
            created_at: now,
            updated_at: now
          }
        };
        expect(validateCustomerDocument(doc).success, `고객 "${customer.name}" 실패`).toBe(true);
      }
    });

    it('동일 고객에 여러 메모 추가 시뮬레이션', () => {
      const customerId = '507f1f77bcf86cd799439011';
      const memoContents = [
        '첫 상담: 보험료 문의',
        '두번째 상담: 가입 결정',
        '세번째 상담: 추가 담보 문의',
        '네번째 상담: 계약 완료',
        '다섯번째 상담: 사후 관리'
      ];

      for (const content of memoContents) {
        const now = new Date();
        const memo = {
          customer_id: customerId,
          content,
          created_by: 'user123',
          created_at: now,
          updated_at: now
        };
        expect(validateMemoDocument(memo).success, `메모 "${content}" 실패`).toBe(true);
      }
    });
  });
});
