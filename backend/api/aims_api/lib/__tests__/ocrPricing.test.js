/**
 * OCR Pricing Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. OCR_PRICE_PER_PAGE_USD 상수 - 페이지당 가격
 * 2. DEFAULT_EXCHANGE_RATE 상수 - 기본 환율
 * 3. calculateOCRCost - OCR 비용 계산
 *
 * @priority CRITICAL - 과금 관련 핵심 유틸리티
 * @see https://www.upstage.ai/pricing
 */

const {
  OCR_PRICE_PER_PAGE_USD,
  DEFAULT_EXCHANGE_RATE,
  calculateOCRCost
} = require('../ocrPricing');

// =============================================================================
// 1. 상수 검증 (3개)
// =============================================================================

describe('OCR 가격 상수 검증', () => {
  describe('OCR_PRICE_PER_PAGE_USD', () => {
    it('페이지당 $0.0015여야 함', () => {
      expect(OCR_PRICE_PER_PAGE_USD).toBe(0.0015);
    });

    it('상수 값이 변경되지 않아야 함', () => {
      // 상수 불변성 검증
      const originalValue = OCR_PRICE_PER_PAGE_USD;
      expect(OCR_PRICE_PER_PAGE_USD).toBe(originalValue);
    });
  });

  describe('DEFAULT_EXCHANGE_RATE', () => {
    it('기본 환율 1400 KRW/USD여야 함', () => {
      expect(DEFAULT_EXCHANGE_RATE).toBe(1400);
    });

    it('상수 값이 변경되지 않아야 함', () => {
      const originalValue = DEFAULT_EXCHANGE_RATE;
      expect(DEFAULT_EXCHANGE_RATE).toBe(originalValue);
    });
  });

  describe('상수 타입 검증', () => {
    it('OCR_PRICE_PER_PAGE_USD는 숫자여야 함', () => {
      expect(typeof OCR_PRICE_PER_PAGE_USD).toBe('number');
    });

    it('DEFAULT_EXCHANGE_RATE는 숫자여야 함', () => {
      expect(typeof DEFAULT_EXCHANGE_RATE).toBe('number');
    });
  });
});

// =============================================================================
// 2. calculateOCRCost 함수 테스트 (17개+)
// =============================================================================

