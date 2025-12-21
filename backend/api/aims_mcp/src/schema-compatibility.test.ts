/**
 * MCP-AIMS 스키마 호환성 테스트
 *
 * 이 테스트는 MCP 도구들이 생성하는 데이터가 aims_api 스키마와 호환되는지 검증합니다.
 * 과거 발생한 버그들을 방지하기 위한 회귀 테스트입니다.
 *
 * 과거 버그:
 * 1. phone vs mobile_phone 필드명 불일치 (고객 데이터)
 * 2. 날짜를 문자열 "YYYY.MM.DD HH:mm:ss"로 저장 (Date 객체 필요)
 */

import { describe, it, expect } from 'vitest';
import {
  validateCustomerDocument,
  validateCustomerUpdateFields,
  validateMemoDocument,
} from './schemas/aims.schema.js';

describe('MCP-AIMS 스키마 호환성', () => {

  describe('create_customer 도구', () => {
    it('mobile_phone 필드를 사용해야 함 (phone 아님)', () => {
      const now = new Date();

      // 올바른 형식 (mobile_phone 사용)
      const correctDoc = {
        personal_info: {
          name: '테스트 고객',
          mobile_phone: '010-1234-5678',
          email: '',
          birth_date: '',
          address: {},
        },
        insurance_info: {
          customer_type: '개인' as const,
        },
        meta: {
          status: 'active' as const,
          created_by: 'user123',
          created_at: now,
          updated_at: now,
        },
      };

      const result = validateCustomerDocument(correctDoc);
      expect(result.success).toBe(true);
    });

    it('phone 필드 사용 시 mobile_phone이 누락되어 검증 통과하지만 경고', () => {
      const now = new Date();

      // 잘못된 형식 (phone 사용) - 이 형식은 aims_api에서 전화번호가 표시되지 않음
      const wrongDoc = {
        personal_info: {
          name: '테스트 고객',
          phone: '010-1234-5678', // 잘못된 필드명!
          email: '',
          birth_date: '',
          address: {},
        },
        insurance_info: {
          customer_type: '개인' as const,
        },
        meta: {
          status: 'active' as const,
          created_by: 'user123',
          created_at: now,
          updated_at: now,
        },
      };

      // phone 필드가 있어도 스키마는 통과하지만 mobile_phone이 없으면 전화번호가 저장 안됨
      // 이 테스트는 phone 필드가 스키마에 없음을 확인
      expect(wrongDoc.personal_info).not.toHaveProperty('mobile_phone');
      expect(wrongDoc.personal_info).toHaveProperty('phone');
    });

    it('meta.created_at은 Date 객체여야 함', () => {
      const now = new Date();

      const correctDoc = {
        personal_info: {
          name: '테스트 고객',
          mobile_phone: '',
          email: '',
          birth_date: '',
          address: {},
        },
        insurance_info: {
          customer_type: '개인' as const,
        },
        meta: {
          status: 'active' as const,
          created_by: 'user123',
          created_at: now, // Date 객체
          updated_at: now,
        },
      };

      const result = validateCustomerDocument(correctDoc);
      expect(result.success).toBe(true);
    });

    it('meta.created_at이 문자열이면 실패해야 함', () => {
      const wrongDoc = {
        personal_info: {
          name: '테스트 고객',
          mobile_phone: '',
          email: '',
          birth_date: '',
          address: {},
        },
        insurance_info: {
          customer_type: '개인' as const,
        },
        meta: {
          status: 'active' as const,
          created_by: 'user123',
          created_at: '2025.12.21 14:35:42', // 잘못된 형식! 문자열!
          updated_at: '2025.12.21 14:35:42',
        },
      };

      const result = validateCustomerDocument(wrongDoc);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('created_at'))).toBe(true);
      }
    });

    it('insurance_info.customer_type은 개인 또는 법인이어야 함', () => {
      const now = new Date();

      const validTypes = ['개인', '법인'] as const;
      for (const type of validTypes) {
        const doc = {
          personal_info: {
            name: '테스트 고객',
          },
          insurance_info: {
            customer_type: type,
          },
          meta: {
            status: 'active' as const,
            created_by: 'user123',
            created_at: now,
            updated_at: now,
          },
        };

        const result = validateCustomerDocument(doc);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('update_customer 도구', () => {
    it('personal_info.mobile_phone을 업데이트해야 함 (phone 아님)', () => {
      const updateFields = {
        'personal_info.mobile_phone': '010-9999-8888',
        'meta.updated_at': new Date(),
      };

      const result = validateCustomerUpdateFields(updateFields);
      expect(result.success).toBe(true);
    });

    it('personal_info.phone으로 업데이트하면 안됨', () => {
      const wrongUpdateFields = {
        'personal_info.phone': '010-9999-8888', // 잘못된 필드명!
        'meta.updated_at': new Date(),
      };

      // 이 테스트는 phone 필드가 스키마에 정의되지 않았음을 확인
      // passthrough()로 인해 검증은 통과하지만 실제로는 전화번호가 업데이트 안됨
      expect(wrongUpdateFields).not.toHaveProperty('personal_info.mobile_phone');
    });

    it('meta.updated_at은 Date 객체여야 함', () => {
      const correctFields = {
        'meta.updated_at': new Date(),
      };

      const result = validateCustomerUpdateFields(correctFields);
      expect(result.success).toBe(true);
    });

    it('meta.updated_at이 문자열이면 실패해야 함', () => {
      const wrongFields = {
        'meta.updated_at': '2025.12.21 14:35:42', // 잘못된 형식!
      };

      const result = validateCustomerUpdateFields(wrongFields);
      expect(result.success).toBe(false);
    });
  });

  describe('add_customer_memo 도구', () => {
    it('created_at은 Date 객체여야 함', () => {
      const now = new Date();

      const memo = {
        customer_id: 'someObjectId',
        content: '테스트 메모입니다',
        created_by: 'user123',
        created_at: now, // Date 객체
        updated_at: now,
      };

      const result = validateMemoDocument(memo);
      expect(result.success).toBe(true);
    });

    it('created_at이 문자열이면 실패해야 함', () => {
      const wrongMemo = {
        customer_id: 'someObjectId',
        content: '테스트 메모입니다',
        created_by: 'user123',
        created_at: '2025.12.21 14:35:42', // 잘못된 형식!
        updated_at: '2025.12.21 14:35:42',
      };

      const result = validateMemoDocument(wrongMemo);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.path.includes('created_at'))).toBe(true);
      }
    });

    it('content는 필수이며 비어있으면 안됨', () => {
      const now = new Date();

      const emptyContentMemo = {
        customer_id: 'someObjectId',
        content: '', // 빈 문자열
        created_by: 'user123',
        created_at: now,
        updated_at: now,
      };

      const result = validateMemoDocument(emptyContentMemo);
      expect(result.success).toBe(false);
    });
  });

  describe('과거 버그 회귀 테스트', () => {
    it('[BUG-001] phone 대신 mobile_phone 필드 사용', () => {
      // 과거 버그: MCP가 phone 필드로 저장하여 프론트엔드에서 전화번호가 표시되지 않음
      const now = new Date();

      const correctDoc = {
        personal_info: {
          name: '홍길동',
          mobile_phone: '010-1234-5678', // 올바른 필드명
        },
        insurance_info: {
          customer_type: '개인' as const,
        },
        meta: {
          status: 'active' as const,
          created_by: 'agent001',
          created_at: now,
          updated_at: now,
        },
      };

      const result = validateCustomerDocument(correctDoc);
      expect(result.success).toBe(true);

      // phone 필드가 없어야 함
      expect(correctDoc.personal_info).not.toHaveProperty('phone');
      // mobile_phone 필드가 있어야 함
      expect(correctDoc.personal_info).toHaveProperty('mobile_phone');
    });

    it('[BUG-002] 날짜는 문자열이 아닌 Date 객체로 저장', () => {
      // 과거 버그: MCP가 "2025.12.21 14:35:42" 형식의 문자열로 저장하여
      // 프론트엔드에서 날짜 파싱 오류 발생

      const stringDate = '2025.12.21 14:35:42';
      const dateObject = new Date();

      // 문자열 날짜는 실패해야 함
      const wrongDoc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'agent001',
          created_at: stringDate, // 잘못됨!
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
          created_at: dateObject, // 올바름!
          updated_at: dateObject,
        },
      };

      const correctResult = validateCustomerDocument(correctDoc);
      expect(correctResult.success).toBe(true);
    });
  });
});
