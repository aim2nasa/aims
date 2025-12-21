/**
 * 스트레스 및 성능 시뮬레이션 테스트
 *
 * 극한 상황에서 스키마와 데이터 처리가 올바르게 동작하는지 검증
 */

import { describe, it, expect } from 'vitest';
import {
  validateCustomerDocument,
  validateCustomerUpdateFields,
  validateMemoDocument,
} from './schemas/aims.schema.js';

describe('스트레스 테스트', () => {

  describe('대량 데이터 검증', () => {

    it('100개 고객 문서 연속 검증', () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const doc = {
          personal_info: {
            name: `고객${i}`,
            mobile_phone: `010-0000-${String(i).padStart(4, '0')}`,
            email: `customer${i}@example.com`
          },
          insurance_info: { customer_type: i % 2 === 0 ? '개인' as const : '법인' as const },
          meta: {
            status: 'active' as const,
            created_by: 'user',
            created_at: new Date(),
            updated_at: new Date()
          }
        };
        expect(validateCustomerDocument(doc).success).toBe(true);
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);  // 1초 이내
    });

    it('100개 메모 문서 연속 검증', () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const memo = {
          customer_id: `507f1f77bcf86cd79943901${String(i % 10)}`,
          content: `메모 내용 ${i}: 상담 진행 중`,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        };
        expect(validateMemoDocument(memo).success).toBe(true);
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);
    });

    it('100개 업데이트 필드 연속 검증', () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const fields = {
          'personal_info.name': `새이름${i}`,
          'personal_info.mobile_phone': `010-9999-${String(i).padStart(4, '0')}`,
          'meta.updated_at': new Date()
        };
        expect(validateCustomerUpdateFields(fields).success).toBe(true);
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('극단적 문자열 길이', () => {

    it('100,000자 이름 검증', () => {
      const longName = '가'.repeat(100000);
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

    it('1,000,000자 메모 검증', () => {
      const longContent = '메모'.repeat(500000);
      const memo = {
        customer_id: 'someId',
        content: longContent,
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });

    it('10,000자 이메일 검증', () => {
      const longEmail = 'a'.repeat(9900) + '@test.com';
      const doc = {
        personal_info: {
          name: '테스트',
          email: longEmail
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
    });

    it('10,000자 전화번호 검증', () => {
      const longPhone = '010-' + '1234-'.repeat(2000);
      const doc = {
        personal_info: {
          name: '테스트',
          mobile_phone: longPhone
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
    });

    it('10,000자 주소 검증', () => {
      const longAddress = '서울시 강남구 '.repeat(700);
      const doc = {
        personal_info: {
          name: '테스트',
          address: { address1: longAddress }
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
    });
  });

  describe('특수 문자 조합', () => {

    it('모든 ASCII 특수문자 포함 이름', () => {
      const specialChars = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
      const doc = {
        personal_info: { name: `테스트${specialChars}` },
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

    it('제어 문자 포함 메모', () => {
      // 탭, 줄바꿈, 캐리지 리턴
      const controlChars = 'Hello\tWorld\nNew Line\rCarriage';
      const memo = {
        customer_id: 'someId',
        content: controlChars,
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });

    it('널 문자 포함 (문자열 내 \\0)', () => {
      const withNull = 'Hello\x00World';
      const memo = {
        customer_id: 'someId',
        content: withNull,
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });

    it('이모지 시퀀스', () => {
      const emojiSequence = '👨‍👩‍👧‍👦 가족 🏠 집 🚗 차 💼 일';
      const doc = {
        personal_info: { name: emojiSequence },
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

    it('RTL(Right-to-Left) 문자', () => {
      const rtlText = 'مرحبا العالم';  // 아랍어: Hello World
      const doc = {
        personal_info: { name: rtlText },
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

    it('유니코드 서로게이트 페어', () => {
      // 4바이트 유니코드 문자 (이모지)
      const highUnicode = '𝄞 𝕳𝖊𝖑𝖑𝖔 𝕎𝕠𝕣𝕝𝕕';
      const doc = {
        personal_info: { name: highUnicode },
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
  });

  describe('날짜 극한값', () => {

    it('최소 JavaScript Date (1970-01-01 이전)', () => {
      const minDate = new Date(-8640000000000000);  // 약 271821 BCE
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: minDate,
          updated_at: minDate
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('최대 JavaScript Date', () => {
      const maxDate = new Date(8640000000000000);  // 약 275760 CE
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: maxDate,
          updated_at: maxDate
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('밀리초 차이 날짜', () => {
      const date1 = new Date('2025-12-21T00:00:00.000Z');
      const date2 = new Date('2025-12-21T00:00:00.001Z');

      const doc1 = {
        personal_info: { name: '테스트1' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: date1,
          updated_at: date1
        }
      };

      const doc2 = {
        personal_info: { name: '테스트2' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: date2,
          updated_at: date2
        }
      };

      expect(validateCustomerDocument(doc1).success).toBe(true);
      expect(validateCustomerDocument(doc2).success).toBe(true);
    });
  });

  describe('동시 검증 시뮬레이션', () => {

    it('1000개 문서 동시 생성 시뮬레이션', () => {
      const documents = [];

      for (let i = 0; i < 1000; i++) {
        const doc = {
          personal_info: {
            name: `고객${i}`,
            mobile_phone: `010-${String(i).padStart(4, '0')}-${String(i * 2).padStart(4, '0')}`
          },
          insurance_info: { customer_type: '개인' as const },
          meta: {
            status: 'active' as const,
            created_by: `user${i % 10}`,
            created_at: new Date(),
            updated_at: new Date()
          }
        };
        documents.push(doc);
      }

      const results = documents.map(doc => validateCustomerDocument(doc));
      const allValid = results.every(r => r.success);

      expect(allValid).toBe(true);
    });

    it('다양한 타입 혼합 검증', () => {
      const testCases = [
        // 개인 고객
        {
          personal_info: { name: '홍길동', mobile_phone: '010-1234-5678' },
          insurance_info: { customer_type: '개인' as const },
          meta: { status: 'active' as const, created_by: 'user', created_at: new Date(), updated_at: new Date() }
        },
        // 법인 고객
        {
          personal_info: { name: '(주)테스트', mobile_phone: '02-1234-5678' },
          insurance_info: { customer_type: '법인' as const },
          meta: { status: 'active' as const, created_by: 'user', created_at: new Date(), updated_at: new Date() }
        },
        // 비활성 고객
        {
          personal_info: { name: '휴면고객' },
          insurance_info: { customer_type: '개인' as const },
          meta: { status: 'inactive' as const, created_by: 'user', created_at: new Date(), updated_at: new Date() }
        },
        // 전체 정보
        {
          personal_info: {
            name: '완전고객',
            mobile_phone: '010-9999-8888',
            email: 'full@example.com',
            birth_date: '1990-01-01',
            address: { address1: '서울시', address2: '강남구' }
          },
          insurance_info: { customer_type: '개인' as const },
          meta: { status: 'active' as const, created_by: 'admin', created_at: new Date(), updated_at: new Date() }
        }
      ];

      for (const doc of testCases) {
        expect(validateCustomerDocument(doc).success).toBe(true);
      }
    });
  });

  describe('필드 조합 테스트', () => {

    it('모든 optional 필드 있음', () => {
      const doc = {
        personal_info: {
          name: '테스트',
          mobile_phone: '010-1234-5678',
          email: 'test@test.com',
          birth_date: '1990-01-01',
          address: { address1: '서울시', address2: '강남구' }
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
    });

    it('모든 optional 필드 없음', () => {
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

    it('일부 optional 필드만 (phone만)', () => {
      const doc = {
        personal_info: { name: '테스트', mobile_phone: '010-1234-5678' },
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

    it('일부 optional 필드만 (email만)', () => {
      const doc = {
        personal_info: { name: '테스트', email: 'test@test.com' },
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

    it('일부 optional 필드만 (address만)', () => {
      const doc = {
        personal_info: { name: '테스트', address: { address1: '서울시' } },
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
  });

  describe('업데이트 필드 조합', () => {

    it('단일 필드 업데이트', () => {
      const fields = { 'personal_info.name': '새이름', 'meta.updated_at': new Date() };
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
    });

    it('모든 필드 동시 업데이트', () => {
      const fields = {
        'personal_info.name': '새이름',
        'personal_info.mobile_phone': '010-9999-8888',
        'personal_info.email': 'new@email.com',
        'personal_info.birth_date': '1985-05-05',
        'personal_info.address.address1': '새주소',
        'meta.updated_at': new Date()
      };
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
    });

    it('updated_at만 업데이트', () => {
      const fields = { 'meta.updated_at': new Date() };
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
    });

    it('address만 업데이트', () => {
      const fields = {
        'personal_info.address.address1': '새주소',
        'meta.updated_at': new Date()
      };
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
    });
  });
});

describe('실제 시나리오 시뮬레이션', () => {

  describe('신규 고객 등록 시나리오', () => {

    it('최소 정보로 등록', () => {
      const doc = {
        personal_info: { name: '홍길동', mobile_phone: '', email: '', birth_date: '', address: {} },
        insurance_info: { customer_type: '개인' as const },
        meta: { status: 'active' as const, created_by: 'agent001', created_at: new Date(), updated_at: new Date() }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('상담 중 정보 추가', () => {
      const fields = {
        'personal_info.mobile_phone': '010-1234-5678',
        'personal_info.email': 'hong@example.com',
        'meta.updated_at': new Date()
      };
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
    });

    it('상담 메모 추가', () => {
      const memo = {
        customer_id: '507f1f77bcf86cd799439011',
        content: '보험 상담 진행. 종신보험에 관심 있음. 다음 주 재상담 예정.',
        created_by: 'agent001',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });
  });

  describe('법인 고객 시나리오', () => {

    it('법인 고객 등록', () => {
      const doc = {
        personal_info: {
          name: '(주)에이비시테크놀로지',
          mobile_phone: '02-1234-5678',
          email: 'contact@abctech.co.kr',
          address: { address1: '서울특별시 강남구 테헤란로 123' }
        },
        insurance_info: { customer_type: '법인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'agent002',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('법인 담당자 변경', () => {
      const fields = {
        'personal_info.mobile_phone': '02-9999-8888',
        'personal_info.email': 'newcontact@abctech.co.kr',
        'meta.updated_at': new Date()
      };
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
    });
  });

  describe('휴면 고객 시나리오', () => {

    it('휴면 전환', () => {
      // 실제로는 status 업데이트가 필요하지만, 현재 스키마는 status 업데이트 경로가 없음
      // 이것은 비즈니스 로직의 한계를 보여줌
      const doc = {
        personal_info: { name: '휴면고객' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'inactive' as const,
          created_by: 'agent001',
          created_at: new Date('2023-01-01'),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });
  });
});
