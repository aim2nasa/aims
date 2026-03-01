/**
 * escapeRegex 함수 단위 테스트
 * @description MongoDB $regex에 사용자 입력을 안전하게 전달하기 위한 이스케이프 함수 검증
 * @since 2026-03-02
 *
 * 검증 대상:
 * - 정규식 특수문자 이스케이프 (OWASP 기준)
 * - 한글/영문/숫자 일반 문자열 통과
 * - null/undefined/비문자열 방어
 * - ReDoS 공격 패턴 무력화
 * - 실제 AIMS 사용 케이스 (법인명, 주소 등)
 */

const { escapeRegex } = require('../lib/helpers');

describe('escapeRegex', () => {
  describe('정규식 특수문자 이스케이프', () => {
    test.each([
      ['.', '\\.'],
      ['*', '\\*'],
      ['+', '\\+'],
      ['?', '\\?'],
      ['^', '\\^'],
      ['$', '\\$'],
      ['{', '\\{'],
      ['}', '\\}'],
      ['(', '\\('],
      [')', '\\)'],
      ['|', '\\|'],
      ['[', '\\['],
      [']', '\\]'],
      ['\\', '\\\\'],
      ['-', '\\-'],
    ])('"%s" → "%s"', (input, expected) => {
      expect(escapeRegex(input)).toBe(expected);
    });
  });

  describe('일반 문자열은 변경 없이 통과', () => {
    test('한글', () => {
      expect(escapeRegex('홍길동')).toBe('홍길동');
    });

    test('영문', () => {
      expect(escapeRegex('John')).toBe('John');
    });

    test('숫자', () => {
      expect(escapeRegex('12345')).toBe('12345');
    });

    test('한글+영문+숫자 혼합', () => {
      expect(escapeRegex('김철수abc123')).toBe('김철수abc123');
    });

    test('공백 포함', () => {
      expect(escapeRegex('홍 길동')).toBe('홍 길동');
    });

    test('빈 문자열', () => {
      expect(escapeRegex('')).toBe('');
    });
  });

  describe('비정상 입력 방어', () => {
    test('null → 빈 문자열', () => {
      expect(escapeRegex(null)).toBe('');
    });

    test('undefined → 빈 문자열', () => {
      expect(escapeRegex(undefined)).toBe('');
    });

    test('숫자 타입 → 빈 문자열', () => {
      expect(escapeRegex(123)).toBe('');
    });

    test('객체 타입 → 빈 문자열', () => {
      expect(escapeRegex({})).toBe('');
    });

    test('배열 타입 → 빈 문자열', () => {
      expect(escapeRegex([])).toBe('');
    });

    test('boolean 타입 → 빈 문자열', () => {
      expect(escapeRegex(true)).toBe('');
    });
  });

  describe('AIMS 실제 사용 케이스', () => {
    test('법인명 — (주)삼성생명', () => {
      expect(escapeRegex('(주)삼성생명')).toBe('\\(주\\)삼성생명');
    });

    test('법인명 — [주식회사]', () => {
      expect(escapeRegex('[주식회사]')).toBe('\\[주식회사\\]');
    });

    test('이메일 — user@test.com', () => {
      expect(escapeRegex('user@test.com')).toBe('user@test\\.com');
    });

    test('전화번호 — 010-1234-5678', () => {
      expect(escapeRegex('010-1234-5678')).toBe('010\\-1234\\-5678');
    });

    test('주소 — 서울특별시', () => {
      expect(escapeRegex('서울특별시')).toBe('서울특별시');
    });
  });

  describe('보안: ReDoS 공격 패턴 무력화', () => {
    test('(a+)+ 패턴', () => {
      const result = escapeRegex('(a+)+');
      expect(result).toBe('\\(a\\+\\)\\+');
      // 이스케이프된 결과로 RegExp 생성 시 에러 없이 동작
      expect(() => new RegExp(result)).not.toThrow();
    });

    test('.* 와일드카드', () => {
      const result = escapeRegex('.*');
      expect(result).toBe('\\.\\*');
      expect(() => new RegExp(result)).not.toThrow();
    });

    test('a|b OR 조건 주입', () => {
      const result = escapeRegex('a|b');
      expect(result).toBe('a\\|b');
      expect(() => new RegExp(result)).not.toThrow();
    });

    test('복합 공격 패턴', () => {
      const result = escapeRegex('test**??[a-z](.*)');
      expect(result).toBe('test\\*\\*\\?\\?\\[a\\-z\\]\\(\\.\\*\\)');
      expect(() => new RegExp(result)).not.toThrow();
    });
  });

  describe('이스케이프된 결과의 MongoDB $regex 호환성', () => {
    test('이스케이프된 문자열로 RegExp 생성 가능', () => {
      const inputs = ['(주)삼성', 'test.*', 'a+b', '[주]', 'hello$world'];
      for (const input of inputs) {
        const escaped = escapeRegex(input);
        expect(() => new RegExp(escaped, 'i')).not.toThrow();
      }
    });

    test('이스케이프된 RegExp는 원본 문자열을 정확히 매칭', () => {
      const inputs = ['(주)삼성생명', 'test.pdf', 'a+b=c', '[중요]메모'];
      for (const input of inputs) {
        const escaped = escapeRegex(input);
        const regex = new RegExp(escaped, 'i');
        expect(regex.test(input)).toBe(true);
      }
    });

    test('이스케이프된 RegExp는 와일드카드로 동작하지 않음', () => {
      const escaped = escapeRegex('.*');
      const regex = new RegExp(escaped);
      expect(regex.test('anything')).toBe(false);
      expect(regex.test('.*')).toBe(true);
    });
  });
});
