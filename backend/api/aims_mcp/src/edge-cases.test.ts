/**
 * MCP-AIMS 엣지 케이스 테스트
 *
 * 실제 런타임에서 발생할 수 있는 다양한 엣지 케이스를 검증합니다.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCustomerDocument,
  validateCustomerUpdateFields,
  validateMemoDocument,
} from './schemas/aims.schema.js';

describe('엣지 케이스 테스트', () => {

  describe('빈 문자열 처리', () => {
    it('고객: 빈 mobile_phone 허용', () => {
      const doc = {
        personal_info: {
          name: '테스트',
          mobile_phone: '',  // 빈 문자열
          email: '',
          birth_date: '',
          address: {}
        },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      const result = validateCustomerDocument(doc);
      expect(result.success).toBe(true);
    });

    it('메모: 빈 content 거부', () => {
      const memo = {
        customer_id: 'someId',
        content: '',  // 빈 문자열 - 거부되어야 함
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      const result = validateMemoDocument(memo);
      expect(result.success).toBe(false);
    });
  });

  describe('특수 문자 처리', () => {
    it('고객명에 특수 문자 허용', () => {
      const specialNames = [
        '홍길동',           // 한글
        'John Doe',        // 영문 + 공백
        '김철수 (대표)',    // 괄호
        "O'Brien",         // 아포스트로피
        '이-수',           // 하이픈
        '박.진영',         // 점
      ];

      for (const name of specialNames) {
        const doc = {
          personal_info: { name },
          insurance_info: { customer_type: '개인' as const },
          meta: {
            status: 'active' as const,
            created_by: 'user',
            created_at: new Date(),
            updated_at: new Date()
          }
        };
        const result = validateCustomerDocument(doc);
        expect(result.success, `이름 "${name}" 실패`).toBe(true);
      }
    });

    it('메모 content에 특수 문자 허용', () => {
      const specialContents = [
        '상담 내용: 보험료 인상 안내',
        '다음 미팅 일정 - 2025년 1월 15일',
        '고객 요청: "추가 담보 검토"',
        '연락처 변경됨 (010-1234-5678 → 010-9999-8888)',
        '긴급! 클레임 처리 필요',
        '한글/English/123/특수!@#$%',
      ];

      for (const content of specialContents) {
        const memo = {
          customer_id: 'someId',
          content,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        };
        const result = validateMemoDocument(memo);
        expect(result.success, `내용 "${content}" 실패`).toBe(true);
      }
    });
  });

  describe('날짜 형식 검증', () => {
    it('Date 객체 허용', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('YYYY.MM.DD HH:mm:ss 문자열 거부', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: '2025.12.21 14:35:42',  // 잘못된 형식
          updated_at: '2025.12.21 14:35:42'
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });

    it('YYYY-MM-DD 문자열 거부', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: '2025-12-21',  // 잘못된 형식
          updated_at: '2025-12-21'
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });

    it('ISO 문자열 거부 (Date 객체만 허용)', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: '2025-12-21T14:35:42.000Z',  // ISO 문자열도 거부
          updated_at: '2025-12-21T14:35:42.000Z'
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });

    it('숫자(타임스탬프) 거부', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: 1734789342000,  // 타임스탬프
          updated_at: 1734789342000
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });
  });

  describe('customer_type 검증', () => {
    it('개인 허용', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('법인 허용', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '법인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('잘못된 customer_type 거부', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '기타' },  // 잘못된 값
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });
  });

  describe('status 검증', () => {
    it('active 허용', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('inactive 허용', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'inactive' as const,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('잘못된 status 거부', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'deleted',  // 잘못된 값
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });
  });

  describe('업데이트 필드 검증', () => {
    it('올바른 필드 경로 허용', () => {
      const fields = {
        'personal_info.name': '새이름',
        'personal_info.mobile_phone': '010-1234-5678',
        'personal_info.email': 'test@test.com',
        'personal_info.birth_date': '1990-01-01',
        'personal_info.address.address1': '서울시',
        'meta.updated_at': new Date()
      };
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
    });

    it('meta.updated_at이 문자열이면 거부', () => {
      const fields = {
        'personal_info.name': '새이름',
        'meta.updated_at': '2025-12-21T00:00:00Z'
      };
      expect(validateCustomerUpdateFields(fields).success).toBe(false);
    });
  });

  describe('필수 필드 검증', () => {
    it('고객: name 필수', () => {
      const doc = {
        personal_info: {},  // name 없음
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });

    it('고객: created_by 필수', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          // created_by 없음
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });

    it('메모: content 필수', () => {
      const memo = {
        customer_id: 'someId',
        // content 없음
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(false);
    });

    it('메모: created_by 필수', () => {
      const memo = {
        customer_id: 'someId',
        content: '테스트 메모',
        // created_by 없음
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(false);
    });
  });

  describe('긴 문자열 처리', () => {
    it('긴 고객명 허용', () => {
      const longName = '가'.repeat(100);  // 100자 한글
      const doc = {
        personal_info: { name: longName },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('긴 메모 content 허용', () => {
      const longContent = '상담내용: ' + '가'.repeat(10000);  // 10000자
      const memo = {
        customer_id: 'someId',
        content: longContent,
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });
  });
});
