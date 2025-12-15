/**
 * OCR 가격 상수 및 요금 계산 유틸리티
 * Upstage Document OCR 기준
 * @since 2025-12-15
 * @see https://www.upstage.ai/pricing
 */

// Upstage Document OCR 페이지당 가격 (USD)
const OCR_PRICE_PER_PAGE_USD = 0.0015;

// 기본 환율 (USD -> KRW)
const DEFAULT_EXCHANGE_RATE = 1400;

/**
 * 페이지 수로 예상 요금 계산
 * @param {number} pageCount - 페이지 수
 * @param {number} [exchangeRate=1400] - USD/KRW 환율
 * @returns {{ usd: number, krw: number }}
 */
function calculateOCRCost(pageCount, exchangeRate = DEFAULT_EXCHANGE_RATE) {
  const usd = Number((pageCount * OCR_PRICE_PER_PAGE_USD).toFixed(4));
  const krw = Math.round(usd * exchangeRate);
  return { usd, krw };
}

module.exports = {
  OCR_PRICE_PER_PAGE_USD,
  DEFAULT_EXCHANGE_RATE,
  calculateOCRCost
};