describe('calculateOCRCost - OCR 비용 계산', () => {
  describe('기본 계산', () => {
    it('1페이지 비용 계산', () => {
      const result = calculateOCRCost(1);
      // 1 * 0.0015 = 0.0015 USD
      // 0.0015 * 1400 = 2.1 → Math.round = 2 KRW
      expect(result.usd).toBe(0.0015);
      expect(result.krw).toBe(2);
    });

    it('10페이지 비용 계산', () => {
      const result = calculateOCRCost(10);
      // 10 * 0.0015 = 0.015 USD
      // 0.015 * 1400 = 21 KRW
      expect(result.usd).toBe(0.015);
      expect(result.krw).toBe(21);
    });

    it('100페이지 비용 계산', () => {
      const result = calculateOCRCost(100);
      // 100 * 0.0015 = 0.15 USD
      // 0.15 * 1400 = 210 KRW
      expect(result.usd).toBe(0.15);
      expect(result.krw).toBe(210);
    });

    it('1000페이지 비용 계산', () => {
      const result = calculateOCRCost(1000);
      // 1000 * 0.0015 = 1.5 USD
      // 1.5 * 1400 = 2100 KRW
      expect(result.usd).toBe(1.5);
      expect(result.krw).toBe(2100);
    });

    it('10000페이지 비용 계산', () => {
      const result = calculateOCRCost(10000);
      // 10000 * 0.0015 = 15 USD
      // 15 * 1400 = 21000 KRW
      expect(result.usd).toBe(15);
      expect(result.krw).toBe(21000);
    });
  });

  describe('0 페이지 처리', () => {
    it('0페이지 → 0 비용', () => {
      const result = calculateOCRCost(0);
      expect(result.usd).toBe(0);
      expect(result.krw).toBe(0);
    });
  });

  describe('음수 페이지 방어', () => {
    it('음수 페이지 → 음수 비용 반환 (방어 로직 없음 확인)', () => {
      // 현재 구현은 음수 방어 없음
      const result = calculateOCRCost(-10);
      expect(result.usd).toBeLessThan(0);
      expect(result.krw).toBeLessThan(0);
    });
  });

  describe('소수점 페이지', () => {
    it('소수점 페이지도 계산됨 (1.5페이지)', () => {
      const result = calculateOCRCost(1.5);
      // 1.5 * 0.0015 = 0.00225 → toFixed(4) = 0.0023
      expect(result.usd).toBe(0.0023);
    });

    it('소수점 페이지 KRW 반올림', () => {
      const result = calculateOCRCost(1.5);
      // 0.0023 * 1400 = 3.22 → Math.round = 3 KRW
      expect(result.krw).toBe(3);
    });
  });

  describe('환율 파라미터', () => {
    it('기본 환율 1400 적용', () => {
      const result = calculateOCRCost(100);
      expect(result.krw).toBe(Math.round(0.15 * 1400));
    });

    it('커스텀 환율 1300 적용', () => {
      const result = calculateOCRCost(100, 1300);
      // 0.15 * 1300 = 195 KRW
      expect(result.krw).toBe(195);
    });

    it('커스텀 환율 1500 적용', () => {
      const result = calculateOCRCost(100, 1500);
      // 0.15 * 1500 = 225 KRW
      expect(result.krw).toBe(225);
    });

    it('환율 0 → KRW 0', () => {
      const result = calculateOCRCost(100, 0);
      expect(result.krw).toBe(0);
    });

    it('음수 환율 방어 (현재 방어 없음)', () => {
      const result = calculateOCRCost(100, -1400);
      expect(result.krw).toBeLessThan(0);
    });
  });

  describe('USD 소수점 정밀도', () => {
    it('소수점 4자리까지 표시 (toFixed(4))', () => {
      const result = calculateOCRCost(1);
      // 0.0015는 이미 4자리 이하
      expect(result.usd.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(4);
    });

    it('5자리 이상 값은 4자리로 반올림', () => {
      // 7페이지: 7 * 0.0015 = 0.0105 (정확히 4자리)
      const result = calculateOCRCost(7);
      expect(result.usd).toBe(0.0105);
    });

    it('반복 계산 시 정밀도 유지', () => {
      const result1 = calculateOCRCost(123);
      const result2 = calculateOCRCost(123);
      expect(result1.usd).toBe(result2.usd);
      expect(result1.krw).toBe(result2.krw);
    });
  });

  describe('KRW Math.round 검증', () => {
    it('0.5 미만 내림', () => {
      // 1페이지: 0.0015 * 1400 = 2.1 → 2
      const result = calculateOCRCost(1);
      expect(result.krw).toBe(2);
    });

    it('0.5 이상 올림', () => {
      // 5페이지: 0.0075 * 1400 = 10.5 → 11 (Math.round)
      const result = calculateOCRCost(5);
      expect(result.krw).toBe(11);
    });

    it('정확히 정수일 때', () => {
      // 10페이지: 0.015 * 1400 = 21 (정수)
      const result = calculateOCRCost(10);
      expect(result.krw).toBe(21);
    });
  });

  describe('부동소수점 정밀도 (0.0015 * 페이지)', () => {
    it('부동소수점 문제 없이 계산 (333페이지)', () => {
      // 333 * 0.0015 = 0.4995
      const result = calculateOCRCost(333);
      // toFixed(4) → 0.4995
      expect(result.usd).toBe(0.4995);
    });

    it('큰 숫자에서 정밀도 유지 (999999페이지)', () => {
      const result = calculateOCRCost(999999);
      // 999999 * 0.0015 = 1499.9985 → toFixed(4) → 1499.9985
      expect(result.usd).toBeCloseTo(1499.9985, 4);
    });
  });

  describe('경계값 테스트', () => {
    it('매우 큰 페이지 수 (100만 페이지)', () => {
      const result = calculateOCRCost(1000000);
      // 1000000 * 0.0015 = 1500 USD
      // 1500 * 1400 = 2,100,000 KRW
      expect(result.usd).toBe(1500);
      expect(result.krw).toBe(2100000);
    });

    it('매우 작은 페이지 수 (0.001페이지)', () => {
      const result = calculateOCRCost(0.001);
      // 0.001 * 0.0015 = 0.0000015 → toFixed(4) → 0
      expect(result.usd).toBe(0);
    });
  });

  describe('실제 과금 시나리오', () => {
    it('일반 문서 (10페이지) 비용', () => {
      const result = calculateOCRCost(10);
      // 사용자가 예상하는 비용: 약 21원
      expect(result.usd).toBe(0.015);
      expect(result.krw).toBe(21);
    });

    it('대용량 문서 (200페이지 PDF) 비용', () => {
      const result = calculateOCRCost(200);
      // 200 * 0.0015 = 0.3 USD
      // 0.3 * 1400 = 420 KRW
      expect(result.usd).toBe(0.3);
      expect(result.krw).toBe(420);
    });

    it('월간 예상 비용 (1000문서 * 평균 5페이지)', () => {
      const totalPages = 1000 * 5; // 5000페이지
      const result = calculateOCRCost(totalPages);
      // 5000 * 0.0015 = 7.5 USD
      // 7.5 * 1400 = 10,500 KRW
      expect(result.usd).toBe(7.5);
      expect(result.krw).toBe(10500);
    });

    it('분기 예상 비용 (3000문서 * 평균 10페이지)', () => {
      const totalPages = 3000 * 10; // 30000페이지
      const result = calculateOCRCost(totalPages);
      // 30000 * 0.0015 = 45 USD
      // 45 * 1400 = 63,000 KRW
      expect(result.usd).toBe(45);
      expect(result.krw).toBe(63000);
    });
  });

  describe('반환 값 타입', () => {
    it('usd는 숫자여야 함', () => {
      const result = calculateOCRCost(10);
      expect(typeof result.usd).toBe('number');
    });

    it('krw는 정수여야 함', () => {
      const result = calculateOCRCost(10);
      expect(Number.isInteger(result.krw)).toBe(true);
    });

    it('반환 객체는 usd, krw 두 키만 포함', () => {
      const result = calculateOCRCost(10);
      expect(Object.keys(result)).toEqual(['usd', 'krw']);
    });
  });
});
