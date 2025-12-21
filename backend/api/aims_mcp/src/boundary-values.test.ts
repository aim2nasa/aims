/**
 * 경계값 테스트
 *
 * 극한의 입력값, 경계 조건에서 스키마가 올바르게 동작하는지 검증
 */

import { describe, it, expect } from 'vitest';
import {
  validateCustomerDocument,
  validateCustomerUpdateFields,
  validateMemoDocument,
} from './schemas/aims.schema.js';

describe('경계값 테스트', () => {

  describe('문자열 길이 경계', () => {
    // 이름 경계값
    it('1글자 이름 허용', () => {
      const doc = {
        personal_info: { name: '가' },
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

    it('빈 이름 거부', () => {
      const doc = {
        personal_info: { name: '' },
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

    it('500자 이름 허용', () => {
      const longName = '가'.repeat(500);
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

    it('10000자 이름 허용', () => {
      const veryLongName = '가'.repeat(10000);
      const doc = {
        personal_info: { name: veryLongName },
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

    // 메모 content 경계값
    it('1글자 메모 허용', () => {
      const memo = {
        customer_id: 'someId',
        content: 'A',
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });

    it('빈 메모 거부', () => {
      const memo = {
        customer_id: 'someId',
        content: '',
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(false);
    });

    it('50000자 메모 허용', () => {
      const longContent = '메모 '.repeat(10000);
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

  describe('숫자 경계값', () => {
    it('전화번호: 숫자만', () => {
      const doc = {
        personal_info: {
          name: '테스트',
          mobile_phone: '01012345678'  // 하이픈 없음
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

    it('전화번호: 하이픈 포함', () => {
      const doc = {
        personal_info: {
          name: '테스트',
          mobile_phone: '010-1234-5678'
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

    it('전화번호: 국제번호 포함', () => {
      const doc = {
        personal_info: {
          name: '테스트',
          mobile_phone: '+82-10-1234-5678'
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

    it('전화번호: 괄호 포함', () => {
      const doc = {
        personal_info: {
          name: '테스트',
          mobile_phone: '(02) 1234-5678'
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

  describe('날짜 경계값', () => {
    it('아주 오래된 날짜 (1900년)', () => {
      const oldDate = new Date('1900-01-01T00:00:00.000Z');
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: oldDate,
          updated_at: oldDate
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('미래 날짜 (2100년)', () => {
      const futureDate = new Date('2100-12-31T23:59:59.999Z');
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: futureDate,
          updated_at: futureDate
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('Unix epoch (1970-01-01)', () => {
      const epochDate = new Date(0);
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: epochDate,
          updated_at: epochDate
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('밀리초 정밀도 날짜', () => {
      const preciseDate = new Date('2025-06-15T14:35:42.123Z');
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: preciseDate,
          updated_at: preciseDate
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(true);
    });

    it('Invalid Date 객체 거부', () => {
      const invalidDate = new Date('invalid-date');
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: invalidDate,
          updated_at: new Date()
        }
      };
      // Invalid Date는 Date 객체이지만 NaN 값을 가짐
      // Zod의 z.date()는 Invalid Date를 거부함 (좋은 동작!)
      const result = validateCustomerDocument(doc);
      expect(result.success).toBe(false);
    });
  });

  describe('유니코드 경계값', () => {
    it('이모지 포함 이름', () => {
      const doc = {
        personal_info: { name: '홍길동 👨‍💼' },
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

    it('중국어 이름', () => {
      const doc = {
        personal_info: { name: '王小明' },
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

    it('일본어 이름', () => {
      const doc = {
        personal_info: { name: '田中太郎' },
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

    it('아랍어 이름', () => {
      const doc = {
        personal_info: { name: 'محمد علي' },
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

    it('혼합 언어 이름', () => {
      const doc = {
        personal_info: { name: '홍길동 Hong Gil-dong 洪吉童' },
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

    it('Zero Width Joiner 포함', () => {
      const doc = {
        personal_info: { name: '홍\u200D길동' },  // ZWJ
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

    it('서로게이트 페어 이모지', () => {
      const doc = {
        personal_info: { name: '테스트 🏠 집' },  // 집 이모지
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

  describe('공백 문자 경계값', () => {
    it('탭 문자 포함', () => {
      const doc = {
        personal_info: { name: '홍\t길동' },
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

    it('줄바꿈 포함 메모', () => {
      const memo = {
        customer_id: 'someId',
        content: '첫줄\n둘째줄\n셋째줄',
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });

    it('CRLF 줄바꿈 포함 메모', () => {
      const memo = {
        customer_id: 'someId',
        content: '첫줄\r\n둘째줄\r\n셋째줄',
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });

    it('연속 공백 포함', () => {
      const doc = {
        personal_info: { name: '홍   길   동' },  // 여러 공백
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

    it('앞뒤 공백만', () => {
      const doc = {
        personal_info: { name: '   홍길동   ' },
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

    it('공백만 있는 이름 허용 (Zod min(1) 통과)', () => {
      const doc = {
        personal_info: { name: '   ' },  // 공백만
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      // Zod min(1)은 길이만 체크, 공백도 문자로 인정
      expect(validateCustomerDocument(doc).success).toBe(true);
    });
  });

  describe('null/undefined 경계값', () => {
    it('optional 필드 undefined', () => {
      const doc = {
        personal_info: {
          name: '테스트',
          mobile_phone: undefined,
          email: undefined
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

    it('optional 필드 누락', () => {
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

    it('필수 필드 null 거부', () => {
      const doc = {
        personal_info: { name: null },  // null
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

    it('customer_type null 거부', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: null },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });

    it('status null 거부', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: null,
          created_by: 'user',
          created_at: new Date(),
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });
  });

  describe('잘못된 타입 경계값', () => {
    it('name이 숫자면 거부', () => {
      const doc = {
        personal_info: { name: 12345 },
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

    it('name이 배열이면 거부', () => {
      const doc = {
        personal_info: { name: ['홍', '길', '동'] },
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

    it('name이 객체면 거부', () => {
      const doc = {
        personal_info: { name: { first: '홍', last: '길동' } },
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

    it('created_at이 배열이면 거부', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: [2025, 12, 21],
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });

    it('created_at이 객체면 거부', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: '개인' as const },
        meta: {
          status: 'active' as const,
          created_by: 'user',
          created_at: { year: 2025, month: 12, day: 21 },
          updated_at: new Date()
        }
      };
      expect(validateCustomerDocument(doc).success).toBe(false);
    });

    it('customer_type이 boolean이면 거부', () => {
      const doc = {
        personal_info: { name: '테스트' },
        insurance_info: { customer_type: true },
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

  describe('업데이트 필드 경계값', () => {
    it('빈 업데이트 객체 거부 (meta.updated_at 필수)', () => {
      const fields = {};
      // meta.updated_at은 필수 Date 필드이므로 빈 객체는 거부됨
      expect(validateCustomerUpdateFields(fields).success).toBe(false);
    });

    it('알 수 없는 필드 포함 허용', () => {
      const fields = {
        'personal_info.name': '새이름',
        'unknown_field': 'unknown_value',
        'meta.updated_at': new Date()
      };
      // passthrough()로 설정되어 있으므로 추가 필드 허용
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
    });

    it('meta.updated_at만 있는 업데이트', () => {
      const fields = {
        'meta.updated_at': new Date()
      };
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
    });

    it('모든 필드 동시 업데이트', () => {
      const fields = {
        'personal_info.name': '새이름',
        'personal_info.mobile_phone': '010-9999-8888',
        'personal_info.email': 'new@email.com',
        'personal_info.birth_date': '1990-05-15',
        'personal_info.address.address1': '서울시 강남구',
        'meta.updated_at': new Date()
      };
      expect(validateCustomerUpdateFields(fields).success).toBe(true);
    });
  });

  describe('메모 경계값', () => {
    it('HTML 포함 메모', () => {
      const memo = {
        customer_id: 'someId',
        content: '<script>alert("xss")</script>',
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      // 스키마는 HTML을 필터링하지 않음 (저장 시 이스케이프는 별도 처리)
      expect(validateMemoDocument(memo).success).toBe(true);
    });

    it('SQL 인젝션 시도 메모', () => {
      const memo = {
        customer_id: 'someId',
        content: "'; DROP TABLE customers; --",
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });

    it('JSON 포함 메모', () => {
      const memo = {
        customer_id: 'someId',
        content: '{"key": "value", "nested": {"a": 1}}',
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });

    it('마크다운 포함 메모', () => {
      const memo = {
        customer_id: 'someId',
        content: '# 제목\n## 부제목\n- 목록1\n- 목록2\n**굵은글씨**',
        created_by: 'user',
        created_at: new Date(),
        updated_at: new Date()
      };
      expect(validateMemoDocument(memo).success).toBe(true);
    });
  });
});
